'use strict';

const GofileProvider = require('./gofile.provider');
const PixeldrainProvider = require('./pixeldrain.provider');
const FileioProvider = require('./fileio.provider');
const CatboxProvider = require('./catbox.provider');
const TransfershProvider = require('./transfersh.provider');
const logger = require('../utils/logger');

class ProviderRegistry {
    constructor() {
        this.providers = new Map();

        // Register all providers
        this._register(new GofileProvider());
        this._register(new PixeldrainProvider());
        this._register(new FileioProvider());
        this._register(new CatboxProvider());
        this._register(new TransfershProvider());
    }

    _register(provider) {
        this.providers.set(provider.name, provider);
    }

    /**
     * Get a provider by name
     */
    get(name) {
        const provider = this.providers.get(name);
        if (!provider) {
            throw new Error(`Unknown provider: ${name}`);
        }
        return provider;
    }

    /**
     * Get all provider names
     */
    getNames() {
        return Array.from(this.providers.keys());
    }

    /**
     * Get all available providers (that respond to health check)
     */
    async getAvailable() {
        const results = await Promise.allSettled(
            Array.from(this.providers.entries()).map(async ([name, provider]) => {
                const available = await provider.isAvailable();
                return { name, available };
            })
        );

        return results
            .filter((r) => r.status === 'fulfilled' && r.value.available)
            .map((r) => r.value.name);
    }

    /**
     * Upload a file to a specific provider
     */
    async upload(providerName, filePath, options = {}) {
        const provider = this.get(providerName);
        return provider.upload(filePath, options);
    }

    /**
     * Upload to multiple providers with failover
     * Returns results from all successful uploads
     */
    async uploadToMultiple(filePath, providerNames = null, options = {}) {
        const names = providerNames || this.getNames();
        const results = [];
        const errors = [];

        for (const name of names) {
            try {
                const result = await this.upload(name, filePath, options);
                results.push(result);
                logger.info(`[Registry] Upload to ${name} succeeded`);
            } catch (err) {
                errors.push({ provider: name, error: err.message });
                logger.warn(`[Registry] Upload to ${name} failed: ${err.message}`);
            }
        }

        if (results.length === 0) {
            throw new Error(
                `All uploads failed:\n${errors.map((e) => `  - ${e.provider}: ${e.error}`).join('\n')}`
            );
        }

        return { results, errors };
    }

    /**
     * Upload to the first available provider
     */
    async uploadToFirst(filePath, options = {}) {
        const names = this.getNames();

        for (const name of names) {
            try {
                const provider = this.get(name);
                const available = await provider.isAvailable();
                if (!available) continue;

                const result = await provider.upload(filePath, options);
                return result;
            } catch (err) {
                logger.warn(`[Registry] ${name} failed, trying next: ${err.message}`);
            }
        }

        throw new Error('No upload providers available');
    }
}

// Singleton
module.exports = new ProviderRegistry();
