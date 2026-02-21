'use strict';

const extractorRegistry = require('../extractors');
const logger = require('../utils/logger');
const { isValidUrl, getDomain } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/constants');

class ScraperService {
    /**
     * Scrape media from a URL
     */
    async scrape(url, options = {}) {
        if (!isValidUrl(url)) {
            throw new AppError('Invalid URL provided', 400, ERROR_CODES.VALIDATION_ERROR);
        }

        const domain = getDomain(url);
        logger.info(`[Scraper] Scraping: ${url} (domain: ${domain})`);

        const startTime = Date.now();

        try {
            const media = await extractorRegistry.extract(url, options);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

            logger.info(`[Scraper] Found ${media.length} items in ${elapsed}s from: ${url}`);

            return {
                url,
                domain,
                itemCount: media.length,
                items: media,
                extractionTime: `${elapsed}s`,
            };
        } catch (err) {
            logger.error(`[Scraper] Failed to scrape ${url}: ${err.message}`);
            throw new AppError(
                `Extraction failed: ${err.message}`,
                422,
                ERROR_CODES.EXTRACTION_FAILED
            );
        }
    }

    /**
     * Get all available formats for a URL
     */
    async getFormats(url) {
        if (!isValidUrl(url)) {
            throw new AppError('Invalid URL provided', 400, ERROR_CODES.VALIDATION_ERROR);
        }

        try {
            const formats = await extractorRegistry.getFormats(url);
            return formats;
        } catch (err) {
            throw new AppError(
                `Format extraction failed: ${err.message}`,
                422,
                ERROR_CODES.EXTRACTION_FAILED
            );
        }
    }
}

module.exports = new ScraperService();
