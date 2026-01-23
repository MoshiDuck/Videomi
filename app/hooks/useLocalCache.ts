// INFO : app/hooks/useLocalCache.ts
// Hook React pour utiliser le cache local

import { useCallback } from 'react';
import {
    fetchWithLocalCache,
    clearLocalCache,
    invalidateLocalCache,
    LOCAL_CACHE_TTL,
    generateLocalCacheKey,
} from '~/utils/cache/localCache';

interface UseLocalCacheOptions {
    userId: string | null;
}

/**
 * Hook pour utiliser le cache local avec IndexedDB
 */
export function useLocalCache({ userId }: UseLocalCacheOptions) {
    /**
     * Récupère des données avec cache local
     */
    const fetchCached = useCallback(
        async <T>(
            url: string,
            options: {
                resource: string;
                params?: Record<string, string | number | null>;
                ttl?: number;
                headers?: HeadersInit;
            } = { resource: url }
        ): Promise<T> => {
            if (!userId) {
                throw new Error('User ID is required for local cache');
            }

            const cacheKey = generateLocalCacheKey(options.resource, options.params);

            return fetchWithLocalCache<T>(
                userId,
                url,
                {
                    cacheKey,
                    ttl: options.ttl || LOCAL_CACHE_TTL.USER_FILES,
                    resource: options.resource,
                    params: options.params,
                    headers: options.headers,
                }
            );
        },
        [userId]
    );

    /**
     * Invalide le cache pour un pattern donné
     */
    const invalidate = useCallback(
        async (pattern: string) => {
            if (!userId) return;
            await invalidateLocalCache(userId, pattern);
        },
        [userId]
    );

    /**
     * Vide tout le cache local
     */
    const clear = useCallback(async () => {
        if (!userId) return;
        await clearLocalCache(userId);
    }, [userId]);

    /**
     * Invalide le cache pour une catégorie de fichiers
     */
    const invalidateCategory = useCallback(
        async (category: string) => {
            if (!userId) return;
            const pattern = generateLocalCacheKey('files', { category });
            await invalidateLocalCache(userId, pattern);
        },
        [userId]
    );

    /**
     * Invalide le cache pour un fichier spécifique
     */
    const invalidateFile = useCallback(
        async (fileId: string) => {
            if (!userId) return;
            const patterns = [
                generateLocalCacheKey('file:info', { fileId }),
                generateLocalCacheKey('file:metadata', { fileId }),
            ];
            for (const pattern of patterns) {
                await invalidateLocalCache(userId, pattern);
            }
        },
        [userId]
    );

    /**
     * Invalide le cache des stats
     */
    const invalidateStats = useCallback(async () => {
        if (!userId) return;
        const pattern = generateLocalCacheKey('stats');
        await invalidateLocalCache(userId, pattern);
    }, [userId]);

    return {
        fetchCached,
        invalidate,
        clear,
        invalidateCategory,
        invalidateFile,
        invalidateStats,
    };
}
