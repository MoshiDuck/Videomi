// INFO : electron/types.ts
export type FetchResponse = {
    ok: boolean;
    status: number;
    text: () => Promise<string>;
    json: () => Promise<any>;
};

export type UploadOptions = {
    key?: string;
    folder?: string;
    isSegment?: boolean;
    segmentNumber?: number;
    totalSegments?: number;
    cacheControl?: string;
};

export type SubtitleInfo = {
    language: string;
    path: string;
    format: string;
    codec?: string;
};

export type FileInfo = {
    name: string;
    path: string;
    size: number;
    lastModified: Date;
    extension: string;
};

export type AssetCheckResult = {
    exists: boolean;
    url?: string;
    uid?: string; // Ajouter cette ligne
    metadata?: any;
};

export type UploadResult = {
    success: boolean;
    key: string;
    uid?: string; // Ajouter cette ligne
    url?: string;
    message: string;
};

export type UploadQueueItem = {
    filePath: string;
    folder: string;
    isSegment: boolean;
    uid?: string;
};