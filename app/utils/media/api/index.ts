// INFO: app/utils/media/api/index.ts
// Point d'entrée principal pour toutes les intégrations API de métadonnées

import { BaseMetadataApi, MetadataApiFallback, ApiConfig } from './base.js';
import { createFilmsSeriesApis } from './films-series.js';
import { createMusicApis } from './music.js';
import { createAnimeMangaApis } from './anime-manga.js';
import { createSubtitlesApis } from './subtitles.js';
import { createBooksApis } from './books.js';
import { createImagesApis } from './images.js';
import type { MediaMatch, MediaSearchResult, MetadataSource, MediaCategory } from '../../../types/metadata.js';

/** Alias de catégories pour compatibilité (films -> videos, music -> musics) */
const CATEGORY_ALIASES: Record<string, MediaCategory> = {
    films: 'videos',
    film: 'videos',
    music: 'musics'
};

function normalizeCategory(category: string): MediaCategory {
    return (CATEGORY_ALIASES[category] as MediaCategory) ?? (category as MediaCategory);
}

/**
 * Configuration globale de toutes les API
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

/**
 * Gestionnaire principal des API de métadonnées
 */
export class MetadataApiManager {
    private config: MetadataApiConfig;
    private apis: Map<MediaCategory, BaseMetadataApi[]>;
    private fallbacks: Map<MediaCategory, MetadataApiFallback>;

    constructor(config: MetadataApiConfig) {
        this.config = config;
        this.apis = new Map();
        this.fallbacks = new Map();
        
        this.initializeApis();
    }

    /**
     * Initialise toutes les API par catégorie
     */
    private initializeApis(): void {
        // Films & Séries
        const filmsSeriesApis = createFilmsSeriesApis({
            tmdb: this.config.tmdb,
            omdb: this.config.omdb
        });
        this.apis.set('videos', filmsSeriesApis);
        this.fallbacks.set('videos', new MetadataApiFallback(filmsSeriesApis));

        // Musique
        const musicApis = createMusicApis({
            musicbrainz: this.config.musicbrainz,
            spotify: this.config.spotify,
            discogs: this.config.discogs
        });
        this.apis.set('musics', musicApis);
        this.fallbacks.set('musics', new MetadataApiFallback(musicApis));

        // Anime / Manga
        const animeMangaApis = createAnimeMangaApis({
            anilist: this.config.anilist,
            kitsu: this.config.kitsu
        });
        this.apis.set('anime', animeMangaApis);
        this.fallbacks.set('anime', new MetadataApiFallback(animeMangaApis));
        
        this.apis.set('manga', animeMangaApis);
        this.fallbacks.set('manga', new MetadataApiFallback(animeMangaApis));

        // Sous-titres
        const subtitlesApis = createSubtitlesApis({
            opensubtitles: this.config.opensubtitles
        });
        // Les sous-titres sont associés aux vidéos
        if (this.apis.has('videos')) {
            this.apis.set('videos', [...this.apis.get('videos')!, ...subtitlesApis]);
        }

        // Livres / Comics
        const booksApis = createBooksApis({
            googlebooks: this.config.googlebooks,
            comicvine: this.config.comicvine
        });
        this.apis.set('books', booksApis.filter(a => a.source === 'googlebooks'));
        this.fallbacks.set('books', new MetadataApiFallback(booksApis.filter(a => a.source === 'googlebooks')));
        
        this.apis.set('comics', booksApis.filter(a => a.source === 'comicvine'));
        this.fallbacks.set('comics', new MetadataApiFallback(booksApis.filter(a => a.source === 'comicvine')));

        // Images (utilisées comme complément)
        const imagesApis = createImagesApis({
            fanarttv: this.config.fanarttv
        });
        // Les images sont utilisées comme complément, pas comme source principale
    }

    /**
     * Recherche des métadonnées pour une catégorie donnée.
     * Accepte 'films'|'film' (-> videos) et 'music' (-> musics) comme alias.
     */
    async search(
        category: MediaCategory | 'films' | 'film' | 'music',
        query: string,
        options?: unknown
    ): Promise<MediaSearchResult | null> {
        const normalized = normalizeCategory(category);
        const fallback = this.fallbacks.get(normalized);
        if (!fallback) {
            return null;
        }

        return await fallback.search(query, options);
    }

    /**
     * Récupère les détails d'un média par son ID source
     */
    async getDetails(
        category: MediaCategory | 'films' | 'film' | 'music',
        sourceId: string,
        source: MetadataSource,
        options?: unknown
    ): Promise<MediaMatch | null> {
        const normalized = normalizeCategory(category);
        const fallback = this.fallbacks.get(normalized);
        if (!fallback) {
            return null;
        }

        return await fallback.getDetails(sourceId, source, options);
    }

