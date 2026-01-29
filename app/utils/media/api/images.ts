// INFO: app/utils/media/api/images.ts
// Intégration API pour images/artwork (Fanart.tv)

import { BaseMetadataApi, ApiConfig } from './base.js';
import type { MediaMatch, MediaSearchResult } from '../../../types/metadata.js';

/**
 * Intégration Fanart.tv
 */
export class FanartTvApi extends BaseMetadataApi {
    constructor(config: ApiConfig) {
        super(config, 'fanarttv');
    }

    protected hasRequiredCredentials(): boolean {
        return !!this.config.apiKey;
    }

    /**
     * Récupère les images pour un film (via TMDb ID)
     */
    async getMovieImages(tmdbId: number): Promise<{
        posters?: string[];
        backgrounds?: string[];
        logos?: string[];
    } | null> {
        if (!this.isAvailable()) return null;

        try {
            const url = `https://webservice.fanart.tv/v3/movies/${tmdbId}?api_key=${this.config.apiKey}`;
            const response = await this.fetchWithCache(url, {}, `fanarttv_movie_${tmdbId}`);

            if (response.ok) {
                const data = await response.json();
                return {
                    posters: data.movieposter?.map((img: any) => img.url) || [],
                    backgrounds: data.moviebackground?.map((img: any) => img.url) || [],
                    logos: data.movielogo?.map((img: any) => img.url) || []
                };
            }
        } catch (error) {
            console.warn('[Fanart.tv] Erreur récupération images film:', error);
        }

        return null;
    }

    /**
     * Récupère les images pour une série (via TVDB ID)
     */
    async getTvImages(tvdbId: number): Promise<{
        posters?: string[];
        backgrounds?: string[];
        logos?: string[];
        clearart?: string[];
    } | null> {
        if (!this.isAvailable()) return null;

        try {
            const url = `https://webservice.fanart.tv/v3/tv/${tvdbId}?api_key=${this.config.apiKey}`;
            const response = await this.fetchWithCache(url, {}, `fanarttv_tv_${tvdbId}`);

            if (response.ok) {
                const data = await response.json();
                return {
                    posters: data.tvposter?.map((img: any) => img.url) || [],
                    backgrounds: data.showbackground?.map((img: any) => img.url) || [],
                    logos: data.hdtvlogo?.map((img: any) => img.url) || [],
                    clearart: data.clearart?.map((img: any) => img.url) || []
                };
            }
        } catch (error) {
            console.warn('[Fanart.tv] Erreur récupération images série:', error);
        }

        return null;
    }

    /**
     * Récupère les images pour un artiste (via MusicBrainz ID)
     */
    async getArtistImages(mbid: string): Promise<{
        thumbnails?: string[];
        backgrounds?: string[];
        logos?: string[];
    } | null> {
        if (!this.isAvailable()) return null;

        try {
            const url = `https://webservice.fanart.tv/v3/music/${mbid}?api_key=${this.config.apiKey}`;
            const response = await this.fetchWithCache(url, {}, `fanarttv_artist_${mbid}`);

            if (response.ok) {
                const data = await response.json();
                return {
                    thumbnails: data.artistthumb?.map((img: any) => img.url) || [],
                    backgrounds: data.artistbackground?.map((img: any) => img.url) || [],
                    logos: data.musiclogo?.map((img: any) => img.url) || []
                };
            }
        } catch (error) {
            console.warn('[Fanart.tv] Erreur récupération images artiste:', error);
        }

        return null;
    }

    // Implémentations requises par BaseMetadataApi (non utilisées pour Fanart.tv)
    async search(query: string): Promise<MediaSearchResult> {
        return { matches: [], total: 0, source: 'fanarttv' };
    }

    async getDetails(sourceId: string): Promise<MediaMatch | null> {
        return null;
    }
}

/**
 * Factory pour créer l'instance d'API images
 */
export function createImagesApis(configs: {
    fanarttv?: ApiConfig;
}): BaseMetadataApi[] {
    const apis: BaseMetadataApi[] = [];

    if (configs.fanarttv) {
        apis.push(new FanartTvApi({
            ...configs.fanarttv,
            rateLimit: configs.fanarttv.rateLimit || { maxRequests: 10, windowMs: 1000 }
        }));
    }

    return apis;
}
