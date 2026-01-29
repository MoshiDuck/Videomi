// INFO : public/sw.js
// Service Worker pour le cache des images et miniatures
// ISOLATION STRICTE PAR UTILISATEUR - Pas de cache public

const IMAGE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 jours
const THUMBNAIL_PREFIX = '/api/files/';

/**
 * userId courant stocké dans le Service Worker
 * IMPORTANT : Doit être défini via message SET_USER_ID avant que le cache fonctionne
 */
let currentUserId = null;

/**
 * Génère un nom de cache isolé par utilisateur
 * STRICT : Retourne null si pas de userId (pas de cache public)
 * Format doc : videomi_${userId}_images (conforme à CACHE_ARCHITECTURE.md)
 */
function getCacheName(userId) {
    if (!userId) {
        return null; // STRICT : Pas de cache sans userId
    }
    return `videomi_${userId}_images_v1`;
}

/**
 * Nettoie les caches expirés
 */
async function cleanupExpiredCaches() {
    const cacheNames = await caches.keys();
    const currentTime = Date.now();

    for (const cacheName of cacheNames) {
        // Match nouveau format (videomi_userId_) et ancien format (videomi-images-)
        if (cacheName.startsWith('videomi_') || cacheName.startsWith('videomi-images-')) {
            const cache = await caches.open(cacheName);
            const requests = await cache.keys();

            for (const request of requests) {
                const response = await cache.match(request);
                if (response) {
                    const cachedDate = response.headers.get('X-Cache-Date');
                    if (cachedDate) {
                        const age = currentTime - new Date(cachedDate).getTime();
                        if (age > IMAGE_CACHE_TTL) {
                            await cache.delete(request);
                        }
                    }
                }
            }
        }
    }
}

/**
 * Supprime tous les caches legacy (ancien format ou cache public)
 * Pour migration vers isolation stricte avec format doc
 */
async function cleanupLegacyCaches() {
    try {
        const cacheNames = await caches.keys();
        const legacyCaches = cacheNames.filter(name => 
            name.startsWith('videomi-images-') // Ancien format avec tirets
        );
        
        for (const cacheName of legacyCaches) {
            await caches.delete(cacheName);
            console.log(`[SW] Cache legacy supprimé: ${cacheName}`);
        }
    } catch (error) {
        console.warn('[SW] Erreur suppression caches legacy:', error);
    }
}

/**
 * Installation du Service Worker
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Service Worker installé (isolation stricte)');
    self.skipWaiting();
});

/**
 * Activation du Service Worker
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Service Worker activé (isolation stricte, format doc)');
    event.waitUntil(
        Promise.all([
            cleanupLegacyCaches(), // Supprimer caches ancien format (videomi-images-*)
            cleanupExpiredCaches(),
            self.clients.claim(),
        ])
    );
});

/**
 * Intercepte les requêtes pour mettre en cache les images
 * STRICT : Ne cache que si userId est défini
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Seulement pour les requêtes GET
    if (event.request.method !== 'GET') {
        return;
    }

    // Ne jamais cacher les watch-progress (données temps réel)
    if (url.pathname.includes('/api/watch-progress/')) {
        return;
    }
    
    // Cache les thumbnails et images UNIQUEMENT si userId est défini
    if (
        url.pathname.includes('/api/files/') && 
        (url.pathname.includes('/thumbnail') || url.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i))
    ) {
        // STRICT : Utiliser le currentUserId stocké
        event.respondWith(handleImageRequest(event.request, currentUserId));
    }
});

/**
 * Gère les requêtes d'images avec stratégie cache-first
 * STRICT : Ne cache pas si userId est null
 */
async function handleImageRequest(request, userId) {
    const cacheName = getCacheName(userId);
    
    // STRICT : Si pas de userId, pas de cache - requête directe
    if (!cacheName) {
        console.log('[SW] Pas de userId - requête directe sans cache');
        try {
            return await fetch(request);
        } catch (error) {
            console.error('[SW] Erreur fetch sans cache:', error);
            return new Response('Network error', { status: 503 });
        }
    }
    
    const cache = await caches.open(cacheName);
    
    // Essayer de récupérer depuis le cache
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        // Vérifier si le cache est encore valide
        const cachedDate = cachedResponse.headers.get('X-Cache-Date');
        if (cachedDate) {
            const age = Date.now() - new Date(cachedDate).getTime();
            if (age < IMAGE_CACHE_TTL) {
                // Cache valide, servir depuis le cache
                console.log(`[SW] Cache hit pour user ${userId}: ${request.url}`);
                return cachedResponse;
            } else {
                // Cache expiré, le supprimer et revalider en arrière-plan
                await cache.delete(request);
                revalidateInBackground(request, cache, userId);
                // Servir quand même le cache expiré pendant la revalidation
                return cachedResponse;
            }
        }
        return cachedResponse;
    }
    
    // Pas dans le cache, faire la requête réseau
    try {
        const response = await fetch(request);
        
        if (response.ok) {
            // Cloner la réponse pour la mettre en cache
            const responseToCache = response.clone();
            
            // Ajouter la date de cache et le userId dans les headers
            const headers = new Headers(responseToCache.headers);
            headers.set('X-Cache-Date', new Date().toISOString());
            headers.set('X-Cache-UserId', userId); // Traçabilité
            
            const cachedResponse = new Response(responseToCache.body, {
                status: responseToCache.status,
                statusText: responseToCache.statusText,
                headers: headers,
            });
            
            // Mettre en cache
            await cache.put(request, cachedResponse);
            console.log(`[SW] Mis en cache pour user ${userId}: ${request.url}`);
            
            return response;
        }
        
        return response;
    } catch (error) {
        console.error('[SW] Erreur fetch image:', error);
        return new Response('Network error', { status: 503 });
    }
}

