// INFO : public/sw.js
// Service Worker pour le cache des images et miniatures

// CACHE_NAME sera généré dynamiquement avec userId pour isolation
const IMAGE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 jours
const THUMBNAIL_PREFIX = '/api/files/';

/**
 * Génère un nom de cache isolé par utilisateur
 * Note: Le userId sera passé via les messages du client
 */
function getCacheName(userId) {
    return userId ? `videomi-images-${userId}-v1` : 'videomi-images-public-v1';
}

/**
 * Nettoie les caches expirés
 */
async function cleanupExpiredCaches() {
    const cacheNames = await caches.keys();
    const currentTime = Date.now();

    for (const cacheName of cacheNames) {
        if (cacheName.startsWith('videomi-images-')) {
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
 * Installation du Service Worker
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Service Worker installé');
    self.skipWaiting();
});

/**
 * Activation du Service Worker
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Service Worker activé');
    event.waitUntil(
        Promise.all([
            cleanupExpiredCaches(),
            self.clients.claim(),
        ])
    );
});

/**
 * Intercepte les requêtes pour mettre en cache les images
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Seulement pour les requêtes GET
    if (event.request.method !== 'GET') {
        return;
    }

    // Ne jamais cacher les watch-progress (données temps réel)
    if (url.pathname.includes('/api/watch-progress/')) {
        return; // Pas de cache pour watch-progress
    }
    
    // Cache les thumbnails et images
    if (
        url.pathname.includes('/api/files/') && 
        (url.pathname.includes('/thumbnail') || url.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i))
    ) {
        // Extraire userId depuis l'URL ou les headers si possible
        // Pour l'instant, on utilise un cache par défaut, mais idéalement on devrait passer userId via message
        event.respondWith(handleImageRequest(event.request, null));
    }
});

/**
 * Gère les requêtes d'images avec stratégie cache-first
 */
async function handleImageRequest(request, userId = null) {
    const cacheName = getCacheName(userId);
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
                return cachedResponse;
            } else {
                // Cache expiré, le supprimer et revalider en arrière-plan
                await cache.delete(request);
                revalidateInBackground(request, cache);
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
            
            // Ajouter la date de cache dans les headers
            const headers = new Headers(responseToCache.headers);
            headers.set('X-Cache-Date', new Date().toISOString());
            
            const cachedResponse = new Response(responseToCache.body, {
                status: responseToCache.status,
                statusText: responseToCache.statusText,
                headers: headers,
            });
            
            // Mettre en cache
            await cache.put(request, cachedResponse);
            
            return response;
        }
        
        return response;
    } catch (error) {
        console.error('[SW] Erreur fetch image:', error);
        // En cas d'erreur réseau, retourner une réponse d'erreur
        return new Response('Network error', { status: 503 });
    }
}

/**
 * Revalide une image en arrière-plan
 */
async function revalidateInBackground(request, cache) {
    try {
        const response = await fetch(request);
        
        if (response.ok) {
            const headers = new Headers(response.headers);
            headers.set('X-Cache-Date', new Date().toISOString());
            
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
 * Vide tous les caches videomi (logout complet, isolation)
 * On utilise toujours getCacheName(null) au fetch → public.
 * Au logout on doit vider TOUS les caches pour éviter fuite cross-user.
 */
async function clearAllVideomiCaches() {
    const names = await caches.keys();
    await Promise.all(
        names.filter((n) => n.startsWith('videomi-images-')).map((n) => caches.delete(n))
    );
    console.log('[SW] Tous les caches videomi vidés');
}

/**
 * Écoute les messages pour invalider le cache
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        if (event.data.clearAll) {
            event.waitUntil(clearAllVideomiCaches());
            return;
        }
        const userId = event.data.userId || null;
        const cacheName = getCacheName(userId);
        event.waitUntil(
            caches.delete(cacheName).then(() => {
                console.log(`[SW] Cache vidé pour utilisateur: ${userId || 'public'}`);
            })
        );
    }
    
    if (event.data && event.data.type === 'INVALIDATE_PATTERN') {
        const pattern = event.data.pattern;
        const userId = event.data.userId || null;
        event.waitUntil(
            invalidateCachePattern(pattern, userId)
        );
    }
});

/**
 * Invalide le cache pour un pattern donné
 */
async function invalidateCachePattern(pattern, userId = null) {
    const cacheName = getCacheName(userId);
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    
    for (const request of requests) {
        if (request.url.includes(pattern)) {
            await cache.delete(request);
        }
    }
}
