// INFO: app/utils/media/api/books.ts
// Intégrations API pour livres et comics (Google Books, Comic Vine)

import { BaseMetadataApi, ApiConfig } from './base.js';
import type { MediaMatch, MediaSearchResult } from '../../../types/metadata.js';

/**
 * Intégration Google Books
 */
export class GoogleBooksApi extends BaseMetadataApi {
    constructor(config: ApiConfig) {
        super(config, 'googlebooks');
    }

    protected hasRequiredCredentials(): boolean {
        // Google Books fonctionne sans clé API (mais avec clé c'est mieux)
        return true;
    }

    async search(query: string, options?: { isbn?: string; limit?: number }): Promise<MediaSearchResult> {
        if (!this.isAvailable()) {
            return { matches: [], total: 0, source: 'googlebooks' };
        }

        const limit = options?.limit || 10;
        let searchQuery = query;

        // Recherche par ISBN si fourni
        if (options?.isbn) {
            searchQuery = `isbn:${options.isbn}`;
        }

        try {
            const url = new URL('https://www.googleapis.com/books/v1/volumes');
            url.searchParams.append('q', searchQuery);
            url.searchParams.append('maxResults', String(limit));
            if (this.config.apiKey) {
                url.searchParams.append('key', this.config.apiKey);
            }

            const response = await this.fetchWithCache(
                url.toString(),
                {},
                `googlebooks_${searchQuery}`
            );

            if (response.ok) {
                const data = await response.json();
                const matches: MediaMatch[] = [];

                for (const item of data.items || []) {
                    const volumeInfo = item.volumeInfo;
                    matches.push({
                        id: `googlebooks_${item.id}`,
                        source_api: 'googlebooks',
                        source_id: item.id,
                        title: volumeInfo.title,
                        year: volumeInfo.publishedDate ? parseInt(volumeInfo.publishedDate.substring(0, 4)) : null,
                        thumbnail_url: volumeInfo.imageLinks?.thumbnail || volumeInfo.imageLinks?.smallThumbnail || null,
                        description: volumeInfo.description ? volumeInfo.description.substring(0, 200) : null
                    });
                }

                return {
                    matches,
                    total: data.totalItems || matches.length,
                    source: 'googlebooks'
                };
            }
        } catch (error) {
            console.warn('[Google Books] Erreur recherche:', error);
        }

        return { matches: [], total: 0, source: 'googlebooks' };
    }

    async getDetails(sourceId: string): Promise<MediaMatch | null> {
        if (!this.isAvailable()) return null;

        try {
            const url = new URL(`https://www.googleapis.com/books/v1/volumes/${sourceId}`);
            if (this.config.apiKey) {
                url.searchParams.append('key', this.config.apiKey);
            }

            const response = await this.fetchWithCache(
                url.toString(),
                {},
                `googlebooks_details_${sourceId}`
            );

            if (response.ok) {
                const data = await response.json();
                const volumeInfo = data.volumeInfo;
                
                if (volumeInfo) {
                    return {
                        id: `googlebooks_${data.id}`,
                        source_api: 'googlebooks',
                        source_id: data.id,
                        title: volumeInfo.title,
                        year: volumeInfo.publishedDate ? parseInt(volumeInfo.publishedDate.substring(0, 4)) : null,
                        thumbnail_url: volumeInfo.imageLinks?.thumbnail || volumeInfo.imageLinks?.smallThumbnail || null,
                        description: volumeInfo.description ? volumeInfo.description.substring(0, 200) : null
                    };
                }
            }
        } catch (error) {
            console.warn('[Google Books] Erreur récupération détails:', error);
        }

        return null;
    }
}

/**
 * Intégration Comic Vine
 */
export class ComicVineApi extends BaseMetadataApi {
    constructor(config: ApiConfig) {
        super(config, 'comicvine');
    }

    protected hasRequiredCredentials(): boolean {
        return !!this.config.apiKey;
    }

