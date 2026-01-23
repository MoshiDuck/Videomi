// INFO : app/utils/cache/cacheInvalidation.ts
// Système d'invalidation intelligente du cache

import { invalidateLocalCache, clearLocalCache } from './localCache';

/**
 * Événements d'invalidation du cache
 */
export type CacheInvalidationEvent =
    | { type: 'file:upload'; userId: string; category: string }
    | { type: 'file:delete'; userId: string; fileId: string; category: string }
    | { type: 'file:metadata:update'; userId: string; fileId: string }
    | { type: 'rating:new'; userId: string; fileId: string }
    | { type: 'user:logout'; userId: string }
    | { type: 'stats:update'; userId: string };

/**
 * Gère l'invalidation du cache en fonction des événements
 */
export async function handleCacheInvalidation(event: CacheInvalidationEvent): Promise<void> {
    switch (event.type) {
        case 'file:upload': {
            // Invalide : liste fichiers, stats
            await Promise.all([
                invalidateLocalCache(event.userId, `files:category:${event.category}`),
                invalidateLocalCache(event.userId, 'stats'),
            ]);
            
            // Émettre un événement personnalisé pour le cache navigateur
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('videomi:cache-invalidate', {
                        detail: {
                            type: 'file:upload',
                            category: event.category,
                            userId: event.userId,
                        },
                    })
                );
            }
            break;
        }

        case 'file:delete': {
            // Invalide : liste fichiers, stats, métadonnées fichier
            await Promise.all([
                invalidateLocalCache(event.userId, `files:category:${event.category}`),
                invalidateLocalCache(event.userId, 'stats'),
                invalidateLocalCache(event.userId, `file:info:fileId:${event.fileId}`),
                invalidateLocalCache(event.userId, `file:metadata:fileId:${event.fileId}`),
            ]);
            
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('videomi:cache-invalidate', {
                        detail: {
                            type: 'file:delete',
                            fileId: event.fileId,
                            category: event.category,
                            userId: event.userId,
                        },
                    })
                );
            }
            break;
        }

        case 'file:metadata:update': {
            // Invalide : métadonnées fichier, liste si changement visible
            await Promise.all([
                invalidateLocalCache(event.userId, `file:info:fileId:${event.fileId}`),
                invalidateLocalCache(event.userId, `file:metadata:fileId:${event.fileId}`),
            ]);
            
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('videomi:cache-invalidate', {
                        detail: {
                            type: 'file:metadata:update',
                            fileId: event.fileId,
                            userId: event.userId,
                        },
                    })
                );
            }
            break;
        }

        case 'rating:new': {
            // Invalide : ratings fichier, top10
            await Promise.all([
                invalidateLocalCache(event.userId, `ratings:fileId:${event.fileId}`),
                invalidateLocalCache(event.userId, 'ratings:top10'),
            ]);
            
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('videomi:cache-invalidate', {
                        detail: {
                            type: 'rating:new',
                            fileId: event.fileId,
                            userId: event.userId,
                        },
                    })
                );
            }
            break;
        }

        case 'user:logout': {
            // Vide tout le cache local
            await clearLocalCache(event.userId);
            
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('videomi:cache-invalidate', {
                        detail: {
                            type: 'user:logout',
                            userId: event.userId,
                        },
                    })
                );
            }
            break;
        }

        case 'stats:update': {
            // Invalide : stats
            await invalidateLocalCache(event.userId, 'stats');
            
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('videomi:stats-invalidated', {
                        detail: {
                            userId: event.userId,
                        },
                    })
                );
            }
            break;
        }
    }
}

/**
 * Hook pour écouter les événements d'invalidation
 */
export function setupCacheInvalidationListener(
    userId: string | null,
    onInvalidate: (event: CacheInvalidationEvent) => void
): () => void {
    if (typeof window === 'undefined' || !userId) {
        return () => {};
    }

    const handler = (event: Event) => {
        const customEvent = event as CustomEvent;
        const detail = customEvent.detail;

        if (detail?.userId === userId) {
            onInvalidate(detail as CacheInvalidationEvent);
        }
    };

    window.addEventListener('videomi:cache-invalidate', handler);

    return () => {
        window.removeEventListener('videomi:cache-invalidate', handler);
    };
}
