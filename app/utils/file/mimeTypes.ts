// INFO : app/utils/mimeTypes.ts
export const VIDEO_MIME_TYPES = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/x-flv',
    'video/x-ms-wmv',
];

export const AUDIO_MIME_TYPES = [
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/aac',
    'audio/x-m4a',
    'audio/flac',
    'audio/x-wav',
];

export const IMAGE_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
];

export const DOCUMENT_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/html',
    'text/css',
    'text/javascript',
    'application/json',
    'application/xml',
];

export function isMediaFile(mimeType: string): boolean {
    return mimeType.startsWith('video/') || mimeType.startsWith('audio/');
}

export function getFileExtension(mimeType: string): string {
    const extensions: Record<string, string> = {
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/ogg': 'ogv',
        'audio/mpeg': 'mp3',
        'audio/ogg': 'oga',
        'audio/wav': 'wav',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'application/pdf': 'pdf',
    };
    return extensions[mimeType] || 'bin';
}