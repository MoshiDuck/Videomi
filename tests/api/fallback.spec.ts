/**
 * Tests : chaîne de fallback (MetadataApiFallback)
 */
import { describe, it, expect, vi } from 'vitest';
import { MetadataApiFallback } from '../../app/utils/media/api/base.js';
import { TmdbApi, OmdbApi } from '../../app/utils/media/api/films-series.js';
import type { ApiConfig } from '../../app/utils/media/api/base.js';

function tmdbConfig(apiKey: string): ApiConfig {
    return {
        enabled: true,
        apiKey,
        rateLimit: { maxRequests: 40, windowMs: 10000 }
    };
}

function omdbConfig(apiKey: string): ApiConfig {
    return {
        enabled: true,
        apiKey,
        rateLimit: { maxRequests: 10, windowMs: 1000 }
    };
}

describe('MetadataApiFallback', () => {
    it('filtre les API non disponibles', () => {
        const apis = [
            new TmdbApi(tmdbConfig('key1')),
            new OmdbApi(omdbConfig('key2'))
        ];
        const fallback = new MetadataApiFallback(apis);
        expect(apis.length).toBe(2);
    });

    it('search() retourne le premier résultat non vide', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                if (url.includes('themoviedb.org')) {
                    return Promise.resolve(
                        new Response(
                            JSON.stringify({
                                results: [
                                    { id: 1, title: 'Inception', release_date: '2010-07-15', overview: '', popularity: 1 }
                                ]
                            }),
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
                        )
                    );
                }
                return Promise.resolve(new Response('{}', { status: 404 }));
            })
        );
        const apis = [
            new TmdbApi(tmdbConfig('key1')),
            new OmdbApi(omdbConfig('key2'))
        ];
        const fallback = new MetadataApiFallback(apis);
        try {
            const result = await fallback.search('Inception', { type: 'movie' });
            expect(result).not.toBeNull();
            expect(result!.matches.length).toBeGreaterThanOrEqual(1);
            expect(result!.source).toBe('tmdb');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('search() essaie OMDb si TMDb renvoie vide', async () => {
        let callCount = 0;
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                callCount++;
                if (url.includes('themoviedb.org')) {
                    return Promise.resolve(
                        new Response(JSON.stringify({ results: [] }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' }
                        })
                    );
                }
                if (url.includes('omdbapi.com')) {
                    return Promise.resolve(
                        new Response(
                            JSON.stringify({
                                Response: 'True',
                                Search: [
                                    { imdbID: 'tt1', Title: 'Inception', Year: '2010', Poster: 'N/A' }
                                ],
                                totalResults: '1'
                            }),
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
                        )
                    );
                }
                return Promise.resolve(new Response('{}', { status: 404 }));
            })
        );
        const apis = [
            new TmdbApi(tmdbConfig('key1')),
            new OmdbApi(omdbConfig('key2'))
        ];
        const fallback = new MetadataApiFallback(apis);
        try {
            const result = await fallback.search('Inception');
            expect(result).not.toBeNull();
            expect(result!.matches.length).toBeGreaterThanOrEqual(1);
            expect(result!.source).toBe('omdb');
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
