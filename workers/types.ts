// INFO: workers/types.ts

export interface Bindings {
    STORAGE: R2Bucket;
    DATABASE: D1Database;
    JWT_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    TMDB_API_KEY?: string;
    OMDB_API_KEY?: string;
    SPOTIFY_CLIENT_ID?: string;
    SPOTIFY_CLIENT_SECRET?: string;
    DISCOGS_API_TOKEN?: string;
}

export interface UploadPart {
    partNumber: number;
    etag: string;
}

export interface FileRecord {
    file_id: string;
    category: string;
    size: number;
    mime_type: string;
    hash: string;
    created_at: number;
}

export interface UserFileRecord {
    user_id: string;
    file_id: string;
    uploaded_at: number;
}