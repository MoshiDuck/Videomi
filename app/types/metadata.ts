// INFO: app/types/metadata.ts
// Types standardisés pour les métadonnées multimédias de toutes les sources API

/**
 * Source API utilisée pour les métadonnées
 */
export type MetadataSource =
    // Films & Séries
    | 'tmdb'           // The Movie Database (films)
    | 'tmdb_tv'        // The Movie Database (séries)
    | 'tvdb'           // TheTVDB
    | 'omdb'           // Open Movie Database
    | 'trakt'          // Trakt
    // Musique
    | 'musicbrainz'    // MusicBrainz
    | 'spotify'        // Spotify
    | 'discogs'        // Discogs
    | 'theaudiodb'     // TheAudioDB
    | 'coverartarchive' // Cover Art Archive
    // Anime / Manga
    | 'anilist'        // AniList
    | 'kitsu'          // Kitsu
    | 'anidb'          // AniDB
    // Sous-titres
    | 'opensubtitles'  // OpenSubtitles
    // Images / Artwork
    | 'fanarttv'       // Fanart.tv
    // Livres / Comics
    | 'googlebooks'    // Google Books
    | 'comicvine'      // Comic Vine
    // Autres
    | 'vgmdb'          // VGMdb
    | 'simkl'          // Simkl
    | null;

/**
 * Catégorie de média
 */
export type MediaCategory = 
    | 'videos' 
    | 'musics' 
    | 'images' 
    | 'raw_images' 
    | 'documents' 
    | 'archives' 
    | 'executables' 
    | 'others'
    | 'anime'
    | 'manga'
    | 'books'
    | 'comics';

/**
 * Métadonnées standardisées communes à tous les médias
 */
export interface StandardMetadata {
    // Identification
    source_api: MetadataSource;
    source_id: string | null; // ID dans l'API source
    
    // Informations de base
    title: string | null;
    original_title?: string | null; // Titre original (pour films/séries/anime)
    year: number | null;
    description: string | null; // Synopsis/description
    
    // Images
    thumbnail_url: string | null;
    backdrop_url: string | null; // Image de fond (films/séries)
    thumbnail_r2_path: string | null; // Chemin R2 si image téléchargée
    
    // Classification
    genres: string[] | null;
    subgenres?: string[] | null;
    tags?: string[] | null;
    
    // Métadonnées additionnelles
    rating?: number | null; // Note (0-10 ou 0-5 selon source)
    rating_count?: number | null;
    duration?: number | null; // Durée en secondes
    language?: string | null; // Langue principale
    country?: string | null; // Pays d'origine
}

/**
 * Métadonnées spécifiques aux films
 */
export interface FilmMetadata extends StandardMetadata {
    type: 'film';
    
    // Cast & Crew
    directors?: string[] | null;
    actors?: string[] | null;
    writers?: string[] | null;
    producers?: string[] | null;
    
    // Informations techniques
    release_date?: string | null; // Format ISO (YYYY-MM-DD)
    budget?: number | null;
    revenue?: number | null;
    
    // Relations
    imdb_id?: string | null;
    tmdb_id?: number | null;
}

/**
 * Métadonnées spécifiques aux séries
 */
export interface SeriesMetadata extends StandardMetadata {
    type: 'series';
    
    // Informations série
    season?: number | null; // Saison actuelle
    episode?: number | null; // Épisode actuel
    total_seasons?: number | null;
    total_episodes?: number | null;
    episode_title?: string | null;
    episode_description?: string | null;
    
    // Dates
    first_air_date?: string | null;
    last_air_date?: string | null;
    
    // Cast & Crew
    creators?: string[] | null;
    actors?: string[] | null;
    
    // Relations
    tvdb_id?: number | null;
    tmdb_id?: number | null;
    imdb_id?: string | null;
}

/**
 * Métadonnées spécifiques à la musique
 */
export interface MusicMetadata extends StandardMetadata {
    type: 'music';
    
    // Artistes
    artists: string[] | null;
    featuring_artists?: string[] | null; // Artistes featuring
    
    // Albums
    album?: string | null; // Album principal
    albums?: string[] | null; // Tous les albums contenant ce titre
    
    // Informations techniques
    track_number?: number | null;
    disc_number?: number | null;
    release_date?: string | null;
    
    // Relations
    mbid?: string | null; // MusicBrainz ID
    spotify_id?: string | null;
    discogs_id?: number | null;
    isrc?: string | null; // International Standard Recording Code
}

/**
 * Métadonnées spécifiques aux anime
 */
export interface AnimeMetadata extends StandardMetadata {
    type: 'anime';
    
    // Informations anime
    format?: 'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL' | 'MUSIC' | null;
    status?: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | null;
    episodes?: number | null;
    duration?: number | null; // Durée par épisode en minutes
    
