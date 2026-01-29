/**
 * Tests unitaires : MetadataApiManager, createMetadataApiManagerFromEnv, alias catégories
 */
import { describe, it, expect } from 'vitest';
import {
    MetadataApiManager,
    createMetadataApiManagerFromEnv
} from '../../app/utils/media/api/index.js';
import type { MetadataApiConfig } from '../../app/utils/media/api/index.js';

describe('MetadataApiManager', () => {
    const emptyConfig: MetadataApiConfig = {
        tmdb: { enabled: false },
        omdb: { enabled: false },
        musicbrainz: { enabled: false },
        spotify: { enabled: false },
        discogs: { enabled: false },
        anilist: { enabled: false },
        kitsu: { enabled: false },
        opensubtitles: { enabled: false },
        googlebooks: { enabled: false },
        comicvine: { enabled: false }
    };

    it('normalise catégorie "films" en "videos"', () => {
        const config: MetadataApiConfig = {
            ...emptyConfig,
            tmdb: { enabled: true, apiKey: 'key', rateLimit: { maxRequests: 40, windowMs: 10000 } }
        };
        const manager = new MetadataApiManager(config);
        expect(manager.isCategoryAvailable('films')).toBe(true);
        expect(manager.getAvailableApis('films')).toContain('tmdb');
    });

    it('normalise catégorie "music" en "musics"', () => {
        const config: MetadataApiConfig = {
            ...emptyConfig,
            musicbrainz: { enabled: true, userAgent: 'Test', rateLimit: { maxRequests: 1, windowMs: 1000 } }
        };
        const manager = new MetadataApiManager(config);
        expect(manager.isCategoryAvailable('music')).toBe(true);
    });

    it('search("films", ...) retourne un objet résultat ou null (même chaîne que videos)', async () => {
        const config: MetadataApiConfig = {
            ...emptyConfig,
            tmdb: { enabled: true, apiKey: 'key', rateLimit: { maxRequests: 40, windowMs: 10000 } }
        };
        const manager = new MetadataApiManager(config);
        const result = await manager.search('films', 'Inception', { type: 'movie' });
        expect(result === null || (typeof result === 'object' && Array.isArray(result.matches))).toBe(true);
    });

    it('getDetails accepte alias "films"', async () => {
        const config: MetadataApiConfig = {
            ...emptyConfig,
            tmdb: { enabled: true, apiKey: 'key', rateLimit: { maxRequests: 40, windowMs: 10000 } }
        };
        const manager = new MetadataApiManager(config);
        const details = await manager.getDetails('films', '27205', 'tmdb', { type: 'movie' });
        expect(details === null || (typeof details === 'object' && 'title' in details)).toBe(true);
    });
});

describe('createMetadataApiManagerFromEnv', () => {
    it('retourne un MetadataApiManager', () => {
        const manager = createMetadataApiManagerFromEnv({});
        expect(manager).toBeDefined();
        expect(typeof manager.search).toBe('function');
        expect(typeof manager.getDetails).toBe('function');
        expect(typeof manager.searchWithFallback).toBe('function');
    });

    it('active tmdb si TMDB_API_KEY est fourni', () => {
        const manager = createMetadataApiManagerFromEnv({ TMDB_API_KEY: 'secret' });
        expect(manager.isCategoryAvailable('videos')).toBe(true);
        expect(manager.getAvailableApis('videos')).toContain('tmdb');
    });

    it('getAvailableApis ne retourne pas de secrets (uniquement noms de sources)', () => {
        const manager = createMetadataApiManagerFromEnv({
            TMDB_API_KEY: 'secret',
            SPOTIFY_CLIENT_SECRET: 'secret'
        });
        const apis = manager.getAvailableApis('videos');
        expect(apis).toContain('tmdb');
        apis.forEach(name => {
            expect(typeof name).toBe('string');
            expect(name).not.toContain('secret');
        });
    });
});
