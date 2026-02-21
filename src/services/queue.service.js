'use strict';

const { Queue, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

class QueueService {
    constructor() {
        this.connection = null;
        this.queue = null;
        this.queueEvents = null;
        this._initialized = false;
    }

    /**
     * Initialize the queue connection
     */
    async init() {
        if (this._initialized) return;

        try {
            this.connection = new IORedis({
                host: config.redis.host,
                port: config.redis.port,
                password: config.redis.password,
                db: config.redis.db,
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
            });

            this.connection.on('error', (err) => {
                logger.error('[Queue] Redis connection error:', err.message);
            });

            this.connection.on('connect', () => {
                logger.info('[Queue] Redis connected');
            });

            this.queue = new Queue(config.queue.name, {
                connection: this.connection,
                defaultJobOptions: config.queue.defaultJobOptions,
            });

            this.queueEvents = new QueueEvents(config.queue.name, {
                connection: this.connection.duplicate(),
            });

            this._initialized = true;
            logger.info('[Queue] Service initialized');
        } catch (err) {
            logger.error('[Queue] Failed to initialize:', err.message);
            throw err;
        }
    }

    /**
     * Add a new job to the queue
     */
    async addJob(type, data) {
        await this.init();

        const job = await this.queue.add(type, {
            ...data,
            createdAt: new Date().toISOString(),
        }, {
            ...config.queue.defaultJobOptions,
            jobId: data.jobId || undefined,
        });

        logger.info(`[Queue] Job added: ${job.id} (type: ${type})`);

        return {
            jobId: job.id,
            type,
            status: 'queued',
        };
    }

    /**
     * Get job status and data
     */
    async getJob(jobId) {
        await this.init();

        const job = await this.queue.getJob(jobId);
        if (!job) return null;

        const state = await job.getState();

        return {
            jobId: job.id,
            type: job.name,
            status: state,
            data: job.data,
            result: job.returnvalue || null,
            failedReason: job.failedReason || null,
            progress: job.progress || 0,
            attempts: job.attemptsMade,
            createdAt: job.data.createdAt || null,
            processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
            finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        };
    }

    /**
     * Cancel/remove a job
     */
    async cancelJob(jobId) {
        await this.init();

        const job = await this.queue.getJob(jobId);
        if (!job) return null;

        const state = await job.getState();

        if (['completed', 'failed'].includes(state)) {
            await job.remove();
            return { jobId, status: 'removed' };
        }

        // For active jobs, we can't directly cancel, but we can move to failed
        if (state === 'active') {
            await job.moveToFailed(new Error('Cancelled by user'), '0', true);
            return { jobId, status: 'cancelled' };
        }

        // For waiting/delayed jobs
        await job.remove();
        return { jobId, status: 'removed' };
    }

    /**
     * Get queue statistics
     */
    async getStats() {
        await this.init();

        const [waiting, active, completed, failed, delayed] = await Promise.all([
            this.queue.getWaitingCount(),
            this.queue.getActiveCount(),
            this.queue.getCompletedCount(),
            this.queue.getFailedCount(),
            this.queue.getDelayedCount(),
        ]);

        return { waiting, active, completed, failed, delayed };
    }

    /**
     * Close connections
     */
    async close() {
        if (this.queueEvents) {
            await this.queueEvents.close();
        }
        if (this.queue) {
            await this.queue.close();
        }
        if (this.connection) {
            await this.connection.quit();
        }
        this._initialized = false;
        logger.info('[Queue] Connections closed');
    }
}

module.exports = new QueueService();
