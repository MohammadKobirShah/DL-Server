'use strict';

const Joi = require('joi');
const scraperService = require('../services/scraper.service');
const extractorService = require('../services/extractor.service');
const uploaderService = require('../services/uploader.service');
const queueService = require('../services/queue.service');
const { generateJobId, cleanupFile } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');
const { ERROR_CODES, JOB_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * POST /api/v1/scrape
 * Quick scrape - extract media info without downloading
 */
async function scrapeUrl(req, res, next) {
    try {
        const { url, extractor, audioOnly } = req.body;

        const result = await scraperService.scrape(url, { extractor, audioOnly });

        res.json({
            success: true,
            data: result,
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/v1/extract
 * Full extraction - scrape + download + upload to file hosts
 * Returns a job ID for async processing
 */
async function extractAndUpload(req, res, next) {
    try {
        const { url, extractor, audioOnly, providers, uploadMode, format, quality } = req.body;
        const jobId = generateJobId();

        await queueService.addJob('extract-and-upload', {
            jobId,
            url,
            extractor: extractor || 'auto',
            audioOnly: audioOnly || false,
            providers: providers || null,
            uploadMode: uploadMode || 'all',
            format: format || null,
            quality: quality || null,
        });

        res.status(202).json({
            success: true,
            data: {
                jobId,
                status: JOB_STATUS.QUEUED,
                message: 'Job queued for processing',
                statusUrl: `/api/v1/jobs/${jobId}`,
            },
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/v1/scrape/quick
 * Quick mode - scrape, download first item, upload to first provider, return link
 * Synchronous response (may take a while)
 */
async function quickScrapeAndUpload(req, res, next) {
    let filePath = null;

    try {
        const { url, extractor, audioOnly, provider } = req.body;

        // 1. Scrape
        const scrapeResult = await scraperService.scrape(url, { extractor, audioOnly });

        if (!scrapeResult.items || scrapeResult.items.length === 0) {
            throw new AppError('No media found at the provided URL', 404, ERROR_CODES.NOT_FOUND);
        }

        const media = scrapeResult.items[0];

        if (!media.directUrl) {
            throw new AppError('No direct download URL found', 422, ERROR_CODES.EXTRACTION_FAILED);
        }

        // 2. Download
        logger.info(`[Quick] Downloading: ${media.directUrl}`);
        let downloadResult;

        try {
            downloadResult = await extractorService.download(media.directUrl, {
                extension: media.extension,
            });
        } catch {
            // Fallback to yt-dlp download
            downloadResult = await extractorService.downloadWithYtdlp(url, { audioOnly });
        }

        filePath = downloadResult.filePath;

        // 3. Upload
        const uploadResult = await uploaderService.upload(filePath, {
            mode: provider ? 'specific' : 'first',
            provider,
        });

        // 4. Cleanup
        await cleanupFile(filePath);

        res.json({
            success: true,
            data: {
                media: {
                    title: media.title,
                    mediaType: media.mediaType,
                    duration: media.duration,
                    thumbnail: media.thumbnail,
                },
                download: {
                    size: downloadResult.size,
                },
                uploads: uploadResult.uploads,
            },
        });
    } catch (err) {
        if (filePath) await cleanupFile(filePath);
        next(err);
    }
}

/**
 * GET /api/v1/formats
 * Get all available formats for a URL
 */
async function getFormats(req, res, next) {
    try {
        const { url } = req.query;

        if (!url) {
            throw new AppError('URL query parameter is required', 400, ERROR_CODES.VALIDATION_ERROR);
        }

        const formats = await scraperService.getFormats(url);

        res.json({
            success: true,
            data: { formats },
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/v1/providers
 * List available upload providers
 */
async function listProviders(req, res, next) {
    try {
        const all = uploaderService.getAllProviders();
        const available = await uploaderService.getAvailableProviders();

        res.json({
            success: true,
            data: {
                providers: all.map((name) => ({
                    name,
                    available: available.includes(name),
                })),
            },
        });
    } catch (err) {
        next(err);
    }
}

// Validation schemas
const scrapeSchema = Joi.object({
    url: Joi.string().uri().required().messages({
        'string.uri': 'A valid URL is required',
        'any.required': 'URL is required',
    }),
    extractor: Joi.string().valid('auto', 'ytdlp', 'browser', 'direct').default('auto'),
    audioOnly: Joi.boolean().default(false),
});

const extractSchema = Joi.object({
    url: Joi.string().uri().required(),
    extractor: Joi.string().valid('auto', 'ytdlp', 'browser', 'direct').default('auto'),
    audioOnly: Joi.boolean().default(false),
    providers: Joi.array().items(Joi.string()).default(null),
    uploadMode: Joi.string().valid('all', 'first', 'specific').default('all'),
    format: Joi.string().allow(null, '').default(null),
    quality: Joi.string().allow(null, '').default(null),
});

const quickSchema = Joi.object({
    url: Joi.string().uri().required(),
    extractor: Joi.string().valid('auto', 'ytdlp', 'browser', 'direct').default('auto'),
    audioOnly: Joi.boolean().default(false),
    provider: Joi.string().allow(null, '').default(null),
});

module.exports = {
    scrapeUrl,
    extractAndUpload,
    quickScrapeAndUpload,
    getFormats,
    listProviders,
    scrapeSchema,
    extractSchema,
    quickSchema,
};
