'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');
const scraperService = require('../services/scraper.service');
const extractorService = require('../services/extractor.service');
const uploaderService = require('../services/uploader.service');
const { cleanupFile, ensureTempDir, formatFileSize } = require('../utils/helpers');
const { JOB_STATUS } = require('../utils/constants');

ensureTempDir();

// Create Redis connection for worker
const connection = new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

connection.on('connect', () => {
    logger.info('[Worker] Connected to Redis');
});

connection.on('error', (err) => {
    logger.error('[Worker] Redis error:', err.message);
});

/**
 * Process an extract-and-upload job
 */
async function processJob(job) {
    const { url, extractor, audioOnly, providers, uploadMode, format } = job.data;
    let filePath = null;

    try {
        // Stage 1: Extract media info
        await job.updateProgress(10);
        await job.log(`Extracting media from: ${url}`);
        logger.info(`[Worker] Job ${job.id}: Extracting ${url}`);

        const scrapeResult = await scraperService.scrape(url, { extractor, audioOnly });

        if (!scrapeResult.items || scrapeResult.items.length === 0) {
            throw new Error('No media found at the provided URL');
        }

        const media = scrapeResult.items[0];
        await job.updateProgress(25);
        await job.log(`Found: ${media.title} (${media.mediaType})`);

        // Stage 2: Download
        await job.log(`Downloading: ${media.directUrl || url}`);
        logger.info(`[Worker] Job ${job.id}: Downloading`);

        let downloadResult;

        if (media.directUrl) {
            try {
                downloadResult = await extractorService.download(media.directUrl, {
                    extension: media.extension,
                    headers: media.metadata?.headers || {},
                });
            } catch (dlErr) {
                logger.warn(`[Worker] Direct download failed, trying yt-dlp: ${dlErr.message}`);
                downloadResult = await extractorService.downloadWithYtdlp(url, {
                    audioOnly,
                    format,
                });
            }
        } else {
            downloadResult = await extractorService.downloadWithYtdlp(url, {
                audioOnly,
                format,
            });
        }

        filePath = downloadResult.filePath;
        await job.updateProgress(60);
        await job.log(`Downloaded: ${formatFileSize(downloadResult.size)}`);
        logger.info(`[Worker] Job ${job.id}: Downloaded ${formatFileSize(downloadResult.size)}`);

        // Stage 3: Upload to providers
        await job.log(`Uploading to providers (mode: ${uploadMode || 'all'})...`);
        logger.info(`[Worker] Job ${job.id}: Uploading`);

        const uploadResult = await uploaderService.upload(filePath, {
            mode: uploadMode || 'all',
            providers: providers || undefined,
            fileName: `${media.title || 'download'}.${media.extension || 'mp4'}`,
        });

        await job.updateProgress(95);

        // Stage 4: Cleanup
        await cleanupFile(filePath);
        filePath = null;
        await job.updateProgress(100);

        const result = {
            media: {
                title: media.title,
                mediaType: media.mediaType,
                duration: media.duration,
                thumbnail: media.thumbnail,
                quality: media.quality,
            },
            download: {
                size: downloadResult.size,
                sizeFormatted: formatFileSize(downloadResult.size),
            },
            uploads: uploadResult.uploads,
            failed: uploadResult.failed,
            status: JOB_STATUS.COMPLETED,
        };

        await job.log(`Completed! ${uploadResult.totalSuccess} uploads succeeded`);
        logger.info(`[Worker] Job ${job.id}: Completed with ${uploadResult.totalSuccess} uploads`);

        return result;
    } catch (err) {
        // Cleanup on error
        if (filePath) await cleanupFile(filePath);

        logger.error(`[Worker] Job ${job.id} failed:`, err.message);
        await job.log(`Failed: ${err.message}`);
        throw err;
    }
}

// Create the worker
const worker = new Worker(config.queue.name, processJob, {
    connection,
    concurrency: config.concurrency.maxJobs,
    limiter: {
        max: 10,
        duration: 60000,
    },
    removeOnComplete: { count: 100, age: 3600 },
    removeOnFail: { count: 50, age: 86400 },
});

// Worker event handlers
worker.on('completed', (job, result) => {
    logger.info(`[Worker] ✅ Job ${job.id} completed`, {
        uploads: result?.uploads?.length || 0,
    });
});

worker.on('failed', (job, err) => {
    logger.error(`[Worker] ❌ Job ${job?.id} failed: ${err.message}`, {
        attempts: job?.attemptsMade,
    });
});

worker.on('active', (job) => {
    logger.info(`[Worker] 🔄 Job ${job.id} started processing`);
});

worker.on('stalled', (jobId) => {
    logger.warn(`[Worker] ⚠️ Job ${jobId} stalled`);
});

worker.on('error', (err) => {
    logger.error('[Worker] Error:', err.message);
});

// Graceful shutdown
const shutdown = async (signal) => {
    logger.info(`[Worker] ${signal} received, shutting down...`);
    await worker.close();
    await connection.quit();
    logger.info('[Worker] Shutdown complete');
    process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

logger.info('='.repeat(60));
logger.info(`  Media Scraper Worker`);
logger.info(`  Queue: ${config.queue.name}`);
logger.info(`  Concurrency: ${config.concurrency.maxJobs}`);
logger.info(`  Redis: ${config.redis.host}:${config.redis.port}`);
logger.info('='.repeat(60));
