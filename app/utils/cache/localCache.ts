// INFO : app/utils/cache/localCache.ts
// Système de cache local avec IndexedDB pour les métadonnées

/**
 * Configuration des TTL pour le cache local
 */
export const LOCAL_CACHE_TTL = {
    USER_FILES: 3600, // 1 heure
    USER_STATS: 300, // 5 minutes
    FILE_INFO: 3600, // 1 heure
    FILE_METADATA: 3600, // 1 heure
    RATINGS: 3600, // 1 heure
    TOP10: 3600, // 1 heure
    THUMBNAIL_URL: 604800, // 7 jours
} as const;

interface CachedItem<T> {
    key: string;
    data: T;
    timestamp: number;
    ttl: number;
    version: string;
}

const DB_NAME = 'videomi_cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache';

/**
 * Initialise la base de données IndexedDB
 */
function initDB(userId: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const dbName = `${DB_NAME}_${userId}`;
        const request = indexedDB.open(dbName, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            
            // Créer l'object store s'il n'existe pas
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

/**
 * Génère une clé de cache locale
 */
export function generateLocalCacheKey(
    resource: string,
    params?: Record<string, string | number | null>
): string {
    const parts = [resource];
    
    if (params) {
        const sortedParams = Object.entries(params)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}:${value ?? 'null'}`)
            .join(',');
        if (sortedParams) {
            parts.push(sortedParams);
        }
    }
    
    return parts.join(':');
}

/**
 * Récupère un élément depuis le cache local
 */
export async function getFromLocalCache<T>(
    userId: string,
    key: string
): Promise<T | null> {
    try {
        const db = await initDB(userId);
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const result = request.result as CachedItem<T> | undefined;
                
                if (!result) {
                    resolve(null);
                    return;
                }

                // Vérifier si le cache est expiré
                const age = Date.now() - result.timestamp;
                if (age > result.ttl * 1000) {
                    // Cache expiré, le supprimer
                    deleteFromLocalCache(userId, key).catch(console.error);
                    resolve(null);
                    return;
                }

                resolve(result.data);
            };

            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[LOCAL_CACHE] Erreur lecture:', error);
        return null;
    }
}

/**
 * Récupère un élément depuis le cache local même si expiré (stale).
 * Utilisé en fallback offline : doc "servir depuis le cache local même si stale".
 */
export async function getStaleFromLocalCache<T>(
    userId: string,
    key: string
): Promise<T | null> {
    try {
        const db = await initDB(userId);
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const result = request.result as CachedItem<T> | undefined;
                if (!result) {
                    resolve(null);
                    return;
                }
                resolve(result.data);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[LOCAL_CACHE] Erreur lecture stale:', error);
        return null;
    }
}

/**
 * Met un élément en cache local
 */
export async function putInLocalCache<T>(
    userId: string,
    key: string,
    data: T,
    ttl: number
): Promise<void> {
    try {
        const db = await initDB(userId);
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const item: CachedItem<T> = {
            key,
            data,
            timestamp: Date.now(),
            ttl,
            version: '1.0',
        };

        await new Promise<void>((resolve, reject) => {
            const request = store.put(item);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[LOCAL_CACHE] Erreur écriture:', error);
        // Ne pas faire échouer l'application si le cache échoue
    }
}

/**
 * Supprime un élément du cache local
 */
export async function deleteFromLocalCache(
    userId: string,
    key: string
): Promise<void> {
    try {
        const db = await initDB(userId);
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        await new Promise<void>((resolve, reject) => {
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[LOCAL_CACHE] Erreur suppression:', error);
    }
}

/**
 * Supprime tous les éléments expirés du cache
 */
export async function cleanupExpiredCache(userId: string): Promise<void> {
    try {
        const db = await initDB(userId);
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const now = Date.now();
        
        const request = index.openCursor();
        
        await new Promise<void>((resolve, reject) => {
            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                
                if (cursor) {
                    const item = cursor.value as CachedItem<unknown>;
                    const age = now - item.timestamp;
                    
                    if (age > item.ttl * 1000) {
                        cursor.delete();
                    }
                    
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[LOCAL_CACHE] Erreur nettoyage:', error);
    }
}

/**
 * Vide tout le cache local pour un utilisateur
 */
export async function clearLocalCache(userId: string): Promise<void> {
    try {
        const dbName = `${DB_NAME}_${userId}`;
        const deleteRequest = indexedDB.deleteDatabase(dbName);
        
        await new Promise<void>((resolve, reject) => {
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
            deleteRequest.onblocked = () => {
                console.warn('[LOCAL_CACHE] Suppression bloquée, réessayez plus tard');
                resolve();
            };
        });
    } catch (error) {
        console.error('[LOCAL_CACHE] Erreur vidage cache:', error);
    }
}

/**
 * Invalide le cache pour un pattern donné
 */
export async function invalidateLocalCache(
    userId: string,
    pattern: string
): Promise<void> {
    try {
        const db = await initDB(userId);
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();
        
        await new Promise<void>((resolve, reject) => {
            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                
                if (cursor) {
                    const key = cursor.key as string;
                    
                    // Vérifier si la clé correspond au pattern
                    if (key.startsWith(pattern) || key.includes(pattern)) {
                        cursor.delete();
                    }
                    
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[LOCAL_CACHE] Erreur invalidation:', error);
    }
}

/**
 * Wrapper pour les requêtes fetch avec cache local
 */
export async function fetchWithLocalCache<T>(
    userId: string,
    url: string,
    options: RequestInit & {
        cacheKey?: string;
        ttl?: number;
        resource?: string;
        params?: Record<string, string | number | null>;
    } = {}
): Promise<T> {
    const {
        cacheKey,
        ttl = LOCAL_CACHE_TTL.USER_FILES,
        resource,
        params,
        ...fetchOptions
    } = options;

    // Générer la clé de cache
    const key = cacheKey || (resource ? generateLocalCacheKey(resource, params) : url);

    // Essayer de récupérer depuis le cache local
    const cached = await getFromLocalCache<T>(userId, key);
    if (cached !== null) {
        console.log(`[LOCAL_CACHE] Hit: ${key}`);
        return cached;
    }

    // Faire la requête réseau
    let response: Response;
    try {
        response = await fetch(url, fetchOptions);
    } catch (networkError) {
        // Doc : "En cas d'erreur réseau, servir depuis le cache local même si stale"
        const stale = await getStaleFromLocalCache<T>(userId, key);
        if (stale !== null) {
            console.log(`[LOCAL_CACHE] Offline fallback (stale): ${key}`);
            return stale;
        }
        throw networkError;
    }

    if (!response.ok) {
        const stale = await getStaleFromLocalCache<T>(userId, key);
        if (stale !== null) {
            console.log(`[LOCAL_CACHE] Erreur HTTP, fallback stale: ${key}`);
            return stale;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as T;

    // Mettre en cache
    await putInLocalCache(userId, key, data, ttl);

    return data;
}
