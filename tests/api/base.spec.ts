/**
 * Tests unitaires : base.ts (RateLimiter, ApiCache, fetchWithCache retry/cache)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    RateLimiter,
    ApiCache,
    CACHE_TTL_MS,
    RETRY_MAX_ATTEMPTS,
    RETRY_BASE_DELAY_MS
} from '../../app/utils/media/api/base.js';

describe('CACHE_TTL_MS', () => {
    it('vaut 7 jours en ms', () => {
        expect(CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });
});

describe('RETRY_MAX_ATTEMPTS', () => {
    it('vaut 3', () => {
        expect(RETRY_MAX_ATTEMPTS).toBe(3);
    });
});

describe('RETRY_BASE_DELAY_MS', () => {
    it('vaut 500', () => {
        expect(RETRY_BASE_DELAY_MS).toBe(500);
    });
});

describe('RateLimiter', () => {
    it('autorise les requêtes sous la limite', async () => {
        const limiter = new RateLimiter(3, 1000);
        const start = Date.now();
        await limiter.waitIfNeeded();
        await limiter.waitIfNeeded();
        await limiter.waitIfNeeded();
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(200);
    });

    it('throttle au-delà de la limite', async () => {
        const limiter = new RateLimiter(2, 400);
        await limiter.waitIfNeeded();
        await limiter.waitIfNeeded();
        const start = Date.now();
        await limiter.waitIfNeeded();
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(350);
    });
});

describe('ApiCache', () => {
    let cache: ApiCache;

    beforeEach(() => {
        cache = new ApiCache(100);
    });

    it('retourne null pour une clé absente', () => {
        expect(cache.get('missing')).toBeNull();
    });

    it('retourne la valeur après set', () => {
        cache.set('k', { title: 'Inception' });
        expect(cache.get('k')).toEqual({ title: 'Inception' });
    });

    it('retourne null après expiration TTL', async () => {
        cache.set('k', { x: 1 });
        expect(cache.get('k')).toEqual({ x: 1 });
        await new Promise(r => setTimeout(r, 110));
        expect(cache.get('k')).toBeNull();
    });

    it('clear vide le cache', () => {
        cache.set('a', 1);
        cache.clear();
        expect(cache.get('a')).toBeNull();
    });
});
