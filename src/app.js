'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { globalLimiter } = require('./middleware/rateLimiter');
const { apiKeyAuth } = require('./middleware/apiKey');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');
const logger = require('./utils/logger');

function createApp() {
    const app = express();

    // Trust proxy for rate limiting behind reverse proxies
    app.set('trust proxy', 1);

    // Security headers
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    }));

    // CORS
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
        maxAge: 86400,
    }));

    // Compression
    app.use(compression());

    // Body parsing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            logger.http(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, {
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                duration: `${duration}ms`,
                ip: req.ip,
            });
        });
        next();
    });

    // Global rate limiting
    app.use(globalLimiter);

    // Optional API key auth
    app.use(apiKeyAuth);

    // API routes
    app.use('/api/v1', routes);

    // Redirect root to API info
    app.get('/', (req, res) => {
        res.redirect('/api/v1');
    });

    // 404 handler
    app.use(notFoundHandler);

    // Global error handler
    app.use(errorHandler);

    return app;
}

module.exports = createApp;
