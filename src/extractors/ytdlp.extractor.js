'use strict';

const { execFile } = require('child_process');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { buildMediaInfo, getMediaTypeFromExt } = require('../utils/helpers');
const { EXTRACTOR_TYPES, MEDIA_TYPES } = require('../utils/constants');

class YtdlpExtractor {
    constructor() {
        this.name = EXTRACTOR_TYPES.YTDLP;
        this.binary = config.ytdlp.path;
    }

    /**
     * Check if yt-dlp is available
     */
    async isAvailable() {
        return new Promise((resolve) => {
            execFile(this.binary, ['--version'], (err, stdout) => {
                if (err) {
                    logger.warn('yt-dlp not available:', err.message);
                    resolve(false);
                } else {
                    logger.debug(`yt-dlp version: ${stdout.trim()}`);
                    resolve(true);
                }
            });
        });
    }

    /**
     * Extract media info from URL using yt-dlp
     */
    async extract(url, options = {}) {
        const args = this._buildArgs(url, options);
        logger.info(`[yt-dlp] Extracting: ${url}`);

        const raw = await this._exec([...args, '--dump-json', url]);
        const entries = this._parseOutput(raw);

        if (entries.length === 0) {
            throw new Error(`yt-dlp returned no results for: ${url}`);
        }

        return entries.map((entry) => this._normalizeEntry(entry, options));
    }

    /**
     * Extract all available formats/links
     */
    async extractAll(url, options = {}) {
        const args = this._buildArgs(url, options);
        logger.info(`[yt-dlp] Extracting all formats: ${url}`);

        const raw = await this._exec([...args, '--dump-json', '--flat-playlist', url]);
        const entries = this._parseOutput(raw);

        return entries.map((entry) => this._normalizeEntry(entry, options));
    }

    /**
     * Download media to file
     */
    async download(url, outputPath, options = {}) {
        const args = this._buildArgs(url, options);
        const ext = path.extname(outputPath) || '.%(ext)s';

        const dlArgs = [
            ...args,
            '-o', outputPath.replace(ext, '') + '.%(ext)s',
            '--no-playlist',
        ];

        if (options.audioOnly) {
            dlArgs.push('-x', '--audio-format', options.audioFormat || 'mp3');
        }

        if (options.format) {
            dlArgs.push('-f', options.format);
        } else {
            dlArgs.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
        }

        dlArgs.push(url);
        logger.info(`[yt-dlp] Downloading to: ${outputPath}`);

        const result = await this._exec(dlArgs, { timeout: 600000 });
        return result;
    }

    /**
     * Build common yt-dlp arguments
     */
    _buildArgs(url, options = {}) {
        const args = [
            '--no-warnings',
            '--no-check-certificates',
            '--prefer-free-formats',
            '--socket-timeout', '30',
        ];

        if (config.ytdlp.cookiesFile) {
            args.push('--cookies', config.ytdlp.cookiesFile);
        }

        if (config.ytdlp.proxy) {
            args.push('--proxy', config.ytdlp.proxy);
        }

        if (options.userAgent) {
            args.push('--user-agent', options.userAgent);
        }

        if (options.referer) {
            args.push('--referer', options.referer);
        }

        if (options.maxFilesize) {
            args.push('--max-filesize', options.maxFilesize);
        }

        return args;
    }

    /**
     * Execute yt-dlp and return stdout
     */
    _exec(args, options = {}) {
        const timeout = options.timeout || 120000;

        return new Promise((resolve, reject) => {
            const proc = execFile(this.binary, args, {
                maxBuffer: 50 * 1024 * 1024,
                timeout,
                windowsHide: true,
            }, (err, stdout, stderr) => {
                if (err) {
                    logger.error(`[yt-dlp] Error: ${stderr || err.message}`);
                    reject(new Error(`yt-dlp failed: ${stderr || err.message}`));
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    /**
     * Parse yt-dlp JSON output (may contain multiple JSON objects)
     */
    _parseOutput(raw) {
        const entries = [];
        const lines = raw.trim().split('\n');

        for (const line of lines) {
            try {
                const data = JSON.parse(line.trim());
                entries.push(data);
            } catch {
                // skip non-JSON lines
            }
        }

        return entries;
    }

    /**
     * Normalize yt-dlp entry to our standard media info format
     */
    _normalizeEntry(entry, options = {}) {
        const formats = (entry.formats || []).map((f) => ({
            formatId: f.format_id,
            ext: f.ext,
            quality: f.format_note || f.quality || null,
            width: f.width || null,
            height: f.height || null,
            fps: f.fps || null,
            vcodec: f.vcodec !== 'none' ? f.vcodec : null,
            acodec: f.acodec !== 'none' ? f.acodec : null,
            filesize: f.filesize || f.filesize_approx || null,
            url: f.url || null,
            tbr: f.tbr || null,
        }));

        // Determine best download URL
        let directUrl = entry.url || null;
        if (!directUrl && formats.length > 0) {
            const bestFormat = formats[formats.length - 1];
            directUrl = bestFormat.url;
        }

        const ext = entry.ext || 'mp4';
        let mediaType = MEDIA_TYPES.VIDEO;
        if (options.audioOnly || entry.acodec && (!entry.vcodec || entry.vcodec === 'none')) {
            mediaType = MEDIA_TYPES.AUDIO;
        } else {
            mediaType = getMediaTypeFromExt(ext);
            if (mediaType === 'unknown') mediaType = MEDIA_TYPES.VIDEO;
        }

        return buildMediaInfo({
            id: entry.id || null,
            title: entry.title || entry.fulltitle || 'Untitled',
            url: entry.webpage_url || entry.original_url || null,
            directUrl,
            thumbnail: entry.thumbnail || (entry.thumbnails && entry.thumbnails.length > 0 ? entry.thumbnails[entry.thumbnails.length - 1].url : null),
            duration: entry.duration || null,
            filesize: entry.filesize || entry.filesize_approx || null,
            format: entry.format || null,
            extension: ext,
            mediaType,
            quality: entry.format_note || entry.resolution || null,
            extractor: this.name,
            metadata: {
                uploader: entry.uploader || null,
                uploadDate: entry.upload_date || null,
                viewCount: entry.view_count || null,
                likeCount: entry.like_count || null,
                description: entry.description ? entry.description.substring(0, 500) : null,
                formats,
                site: entry.extractor || entry.extractor_key || null,
            },
        });
    }
}

module.exports = YtdlpExtractor;
