// INFO: app/utils/media/api/subtitles.ts
// Intégration API pour sous-titres (OpenSubtitles)

import { BaseMetadataApi, ApiConfig } from './base.js';
import type { MediaMatch, MediaSearchResult } from '../../../types/metadata.js';

/**
 * Intégration OpenSubtitles
 */
export class OpenSubtitlesApi extends BaseMetadataApi {
    private token: string | null = null;
    private tokenExpiry: number = 0;

    constructor(config: ApiConfig) {
        super(config, 'opensubtitles');
    }

    protected hasRequiredCredentials(): boolean {
        return !!this.config.apiKey;
    }

    /**
     * Obtient un token d'accès OpenSubtitles
     */
    private async getAccessToken(): Promise<string | null> {
        const now = Date.now();
        
        // Réutiliser le token s'il est encore valide
        if (this.token && now < this.tokenExpiry) {
            return this.token;
        }

        if (!this.config.apiKey) {
            return null;
        }

        try {
            const response = await fetch('https://api.opensubtitles.com/api/v1/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Api-Key': this.config.apiKey,
                    'User-Agent': this.config.userAgent || 'Videomi/1.0'
                },
                body: JSON.stringify({})
            });

            if (response.ok) {
                const data = await response.json();
                this.token = data.token;
                this.tokenExpiry = now + (data.expires_in * 1000) - 60000; // -1min de marge
                return this.token;
            }
        } catch (error) {
            console.warn('[OpenSubtitles] Erreur obtention token:', error);
        }

        return null;
    }

    /**
     * Recherche de sous-titres par hash de fichier ou métadonnées
     */
    async search(query: string, options?: { 
        fileHash?: string; 
        fileSize?: number; 
        imdbId?: string; 
        language?: string;
        limit?: number 
    }): Promise<MediaSearchResult> {
        if (!this.isAvailable()) {
            return { matches: [], total: 0, source: 'opensubtitles' };
        }

        const token = await this.getAccessToken();
        if (!token) {
            return { matches: [], total: 0, source: 'opensubtitles' };
        }

        const limit = options?.limit || 10;
        const matches: MediaMatch[] = [];

        try {
            // Construire les paramètres de recherche
            const searchParams: any = {
                languages: options?.language || 'fr,en',
                limit: limit
            };

            // Recherche par hash (plus précise)
            if (options?.fileHash && options?.fileSize) {
                searchParams.moviehash = options.fileHash;
                searchParams.moviebytesize = options.fileSize;
            }
            // Recherche par IMDb ID
            else if (options?.imdbId) {
                searchParams.imdb_id = options.imdbId.replace(/^tt/, ''); // Retirer le préfixe 'tt'
            }
            // Recherche par titre
            else {
                searchParams.query = query;
            }

            const url = new URL('https://api.opensubtitles.com/api/v1/subtitles');
            Object.entries(searchParams).forEach(([key, value]) => {
                url.searchParams.append(key, String(value));
            });

            const response = await this.fetchWithCache(
                url.toString(),
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Api-Key': this.config.apiKey!,
                        'User-Agent': this.config.userAgent || 'Videomi/1.0'
                    }
                },
                `opensubtitles_${query}_${options?.fileHash || ''}_${options?.imdbId || ''}`
            );

            if (response.ok) {
                const data = await response.json();
                for (const subtitle of data.data || []) {
                    const attributes = subtitle.attributes;
                    matches.push({
                        id: `opensubtitles_${subtitle.id}`,
                        source_api: 'opensubtitles',
                        source_id: subtitle.id,
                        title: attributes.movie_name || query,
                        year: attributes.movie_year || null,
                        thumbnail_url: null,
                        description: `${attributes.language} - ${attributes.format || 'srt'}`
                    });
                }
            }
        } catch (error) {
            console.warn('[OpenSubtitles] Erreur recherche:', error);
        }

        return {
            matches,
            total: matches.length,
            source: 'opensubtitles'
        };
    }

    /**
     * Récupère les détails d'un sous-titre et l'URL de téléchargement
     */
    async getDetails(sourceId: string): Promise<MediaMatch | null> {
        if (!this.isAvailable()) return null;

        const token = await this.getAccessToken();
        if (!token) return null;

        try {
            const url = `https://api.opensubtitles.com/api/v1/subtitles/${sourceId}`;
            const response = await this.fetchWithCache(
                url,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Api-Key': this.config.apiKey!,
                        'User-Agent': this.config.userAgent || 'Videomi/1.0'
                    }
                },
                `opensubtitles_details_${sourceId}`
            );

            if (response.ok) {
                const data = await response.json();
                const subtitle = data.data;
                if (subtitle) {
                    const attributes = subtitle.attributes;
                    return {
                        id: `opensubtitles_${subtitle.id}`,
                        source_api: 'opensubtitles',
                        source_id: subtitle.id,
                        title: attributes.movie_name || null,
                        year: attributes.movie_year || null,
                        thumbnail_url: null,
                        description: `${attributes.language} - ${attributes.format || 'srt'}`
                    };
                }
            }
        } catch (error) {
            console.warn('[OpenSubtitles] Erreur récupération détails:', error);
        }

        return null;
    }

    /**
     * Télécharge un sous-titre (retourne l'URL de téléchargement)
     */
    async downloadSubtitle(subtitleId: string): Promise<string | null> {
        if (!this.isAvailable()) return null;

        const token = await this.getAccessToken();
        if (!token) return null;

        try {
            const response = await fetch(`https://api.opensubtitles.com/api/v1/download`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Api-Key': this.config.apiKey!,
                    'User-Agent': this.config.userAgent || 'Videomi/1.0',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    file_id: subtitleId
                })
            });

            if (response.ok) {
                const data = await response.json();
                return data.link || null;
            }
        } catch (error) {
            console.warn('[OpenSubtitles] Erreur téléchargement:', error);
        }

        return null;
    }
}

/**
 * Factory pour créer l'instance d'API sous-titres
 */
export function createSubtitlesApis(configs: {
    opensubtitles?: ApiConfig;
}): BaseMetadataApi[] {
    const apis: BaseMetadataApi[] = [];

    if (configs.opensubtitles) {
        apis.push(new OpenSubtitlesApi({
            ...configs.opensubtitles,
            userAgent: configs.opensubtitles.userAgent || 'Videomi/1.0',
            rateLimit: configs.opensubtitles.rateLimit || { maxRequests: 10, windowMs: 1000 }
        }));
    }

    return apis;
}
