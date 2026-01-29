/**
 * Tests unitaires et intégration (mock) : films-series (TMDb, OMDb)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TmdbApi, OmdbApi } from '../../app/utils/media/api/films-series.js';
import type { ApiConfig } from '../../app/utils/media/api/base.js';

function createTmdbConfig(overrides?: Partial<ApiConfig>): ApiConfig {
    return {
        enabled: true,
        apiKey: 'test-key',
        rateLimit: { maxRequests: 40, windowMs: 10000 },
        ...overrides
    };
}

function createOmdbConfig(overrides?: Partial<ApiConfig>): ApiConfig {
    return {
        enabled: true,
        apiKey: 'test-key',
        rateLimit: { maxRequests: 10, windowMs: 1000 },
        ...overrides
    };
}

describe('TmdbApi', () => {
    let tmdb: TmdbApi;

    beforeEach(() => {
        tmdb = new TmdbApi(createTmdbConfig());
    });

    it('isAvailable() est true si apiKey est défini', () => {
        expect(tmdb.isAvailable()).toBe(true);
    });

    it('isAvailable() est false si apiKey absent', () => {
        const noKey = new TmdbApi(createTmdbConfig({ apiKey: undefined, enabled: true }));
        expect(noKey.isAvailable()).toBe(false);
    });

    it('search() sans clé retourne tableau vide', async () => {
        const noKey = new TmdbApi(createTmdbConfig({ apiKey: undefined }));
        const result = await noKey.search('Inception');
        expect(result.matches).toEqual([]);
        expect(result.total).toBe(0);
        expect(result.source).toBe('tmdb');
    });

    it('search() avec fetch mocké retourne au moins 1 match pour Inception', async () => {
        const mockMovie = {
            id: 27205,
            title: 'Inception',
            release_date: '2010-07-15',
            poster_path: '/poster.jpg',
            overview: 'A thief who steals secrets...',
            popularity: 100
        };
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve(
                    new Response(JSON.stringify({ results: [mockMovie] }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    })
                )
            )
        );
        try {
            const result = await tmdb.search('Inception', { type: 'movie' });
            expect(result.matches.length).toBeGreaterThanOrEqual(1);
            const first = result.matches[0];
            expect(first.source_api).toBe('tmdb');
            expect(first.source_id).toBe('27205');
            expect(first.title).toBe('Inception');
            expect(first.year).toBe(2010);
            expect(first.description).toBeDefined();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('OmdbApi', () => {
    let omdb: OmdbApi;

    beforeEach(() => {
        omdb = new OmdbApi(createOmdbConfig());
    });

    it('isAvailable() est true si apiKey est défini', () => {
        expect(omdb.isAvailable()).toBe(true);
    });

    it('search() sans clé retourne tableau vide', async () => {
        const noKey = new OmdbApi(createOmdbConfig({ apiKey: undefined }));
        const result = await noKey.search('Inception');
        expect(result.matches).toEqual([]);
        expect(result.source).toBe('omdb');
    });

    it('search() avec fetch mocké retourne match avec title, year', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({
                            Response: 'True',
                            Search: [
                                {
                                    imdbID: 'tt1375666',
                                    Title: 'Inception',
                                    Year: '2010',
                                    Poster: 'https://example.com/poster.jpg'
                                }
                            ],
                            totalResults: '1'
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    )
                )
            )
        );
        try {
            const result = await omdb.search('Inception');
            expect(result.matches.length).toBeGreaterThanOrEqual(1);
            const first = result.matches[0];
            expect(first.source_api).toBe('omdb');
            expect(first.source_id).toBe('tt1375666');
            expect(first.title).toBe('Inception');
            expect(first.year).toBe(2010);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
