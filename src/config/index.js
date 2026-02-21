'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const config = {
    env: process.env.NODE_ENV || 'development',
    isDev: (process.env.NODE_ENV || 'development') === 'development',
    isProd: process.env.NODE_ENV === 'production',

    server: {
        port: parseInt(process.env.PORT, 10) || 3000,
        host: process.env.HOST || '0.0.0.0',
    },

    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB, 10) || 0,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    },

    auth: {
        enabled: process.env.API_KEY_ENABLED === 'true',
        keys: (process.env.API_KEYS || '').split(',').filter(Boolean),
    },

    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    },

    storage: {
        tempDir: path.resolve(process.env.TEMP_DIR || './tmp'),
        maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 2048,
        get maxFileSizeBytes() {
            return this.maxFileSizeMB * 1024 * 1024;
        },
        cleanupIntervalMs: parseInt(process.env.CLEANUP_INTERVAL_MS, 10) || 3600000,
    },

    ytdlp: {
        path: process.env.YTDLP_PATH || 'yt-dlp',
        cookiesFile: process.env.YTDLP_COOKIES_FILE || null,
        proxy: process.env.YTDLP_PROXY || null,
    },

    puppeteer: {
        headless: process.env.PUPPETEER_HEADLESS !== 'false',
        timeout: parseInt(process.env.PUPPETEER_TIMEOUT, 10) || 30000,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    },

    providers: {
        gofile: {
            apiKey: process.env.GOFILE_API_KEY || null,
        },
        pixeldrain: {
            apiKey: process.env.PIXELDRAIN_API_KEY || null,
        },
        fileio: {
            expiry: process.env.FILEIO_EXPIRY || '14d',
        },
        catbox: {
            userHash: process.env.CATBOX_USERHASH || null,
        },
        transfersh: {
            url: process.env.TRANSFERSH_URL || 'https://transfer.sh',
            maxDays: parseInt(process.env.TRANSFERSH_MAX_DAYS, 10) || 14,
        },
    },

    logging: {
        level: process.env.LOG_LEVEL || 'debug',
        dir: path.resolve(process.env.LOG_DIR || './logs'),
    },

    concurrency: {
        maxJobs: parseInt(process.env.MAX_CONCURRENT_JOBS, 10) || 3,
        maxUploads: parseInt(process.env.MAX_CONCURRENT_UPLOADS, 10) || 2,
        maxDownloads: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS, 10) || 2,
    },

    queue: {
        name: 'media-processing',
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { count: 100, age: 3600 },
            removeOnFail: { count: 50, age: 86400 },
        },
    },
};

module.exports = config;
