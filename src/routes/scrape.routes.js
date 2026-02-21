'use strict';

const { Router } = require('express');
const { validate } = require('../middleware/validator');
const { scrapeLimiter } = require('../middleware/rateLimiter');
const {
    scrapeUrl,
    extractAndUpload,
    quickScrapeAndUpload,
    getFormats,
    listProviders,
    scrapeSchema,
    extractSchema,
    quickSchema,
} = require('../controllers/scrape.controller');

const router = Router();

// Get available upload providers
router.get('/providers', listProviders);

// Get available formats for a URL
router.get('/formats', getFormats);

// Quick scrape - extract media info only (no download)
router.post('/scrape', scrapeLimiter, validate(scrapeSchema), scrapeUrl);

// Full extract + upload (async with job queue)
router.post('/extract', scrapeLimiter, validate(extractSchema), extractAndUpload);

// Quick synchronous scrape + download + upload
router.post('/scrape/quick', scrapeLimiter, validate(quickSchema), quickScrapeAndUpload);

module.exports = router;
