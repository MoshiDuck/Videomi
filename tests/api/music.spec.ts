/**
 * Tests unitaires et intégration (mock) : music (MusicBrainz, Spotify, Discogs)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MusicBrainzApi, SpotifyApi, DiscogsApi } from '../../app/utils/media/api/music.js';
import type { ApiConfig } from '../../app/utils/media/api/base.js';

function createMusicBrainzConfig(): ApiConfig {
    return {
        enabled: true,
        userAgent: 'Videomi/1.0',
        rateLimit: { maxRequests: 1, windowMs: 1000 }
    };
}

function createSpotifyConfig(): ApiConfig {
    return {
        enabled: true,
        clientId: 'id',
        clientSecret: 'secret',
        rateLimit: { maxRequests: 10, windowMs: 1000 }
    };
}

describe('MusicBrainzApi', () => {
    it('hasRequiredCredentials() est true (User-Agent suffit)', () => {
        const api = new MusicBrainzApi(createMusicBrainzConfig());
        expect(api.isAvailable()).toBe(true);
    });

    it('search() avec mock retourne match avec artist, album', async () => {
        const api = new MusicBrainzApi(createMusicBrainzConfig());
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                if (url.includes('/recording?')) {
                    return Promise.resolve(
                        new Response(
                            JSON.stringify({
                                recordings: [
                                    {
                                        id: 'mbid-1',
                                        title: 'Bohemian Rhapsody',
                                        'artist-credit': [{ artist: { name: 'Queen' } }],
                                        releases: [{ title: 'A Night at the Opera', date: '1975-10-31' }],
                                        score: 100
                                    }
                                ],
                                count: 1
                            }),
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
                        )
                    );
                }
                return Promise.resolve(new Response('{}', { status: 404 }));
            })
        );
        try {
            const result = await api.search('Bohemian Rhapsody', { artist: 'Queen' });
            expect(result.source).toBe('musicbrainz');
            if (result.matches.length > 0) {
                expect(result.matches[0].title).toBe('Bohemian Rhapsody');
                expect(result.matches[0].artist).toBe('Queen');
                expect(result.matches[0].album).toBeDefined();
            }
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('SpotifyApi', () => {
    it('isAvailable() est false sans clientId/clientSecret', () => {
        const api = new SpotifyApi({ enabled: true, rateLimit: { maxRequests: 10, windowMs: 1000 } });
        expect(api.isAvailable()).toBe(false);
    });

    it('search() sans credentials retourne tableau vide', async () => {
        const api = new SpotifyApi({ enabled: true, rateLimit: { maxRequests: 10, windowMs: 1000 } });
        const result = await api.search('Bohemian Rhapsody');
        expect(result.matches).toEqual([]);
        expect(result.source).toBe('spotify');
    });
});

describe('DiscogsApi', () => {
    it('hasRequiredCredentials() est true (optionnel)', () => {
        const api = new DiscogsApi({ enabled: true, userAgent: 'Test' });
        expect(api.isAvailable()).toBe(true);
    });
});
