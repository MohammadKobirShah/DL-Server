'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');
const { ensureTempDir, generateTempFilename, getExtFromUrl } = require('../utils/helpers');
const { DEFAULT_HEADERS } = require('../utils/constants');

class ExtractorService {
    constructor() {
        ensureTempDir();
    }

    /**
     * Download a file from a direct URL to temp directory
     * Returns the local file path
     */
    async download(url, options = {}) {
        ensureTempDir();

        const ext = options.extension
            ? `.${options.extension}`
            : getExtFromUrl(url) || '.mp4';

        const filename = options.filename || generateTempFilename(ext);
        const outputPath = path.join(config.storage.tempDir, filename);

        logger.info(`[Downloader] Downloading: ${url}`);
        logger.debug(`[Downloader] Output: ${outputPath}`);

        const response = await axios({
            method: 'get',
            url,
            responseType: 'stream',
            headers: {
                ...DEFAULT_HEADERS,
                ...(options.headers || {}),
            },
            timeout: options.timeout || 600000,
            maxContentLength: config.storage.maxFileSizeBytes,
            maxBodyLength: config.storage.maxFileSizeBytes,
            maxRedirects: 10,
        });

        const contentLength = parseInt(response.headers['content-length'] || '0', 10);

        if (contentLength > config.storage.maxFileSizeBytes) {
            response.data.destroy();
            throw new Error(
                `File too large: ${(contentLength / 1024 / 1024).toFixed(1)}MB exceeds limit of ${config.storage.maxFileSizeMB}MB`
            );
        }

        const writer = fs.createWriteStream(outputPath);
        let downloadedBytes = 0;
        let lastLogTime = Date.now();

        return new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                downloadedBytes += chunk.length;

                // Check size limit during download
                if (downloadedBytes > config.storage.maxFileSizeBytes) {
                    response.data.destroy();
                    writer.destroy();
                    fs.unlinkSync(outputPath).catch?.(() => { });
                    reject(new Error(`Download exceeded max file size of ${config.storage.maxFileSizeMB}MB`));
                }

                // Log progress every 5 seconds
                if (Date.now() - lastLogTime > 5000) {
                    const percent = contentLength
                        ? ((downloadedBytes / contentLength) * 100).toFixed(1)
                        : 'N/A';
                    logger.debug(
                        `[Downloader] Progress: ${(downloadedBytes / 1024 / 1024).toFixed(1)}MB / ${contentLength ? (contentLength / 1024 / 1024).toFixed(1) + 'MB' : 'unknown'} (${percent}%)`
                    );
                    lastLogTime = Date.now();
                }
            });

            response.data.on('error', (err) => {
                writer.destroy();
                reject(new Error(`Download stream error: ${err.message}`));
            });

            writer.on('finish', () => {
                logger.info(
                    `[Downloader] Complete: ${outputPath} (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB)`
                );
                resolve({
                    filePath: outputPath,
                    filename,
                    size: downloadedBytes,
                    contentType: response.headers['content-type'] || null,
                });
            });

            writer.on('error', (err) => {
                reject(new Error(`File write error: ${err.message}`));
            });

            response.data.pipe(writer);
        });
    }

    /**
     * Download using yt-dlp (for complex sites)
     */
    async downloadWithYtdlp(url, options = {}) {
        const YtdlpExtractor = require('../extractors/ytdlp.extractor');
        const ytdlp = new YtdlpExtractor();

        const ext = options.audioOnly ? '.mp3' : '.mp4';
        const filename = generateTempFilename(ext);
        const outputPath = path.join(config.storage.tempDir, filename);

        await ytdlp.download(url, outputPath, options);

        // yt-dlp might change the extension, find the actual file
        const dir = config.storage.tempDir;
        const baseName = path.basename(filename, ext);
        const files = fs.readdirSync(dir).filter((f) => f.startsWith(baseName));

        if (files.length === 0) {
            throw new Error('yt-dlp download produced no output file');
        }

        const actualFile = path.join(dir, files[0]);
        const stat = fs.statSync(actualFile);

        return {
            filePath: actualFile,
            filename: files[0],
            size: stat.size,
            contentType: null,
        };
    }
}

module.exports = new ExtractorService();
