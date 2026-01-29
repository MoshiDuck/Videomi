// INFO: app/utils/media/api/music.ts
// Intégrations API pour musique (MusicBrainz, Spotify, Discogs, TheAudioDB, Cover Art Archive)

import { BaseMetadataApi, ApiConfig } from './base.js';
import type { MediaMatch, MediaSearchResult } from '../../../types/metadata.js';

/**
 * Intégration MusicBrainz
 */
export class MusicBrainzApi extends BaseMetadataApi {
    constructor(config: ApiConfig) {
        super(config, 'musicbrainz');
    }

    protected hasRequiredCredentials(): boolean {
        // MusicBrainz nécessite seulement un User-Agent
        return true;
    }

    async search(query: string, options?: { artist?: string; limit?: number }): Promise<MediaSearchResult> {
        if (!this.isAvailable()) {
            return { matches: [], total: 0, source: 'musicbrainz' };
        }

        const limit = options?.limit || 10;
        const artist = options?.artist;
        
        // Construire la requête de recherche
        let searchQuery = `recording:${query.replace(/"/g, '\\"')}`;
        if (artist) {
            searchQuery += ` AND artist:${artist.replace(/"/g, '\\"')}`;
        }

        try {
            const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(searchQuery)}&limit=${limit}&fmt=json`;
            const response = await this.fetchWithCache(url, {
                headers: {
                    'User-Agent': this.config.userAgent || 'Videomi/1.0 (https://videomi.uk)',
                    'Accept': 'application/json'
                }
            }, `musicbrainz_${query}_${artist || ''}`);

            if (response.ok) {
                const data = await response.json();
                const matches: MediaMatch[] = [];

                for (const recording of data.recordings || []) {
                    const artists = recording['artist-credit']?.map((ac: any) => ac.artist.name) || [];
                    const releases = recording.releases || [];
                    const firstRelease = releases[0];

                    matches.push({
                        id: `musicbrainz_${recording.id}`,
                        source_api: 'musicbrainz',
                        source_id: recording.id,
                        title: recording.title,
                        year: firstRelease?.date ? parseInt(firstRelease.date.substring(0, 4)) : null,
                        thumbnail_url: null, // À récupérer via Cover Art Archive
                        artist: artists[0] || null,
                        artists: artists,
                        album: firstRelease?.title || null,
                        score: recording.score || 0
                    });
                }

                return {
                    matches,
                    total: data.count || matches.length,
                    source: 'musicbrainz'
                };
            }
        } catch (error) {
            console.warn('[MusicBrainz] Erreur recherche:', error);
        }

        return { matches: [], total: 0, source: 'musicbrainz' };
    }

    async getDetails(sourceId: string): Promise<MediaMatch | null> {
        if (!this.isAvailable()) return null;

        try {
            const url = `https://musicbrainz.org/ws/2/recording/${sourceId}?inc=releases+artists&fmt=json`;
            const response = await this.fetchWithCache(url, {
                headers: {
                    'User-Agent': this.config.userAgent || 'Videomi/1.0 (https://videomi.uk)',
                    'Accept': 'application/json'
                }
            }, `musicbrainz_details_${sourceId}`);

            if (response.ok) {
                const data = await response.json();
                const artists = data['artist-credit']?.map((ac: any) => ac.artist.name) || [];
                const releases = data.releases || [];
                const firstRelease = releases[0];

                // Récupérer la jaquette via Cover Art Archive
                let thumbnailUrl = null;
                if (firstRelease?.id) {
                    try {
                        const coverArtUrl = `https://coverartarchive.org/release/${firstRelease.id}/front-500`;
                        const coverArtResponse = await fetch(coverArtUrl, { method: 'HEAD' });
                        if (coverArtResponse.ok) {
                            thumbnailUrl = coverArtUrl;
                        }
                    } catch (e) {
                        // Ignorer les erreurs Cover Art Archive
                    }
                }

                return {
                    id: `musicbrainz_${data.id}`,
                    source_api: 'musicbrainz',
                    source_id: data.id,
                    title: data.title,
                    year: firstRelease?.date ? parseInt(firstRelease.date.substring(0, 4)) : null,
                    thumbnail_url: thumbnailUrl,
                    artist: artists[0] || null,
                    artists: artists,
                    album: firstRelease?.title || null
                };
            }
        } catch (error) {
            console.warn('[MusicBrainz] Erreur récupération détails:', error);
        }

