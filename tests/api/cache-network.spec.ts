/**
 * Test : deuxième requête identique ne déclenche pas nouvel appel réseau (cache)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TmdbApi } from '../../app/utils/media/api/films-series.js';
import type { ApiConfig } from '../../app/utils/media/api/base.js';

function createTmdbConfig(): ApiConfig {
    return {
        enabled: true,
        apiKey: 'test-key',
        rateLimit: { maxRequests: 40, windowMs: 10000 }
    };
}

describe('Cache TTL 7 jours', () => {
    it('deuxième requête identique utilise le cache (fetch appelé 1 fois)', async () => {
        const fetchMock = vi.fn(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({ results: [{ id: 1, title: 'Inception', release_date: '2010-07-15', overview: '', popularity: 1 }] }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                )
            )
        );
        vi.stubGlobal('fetch', fetchMock);

        const api = new TmdbApi(createTmdbConfig());
        try {
            await api.search('Inception', { type: 'movie' });
            const firstCallCount = fetchMock.mock.calls.length;
            await api.search('Inception', { type: 'movie' });
            const secondCallCount = fetchMock.mock.calls.length;
            expect(secondCallCount).toBe(firstCallCount);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