    /**
     * Recherche avec fallback automatique entre toutes les API disponibles
     */
    async searchWithFallback(
        category: MediaCategory | 'films' | 'film' | 'music',
        query: string,
        options?: unknown
    ): Promise<MediaMatch | null> {
        const result = await this.search(category, query, options);
        if (result && result.matches.length > 0) {
            return result.matches[0];
        }
        return null;
    }

    /**
     * Vérifie si une API est disponible pour une catégorie
     */
    isCategoryAvailable(category: MediaCategory | 'films' | 'film' | 'music'): boolean {
        const normalized = normalizeCategory(category);
        const apis = this.apis.get(normalized);
        return apis ? apis.some(api => api.isAvailable()) : false;
    }

    /**
     * Liste toutes les API disponibles pour une catégorie
     */
    getAvailableApis(category: MediaCategory | 'films' | 'film' | 'music'): MetadataSource[] {
        const normalized = normalizeCategory(category);
        const apis = this.apis.get(normalized);
        if (!apis) return [];
        
        return apis
            .filter(api => api.isAvailable())
            .map(api => api.source);
    }
}

/**
 * Factory pour créer un gestionnaire d'API depuis les variables d'environnement
 * (pour utilisation côté serveur/worker)
 */
export function createMetadataApiManagerFromEnv(env: {
    TMDB_API_KEY?: string;
    OMDB_API_KEY?: string;
    TVDB_API_KEY?: string;
    SPOTIFY_CLIENT_ID?: string;
    SPOTIFY_CLIENT_SECRET?: string;
    DISCOGS_API_TOKEN?: string;
    OPENSUBTITLES_API_KEY?: string;
    FANARTTV_API_KEY?: string;
    GOOGLE_BOOKS_API_KEY?: string;
    COMIC_VINE_API_KEY?: string;
    ANILIST_CLIENT_ID?: string;
    ANILIST_CLIENT_SECRET?: string;
}): MetadataApiManager {
    const config: MetadataApiConfig = {
        // Films & Séries
        tmdb: {
            enabled: !!env.TMDB_API_KEY,
            apiKey: env.TMDB_API_KEY,
            rateLimit: { maxRequests: 40, windowMs: 10000 }
        },
        omdb: {
            enabled: !!env.OMDB_API_KEY,
            apiKey: env.OMDB_API_KEY,
            rateLimit: { maxRequests: 10, windowMs: 1000 }
        },
        
        // Musique
        musicbrainz: {
            enabled: true,
            userAgent: 'Videomi/1.0 (https://videomi.uk)',
            rateLimit: { maxRequests: 1, windowMs: 1000 }
        },
        spotify: {
            enabled: !!env.SPOTIFY_CLIENT_ID && !!env.SPOTIFY_CLIENT_SECRET,
            clientId: env.SPOTIFY_CLIENT_ID,
            clientSecret: env.SPOTIFY_CLIENT_SECRET,
            rateLimit: { maxRequests: 10, windowMs: 1000 }
        },
        discogs: {
            enabled: true,
            token: env.DISCOGS_API_TOKEN,
            userAgent: 'Videomi/1.0 (https://videomi.uk)',
            rateLimit: { maxRequests: env.DISCOGS_API_TOKEN ? 60 : 25, windowMs: 60000 }
        },
        
        // Anime / Manga
        anilist: {
            enabled: true,
            clientId: env.ANILIST_CLIENT_ID,
            clientSecret: env.ANILIST_CLIENT_SECRET,
            rateLimit: { maxRequests: 90, windowMs: 60000 }
        },
        
        // Sous-titres
        opensubtitles: {
            enabled: !!env.OPENSUBTITLES_API_KEY,
            apiKey: env.OPENSUBTITLES_API_KEY,
            userAgent: 'Videomi/1.0',
            rateLimit: { maxRequests: 10, windowMs: 1000 }
        },
        
        // Images
        fanarttv: {
            enabled: !!env.FANARTTV_API_KEY,
            apiKey: env.FANARTTV_API_KEY,
            rateLimit: { maxRequests: 10, windowMs: 1000 }
        },
        
        // Livres / Comics
        googlebooks: {
            enabled: true,
            apiKey: env.GOOGLE_BOOKS_API_KEY,
            rateLimit: { maxRequests: 10, windowMs: 1000 }
        },
        comicvine: {
            enabled: !!env.COMIC_VINE_API_KEY,
            apiKey: env.COMIC_VINE_API_KEY,
            rateLimit: { maxRequests: 10, windowMs: 1000 }
        }
    };

    return new MetadataApiManager(config);
}

/**
 * Export de tous les types et classes pour utilisation externe
 */
export * from './base.js';
export * from './films-series.js';
export * from './music.js';
export * from './anime-manga.js';
export * from './subtitles.js';
export * from './books.js';
export * from './images.js';
