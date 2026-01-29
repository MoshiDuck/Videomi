/**
 * Tests unitaires et smoke : cache Edge (clés URL valides pour Cloudflare Cache API)
 */
import { describe, it, expect, vi } from 'vitest';
import {
    cacheKeyToRequestUrl,
    generateCacheKey,
    invalidateCache,
} from '../../workers/cache.js';

describe('Cache Edge - clés URL valides', () => {
    describe('cacheKeyToRequestUrl', () => {
        it('convertit une clé logique en URL valide', () => {
            const url = cacheKeyToRequestUrl('user:abc123:files:category:musics');
            expect(url).toBe('https://videomi-cache.internal/user/abc123/files/category/musics');
        });

        it('produit une URL avec schéma https', () => {
            const url = cacheKeyToRequestUrl('public:file:info:fileId:xyz,category:videos');
            expect(url).toMatch(/^https:\/\//);
        });

        it('remplace les ":" de la clé logique par "/" dans le path', () => {
            const url = cacheKeyToRequestUrl('user:u1:stats');
            const pathPart = url.replace(/^https?:\/\//, '');
            expect(pathPart).not.toMatch(/^user:/);
            expect(url).toContain('/user/u1/stats');
        });
    });

    describe('generateCacheKey', () => {
        it('génère une clé logique cohérente avec userId et category', () => {
            const key = generateCacheKey('user-1', 'files', { category: 'musics' });
            expect(key).toContain('user:user-1');
            expect(key).toContain('files');
            expect(key).toContain('category:musics');
        });

        it('génère une clé stats', () => {
            const key = generateCacheKey('u2', 'stats');
            expect(key).toBe('user:u2:stats');
        });
    });

    describe('invalidateCache (smoke)', () => {
        it('appelle cache.delete avec une URL valide (pas user:...)', async () => {
            const deletedUrls: string[] = [];
            const mockCache = {
                delete: (key: string) => {
                    deletedUrls.push(key);
                    return Promise.resolve(true);
                },
                match: () => Promise.resolve(null),
                put: () => Promise.resolve(),
            } as unknown as Cache;

            await invalidateCache(mockCache, [
                generateCacheKey('u1', 'files', { category: 'videos' }),
                generateCacheKey('u1', 'stats'),
            ]);

            expect(deletedUrls).toHaveLength(2);
            deletedUrls.forEach((url) => {
                expect(url).toMatch(/^https:\/\//);
                expect(url).not.toMatch(/^user:/);
            });
        });

        it('ne lance pas d’exception pour une clé logique typique', async () => {
            const mockCache = {
                delete: () => Promise.resolve(true),
                match: () => Promise.resolve(null),
                put: () => Promise.resolve(),
            } as unknown as Cache;

            await expect(
                invalidateCache(mockCache, 'user:xyz:files:category:musics')
            ).resolves.toBeUndefined();
        });
    });
});
