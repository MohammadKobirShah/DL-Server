'use strict';

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure log directory exists
if (!fs.existsSync(config.logging.dir)) {
    fs.mkdirSync(config.logging.dir, { recursive: true });
}

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
    winston.format.colorize({ all: true }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level}: ${stack || message}${metaStr}`;
    })
);

const transports = [
    new winston.transports.Console({
        format: config.isDev ? consoleFormat : logFormat,
    }),
];

if (config.isProd) {
    transports.push(
        new winston.transports.File({
            filename: path.join(config.logging.dir, 'error.log'),
            level: 'error',
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
            tailable: true,
        }),
        new winston.transports.File({
            filename: path.join(config.logging.dir, 'combined.log'),
            maxsize: 10 * 1024 * 1024,
            maxFiles: 10,
            tailable: true,
        })
    );
}

const logger = winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    defaultMeta: { service: 'media-scraper-api' },
    transports,
    exitOnError: false,
});

// Stream for Morgan HTTP logging
logger.stream = {
    write: (message) => {
        logger.http(message.trim());
    },
};

module.exports = logger;