/**
 * Revalide une image en arrière-plan
 */
async function revalidateInBackground(request, cache, userId) {
    try {
        const response = await fetch(request);
        
        if (response.ok) {
            const headers = new Headers(response.headers);
            headers.set('X-Cache-Date', new Date().toISOString());
            headers.set('X-Cache-UserId', userId);
            
            const cachedResponse = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: headers,
            });
            
            await cache.put(request, cachedResponse);
        }
    } catch (error) {
        console.error('[SW] Erreur revalidation:', error);
    }
}

/**
 * Vide tous les caches videomi (logout complet)
 * Gère les deux formats : nouveau (videomi_) et legacy (videomi-images-)
 */
async function clearAllVideomiCaches() {
    const names = await caches.keys();
    const videomiCaches = names.filter((n) => 
        n.startsWith('videomi_') || n.startsWith('videomi-images-')
    );
    await Promise.all(videomiCaches.map((n) => caches.delete(n)));
    // Reset userId au logout
    currentUserId = null;
    console.log(`[SW] ${videomiCaches.length} caches videomi vidés + userId reset`);
}

/**
 * Écoute les messages du client
 */
self.addEventListener('message', (event) => {
    // SET_USER_ID : Définir l'utilisateur courant pour l'isolation
    if (event.data && event.data.type === 'SET_USER_ID') {
        const oldUserId = currentUserId;
        currentUserId = event.data.userId || null;
        console.log(`[SW] UserId mis à jour: ${oldUserId} -> ${currentUserId}`);
        
        // Si changement d'utilisateur, vider l'ancien cache par sécurité
        if (oldUserId && oldUserId !== currentUserId) {
            const oldCacheName = getCacheName(oldUserId);
            if (oldCacheName) {
                caches.delete(oldCacheName).then(() => {
                    console.log(`[SW] Cache ancien utilisateur ${oldUserId} supprimé`);
                });
            }
        }
        return;
    }
    
    // CLEAR_CACHE : Vider le cache
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        if (event.data.clearAll) {
            event.waitUntil(clearAllVideomiCaches());
            return;
        }
        const userId = event.data.userId || currentUserId;
        const cacheName = getCacheName(userId);
        if (cacheName) {
            event.waitUntil(
                caches.delete(cacheName).then(() => {
                    console.log(`[SW] Cache vidé pour utilisateur: ${userId}`);
                })
            );
        }
        // Reset userId si c'est un clear de l'utilisateur courant
        if (userId === currentUserId) {
            currentUserId = null;
        }
    }
    
    // INVALIDATE_PATTERN : Invalider par pattern
    if (event.data && event.data.type === 'INVALIDATE_PATTERN') {
        const pattern = event.data.pattern;
        const userId = event.data.userId || currentUserId;
        event.waitUntil(
            invalidateCachePattern(pattern, userId)
        );
    }
    
    // PURGE_FILE_IDS : Supprimer du cache les réponses pour des file_ids orphelins (supprimés via R2/D1)
    if (event.data && event.data.type === 'PURGE_FILE_IDS') {
        const fileIds = event.data.fileIds || [];
        const userId = event.data.userId || currentUserId;
        if (fileIds.length > 0) {
            event.waitUntil(
                purgeCacheByFileIds(fileIds, userId)
            );
        }
    }
    
    // GET_STATUS : Retourner le statut courant (debug)
    if (event.data && event.data.type === 'GET_STATUS') {
        event.ports[0]?.postMessage({
            currentUserId: currentUserId,
            cacheEnabled: !!currentUserId,
        });
    }
});

/**
 * Invalide le cache pour un pattern donné
 */
async function invalidateCachePattern(pattern, userId) {
    const cacheName = getCacheName(userId);
    if (!cacheName) {
        console.log('[SW] Invalidation ignorée - pas de userId');
        return;
    }
    
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    
    for (const request of requests) {
        if (request.url.includes(pattern)) {
            await cache.delete(request);
            console.log(`[SW] Invalidé: ${request.url}`);
        }
    }
}

/**
 * Supprime du cache les entrées dont l'URL contient un des file_ids (orphelins D1/R2)
 */
async function purgeCacheByFileIds(fileIds, userId) {
    const cacheName = getCacheName(userId);
    if (!cacheName || fileIds.length === 0) {
        return;
    }
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    let removed = 0;
    for (const request of requests) {
        const url = request.url;
        for (const fileId of fileIds) {
            if (url.includes('/api/files/') && url.includes(fileId)) {
                await cache.delete(request);
                removed++;
                break;
            }
        }
    }
    if (removed > 0) {
        console.log('[SW] Purge file_ids orphelins: ' + removed + ' entrée(s) supprimée(s)');
    }
}
