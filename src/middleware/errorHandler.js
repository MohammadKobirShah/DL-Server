'use strict';

const logger = require('../utils/logger');
const config = require('../config');
const { ERROR_CODES } = require('../utils/constants');

/**
 * Custom application error with status code and error code
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = ERROR_CODES.INTERNAL_ERROR, details = null) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * 404 handler for unknown routes
 */
function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: {
            code: ERROR_CODES.NOT_FOUND,
            message: `Route ${req.method} ${req.originalUrl} not found`,
        },
    });
}

/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, _next) {
    // Default values
    let statusCode = err.statusCode || 500;
    let code = err.code || ERROR_CODES.INTERNAL_ERROR;
    let message = err.message || 'Internal server error';
    let details = err.details || null;

    // Handle specific error types
    if (err.name === 'ValidationError') {
        statusCode = 400;
        code = ERROR_CODES.VALIDATION_ERROR;
    } else if (err.name === 'SyntaxError' && err.status === 400) {
        statusCode = 400;
        code = ERROR_CODES.VALIDATION_ERROR;
        message = 'Invalid JSON in request body';
    }

    // Log the error
    if (statusCode >= 500) {
        logger.error('Unhandled error:', {
            error: message,
            code,
            stack: err.stack,
            path: req.originalUrl,
            method: req.method,
        });
    } else {
        logger.warn('Client error:', {
            error: message,
            code,
            path: req.originalUrl,
            method: req.method,
        });
    }

    // Build response
    const response = {
        success: false,
        error: {
            code,
            message,
        },
    };

    if (details) {
        response.error.details = details;
    }

    // Include stack trace in development
    if (config.isDev && err.stack) {
        response.error.stack = err.stack.split('\n').map((l) => l.trim());
    }

    res.status(statusCode).json(response);
}

module.exports = { AppError, notFoundHandler, errorHandler };
