'use strict';

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');

class FileioProvider {
    constructor() {
        this.name = 'fileio';
        this.maxSize = 2 * 1024 * 1024 * 1024; // 2GB
        this.baseUrl = 'https://file.io';
    }

    /**
     * Upload file to file.io
     */
    async upload(filePath, options = {}) {
        const fileName = options.fileName || path.basename(filePath);
        const expiry = options.expiry || config.providers.fileio.expiry || '14d';

        const form = new FormData();
        form.append('file', fs.createReadStream(filePath), { filename: fileName });

        logger.info(`[file.io] Uploading ${fileName} (expires: ${expiry})...`);

        const { data } = await axios.post(this.baseUrl, form, {
            headers: form.getHeaders(),
            params: {
                expires: expiry,
                autoDelete: options.autoDelete !== false ? 'true' : 'false',
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 600000,
        });

        if (!data.success) {
            throw new Error(`file.io upload failed: ${data.message || JSON.stringify(data)}`);
        }

        const result = {
            provider: this.name,
            success: true,
            fileId: data.key || data.id,
            fileName: data.name || fileName,
            downloadUrl: data.link,
            directUrl: data.link,
            expiry: data.expires || expiry,
            autoDelete: true,
            metadata: {
                size: data.size,
                expires: data.expires,
                key: data.key,
            },
        };

        logger.info(`[file.io] Upload complete: ${result.downloadUrl}`);
        return result;
    }

    /**
     * Check if provider is available
     */
    async isAvailable() {
        try {
            const { status } = await axios.get(this.baseUrl, { timeout: 5000 });
            return status === 200;
        } catch {
            return false;
        }
    }
}

module.exports = FileioProvider;