        return null;
    }
}

/**
 * Intégration Spotify
 */
export class SpotifyApi extends BaseMetadataApi {
    private accessToken: string | null = null;
    private tokenExpiry: number = 0;

    constructor(config: ApiConfig) {
        super(config, 'spotify');
    }

    protected hasRequiredCredentials(): boolean {
        return !!this.config.clientId && !!this.config.clientSecret;
    }

    /**
     * Obtient un token d'accès Spotify
     */
    private async getAccessToken(): Promise<string | null> {
        const now = Date.now();
        
        // Réutiliser le token s'il est encore valide
        if (this.accessToken && now < this.tokenExpiry) {
            return this.accessToken;
        }

        if (!this.config.clientId || !this.config.clientSecret) {
            return null;
        }

        try {
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${btoa(`${this.config.clientId}:${this.config.clientSecret}`)}`
                },
                body: 'grant_type=client_credentials'
            });

            if (response.ok) {
                const data = await response.json();
                this.accessToken = data.access_token;
                this.tokenExpiry = now + (data.expires_in * 1000) - 60000; // -1min de marge
                return this.accessToken;
            }
        } catch (error) {
            console.warn('[Spotify] Erreur obtention token:', error);
        }

        return null;
    }

    async search(query: string, options?: { artist?: string; limit?: number }): Promise<MediaSearchResult> {
        if (!this.isAvailable()) {
            return { matches: [], total: 0, source: 'spotify' };
        }

        const token = await this.getAccessToken();
        if (!token) {
            return { matches: [], total: 0, source: 'spotify' };
        }

        const limit = options?.limit || 10;
        let searchQuery = query;
        if (options?.artist) {
            searchQuery = `track:${query} artist:${options.artist}`;
        }

        try {
            const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=${limit}`;
            const response = await this.fetchWithCache(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }, `spotify_${query}_${options?.artist || ''}`);

            if (response.ok) {
                const data = await response.json();
                const matches: MediaMatch[] = [];

                for (const track of data.tracks?.items || []) {
                    const artists = track.artists?.map((a: any) => a.name) || [];
                    matches.push({
                        id: `spotify_${track.id}`,
                        source_api: 'spotify',
                        source_id: track.id,
                        title: track.name,
                        year: track.album?.release_date ? parseInt(track.album.release_date.substring(0, 4)) : null,
                        thumbnail_url: track.album?.images?.[0]?.url || null,
                        artist: artists[0] || null,
                        artists: artists,
                        album: track.album?.name || null
                    });
                }

                return {
                    matches,
                    total: data.tracks?.total || matches.length,
                    source: 'spotify'
                };
            }
        } catch (error) {
            console.warn('[Spotify] Erreur recherche:', error);
        }

        return { matches: [], total: 0, source: 'spotify' };
    }

    async getDetails(sourceId: string): Promise<MediaMatch | null> {
        if (!this.isAvailable()) return null;

        const token = await this.getAccessToken();
        if (!token) return null;

        try {
            const url = `https://api.spotify.com/v1/tracks/${sourceId}`;
            const response = await this.fetchWithCache(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }, `spotify_details_${sourceId}`);

            if (response.ok) {
                const track = await response.json();
                const artists = track.artists?.map((a: any) => a.name) || [];

                return {
                    id: `spotify_${track.id}`,
                    source_api: 'spotify',
                    source_id: track.id,
                    title: track.name,
                    year: track.album?.release_date ? parseInt(track.album.release_date.substring(0, 4)) : null,
                    thumbnail_url: track.album?.images?.[0]?.url || null,
                    artist: artists[0] || null,
                    artists: artists,
                    album: track.album?.name || null
                };
            }
        } catch (error) {
            console.warn('[Spotify] Erreur récupération détails:', error);
        }

        return null;
    }
}

/**
 * Intégration Discogs
 */
