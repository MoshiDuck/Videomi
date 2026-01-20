// INFO : app/types/upload.ts
export interface UploadFile {
    id: string;
    name: string;
    size: number;
    type: string;
    category: 'video' | 'music' | 'image' | 'document' | 'archive' | 'executable';
    status: 'pending' | 'hashing' | 'checking' | 'transcoding' | 'uploading' | 'completed' | 'error';
    progress: number;
    error?: string;
    fileId?: string; // Hash du contenu
    url?: string;
    uploadedAt?: string;
}

export interface TranscodingResult {
    segments: string[];
    playlist: string;
    initSegment: string;
    duration: number;
}

export interface MultipartUploadResponse {
    uploadId: string;
    partUrls: string[];
    fileId: string;
    category: string;
}

export interface UploadProgress {
    fileId: string;
    loaded: number;
    total: number;
    percentage: number;
    currentPart: number;
    totalParts: number;
}

export interface FileMetadata {
    id: string;
    userId: string;
    fileId: string;
    name: string;
    size: number;
    type: string;
    category: string;
    url: string;
    uploadedAt: string;
    hash: string;
}