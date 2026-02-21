'use strict';

const providerRegistry = require('../providers');
const logger = require('../utils/logger');
const pLimit = require('p-limit');
const config = require('../config');

class UploaderService {
    constructor() {
        this.concurrencyLimit = pLimit(config.concurrency.maxUploads);
    }

    /**
     * Upload a file to specified or all providers
     */
    async upload(filePath, options = {}) {
        const providers = options.providers || providerRegistry.getNames();
        const mode = options.mode || 'all'; // 'all', 'first', 'specific'

        logger.info(`[Uploader] Uploading to providers: ${providers.join(', ')} (mode: ${mode})`);

        if (mode === 'first') {
            return this._uploadToFirst(filePath, providers, options);
        }

        if (mode === 'specific' && options.provider) {
            return this._uploadToSpecific(filePath, options.provider, options);
        }

        return this._uploadToAll(filePath, providers, options);
    }

    /**
     * Upload to all providers concurrently
     */
    async _uploadToAll(filePath, providers, options) {
        const tasks = providers.map((name) =>
            this.concurrencyLimit(async () => {
                try {
                    const result = await providerRegistry.upload(name, filePath, options);
                    return { success: true, ...result };
                } catch (err) {
                    logger.warn(`[Uploader] ${name} failed: ${err.message}`);
                    return {
                        success: false,
                        provider: name,
                        error: err.message,
                    };
                }
            })
        );

        const results = await Promise.all(tasks);
        const successful = results.filter((r) => r.success);
        const failed = results.filter((r) => !r.success);

        logger.info(
            `[Uploader] Completed: ${successful.length} succeeded, ${failed.length} failed`
        );

        return {
            uploads: successful,
            failed,
            totalSuccess: successful.length,
            totalFailed: failed.length,
        };
    }

    /**
     * Upload to the first available provider
     */
    async _uploadToFirst(filePath, providers, options) {
        for (const name of providers) {
            try {
                const result = await providerRegistry.upload(name, filePath, options);
                return {
                    uploads: [result],
                    failed: [],
                    totalSuccess: 1,
                    totalFailed: 0,
                };
            } catch (err) {
                logger.warn(`[Uploader] ${name} failed, trying next: ${err.message}`);
            }
        }

        throw new Error('All providers failed');
    }

    /**
     * Upload to a specific provider
     */
    async _uploadToSpecific(filePath, providerName, options) {
        const result = await providerRegistry.upload(providerName, filePath, options);
        return {
            uploads: [result],
            failed: [],
            totalSuccess: 1,
            totalFailed: 0,
        };
    }

    /**
     * Get available providers
     */
    async getAvailableProviders() {
        return providerRegistry.getAvailable();
    }

    /**
     * Get all provider names
     */
    getAllProviders() {
        return providerRegistry.getNames();
    }
}

module.exports = new UploaderService();
