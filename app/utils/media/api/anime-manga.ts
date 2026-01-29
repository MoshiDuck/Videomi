// INFO: app/utils/media/api/anime-manga.ts
// Intégrations API pour anime et manga (AniList, Kitsu, AniDB)

import { BaseMetadataApi, ApiConfig } from './base.js';
import type { MediaMatch, MediaSearchResult } from '../../../types/metadata.js';

/**
 * Intégration AniList (GraphQL)
 */
export class AniListApi extends BaseMetadataApi {
    constructor(config: ApiConfig) {
        super(config, 'anilist');
    }

    protected hasRequiredCredentials(): boolean {
        // AniList fonctionne sans authentification pour les requêtes publiques
        return true;
    }

    async search(query: string, options?: { type?: 'ANIME' | 'MANGA' | 'both'; limit?: number }): Promise<MediaSearchResult> {
        if (!this.isAvailable()) {
            return { matches: [], total: 0, source: 'anilist' };
        }

        const type = options?.type || 'both';
        const limit = options?.limit || 10;
        const matches: MediaMatch[] = [];

        // Requête GraphQL pour anime
        if (type === 'ANIME' || type === 'both') {
            try {
                const graphqlQuery = {
                    query: `
                        query ($search: String, $limit: Int) {
                            Page(perPage: $limit) {
                                media(search: $search, type: ANIME) {
                                    id
                                    title {
                                        romaji
                                        english
                                        native
                                    }
                                    format
                                    status
                                    episodes
                                    duration
                                    startDate {
                                        year
                                    }
                                    endDate {
                                        year
                                    }
                                    coverImage {
                                        large
                                    }
                                    studios {
                                        nodes {
                                            name
                                        }
                                    }
                                    genres
                                    description
                                }
                            }
                        }
                    `,
                    variables: {
                        search: query,
                        limit: limit
                    }
                };

                const response = await this.fetchWithCache(
                    'https://graphql.anilist.co',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify(graphqlQuery)
                    },
                    `anilist_anime_${query}`
                );

                if (response.ok) {
                    const data = await response.json();
                    for (const media of data.data?.Page?.media || []) {
                        const title = media.title.romaji || media.title.english || media.title.native;
                        matches.push({
                            id: `anilist_anime_${media.id}`,
                            source_api: 'anilist',
                            source_id: String(media.id),
                            title: title,
                            year: media.startDate?.year || null,
                            thumbnail_url: media.coverImage?.large || null,
                            description: media.description ? media.description.replace(/<[^>]*>/g, '').substring(0, 200) : null,
                            genres: media.genres || null,
                            format: media.format || null,
                            studios: media.studios?.nodes?.map((s: any) => s.name) || null
                        });
                    }
                }
            } catch (error) {
                console.warn('[AniList] Erreur recherche anime:', error);
            }
        }

        // Requête GraphQL pour manga
        if (type === 'MANGA' || type === 'both') {
            try {
                const graphqlQuery = {
                    query: `
                        query ($search: String, $limit: Int) {
                            Page(perPage: $limit) {
                                media(search: $search, type: MANGA) {
                                    id
                                    title {
                                        romaji
                                        english
                                        native
                                    }
                                    format
                                    status
                                    chapters
                                    volumes
                                    startDate {
                                        year
                                    }
                                    endDate {
                                        year
                                    }
                                    coverImage {
                                        large
                                    }
                                    genres
                                    description
                                }
                            }
                        }
                    `,
                    variables: {
                        search: query,
                        limit: limit
                    }
                };

                const response = await this.fetchWithCache(
                    'https://graphql.anilist.co',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify(graphqlQuery)
                    },
                    `anilist_manga_${query}`
                );

                if (response.ok) {
                    const data = await response.json();
                    for (const media of data.data?.Page?.media || []) {
                        const title = media.title.romaji || media.title.english || media.title.native;
                        matches.push({
                            id: `anilist_manga_${media.id}`,
                            source_api: 'anilist',
                            source_id: String(media.id),
                            title: title,
                            year: media.startDate?.year || null,
                            thumbnail_url: media.coverImage?.large || null,
                            description: media.description ? media.description.replace(/<[^>]*>/g, '').substring(0, 200) : null,
                            genres: media.genres || null,
                            format: media.format || null
                        });
                    }
                }
            } catch (error) {
                console.warn('[AniList] Erreur recherche manga:', error);
            }
        }

        return {
            matches,
            total: matches.length,
            source: 'anilist'
        };
    }

    async getDetails(sourceId: string, options?: { type?: 'ANIME' | 'MANGA' }): Promise<MediaMatch | null> {
        if (!this.isAvailable()) return null;

        const type = options?.type || 'ANIME';
        
        try {
            const graphqlQuery = {
                query: `
                    query ($id: Int) {
                        Media(id: $id, type: ${type}) {
                            id
                            title {
                                romaji
                                english
                                native
                            }
                            format
                            status
                            ${type === 'ANIME' ? 'episodes duration' : 'chapters volumes'}
                            startDate {
                                year
                            }
                            endDate {
                                year
                            }
                            coverImage {
                                large
                            }
                            ${type === 'ANIME' ? 'studios { nodes { name } }' : ''}
                            genres
                            description
                        }
                    }
                `,
                variables: {
                    id: parseInt(sourceId)
                }
            };

            const response = await this.fetchWithCache(
                'https://graphql.anilist.co',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(graphqlQuery)
                },
                `anilist_details_${sourceId}_${type}`
            );

            if (response.ok) {
                const data = await response.json();
                const media = data.data?.Media;
                if (media) {
                    const title = media.title.romaji || media.title.english || media.title.native;
                    return {
                        id: `anilist_${type.toLowerCase()}_${media.id}`,
                        source_api: 'anilist',
                        source_id: String(media.id),
                        title: title,
                        year: media.startDate?.year || null,
                        thumbnail_url: media.coverImage?.large || null,
                        description: media.description ? media.description.replace(/<[^>]*>/g, '').substring(0, 200) : null,
                        genres: media.genres || null,
                        format: media.format || null,
                        studios: type === 'ANIME' ? media.studios?.nodes?.map((s: any) => s.name) || null : null
                    };
                }
            }
        } catch (error) {
            console.warn('[AniList] Erreur récupération détails:', error);
        }

        return null;
    }
}

