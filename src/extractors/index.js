'use strict';

const YtdlpExtractor = require('./ytdlp.extractor');
const BrowserExtractor = require('./browser.extractor');
const DirectExtractor = require('./direct.extractor');
const logger = require('../utils/logger');

class ExtractorRegistry {
    constructor() {
        this.ytdlp = new YtdlpExtractor();
        this.browser = new BrowserExtractor();
        this.direct = new DirectExtractor();
    }

    /**
     * Extract media from URL using the best available extractor.
     * Strategy: yt-dlp first → browser fallback → direct link fallback
     */
    async extract(url, options = {}) {
        const strategy = options.extractor || 'auto';

        if (strategy !== 'auto') {
            return this._runExtractor(strategy, url, options);
        }

        // Auto strategy: try extractors in order of reliability
        const errors = [];

        // 1. Try yt-dlp (supports 1000+ sites)
        try {
            const ytdlpAvailable = await this.ytdlp.isAvailable();
            if (ytdlpAvailable) {
                const results = await this.ytdlp.extract(url, options);
                if (results && results.length > 0) {
                    logger.info(`[Registry] yt-dlp succeeded for: ${url} (${results.length} items)`);
                    return results;
                }
            }
        } catch (err) {
            errors.push({ extractor: 'ytdlp', error: err.message });
            logger.debug(`[Registry] yt-dlp failed for ${url}: ${err.message}`);
        }

        // 2. Try direct extraction (lightweight, no browser needed)
        try {
            const results = await this.direct.extract(url, options);
            if (results && results.length > 0) {
                logger.info(`[Registry] Direct extraction succeeded for: ${url} (${results.length} items)`);
                return results;
            }
        } catch (err) {
            errors.push({ extractor: 'direct', error: err.message });
            logger.debug(`[Registry] Direct extraction failed for ${url}: ${err.message}`);
        }

        // 3. Try browser extraction (heavy but handles JS-rendered content)
        try {
            const results = await this.browser.extract(url, options);
            if (results && results.length > 0) {
                logger.info(`[Registry] Browser extraction succeeded for: ${url} (${results.length} items)`);
                return results;
            }
        } catch (err) {
            errors.push({ extractor: 'browser', error: err.message });
            logger.debug(`[Registry] Browser extraction failed for ${url}: ${err.message}`);
        }

        // All extractors failed
        logger.error(`[Registry] All extractors failed for: ${url}`, { errors });
        throw new Error(
            `No media found. All extractors failed:\n${errors.map((e) => `  - ${e.extractor}: ${e.error}`).join('\n')}`
        );
    }

    /**
     * Run a specific extractor by name
     */
    async _runExtractor(name, url, options) {
        switch (name) {
            case 'ytdlp':
                return this.ytdlp.extract(url, options);
            case 'browser':
                return this.browser.extract(url, options);
            case 'direct':
                return this.direct.extract(url, options);
            default:
                throw new Error(`Unknown extractor: ${name}`);
        }
    }

    /**
     * Get all available formats for a URL (uses yt-dlp)
     */
    async getFormats(url) {
        return this.ytdlp.extractAll(url);
    }

    /**
     * Cleanup resources
     */
    async destroy() {
        await this.browser.close();
    }
}

// Singleton instance
module.exports = new ExtractorRegistry();
