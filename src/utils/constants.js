'use strict';

const JOB_STATUS = {
    QUEUED: 'queued',
    PROCESSING: 'processing',
    EXTRACTING: 'extracting',
    DOWNLOADING: 'downloading',
    UPLOADING: 'uploading',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
};

const MEDIA_TYPES = {
    VIDEO: 'video',
    AUDIO: 'audio',
    UNKNOWN: 'unknown',
};

const VIDEO_EXTENSIONS = [
    '.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv',
    '.m4v', '.3gp', '.ts', '.m3u8', '.mpd',
];

const AUDIO_EXTENSIONS = [
    '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.wav', '.wma', '.webm',
];

const VIDEO_MIMES = [
    'video/mp4', 'video/webm', 'video/ogg', 'video/x-matroska',
    'video/quicktime', 'video/x-flv', 'video/x-msvideo',
    'video/3gpp', 'video/MP2T', 'application/x-mpegURL',
    'application/dash+xml', 'video/x-ms-wmv',
];

const AUDIO_MIMES = [
    'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg',
    'audio/opus', 'audio/flac', 'audio/wav', 'audio/x-ms-wma',
    'audio/webm',
];

const PROVIDER_NAMES = {
    GOFILE: 'gofile',
    PIXELDRAIN: 'pixeldrain',
    FILEIO: 'fileio',
    CATBOX: 'catbox',
    TRANSFERSH: 'transfersh',
};

const ERROR_CODES = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    RATE_LIMIT: 'RATE_LIMIT',
    NOT_FOUND: 'NOT_FOUND',
    EXTRACTION_FAILED: 'EXTRACTION_FAILED',
    DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
    UPLOAD_FAILED: 'UPLOAD_FAILED',
    PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    UNSUPPORTED_URL: 'UNSUPPORTED_URL',
    TIMEOUT: 'TIMEOUT',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    JOB_NOT_FOUND: 'JOB_NOT_FOUND',
    JOB_CANCELLED: 'JOB_CANCELLED',
};

const EXTRACTOR_TYPES = {
    YTDLP: 'ytdlp',
    BROWSER: 'browser',
    DIRECT: 'direct',
};

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
};

module.exports = {
    JOB_STATUS,
    MEDIA_TYPES,
    VIDEO_EXTENSIONS,
    AUDIO_EXTENSIONS,
    VIDEO_MIMES,
    AUDIO_MIMES,
    PROVIDER_NAMES,
    ERROR_CODES,
    EXTRACTOR_TYPES,
    DEFAULT_HEADERS,
};
