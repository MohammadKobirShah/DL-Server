'use strict';

const config = require('../config');
const { ERROR_CODES } = require('../utils/constants');

/**
 * Optional API key authentication middleware
 * Expects: Authorization: Bearer <api-key>  OR  x-api-key: <api-key>
 */
function apiKeyAuth(req, res, next) {
    // Skip if auth is disabled
    if (!config.auth.enabled) {
        return next();
    }

    // Extract key from Authorization header or x-api-key
    let apiKey = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.slice(7).trim();
    }

    if (!apiKey) {
        apiKey = req.headers['x-api-key'];
    }

    if (!apiKey) {
        apiKey = req.query.api_key;
    }

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            error: {
                code: ERROR_CODES.AUTH_REQUIRED,
                message: 'API key is required. Provide via Authorization header, x-api-key header, or api_key query parameter.',
            },
        });
    }

    // Validate
    if (!config.auth.keys.includes(apiKey)) {
        return res.status(403).json({
            success: false,
            error: {
                code: ERROR_CODES.AUTH_REQUIRED,
                message: 'Invalid API key',
            },
        });
    }

    req.apiKey = apiKey;
    next();
}

module.exports = { apiKeyAuth };
