'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');
const { ERROR_CODES } = require('../utils/constants');

/**
 * Global API rate limiter
 */
const globalLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: {
            code: ERROR_CODES.RATE_LIMIT,
            message: 'Too many requests, please slow down',
        },
    },
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress;
    },
});

/**
 * Stricter limiter for scrape/extract endpoints
 */
const scrapeLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: {
            code: ERROR_CODES.RATE_LIMIT,
            message: 'Scrape rate limit exceeded. Max 10 requests per minute.',
        },
    },
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress;
    },
});

module.exports = { globalLimiter, scrapeLimiter };