/**
 * Intégration Kitsu
 */
export class KitsuApi extends BaseMetadataApi {
    constructor(config: ApiConfig) {
        super(config, 'kitsu');
    }

    protected hasRequiredCredentials(): boolean {
        return true; // Kitsu fonctionne sans authentification
    }

    async search(query: string, options?: { type?: 'anime' | 'manga' | 'both'; limit?: number }): Promise<MediaSearchResult> {
        if (!this.isAvailable()) {
            return { matches: [], total: 0, source: 'kitsu' };
        }

        const type = options?.type || 'both';
        const limit = options?.limit || 10;
        const matches: MediaMatch[] = [];

        // Recherche anime
        if (type === 'anime' || type === 'both') {
            try {
                const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=${limit}`;
                const response = await this.fetchWithCache(url, {}, `kitsu_anime_${query}`);

                if (response.ok) {
                    const data = await response.json();
                    for (const item of data.data || []) {
                        const attributes = item.attributes;
                        matches.push({
                            id: `kitsu_anime_${item.id}`,
                            source_api: 'kitsu',
                            source_id: item.id,
                            title: attributes.canonicalTitle || attributes.titles?.en || attributes.titles?.en_jp,
                            year: attributes.startDate ? parseInt(attributes.startDate.substring(0, 4)) : null,
                            thumbnail_url: attributes.posterImage?.medium || null,
                            description: attributes.synopsis || null,
                            genres: null, // À récupérer via getDetails
                            format: attributes.subtype || null
                        });
                    }
                }
            } catch (error) {
                console.warn('[Kitsu] Erreur recherche anime:', error);
            }
        }

        // Recherche manga
        if (type === 'manga' || type === 'both') {
            try {
                const url = `https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(query)}&page[limit]=${limit}`;
                const response = await this.fetchWithCache(url, {}, `kitsu_manga_${query}`);

                if (response.ok) {
                    const data = await response.json();
                    for (const item of data.data || []) {
                        const attributes = item.attributes;
                        matches.push({
                            id: `kitsu_manga_${item.id}`,
                            source_api: 'kitsu',
                            source_id: item.id,
                            title: attributes.canonicalTitle || attributes.titles?.en || attributes.titles?.en_jp,
                            year: attributes.startDate ? parseInt(attributes.startDate.substring(0, 4)) : null,
                            thumbnail_url: attributes.posterImage?.medium || null,
                            description: attributes.synopsis || null,
                            format: attributes.subtype || null
                        });
                    }
                }
            } catch (error) {
                console.warn('[Kitsu] Erreur recherche manga:', error);
            }
        }

        return {
            matches,
            total: matches.length,
            source: 'kitsu'
        };
    }

    async getDetails(sourceId: string, options?: { type?: 'anime' | 'manga' }): Promise<MediaMatch | null> {
        if (!this.isAvailable()) return null;

        const type = options?.type || 'anime';

        try {
            const url = `https://kitsu.io/api/edge/${type}/${sourceId}?include=categories`;
            const response = await this.fetchWithCache(url, {}, `kitsu_details_${sourceId}_${type}`);

            if (response.ok) {
                const data = await response.json();
                const item = data.data;
                if (item) {
                    const attributes = item.attributes;
                    return {
                        id: `kitsu_${type}_${item.id}`,
                        source_api: 'kitsu',
                        source_id: item.id,
                        title: attributes.canonicalTitle || attributes.titles?.en || attributes.titles?.en_jp,
                        year: attributes.startDate ? parseInt(attributes.startDate.substring(0, 4)) : null,
                        thumbnail_url: attributes.posterImage?.medium || null,
                        description: attributes.synopsis || null,
                        genres: data.included?.filter((i: any) => i.type === 'categories').map((c: any) => c.attributes.title) || null,
                        format: attributes.subtype || null
                    };
                }
            }
        } catch (error) {
            console.warn('[Kitsu] Erreur récupération détails:', error);
        }

        return null;
    }
}

/**
 * Factory pour créer les instances d'API anime/manga
 */
export function createAnimeMangaApis(configs: {
    anilist?: ApiConfig;
    kitsu?: ApiConfig;
}): BaseMetadataApi[] {
    const apis: BaseMetadataApi[] = [];

    if (configs.anilist) {
        apis.push(new AniListApi({
            ...configs.anilist,
            rateLimit: configs.anilist.rateLimit || { maxRequests: 90, windowMs: 60000 }
        }));
    }

    if (configs.kitsu) {
        apis.push(new KitsuApi({
            ...configs.kitsu,
            rateLimit: configs.kitsu.rateLimit || { maxRequests: 10, windowMs: 1000 }
        }));
    }

    return apis;
}
