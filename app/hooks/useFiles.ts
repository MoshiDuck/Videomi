// INFO : app/hooks/useFiles.ts
// Hook partagé pour récupérer les fichiers avec cache pour éviter les appels redondants

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FileCategory } from '~/utils/file/fileClassifier';

export interface FileItem {
    file_id: string;
    filename: string;
    category: FileCategory;
    size: number;
    uploaded_at: number;
    mime_type?: string;
    source_id?: string | null;
    source_api?: string | null;
    title?: string | null;
    artists?: string | null;
    albums?: string | null;
    year?: number | null;
    duration?: number | null;
    thumbnail_url?: string | null;
    thumbnail_r2_path?: string | null;
    album_thumbnails?: string | null;
}

interface UseFilesOptions {
    category: FileCategory;
    userId: string | null;
    enabled?: boolean; // Permet de désactiver le fetch
    refetchInterval?: number; // Intervalle de refetch automatique (ms)
}

interface UseFilesReturn {
    files: FileItem[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

// Cache en mémoire partagé entre toutes les instances
const fileCache = new Map<string, { data: FileItem[]; timestamp: number }>();
// Exposer le cache globalement pour le préchargeur
if (typeof window !== 'undefined') {
    (window as any).__fileCache = fileCache;
}
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 heures par défaut (long terme)
const ACTIVE_FETCHES = new Map<string, Promise<FileItem[]>>(); // Évite les appels simultanés

// Flag pour le premier chargement de l'app
const FIRST_LOAD_KEY = 'videomi_first_load_done';
const CACHE_VERSION_KEY = 'videomi_cache_version';
const CURRENT_CACHE_VERSION = '1.0';

// Vérifier si c'est le premier chargement de l'app
function isFirstLoad(): boolean {
    if (typeof window === 'undefined') return false;
    const firstLoadDone = localStorage.getItem(FIRST_LOAD_KEY);
    if (!firstLoadDone) {
        localStorage.setItem(FIRST_LOAD_KEY, 'true');
        localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
        // Invalider tous les caches au premier chargement
        invalidateAllFileCache();
        invalidatePersistentCache();
        return true;
    }
    // Vérifier si la version du cache a changé
    const cachedVersion = localStorage.getItem(CACHE_VERSION_KEY);
    if (cachedVersion !== CURRENT_CACHE_VERSION) {
        localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
        invalidateAllFileCache();
        invalidatePersistentCache();
        return true;
    }
    return false;
}

// Cache persistant dans localStorage
function getPersistentCacheKey(userId: string, category: FileCategory): string {
    return `videomi_files_${userId}_${category}`;
}

function saveToPersistentCache(userId: string, category: FileCategory, data: FileItem[]): void {
    if (typeof window === 'undefined') return;
    try {
        const key = getPersistentCacheKey(userId, category);
        const cacheData = {
            data,
            timestamp: Date.now(),
            version: CURRENT_CACHE_VERSION
        };
        localStorage.setItem(key, JSON.stringify(cacheData));
    } catch (error) {
        console.warn('⚠️ [useFiles] Erreur sauvegarde cache localStorage:', error);
    }
}

function loadFromPersistentCache(userId: string, category: FileCategory): FileItem[] | null {
    if (typeof window === 'undefined') return null;
    try {
        const key = getPersistentCacheKey(userId, category);
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        
        const parsed = JSON.parse(cached) as { data: FileItem[]; timestamp: number; version?: string };
        
        // Vérifier la version du cache
        if (parsed.version !== CURRENT_CACHE_VERSION) {
            localStorage.removeItem(key);
            return null;
        }
        
        // Vérifier l'âge du cache (max 24h)
        if (Date.now() - parsed.timestamp > CACHE_DURATION) {
            localStorage.removeItem(key);
            return null;
        }
        
        return parsed.data;
    } catch (error) {
        console.warn('⚠️ [useFiles] Erreur lecture cache localStorage:', error);
        return null;
    }
}

function invalidatePersistentCache(): void {
    if (typeof window === 'undefined') return;
    try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('videomi_files_')) {
                localStorage.removeItem(key);
            }
        });
    } catch (error) {
        console.warn('⚠️ [useFiles] Erreur invalidation cache localStorage:', error);
    }
}

