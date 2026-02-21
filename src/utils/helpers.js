'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sanitize = require('sanitize-filename');
const bytes = require('bytes');
const { nanoid } = require('nanoid');
const config = require('../config');
const {
    VIDEO_EXTENSIONS, AUDIO_EXTENSIONS,
    VIDEO_MIMES, AUDIO_MIMES,
    MEDIA_TYPES,
} = require('./constants');

/**
 * Generate a unique job ID
 */
function generateJobId() {
    return nanoid(16);
}

/**
 * Generate a unique filename for temp storage
 */
function generateTempFilename(ext = '') {
    const id = crypto.randomBytes(8).toString('hex');
    return `media_${id}${ext}`;
}

/**
 * Get a safe temp file path
 */
function getTempFilePath(filename) {
    const safe = sanitize(filename);
    return path.join(config.storage.tempDir, safe || generateTempFilename());
}

/**
 * Ensure temp directory exists
 */
function ensureTempDir() {
    if (!fs.existsSync(config.storage.tempDir)) {
        fs.mkdirSync(config.storage.tempDir, { recursive: true });
    }
}

/**
 * Clean up a temp file
 */
async function cleanupFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        // Silently ignore cleanup errors
    }
}

/**
 * Clean up old temp files
 */
async function cleanupTempFiles(maxAgeMs = 3600000) {
    try {
        ensureTempDir();
        const files = fs.readdirSync(config.storage.tempDir);
        const now = Date.now();
        let cleaned = 0;

        for (const file of files) {
            const filePath = path.join(config.storage.tempDir, file);
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > maxAgeMs) {
                fs.unlinkSync(filePath);
                cleaned++;
            }
        }
        return cleaned;
    } catch {
        return 0;
    }
}

/**
 * Detect media type from MIME type
 */
function getMediaTypeFromMime(mimeType) {
    if (!mimeType) return MEDIA_TYPES.UNKNOWN;
    const lower = mimeType.toLowerCase();
    if (VIDEO_MIMES.some((m) => lower.startsWith(m))) return MEDIA_TYPES.VIDEO;
    if (AUDIO_MIMES.some((m) => lower.startsWith(m))) return MEDIA_TYPES.AUDIO;
    return MEDIA_TYPES.UNKNOWN;
}

/**
 * Detect media type from file extension
 */
function getMediaTypeFromExt(ext) {
    if (!ext) return MEDIA_TYPES.UNKNOWN;
    const lower = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    if (VIDEO_EXTENSIONS.includes(lower)) return MEDIA_TYPES.VIDEO;
    if (AUDIO_EXTENSIONS.includes(lower)) return MEDIA_TYPES.AUDIO;
    return MEDIA_TYPES.UNKNOWN;
}

/**
 * Format file size for display
 */
function formatFileSize(sizeInBytes) {
    return bytes(sizeInBytes, { unitSeparator: ' ', decimalPlaces: 2 });
}

/**
 * Validate URL format
 */
function isValidUrl(str) {
    try {
        const url = new URL(str);
        return ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
}

/**
 * Extract domain from URL
 */
function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

/**
 * Sleep / delay utility
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truncate string to max length
 */
function truncate(str, maxLen = 200) {
    if (!str || str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
}

/**
 * Get file extension from URL or filename
 */
function getExtFromUrl(url) {
    try {
        const pathname = new URL(url).pathname;
        return path.extname(pathname).toLowerCase() || '';
    } catch {
        return path.extname(url).toLowerCase() || '';
    }
}

/**
 * Build a standardized media info object
 */
function buildMediaInfo(data = {}) {
    return {
        id: data.id || generateJobId(),
        title: data.title || 'Untitled',
        url: data.url || null,
        directUrl: data.directUrl || null,
        thumbnail: data.thumbnail || null,
        duration: data.duration || null,
        filesize: data.filesize || null,
        format: data.format || null,
        extension: data.extension || null,
        mediaType: data.mediaType || MEDIA_TYPES.UNKNOWN,
        quality: data.quality || null,
        extractor: data.extractor || null,
        metadata: data.metadata || {},
    };
}

module.exports = {
    generateJobId,
    generateTempFilename,
    getTempFilePath,
    ensureTempDir,
    cleanupFile,
    cleanupTempFiles,
    getMediaTypeFromMime,
    getMediaTypeFromExt,
    formatFileSize,
    isValidUrl,
    getDomain,
    sleep,
    truncate,
    getExtFromUrl,
    buildMediaInfo,
};