export class DiscogsApi extends BaseMetadataApi {
    constructor(config: ApiConfig) {
        super(config, 'discogs');
    }

    protected hasRequiredCredentials(): boolean {
        // Discogs fonctionne sans token mais avec token c'est mieux (60 req/min vs 25)
        return true;
    }

    async search(query: string, options?: { artist?: string; limit?: number }): Promise<MediaSearchResult> {
        if (!this.isAvailable()) {
            return { matches: [], total: 0, source: 'discogs' };
        }

        const limit = options?.limit || 10;
        let searchQuery = query;
        if (options?.artist) {
            searchQuery = `${options.artist} ${query}`;
        }

        try {
            const headers: HeadersInit = {
                'User-Agent': this.config.userAgent || 'Videomi/1.0 (https://videomi.uk)'
            };
            
            if (this.config.token) {
                headers['Authorization'] = `Discogs token=${this.config.token}`;
            }

            const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(searchQuery)}&type=release&per_page=${limit}`;
            const response = await this.fetchWithCache(url, { headers }, `discogs_${query}_${options?.artist || ''}`);

            if (response.ok) {
                const data = await response.json();
                const matches: MediaMatch[] = [];

                for (const result of data.results || []) {
                    matches.push({
                        id: `discogs_${result.id}`,
                        source_api: 'discogs',
                        source_id: String(result.id),
                        title: result.title,
                        year: result.year || null,
                        thumbnail_url: result.thumb || null,
                        artist: result.artist || null,
                        album: result.title || null
                    });
                }

                return {
                    matches,
                    total: data.pagination?.items || matches.length,
                    source: 'discogs'
                };
            }
        } catch (error) {
            console.warn('[Discogs] Erreur recherche:', error);
        }

        return { matches: [], total: 0, source: 'discogs' };
    }

    async getDetails(sourceId: string): Promise<MediaMatch | null> {
        if (!this.isAvailable()) return null;

        try {
            const headers: HeadersInit = {
                'User-Agent': this.config.userAgent || 'Videomi/1.0 (https://videomi.uk)'
            };
            
            if (this.config.token) {
                headers['Authorization'] = `Discogs token=${this.config.token}`;
            }

            const url = `https://api.discogs.com/releases/${sourceId}`;
            const response = await this.fetchWithCache(url, { headers }, `discogs_details_${sourceId}`);

            if (response.ok) {
                const data = await response.json();
                const artists = data.artists?.map((a: any) => a.name) || [];

                return {
                    id: `discogs_${data.id}`,
                    source_api: 'discogs',
                    source_id: String(data.id),
                    title: data.title,
                    year: data.year || null,
                    thumbnail_url: data.images?.[0]?.uri || null,
                    artist: artists[0] || null,
                    artists: artists,
                    album: data.title || null
                };
            }
        } catch (error) {
            console.warn('[Discogs] Erreur récupération détails:', error);
        }

        return null;
    }
}

/**
 * Factory pour créer les instances d'API musique
 */
export function createMusicApis(configs: {
    musicbrainz?: ApiConfig;
    spotify?: ApiConfig;
    discogs?: ApiConfig;
}): BaseMetadataApi[] {
    const apis: BaseMetadataApi[] = [];

    if (configs.musicbrainz) {
        apis.push(new MusicBrainzApi({
            ...configs.musicbrainz,
            userAgent: configs.musicbrainz.userAgent || 'Videomi/1.0 (https://videomi.uk)',
            rateLimit: configs.musicbrainz.rateLimit || { maxRequests: 1, windowMs: 1000 }
        }));
    }

    if (configs.spotify) {
        apis.push(new SpotifyApi({
            ...configs.spotify,
            rateLimit: configs.spotify.rateLimit || { maxRequests: 10, windowMs: 1000 }
        }));
    }

    if (configs.discogs) {
        apis.push(new DiscogsApi({
            ...configs.discogs,
            userAgent: configs.discogs.userAgent || 'Videomi/1.0 (https://videomi.uk)',
            rateLimit: configs.discogs.rateLimit || { maxRequests: 3, windowMs: 1000 }
        }));
    }

    return apis;
}
