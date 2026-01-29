// INFO: workers/types.ts

export interface Bindings {
    STORAGE: R2Bucket;
    DATABASE: D1Database;
    JWT_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    // Films & Séries
    TMDB_API_KEY?: string;
    OMDB_API_KEY?: string;
    TVDB_API_KEY?: string;
    // Musique
    SPOTIFY_CLIENT_ID?: string;
    SPOTIFY_CLIENT_SECRET?: string;
    /** AcoustID (identification par empreinte Chromaprint), utilisée avant Spotify si fingerprint + duration fournis */
    ACOUSTID_API_KEY?: string;
    DISCOGS_API_TOKEN?: string;
    // Anime / Manga
    ANILIST_CLIENT_ID?: string;
    ANILIST_CLIENT_SECRET?: string;
    // Sous-titres
    OPENSUBTITLES_API_KEY?: string;
    // Images
    FANARTTV_API_KEY?: string;
    // Livres / Comics
    GOOGLE_BOOKS_API_KEY?: string;
    COMIC_VINE_API_KEY?: string;
    // Pré-identification titre (fallback IA)
    GEMINI_API_KEY?: string;
    /** Seuil de similarité artiste (0–1) pour accepter un match. Défaut: 0.6 */
    ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD?: string;
    /** Seuil de similarité titre (0–1) pour accepter un match. Défaut: 0.75 */
    ENRICHMENT_TITLE_SIMILARITY_THRESHOLD?: string;
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