export function useFiles({ category, userId, enabled = true, refetchInterval }: UseFilesOptions): UseFilesReturn {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<number | null>(null);

    const cacheKey = userId && category ? `files_${userId}_${category}` : null;

    const fetchFiles = useCallback(async (skipCache = false, forceRefresh = false): Promise<void> => {
        if (!userId || !category || !enabled) {
            setLoading(false);
            return;
        }

        const key = `files_${userId}_${category}`;

        // Forcer le refresh au premier chargement ou si explicitement demandé
        const isFirstLoadCheck = isFirstLoad();
        if (isFirstLoadCheck || forceRefresh) {
            skipCache = true;
        }

        // Vérifier le cache en mémoire d'abord (priorité pour rapidité)
        if (!skipCache && cacheKey) {
            const cached = fileCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
                // Serveur immédiatement depuis le cache mémoire (instantané)
                setFiles(cached.data);
                setLoading(false);
                setError(null);
                // Note: Le rafraîchissement en arrière-plan sera géré par le système de refetch automatique si configuré
                return;
            }
        }

        // Vérifier le cache persistant (localStorage) si pas de cache mémoire
        if (!skipCache && userId) {
            const persistentCache = loadFromPersistentCache(userId, category);
            if (persistentCache) {
                // Serveur immédiatement depuis le cache persistant (instantané)
                setFiles(persistentCache);
                // Mettre à jour le cache mémoire pour les prochaines fois
                if (cacheKey) {
                    fileCache.set(cacheKey, {
                        data: persistentCache,
                        timestamp: Date.now()
                    });
                }
                setLoading(false);
                setError(null);
                // Note: Le rafraîchissement en arrière-plan sera géré par le système de refetch automatique si configuré
                return;
            }
        }

        // Vérifier si un fetch est déjà en cours
        const activeFetch = ACTIVE_FETCHES.get(key);
        if (activeFetch) {
            try {
                const data = await activeFetch;
                setFiles(data);
                setLoading(false);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Erreur inconnue');
                setLoading(false);
            }
            return;
        }

        // Créer une nouvelle requête
        const fetchPromise = (async (): Promise<FileItem[]> => {
            try {
                setLoading(true);
                setError(null);

                const token = localStorage.getItem('videomi_token');
                const response = await fetch(
                    `https://videomi.uk/api/upload/user/${userId}?category=${category}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    }
                );

                if (!response.ok) {
                    throw new Error('Erreur lors de la récupération des fichiers');
                }

                const data = await response.json() as { files: FileItem[] };
                const fetchedFiles = data.files || [];

                // Mettre en cache (mémoire + persistant)
                if (cacheKey) {
                    fileCache.set(cacheKey, {
                        data: fetchedFiles,
                        timestamp: Date.now()
                    });
                }
                
                // Sauvegarder dans le cache persistant
                if (userId) {
                    saveToPersistentCache(userId, category, fetchedFiles);
                }

                return fetchedFiles;
            } catch (err) {
                console.error(`❌ [useFiles] Erreur fetch ${category}:`, err);
                throw err;
            } finally {
                // Retirer de la liste des fetches actifs
                ACTIVE_FETCHES.delete(key);
            }
        })();

        // Enregistrer le fetch actif
        ACTIVE_FETCHES.set(key, fetchPromise);

        try {
            const data = await fetchPromise;
            setFiles(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur inconnue');
            setFiles([]);
        } finally {
            setLoading(false);
        }
    }, [userId, category, enabled, cacheKey]);

    // Fetch initial - forcer le refresh au premier chargement
    useEffect(() => {
        const firstLoad = isFirstLoad();
        fetchFiles(false, firstLoad);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, category, enabled]); // Dépendances spécifiques pour éviter les re-renders

    // Refetch automatique avec intervalle
    useEffect(() => {
        if (refetchInterval && enabled) {
            intervalRef.current = window.setInterval(() => {
                fetchFiles(false, false);
            }, refetchInterval);

            return () => {
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                }
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refetchInterval, enabled]);

    // Nettoyer l'intervalle au démontage
    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    return {
        files,
        loading,
        error,
        refetch: () => fetchFiles(true, false) // Force un refetch en bypassant le cache
    };
}

/**
 * Invalider le cache pour une catégorie spécifique (mémoire + persistant)
 */
export function invalidateFileCache(userId: string, category: FileCategory): void {
    const key = `files_${userId}_${category}`;
    fileCache.delete(key);
    
    // Invalider aussi le cache persistant
    if (typeof window !== 'undefined') {
        try {
            const persistentKey = getPersistentCacheKey(userId, category);
            localStorage.removeItem(persistentKey);
        } catch (error) {
            console.warn('⚠️ [useFiles] Erreur invalidation cache persistant:', error);
        }
    }
    
}

/**
 * Invalider tout le cache des fichiers (mémoire + persistant)
 */
export function invalidateAllFileCache(): void {
    fileCache.clear();
    invalidatePersistentCache();
}

/**
 * Invalider le cache pour toutes les catégories d'un utilisateur
 */
export function invalidateUserFileCache(userId: string): void {
    if (typeof window === 'undefined') return;
    
    // Invalider toutes les catégories connues
    const categories: FileCategory[] = ['videos', 'musics', 'images', 'documents', 'archives', 'executables', 'others', 'raw_images'];
    categories.forEach(category => {
        invalidateFileCache(userId, category);
    });
    
}

// Système d'événements pour notifier les changements
const cacheInvalidationListeners = new Set<() => void>();

/**
 * S'abonner aux événements d'invalidation de cache
 */
export function onCacheInvalidation(listener: () => void): () => void {
    cacheInvalidationListeners.add(listener);
    return () => {
        cacheInvalidationListeners.delete(listener);
    };
}

/**
 * Notifier tous les listeners d'une invalidation
 */
function notifyCacheInvalidation(): void {
    cacheInvalidationListeners.forEach(listener => {
        try {
            listener();
        } catch (error) {
            console.warn('⚠️ [useFiles] Erreur dans listener d\'invalidation:', error);
        }
    });
}
