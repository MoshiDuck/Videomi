// INFO: app/utils/media/api/films-series.ts
// Intégrations API pour films et séries (TMDb, TheTVDB, OMDb, Trakt)

import { BaseMetadataApi, ApiConfig, RateLimiter } from './base.js';
import type { MediaMatch, MediaSearchResult, MetadataSource } from '../../../types/metadata.js';

/**
 * Intégration TMDb (The Movie Database)
 */
export class TmdbApi extends BaseMetadataApi {
    constructor(config: ApiConfig) {
        super(config, 'tmdb');
    }

    protected hasRequiredCredentials(): boolean {
        return !!this.config.apiKey;
    }

    async search(query: string, options?: { type?: 'movie' | 'tv' | 'both' }): Promise<MediaSearchResult> {
        if (!this.isAvailable()) {
            return { matches: [], total: 0, source: 'tmdb' };
        }

        const type = options?.type || 'both';
        const matches: MediaMatch[] = [];

        // Recherche films
        if (type === 'movie' || type === 'both') {
            try {
                const url = `https://api.themoviedb.org/3/search/movie?api_key=${this.config.apiKey}&query=${encodeURIComponent(query)}&language=fr-FR`;
                const response = await this.fetchWithCache(url, {}, `tmdb_movie_${query}`);
                
                if (response.ok) {
                    const data = await response.json();
                    for (const movie of data.results || []) {
                        matches.push({
                            id: `tmdb_movie_${movie.id}`,
                            source_api: 'tmdb',
                            source_id: String(movie.id),
                            title: movie.title,
                            year: movie.release_date ? parseInt(movie.release_date.substring(0, 4)) : null,
                            thumbnail_url: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
                            description: movie.overview || null,
                            genres: null, // À récupérer via getDetails
                            score: movie.popularity || 0
                        });
                    }
                }
            } catch (error) {
                console.warn('[TMDb] Erreur recherche films:', error);
            }
        }

        // Recherche séries
        if (type === 'tv' || type === 'both') {
            try {
                const url = `https://api.themoviedb.org/3/search/tv?api_key=${this.config.apiKey}&query=${encodeURIComponent(query)}&language=fr-FR`;
                const response = await this.fetchWithCache(url, {}, `tmdb_tv_${query}`);
                
                if (response.ok) {
                    const data = await response.json();
                    for (const tv of data.results || []) {
                        matches.push({
                            id: `tmdb_tv_${tv.id}`,
                            source_api: 'tmdb_tv',
                            source_id: String(tv.id),
                            title: tv.name,
                            year: tv.first_air_date ? parseInt(tv.first_air_date.substring(0, 4)) : null,
                            thumbnail_url: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : null,
                            description: tv.overview || null,
                            genres: null,
                            total_seasons: tv.number_of_seasons || null,
                            score: tv.popularity || 0
                        });
                    }
                }
            } catch (error) {
                console.warn('[TMDb] Erreur recherche séries:', error);
            }
        }

        return {
            matches,
            total: matches.length,
            source: 'tmdb'
        };
    }

    async getDetails(sourceId: string, options?: { type?: 'movie' | 'tv' }): Promise<MediaMatch | null> {
        if (!this.isAvailable()) return null;

        const type = options?.type || 'movie';
        
        try {
            const url = `https://api.themoviedb.org/3/${type}/${sourceId}?api_key=${this.config.apiKey}&language=fr-FR&append_to_response=credits`;
            const response = await this.fetchWithCache(url, {}, `tmdb_${type}_${sourceId}`);
            
            if (response.ok) {
                const data = await response.json();
                
                if (type === 'movie') {
                    return {
                        id: `tmdb_movie_${data.id}`,
                        source_api: 'tmdb',
                        source_id: String(data.id),
                        title: data.title,
                        year: data.release_date ? parseInt(data.release_date.substring(0, 4)) : null,
                        thumbnail_url: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
                        description: data.overview || null,
                        genres: data.genres?.map((g: any) => g.name) || null,
                        directors: data.credits?.crew?.filter((c: any) => c.job === 'Director').map((c: any) => c.name) || null,
                        actors: data.credits?.cast?.slice(0, 10).map((c: any) => c.name) || null
                    };
                } else {
                    return {
                        id: `tmdb_tv_${data.id}`,
                        source_api: 'tmdb_tv',
                        source_id: String(data.id),
                        title: data.name,
                        year: data.first_air_date ? parseInt(data.first_air_date.substring(0, 4)) : null,
                        thumbnail_url: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
                        description: data.overview || null,
                        genres: data.genres?.map((g: any) => g.name) || null,
                        total_seasons: data.number_of_seasons || null,
                        creators: data.created_by?.map((c: any) => c.name) || null
                    };
                }
            }
        } catch (error) {
            console.warn('[TMDb] Erreur récupération détails:', error);
        }

        return null;
    }
}

