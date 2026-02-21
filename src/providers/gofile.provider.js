'use strict';

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');

class GofileProvider {
    constructor() {
        this.name = 'gofile';
        this.maxSize = 0; // Unlimited for free tier
        this.baseUrl = 'https://api.gofile.io';
    }

    /**
     * Get the best available server
     */
    async _getServer() {
        try {
            const { data } = await axios.get(`${this.baseUrl}/servers`, { timeout: 10000 });
            if (data.status === 'ok' && data.data?.servers?.length > 0) {
                return data.data.servers[0].name;
            }
            // Fallback
            return 'store1';
        } catch (err) {
            logger.warn(`[Gofile] Failed to get server: ${err.message}`);
            return 'store1';
        }
    }

    /**
     * Upload file to Gofile
     */
    async upload(filePath, options = {}) {
        const server = await this._getServer();
        const uploadUrl = `https://${server}.gofile.io/uploadFile`;

        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));

        if (config.providers.gofile.apiKey) {
            form.append('token', config.providers.gofile.apiKey);
        }

        if (options.folderId) {
            form.append('folderId', options.folderId);
        }

        logger.info(`[Gofile] Uploading ${path.basename(filePath)} to ${server}...`);

        const { data } = await axios.post(uploadUrl, form, {
            headers: {
                ...form.getHeaders(),
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 600000,
        });

        if (data.status !== 'ok') {
            throw new Error(`Gofile upload failed: ${JSON.stringify(data)}`);
        }

        const result = {
            provider: this.name,
            success: true,
            fileId: data.data.fileId || data.data.id,
            fileName: data.data.fileName || path.basename(filePath),
            downloadUrl: data.data.downloadPage || `https://gofile.io/d/${data.data.parentFolder}`,
            directUrl: data.data.directLink || null,
            deleteToken: data.data.md5 || null,
            metadata: data.data,
        };

        logger.info(`[Gofile] Upload complete: ${result.downloadUrl}`);
        return result;
    }

    /**
     * Check if provider is available
     */
    async isAvailable() {
        try {
            const { data } = await axios.get(`${this.baseUrl}/servers`, { timeout: 5000 });
            return data.status === 'ok';
        } catch {
            return false;
        }
    }
}

module.exports = GofileProvider;
