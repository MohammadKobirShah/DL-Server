'use strict';

const queueService = require('../services/queue.service');
const { AppError } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/constants');

/**
 * GET /api/v1/jobs/:id
 * Get job status and result
 */
async function getJobStatus(req, res, next) {
    try {
        const { id } = req.params;

        const job = await queueService.getJob(id);

        if (!job) {
            throw new AppError('Job not found', 404, ERROR_CODES.JOB_NOT_FOUND);
        }

        res.json({
            success: true,
            data: job,
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/v1/jobs/:id/cancel
 * Cancel a job
 */
async function cancelJob(req, res, next) {
    try {
        const { id } = req.params;

        const result = await queueService.cancelJob(id);

        if (!result) {
            throw new AppError('Job not found', 404, ERROR_CODES.JOB_NOT_FOUND);
        }

        res.json({
            success: true,
            data: result,
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/v1/jobs/stats
 * Get queue statistics
 */
async function getQueueStats(req, res, next) {
    try {
        const stats = await queueService.getStats();

        res.json({
            success: true,
            data: stats,
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { getJobStatus, cancelJob, getQueueStats };
