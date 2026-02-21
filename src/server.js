'use strict';

const config = require('./config');
const createApp = require('./app');
const logger = require('./utils/logger');
const queueService = require('./services/queue.service');
const { ensureTempDir, cleanupTempFiles } = require('./utils/helpers');

async function startServer() {
    try {
        // Ensure directories exist
        ensureTempDir();

        // Initialize queue
        try {
            await queueService.init();
            logger.info('Queue service connected to Redis');
        } catch (err) {
            logger.warn(`Queue service unavailable (Redis not running?): ${err.message}`);
            logger.warn('Async jobs will not work. Synchronous endpoints (/scrape, /scrape/quick) will still function.');
        }

        // Create Express app
        const app = createApp();

        // Start HTTP server
        const server = app.listen(config.server.port, config.server.host, () => {
            logger.info('='.repeat(60));
            logger.info(`  Media Scraper API v${require('../package.json').version}`);
            logger.info(`  Environment: ${config.env}`);
            logger.info(`  Server: http://${config.server.host}:${config.server.port}`);
            logger.info(`  API Base: http://localhost:${config.server.port}/api/v1`);
            logger.info(`  Health: http://localhost:${config.server.port}/api/v1/health`);
            logger.info(`  Auth: ${config.auth.enabled ? 'ENABLED' : 'DISABLED'}`);
            logger.info('='.repeat(60));
        });

        // Periodic temp file cleanup
        const cleanupInterval = setInterval(async () => {
            const cleaned = await cleanupTempFiles(config.storage.cleanupIntervalMs);
            if (cleaned > 0) {
                logger.info(`[Cleanup] Removed ${cleaned} old temp files`);
            }
        }, config.storage.cleanupIntervalMs);

        // Graceful shutdown
        const shutdown = async (signal) => {
            logger.info(`\n${signal} received. Starting graceful shutdown...`);

            clearInterval(cleanupInterval);

            server.close(async () => {
                logger.info('HTTP server closed');

                try {
                    await queueService.close();
                } catch { }

                // Final cleanup
                const cleaned = await cleanupTempFiles(0);
                logger.info(`[Cleanup] Removed ${cleaned} temp files on shutdown`);

                logger.info('Goodbye! 👋');
                process.exit(0);
            });

            // Force close after 30 seconds
            setTimeout(() => {
                logger.error('Forced shutdown after timeout');
                process.exit(1);
            }, 30000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        process.on('uncaughtException', (err) => {
            logger.error('Uncaught Exception:', err);
            shutdown('UNCAUGHT_EXCEPTION');
        });

        process.on('unhandledRejection', (reason) => {
            logger.error('Unhandled Rejection:', reason);
        });

        return server;
    } catch (err) {
        logger.error('Failed to start server:', err);
        process.exit(1);
    }
}

startServer();