/**
 * Intégration OMDb (Open Movie Database)
 */
export class OmdbApi extends BaseMetadataApi {
    constructor(config: ApiConfig) {
        super(config, 'omdb');
    }

    protected hasRequiredCredentials(): boolean {
        return !!this.config.apiKey;
    }

    async search(query: string): Promise<MediaSearchResult> {
        if (!this.isAvailable()) {
            return { matches: [], total: 0, source: 'omdb' };
        }

        try {
            const url = `https://www.omdbapi.com/?s=${encodeURIComponent(query)}&apikey=${this.config.apiKey}`;
            const response = await this.fetchWithCache(url, {}, `omdb_${query}`);
            
            if (response.ok) {
                const data = await response.json();
                if (data.Response === 'True' && data.Search) {
                    const matches: MediaMatch[] = data.Search.map((item: any) => ({
                        id: `omdb_${item.imdbID}`,
                        source_api: 'omdb',
                        source_id: item.imdbID,
                        title: item.Title,
                        year: item.Year ? parseInt(item.Year.substring(0, 4)) : null,
                        thumbnail_url: item.Poster && item.Poster !== 'N/A' ? item.Poster : null
                    }));

                    return {
                        matches,
                        total: parseInt(data.totalResults) || matches.length,
                        source: 'omdb'
                    };
                }
            }
        } catch (error) {
            console.warn('[OMDb] Erreur recherche:', error);
        }

        return { matches: [], total: 0, source: 'omdb' };
    }

    async getDetails(sourceId: string): Promise<MediaMatch | null> {
        if (!this.isAvailable()) return null;

        try {
            const url = `https://www.omdbapi.com/?i=${sourceId}&apikey=${this.config.apiKey}`;
            const response = await this.fetchWithCache(url, {}, `omdb_details_${sourceId}`);
            
            if (response.ok) {
                const data = await response.json();
                if (data.Response === 'True') {
                    return {
                        id: `omdb_${data.imdbID}`,
                        source_api: 'omdb',
                        source_id: data.imdbID,
                        title: data.Title,
                        year: data.Year ? parseInt(data.Year.substring(0, 4)) : null,
                        thumbnail_url: data.Poster && data.Poster !== 'N/A' ? data.Poster : null,
                        description: data.Plot && data.Plot !== 'N/A' ? data.Plot : null,
                        genres: data.Genre ? data.Genre.split(', ').map((g: string) => g.trim()) : null,
                        directors: data.Director && data.Director !== 'N/A' ? data.Director.split(', ').map((d: string) => d.trim()) : null,
                        actors: data.Actors && data.Actors !== 'N/A' ? data.Actors.split(', ').map((a: string) => a.trim()) : null
                    };
                }
            }
        } catch (error) {
            console.warn('[OMDb] Erreur récupération détails:', error);
        }

        return null;
    }
}

/**
 * Factory pour créer les instances d'API films/séries
 */
export function createFilmsSeriesApis(configs: {
    tmdb?: ApiConfig;
    omdb?: ApiConfig;
}): BaseMetadataApi[] {
    const apis: BaseMetadataApi[] = [];

    if (configs.tmdb) {
        apis.push(new TmdbApi({
            ...configs.tmdb,
            rateLimit: configs.tmdb.rateLimit || { maxRequests: 40, windowMs: 10000 }
        }));
    }

    if (configs.omdb) {
        apis.push(new OmdbApi({
            ...configs.omdb,
            rateLimit: configs.omdb.rateLimit || { maxRequests: 10, windowMs: 1000 }
        }));
    }

    return apis;
}