    async search(query: string, options?: { type?: 'issue' | 'volume' | 'both'; limit?: number }): Promise<MediaSearchResult> {
        if (!this.isAvailable()) {
            return { matches: [], total: 0, source: 'comicvine' };
        }

        const type = options?.type || 'both';
        const limit = options?.limit || 10;
        const matches: MediaMatch[] = [];

        // Recherche issues
        if (type === 'issue' || type === 'both') {
            try {
                const url = new URL('https://comicvine.gamespot.com/api/search/');
                url.searchParams.append('api_key', this.config.apiKey!);
                url.searchParams.append('format', 'json');
                url.searchParams.append('query', query);
                url.searchParams.append('resources', 'issue');
                url.searchParams.append('limit', String(limit));

                const response = await this.fetchWithCache(
                    url.toString(),
                    {},
                    `comicvine_issue_${query}`
                );

                if (response.ok) {
                    const data = await response.json();
                    for (const result of data.results || []) {
                        matches.push({
                            id: `comicvine_issue_${result.id}`,
                            source_api: 'comicvine',
                            source_id: String(result.id),
                            title: result.name,
                            year: result.cover_date ? parseInt(result.cover_date.substring(0, 4)) : null,
                            thumbnail_url: result.image?.medium_url || null,
                            description: result.description || null
                        });
                    }
                }
            } catch (error) {
                console.warn('[Comic Vine] Erreur recherche issues:', error);
            }
        }

        // Recherche volumes
        if (type === 'volume' || type === 'both') {
            try {
                const url = new URL('https://comicvine.gamespot.com/api/search/');
                url.searchParams.append('api_key', this.config.apiKey!);
                url.searchParams.append('format', 'json');
                url.searchParams.append('query', query);
                url.searchParams.append('resources', 'volume');
                url.searchParams.append('limit', String(limit));

                const response = await this.fetchWithCache(
                    url.toString(),
                    {},
                    `comicvine_volume_${query}`
                );

                if (response.ok) {
                    const data = await response.json();
                    for (const result of data.results || []) {
                        matches.push({
                            id: `comicvine_volume_${result.id}`,
                            source_api: 'comicvine',
                            source_id: String(result.id),
                            title: result.name,
                            year: result.start_year || null,
                            thumbnail_url: result.image?.medium_url || null,
                            description: result.description || null
                        });
                    }
                }
            } catch (error) {
                console.warn('[Comic Vine] Erreur recherche volumes:', error);
            }
        }

        return {
            matches,
            total: matches.length,
            source: 'comicvine'
        };
    }

    async getDetails(sourceId: string, options?: { type?: 'issue' | 'volume' }): Promise<MediaMatch | null> {
        if (!this.isAvailable()) return null;

        const type = options?.type || 'issue';

        try {
            const url = new URL(`https://comicvine.gamespot.com/api/${type}/4000-${sourceId}/`);
            url.searchParams.append('api_key', this.config.apiKey!);
            url.searchParams.append('format', 'json');

            const response = await this.fetchWithCache(
                url.toString(),
                {},
                `comicvine_details_${sourceId}_${type}`
            );

            if (response.ok) {
                const data = await response.json();
                const result = data.results;
                
                if (result) {
                    return {
                        id: `comicvine_${type}_${result.id}`,
                        source_api: 'comicvine',
                        source_id: String(result.id),
                        title: result.name,
                        year: type === 'issue' 
                            ? (result.cover_date ? parseInt(result.cover_date.substring(0, 4)) : null)
                            : result.start_year || null,
                        thumbnail_url: result.image?.medium_url || null,
                        description: result.description || null
                    };
                }
            }
        } catch (error) {
            console.warn('[Comic Vine] Erreur récupération détails:', error);
        }

        return null;
    }
}

/**
 * Factory pour créer les instances d'API livres/comics
 */
export function createBooksApis(configs: {
    googlebooks?: ApiConfig;
    comicvine?: ApiConfig;
}): BaseMetadataApi[] {
    const apis: BaseMetadataApi[] = [];

    if (configs.googlebooks) {
        apis.push(new GoogleBooksApi({
            ...configs.googlebooks,
            rateLimit: configs.googlebooks.rateLimit || { maxRequests: 10, windowMs: 1000 }
        }));
    }

    if (configs.comicvine) {
        apis.push(new ComicVineApi({
            ...configs.comicvine,
            rateLimit: configs.comicvine.rateLimit || { maxRequests: 10, windowMs: 1000 }
        }));
    }

    return apis;
}
