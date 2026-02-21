'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const { buildMediaInfo, getMediaTypeFromMime, getMediaTypeFromExt, getDomain, isValidUrl } = require('../utils/helpers');
const { EXTRACTOR_TYPES, DEFAULT_HEADERS, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS } = require('../utils/constants');

class DirectExtractor {
    constructor() {
        this.name = EXTRACTOR_TYPES.DIRECT;
    }

    /**
     * Extract media from URL using direct HTTP requests and HTML parsing
     */
    async extract(url, options = {}) {
        logger.info(`[Direct] Extracting from: ${url}`);
        const results = [];

        // First, check if the URL itself is a direct media link
        const directCheck = await this._checkDirectLink(url);
        if (directCheck) {
            results.push(directCheck);
            return results;
        }

        // Otherwise, fetch the page and parse for media links
        const pageMedia = await this._parsePageForMedia(url, options);
        results.push(...pageMedia);

        logger.info(`[Direct] Found ${results.length} media items from: ${url}`);
        return results;
    }

    /**
     * Check if URL is a direct media link using HEAD request
     */
    async _checkDirectLink(url) {
        try {
            const response = await axios.head(url, {
                headers: DEFAULT_HEADERS,
                timeout: 15000,
                maxRedirects: 5,
                validateStatus: (s) => s < 400,
            });

            const contentType = response.headers['content-type'] || '';
            const mediaType = getMediaTypeFromMime(contentType);

            if (mediaType !== 'unknown') {
                const contentLength = parseInt(response.headers['content-length'] || '0', 10);
                const finalUrl = response.request?.res?.responseUrl || url;

                return buildMediaInfo({
                    title: this._getFilenameFromUrl(finalUrl),
                    url,
                    directUrl: finalUrl,
                    filesize: contentLength || null,
                    mediaType,
                    extension: this._getExtFromContentType(contentType),
                    extractor: this.name,
                    metadata: {
                        contentType,
                        site: getDomain(url),
                    },
                });
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Parse HTML page for media links
     */
    async _parsePageForMedia(url, options = {}) {
        try {
            const response = await axios.get(url, {
                headers: DEFAULT_HEADERS,
                timeout: 20000,
                maxRedirects: 5,
                responseType: 'text',
                maxContentLength: 10 * 1024 * 1024,
            });

            const html = response.data;
            const $ = cheerio.load(html);
            const domain = getDomain(url);
            const pageTitle = $('title').text().trim() || 'Untitled';
            const media = [];
            const seenUrls = new Set();

            const addMedia = (mediaUrl, info = {}) => {
                if (!mediaUrl || seenUrls.has(mediaUrl)) return;
                const resolvedUrl = this._resolveUrl(mediaUrl, url);
                if (!resolvedUrl || seenUrls.has(resolvedUrl)) return;
                seenUrls.add(resolvedUrl);

                media.push(buildMediaInfo({
                    title: info.title || pageTitle,
                    url,
                    directUrl: resolvedUrl,
                    thumbnail: info.poster || null,
                    mediaType: info.mediaType || getMediaTypeFromExt(resolvedUrl) || 'unknown',
                    extractor: this.name,
                    metadata: { site: domain, ...info.metadata },
                }));
            };

            // Video elements
            $('video').each((_, el) => {
                const src = $(el).attr('src');
                const poster = $(el).attr('poster');
                if (src) addMedia(src, { mediaType: 'video', poster });
                $(el).find('source').each((__, srcEl) => {
                    addMedia($(srcEl).attr('src'), { mediaType: 'video', poster });
                });
            });

            // Audio elements
            $('audio').each((_, el) => {
                const src = $(el).attr('src');
                if (src) addMedia(src, { mediaType: 'audio' });
                $(el).find('source').each((__, srcEl) => {
                    addMedia($(srcEl).attr('src'), { mediaType: 'audio' });
                });
            });

            // Links to media files
            $('a[href]').each((_, el) => {
                const href = $(el).attr('href');
                if (href) {
                    const allExts = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
                    const hasMediaExt = allExts.some((ext) => href.toLowerCase().includes(ext));
                    if (hasMediaExt) {
                        addMedia(href, { title: $(el).text().trim() || pageTitle });
                    }
                }
            });

            // OG tags
            const ogVideo = $('meta[property="og:video"]').attr('content') ||
                $('meta[property="og:video:url"]').attr('content');
            if (ogVideo) addMedia(ogVideo, { mediaType: 'video' });

            const ogAudio = $('meta[property="og:audio"]').attr('content');
            if (ogAudio) addMedia(ogAudio, { mediaType: 'audio' });

            // JSON-LD
            $('script[type="application/ld+json"]').each((_, script) => {
                try {
                    const data = JSON.parse($(script).html());
                    const items = Array.isArray(data) ? data : [data];
                    for (const item of items) {
                        if (item['@type'] === 'VideoObject' && item.contentUrl) {
                            addMedia(item.contentUrl, {
                                title: item.name || pageTitle,
                                mediaType: 'video',
                            });
                        }
                        if (item['@type'] === 'AudioObject' && item.contentUrl) {
                            addMedia(item.contentUrl, {
                                title: item.name || pageTitle,
                                mediaType: 'audio',
                            });
                        }
                    }
                } catch { }
            });

            // Scan for media URLs in inline scripts
            $('script:not([src])').each((_, script) => {
                const text = $(script).html() || '';
                const urlRegex = /https?:\/\/[^\s"'<>]+\.(mp4|webm|mkv|avi|mp3|m4a|ogg|opus|flac|wav|m3u8|mpd)/gi;
                let match;
                while ((match = urlRegex.exec(text)) !== null) {
                    addMedia(match[0]);
                }
            });

            return media;
        } catch (err) {
            logger.warn(`[Direct] Failed to parse page ${url}: ${err.message}`);
            return [];
        }
    }

    /**
     * Resolve relative URL
     */
    _resolveUrl(mediaUrl, pageUrl) {
        try {
            return new URL(mediaUrl, pageUrl).href;
        } catch {
            return null;
        }
    }

    /**
     * Get filename from URL
     */
    _getFilenameFromUrl(url) {
        try {
            const pathname = new URL(url).pathname;
            const parts = pathname.split('/');
            return decodeURIComponent(parts[parts.length - 1]) || 'download';
        } catch {
            return 'download';
        }
    }

    /**
     * Get extension from content type
     */
    _getExtFromContentType(contentType) {
        const map = {
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'video/ogg': 'ogv',
            'audio/mpeg': 'mp3',
            'audio/mp4': 'm4a',
            'audio/ogg': 'ogg',
            'audio/wav': 'wav',
            'audio/webm': 'weba',
        };
        const base = (contentType || '').split(';')[0].trim().toLowerCase();
        return map[base] || null;
    }
}

module.exports = DirectExtractor;
