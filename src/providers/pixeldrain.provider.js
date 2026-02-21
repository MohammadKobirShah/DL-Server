'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');

class PixeldrainProvider {
    constructor() {
        this.name = 'pixeldrain';
        this.maxSize = 20 * 1024 * 1024 * 1024; // 20GB with API key, 5GB without
        this.baseUrl = 'https://pixeldrain.com/api';
    }

    /**
     * Upload file to Pixeldrain
     */
    async upload(filePath, options = {}) {
        const fileName = options.fileName || path.basename(filePath);
        const fileStream = fs.createReadStream(filePath);
        const stat = fs.statSync(filePath);

        const uploadUrl = `${this.baseUrl}/file/${encodeURIComponent(fileName)}`;

        const headers = {
            'Content-Type': 'application/octet-stream',
            'Content-Length': stat.size,
        };

        // Add auth if API key is configured
        if (config.providers.pixeldrain.apiKey) {
            const auth = Buffer.from(`:${config.providers.pixeldrain.apiKey}`).toString('base64');
            headers['Authorization'] = `Basic ${auth}`;
        }

        logger.info(`[Pixeldrain] Uploading ${fileName} (${stat.size} bytes)...`);

        const { data } = await axios.put(uploadUrl, fileStream, {
            headers,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 600000,
        });

        if (!data.id) {
            throw new Error(`Pixeldrain upload failed: ${JSON.stringify(data)}`);
        }

        const result = {
            provider: this.name,
            success: true,
            fileId: data.id,
            fileName,
            downloadUrl: `https://pixeldrain.com/u/${data.id}`,
            directUrl: `https://pixeldrain.com/api/file/${data.id}?download`,
            metadata: data,
        };

        logger.info(`[Pixeldrain] Upload complete: ${result.downloadUrl}`);
        return result;
    }

    /**
     * Check if provider is available
     */
    async isAvailable() {
        try {
            const { status } = await axios.get(`${this.baseUrl}/misc/rate_limits`, { timeout: 5000 });
            return status === 200;
        } catch {
            return false;
        }
    }
}

module.exports = PixeldrainProvider;
