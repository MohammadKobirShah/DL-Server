'use strict';

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');

class CatboxProvider {
    constructor() {
        this.name = 'catbox';
        this.maxSize = 200 * 1024 * 1024; // 200MB
        this.baseUrl = 'https://catbox.moe/user/api.php';
    }

    /**
     * Upload file to Catbox
     */
    async upload(filePath, options = {}) {
        const fileName = options.fileName || path.basename(filePath);
        const stat = fs.statSync(filePath);

        if (stat.size > this.maxSize) {
            throw new Error(`File too large for Catbox. Max: 200MB, Got: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);
        }

        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', fs.createReadStream(filePath), { filename: fileName });

        if (config.providers.catbox.userHash) {
            form.append('userhash', config.providers.catbox.userHash);
        }

        logger.info(`[Catbox] Uploading ${fileName} (${stat.size} bytes)...`);

        const { data } = await axios.post(this.baseUrl, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 300000,
        });

        // Catbox returns just the URL as a string
        if (typeof data !== 'string' || !data.startsWith('https://')) {
            throw new Error(`Catbox upload failed: ${data}`);
        }

        const result = {
            provider: this.name,
            success: true,
            fileId: data.split('/').pop(),
            fileName,
            downloadUrl: data.trim(),
            directUrl: data.trim(),
            permanent: true,
            metadata: {
                size: stat.size,
            },
        };

        logger.info(`[Catbox] Upload complete: ${result.downloadUrl}`);
        return result;
    }

    /**
     * Check if provider is available
     */
    async isAvailable() {
        try {
            const { status } = await axios.get('https://catbox.moe/', { timeout: 5000 });
            return status === 200;
        } catch {
            return false;
        }
    }
}

module.exports = CatboxProvider;
