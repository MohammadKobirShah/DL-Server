'use strict';

const { Router } = require('express');
const scrapeRoutes = require('./scrape.routes');
const jobsRoutes = require('./jobs.routes');
const uploaderService = require('../services/uploader.service');

const router = Router();

// Health check
router.get('/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            version: require('../../package.json').version,
            node: process.version,
        },
    });
});

// API info
router.get('/', (req, res) => {
    res.json({
        success: true,
        data: {
            name: 'Media Scraper API',
            version: require('../../package.json').version,
            description: 'Professional media scraping, extraction & re-hosting API',
            endpoints: {
                'POST /api/v1/scrape': 'Extract media info from URL (quick, no download)',
                'POST /api/v1/extract': 'Full extract + upload (async job queue)',
                'POST /api/v1/scrape/quick': 'Quick scrape + download + upload (synchronous)',
                'GET /api/v1/formats?url=': 'Get available formats for a URL',
                'GET /api/v1/providers': 'List upload providers',
                'GET /api/v1/jobs/:id': 'Get job status',
                'POST /api/v1/jobs/:id/cancel': 'Cancel a job',
                'GET /api/v1/jobs/stats': 'Queue statistics',
                'GET /api/v1/health': 'Health check',
            },
        },
    });
});

// Mount route groups
router.use('/', scrapeRoutes);
router.use('/jobs', jobsRoutes);

module.exports = router;
