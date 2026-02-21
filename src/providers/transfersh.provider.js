'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');

class TransfershProvider {
    constructor() {
        this.name = 'transfersh';
        this.maxSize = 10 * 1024 * 1024 * 1024; // 10GB default
        this.baseUrl = config.providers.transfersh.url || 'https://transfer.sh';
    }

    /**
     * Upload file to transfer.sh
     */
    async upload(filePath, options = {}) {
        const fileName = options.fileName || path.basename(filePath);
        const stat = fs.statSync(filePath);
        const maxDays = options.maxDays || config.providers.transfersh.maxDays || 14;

        const uploadUrl = `${this.baseUrl}/${encodeURIComponent(fileName)}`;

        logger.info(`[transfer.sh] Uploading ${fileName} (${stat.size} bytes, expires: ${maxDays}d)...`);

        const { data, headers: resHeaders } = await axios.put(uploadUrl, fs.createReadStream(filePath), {
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': stat.size,
                'Max-Days': maxDays.toString(),
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 600000,
        });

        // transfer.sh returns the download URL as plain text
        const downloadUrl = (typeof data === 'string' ? data : '').trim();

        if (!downloadUrl || !downloadUrl.startsWith('http')) {
            throw new Error(`transfer.sh upload failed: ${data}`);
        }

        const result = {
            provider: this.name,
            success: true,
            fileId: downloadUrl.split('/').pop(),
            fileName,
            downloadUrl,
            directUrl: downloadUrl,
            deleteUrl: resHeaders['x-url-delete'] || null,
            expiryDays: maxDays,
            metadata: {
                size: stat.size,
                maxDays,
            },
        };

        logger.info(`[transfer.sh] Upload complete: ${result.downloadUrl}`);
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

module.exports = TransfershProvider;