    // Dates
    start_date?: string | null;
    end_date?: string | null;
    
    // Studios & Relations
    studios?: string[] | null;
    characters?: string[] | null;
    anilist_id?: number | null;
    kitsu_id?: number | null;
    anidb_id?: number | null;
}

/**
 * Métadonnées spécifiques aux mangas
 */
export interface MangaMetadata extends StandardMetadata {
    type: 'manga';
    
    // Informations manga
    format?: 'MANGA' | 'NOVEL' | 'ONE_SHOT' | null;
    status?: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | null;
    chapters?: number | null;
    volumes?: number | null;
    
    // Dates
    start_date?: string | null;
    end_date?: string | null;
    
    // Relations
    anilist_id?: number | null;
    kitsu_id?: number | null;
}

/**
 * Métadonnées spécifiques aux livres
 */
export interface BookMetadata extends StandardMetadata {
    type: 'book';
    
    // Auteurs
    authors: string[] | null;
    
    // Informations livre
    isbn?: string | null;
    isbn13?: string | null;
    publisher?: string | null;
    page_count?: number | null;
    
    // Dates
    published_date?: string | null;
    
    // Relations
    google_books_id?: string | null;
}

/**
 * Métadonnées spécifiques aux comics
 */
export interface ComicMetadata extends StandardMetadata {
    type: 'comic';
    
    // Informations comic
    issue_number?: number | null;
    volume?: string | null;
    series?: string | null;
    
    // Dates
    cover_date?: string | null;
    
    // Relations
    comic_vine_id?: number | null;
}

/**
 * Métadonnées spécifiques aux sous-titres
 */
export interface SubtitleMetadata {
    type: 'subtitle';
    
    // Identification
    source_api: 'opensubtitles';
    source_id: string | null;
    
    // Informations sous-titre
    language: string; // Code langue ISO 639-1 (fr, en, es, etc.)
    language_name?: string | null; // Nom complet (Français, English, etc.)
    format: 'srt' | 'vtt' | 'ass' | 'ssa' | null;
    
    // Fichier
    download_url?: string | null;
    file_size?: number | null;
    
    // Métadonnées associées
    movie_name?: string | null;
    movie_year?: number | null;
    movie_imdb_id?: string | null;
    release_name?: string | null;
}

/**
 * Union type pour toutes les métadonnées
 */
export type MediaMetadata = 
    | FilmMetadata 
    | SeriesMetadata 
    | MusicMetadata 
    | AnimeMetadata 
    | MangaMetadata 
    | BookMetadata 
    | ComicMetadata
    | SubtitleMetadata;

/**
 * Correspondance proposée à l'utilisateur (pour sélection manuelle)
 */
export interface MediaMatch {
    // Identification
    id: string; // ID unique pour cette correspondance
    source_api: MetadataSource;
    source_id: string;
    
    // Informations de base
    title: string;
    year: number | null;
    thumbnail_url: string | null;
    
    // Informations spécifiques selon type
    // Films
    genres?: string[] | null;
    description?: string | null;
    directors?: string[] | null;
    
    // Séries
    season?: number | null;
    episode?: number | null;
    total_seasons?: number | null;
    
    // Musique
    artist?: string | null;
    artists?: string[] | null;
    album?: string | null;
    
    // Anime/Manga
    format?: string | null;
    studios?: string[] | null;
    
    // Score de correspondance (pour tri)
    score?: number;
}

/**
 * Résultat de recherche avec plusieurs correspondances
 */
export interface MediaSearchResult {
    matches: MediaMatch[];
    total: number;
    source: MetadataSource;
}

/**
 * Configuration d'une API
 */
export interface ApiConfig {
    enabled: boolean;
    apiKey?: string;
    clientId?: string;
    clientSecret?: string;
    token?: string;
    rateLimit?: {
        maxRequests: number;
        windowMs: number;
    };
}

/**
 * Configuration globale des API
 */
export interface MetadataApiConfig {
    // Films & Séries
    tmdb?: ApiConfig;
    tvdb?: ApiConfig;
    omdb?: ApiConfig;
    trakt?: ApiConfig;
    
    // Musique
    musicbrainz?: ApiConfig;
    spotify?: ApiConfig;
    discogs?: ApiConfig;
    theaudiodb?: ApiConfig;
    
    // Anime / Manga
    anilist?: ApiConfig;
    kitsu?: ApiConfig;
    anidb?: ApiConfig;
    
    // Sous-titres
    opensubtitles?: ApiConfig;
    
    // Images
    fanarttv?: ApiConfig;
    
    // Livres / Comics
    googlebooks?: ApiConfig;
    comicvine?: ApiConfig;
}
