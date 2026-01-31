// INFO : app/utils/cache/cacheInvalidation.ts
// Système d'invalidation intelligente du cache

import { useEffect, useState } from 'react';
import { invalidateLocalCache, clearLocalCache } from './localCache';
import { invalidateFileCache, invalidateAllFileCache } from '~/hooks/useFiles';

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
            // Invalide : liste fichiers, stats (IndexedDB + cache useFiles localStorage/mémoire)
            invalidateFileCache(event.userId, event.category as import('~/utils/file/fileClassifier').FileCategory);
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
            // Invalide : liste fichiers, stats, métadonnées fichier (IndexedDB + cache useFiles)
            invalidateFileCache(event.userId, event.category as import('~/utils/file/fileClassifier').FileCategory);
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
            // Vide tout le cache local (IndexedDB + cache useFiles localStorage/mémoire)
            invalidateAllFileCache();
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
 * Invalide les stats affichées sur la page d'accueil (client-side).
 * Déclenche la réexécution du clientLoader de /home via l'événement videomi:stats-invalidated.
 * À appeler après un upload, une suppression ou toute action modifiant le nombre/taille des fichiers.
 */
export function invalidateStats(userId: string): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
        new CustomEvent('videomi:stats-invalidated', {
            detail: { userId },
        })
    );
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

/**
 * Hook React pour refetch automatiquement les fichiers d'une catégorie
 * quand un upload/delete invalide le cache (événement videomi:cache-invalidate).
 * Conforme CACHE_ARCHITECTURE.md § Stratégie d'Invalidation.
 */
export function useRefetchOnCacheInvalidation(
    userId: string | null,
    category: string,
    refetch: () => void | Promise<void>
): void {
    useEffect(() => {
        if (typeof window === 'undefined' || !userId) return;

        const handler = (event: Event) => {
            const e = event as CustomEvent<{ type: string; category?: string; userId?: string }>;
            const d = e.detail;
            if (d?.userId !== userId) return;
            if (d.type === 'file:upload' || d.type === 'file:delete') {
                if (d.category === category) {
                    void Promise.resolve(refetch());
                }
            }
        };

        window.addEventListener('videomi:cache-invalidate', handler);
        return () => window.removeEventListener('videomi:cache-invalidate', handler);
    }, [userId, category, refetch]);
}

/**
 * Hook qui retourne un compteur incrémenté à chaque invalidation (file:upload/file:delete)
 * pour la catégorie donnée. À placer dans les deps d'un useEffect pour déclencher un refetch.
 * Utile quand fetchFiles est défini à l'intérieur du useEffect.
 */
export function useCacheInvalidationTrigger(userId: string | null, category: string): number {
    const [trigger, setTrigger] = useState(0);
    useEffect(() => {
        if (typeof window === 'undefined' || !userId) return;
        const handler = (event: Event) => {
            const e = event as CustomEvent<{ type: string; category?: string; userId?: string }>;
            const d = e.detail;
            if (d?.userId !== userId) return;
            if ((d.type === 'file:upload' || d.type === 'file:delete') && d.category === category) {
                setTrigger((t) => t + 1);
            }
        };
        window.addEventListener('videomi:cache-invalidate', handler);
        return () => window.removeEventListener('videomi:cache-invalidate', handler);
    }, [userId, category]);
    return trigger;
}
