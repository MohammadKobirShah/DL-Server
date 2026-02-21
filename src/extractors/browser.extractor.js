'use strict';

const puppeteer = require('puppeteer');
const config = require('../config');
const logger = require('../utils/logger');
const { buildMediaInfo, getMediaTypeFromMime, getMediaTypeFromExt, getDomain } = require('../utils/helpers');
const { EXTRACTOR_TYPES, VIDEO_MIMES, AUDIO_MIMES, DEFAULT_HEADERS } = require('../utils/constants');

class BrowserExtractor {
    constructor() {
        this.name = EXTRACTOR_TYPES.BROWSER;
        this.browser = null;
    }

    /**
     * Launch or reuse browser instance
     */
    async _getBrowser() {
        if (!this.browser || !this.browser.isConnected()) {
            this.browser = await puppeteer.launch({
                headless: config.puppeteer.headless ? 'new' : false,
                executablePath: config.puppeteer.executablePath || undefined,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--window-size=1920,1080',
                ],
                defaultViewport: { width: 1920, height: 1080 },
                timeout: config.puppeteer.timeout,
            });

            logger.info('[Browser] Puppeteer launched');
        }
        return this.browser;
    }

    /**
     * Extract media URLs from a page using browser rendering
     */
    async extract(url, options = {}) {
        const browser = await this._getBrowser();
        const page = await browser.newPage();
        const mediaUrls = new Map();

        try {
            // Set user agent
            await page.setUserAgent(DEFAULT_HEADERS['User-Agent']);

            // Intercept network requests to catch media URLs
            await page.setRequestInterception(true);

            page.on('request', (request) => {
                const reqUrl = request.url();
                const resourceType = request.resourceType();

                // Capture media requests
                if (['media', 'xhr', 'fetch'].includes(resourceType)) {
                    const contentType = request.headers()['content-type'] || '';
                    const mediaType = getMediaTypeFromMime(contentType) || getMediaTypeFromExt(reqUrl);

                    if (mediaType && mediaType !== 'unknown') {
                        mediaUrls.set(reqUrl, {
                            url: reqUrl,
                            type: resourceType,
                            mediaType,
                            headers: request.headers(),
                        });
                    }
                }

                request.continue();
            });

            // Capture responses to detect media content
            page.on('response', async (response) => {
                try {
                    const resUrl = response.url();
                    const contentType = response.headers()['content-type'] || '';
                    const isMedia = [...VIDEO_MIMES, ...AUDIO_MIMES].some((m) => contentType.includes(m));

                    if (isMedia && !mediaUrls.has(resUrl)) {
                        const mediaType = getMediaTypeFromMime(contentType);
                        mediaUrls.set(resUrl, {
                            url: resUrl,
                            contentType,
                            mediaType,
                            contentLength: response.headers()['content-length'] || null,
                        });
                    }
                } catch {
                    // Ignore response parse errors
                }
            });

            // Navigate to the page
            logger.info(`[Browser] Navigating to: ${url}`);
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: config.puppeteer.timeout,
            });

            // Wait a bit for dynamic content
            await page.waitForTimeout(3000);

            // Extract media from DOM
            const domMedia = await page.evaluate(() => {
                const results = [];

                // Find all video elements
                document.querySelectorAll('video, video source').forEach((el) => {
                    const src = el.src || el.getAttribute('src') || el.currentSrc;
                    if (src && src.startsWith('http')) {
                        results.push({
                            url: src,
                            type: el.tagName.toLowerCase(),
                            mediaType: 'video',
                            poster: el.poster || el.closest('video')?.poster || null,
                        });
                    }
                });

                // Find all audio elements
                document.querySelectorAll('audio, audio source').forEach((el) => {
                    const src = el.src || el.getAttribute('src') || el.currentSrc;
                    if (src && src.startsWith('http')) {
                        results.push({
                            url: src,
                            type: el.tagName.toLowerCase(),
                            mediaType: 'audio',
                        });
                    }
                });

                // Find iframes with video embeds
                document.querySelectorAll('iframe').forEach((iframe) => {
                    const src = iframe.src || '';
                    if (src.match(/youtube|vimeo|dailymotion|twitch|streamable|vidyard/i)) {
                        results.push({
                            url: src,
                            type: 'iframe',
                            mediaType: 'video',
                            embedded: true,
                        });
                    }
                });

                // Find Open Graph video meta tags
                const ogVideo = document.querySelector('meta[property="og:video"]');
                const ogVideoUrl = document.querySelector('meta[property="og:video:url"]');
                if (ogVideo) {
                    results.push({
                        url: ogVideo.content,
                        type: 'meta-og',
                        mediaType: 'video',
                    });
                }
                if (ogVideoUrl && ogVideoUrl.content !== ogVideo?.content) {
                    results.push({
                        url: ogVideoUrl.content,
                        type: 'meta-og',
                        mediaType: 'video',
                    });
                }

                // Find JSON-LD VideoObject
                document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
                    try {
                        const data = JSON.parse(script.textContent);
                        const items = Array.isArray(data) ? data : [data];
                        items.forEach((item) => {
                            if (item['@type'] === 'VideoObject' && item.contentUrl) {
                                results.push({
                                    url: item.contentUrl,
                                    type: 'ld-json',
                                    mediaType: 'video',
                                    title: item.name || null,
                                    thumbnail: item.thumbnailUrl || null,
                                    duration: item.duration || null,
                                });
                            }
                        });
                    } catch { }
                });

                // Extract page title
                const title = document.title || '';

                return { results, title };
            });

            // Merge DOM media with intercepted network media
            for (const item of domMedia.results) {
                if (item.url && !mediaUrls.has(item.url)) {
                    mediaUrls.set(item.url, item);
                }
            }

            const pageTitle = domMedia.title;
            const domain = getDomain(url);

            // Convert to standardized format
            const mediaList = Array.from(mediaUrls.values()).map((item, idx) => {
                return buildMediaInfo({
                    id: `${domain}_${idx}`,
                    title: item.title || pageTitle || 'Untitled',
                    url: url,
                    directUrl: item.url,
                    thumbnail: item.poster || item.thumbnail || null,
                    duration: item.duration || null,
                    filesize: item.contentLength ? parseInt(item.contentLength, 10) : null,
                    mediaType: item.mediaType || 'unknown',
                    extractor: this.name,
                    metadata: {
                        contentType: item.contentType || null,
                        site: domain,
                        embedded: item.embedded || false,
                    },
                });
            });

            logger.info(`[Browser] Found ${mediaList.length} media items from: ${url}`);
            return mediaList;

        } finally {
            await page.close().catch(() => { });
        }
    }

    /**
     * Close the browser
     */
    async close() {
        if (this.browser) {
            await this.browser.close().catch(() => { });
            this.browser = null;
            logger.info('[Browser] Closed');
        }
    }
}

module.exports = BrowserExtractor;
