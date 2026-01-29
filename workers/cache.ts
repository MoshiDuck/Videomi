// INFO : workers/cache.ts
// Utilitaires de cache Edge pour Cloudflare Workers

import type { Context } from 'hono';

/**
 * Récupère le cache Edge par défaut (Cloudflare Workers).
 * Contourne le typage DOM CacheStorage qui n'expose pas `default`.
 */
export function getDefaultCache(): Cache {
    return (globalThis.caches as unknown as { default: Cache }).default;
}

/**
 * Configuration des TTL par type de ressource
 */
export const CACHE_TTL = {
    // Métadonnées utilisateur
    USER_FILES: 300, // 5 minutes
    USER_STATS: 60, // 1 minute
    
    // Métadonnées fichier
    FILE_INFO: 900, // 15 minutes
    FILE_METADATA: 900, // 15 minutes
    
    // Médias
    THUMBNAIL: 604800, // 7 jours
    BACKDROP: 604800, // 7 jours
    
    // Ratings
    RATINGS: 600, // 10 minutes
    TOP10: 600, // 10 minutes
    
    // Config (rarement changé)
    CONFIG: 3600, // 1 heure
} as const;

/** Base URL pour les clés de cache (Cloudflare Cache API exige des URLs valides) */
const CACHE_BASE_URL = 'https://videomi-cache.internal/';

/**
 * Convertit une clé logique (ex. user:abc:files:category:videos) en URL valide
 * pour l'API Cache Cloudflare, qui n'accepte que Request ou URL.
 */
export function cacheKeyToRequestUrl(logicalKey: string): string {
    const path = logicalKey.replace(/:/g, '/');
    return `${CACHE_BASE_URL}${path}`;
}

/**
 * Génère une clé de cache sécurisée avec isolation par utilisateur
 */
export function generateCacheKey(
    userId: string | null,
    resource: string,
    params?: Record<string, string | number | null>
): string {
    const parts: string[] = [];
    
    // Isolation par utilisateur (sécurité critique)
    if (userId) {
        parts.push(`user:${userId}`);
    } else {
        parts.push('public');
    }
    
    parts.push(resource);
    
    // Ajouter les paramètres triés pour garantir l'unicité
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
 * Génère un ETag basé sur le contenu
 */
export function generateETag(content: string | object): string {
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    // Hash simple basé sur le contenu (pour production, utiliser crypto.subtle)
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return `"${Math.abs(hash).toString(16)}"`;
}

/**
 * Récupère depuis le cache Edge ou null si absent
 */
function toCacheUrl(key: string): string {
    return key.startsWith('http://') || key.startsWith('https://') ? key : cacheKeyToRequestUrl(key);
}

export async function getFromCache(
    cache: Cache,
    key: string
): Promise<Response | null> {
    try {
        const url = toCacheUrl(key);
        const cachedResponse = await cache.match(url);
        return cachedResponse || null;
    } catch (error) {
        console.error(`[CACHE] Erreur lecture cache pour ${key}:`, error);
        return null;
    }
}

/**
 * Met en cache une réponse avec TTL et headers appropriés
 */
export async function putInCache(
    cache: Cache,
    key: string,
    response: Response,
    ttl: number,
    options?: {
        etag?: string;
        cacheTags?: string[];
        vary?: string[];
    }
): Promise<void> {
    try {
        // Cloner la réponse car elle ne peut être lue qu'une fois
        const responseToCache = response.clone();
        
        // Créer les headers de cache
        const headers = new Headers(responseToCache.headers);
        
        // Cache-Control avec stale-while-revalidate selon la documentation
        // Pour métadonnées: max-age=300, s-maxage=600, stale-while-revalidate=3600
        // Pour thumbnails: max-age=604800, s-maxage=2592000, immutable
        // Pour fichiers média: max-age=31536000, immutable
        let cacheControl: string;
        if (ttl >= 31536000) {
            // Fichiers média (1 an) - immutable
            cacheControl = `public, max-age=${ttl}, immutable`;
        } else if (ttl >= 604800) {
            // Thumbnails (7 jours) - immutable avec s-maxage
            cacheControl = `public, max-age=${ttl}, s-maxage=${Math.max(ttl * 4, 2592000)}, immutable`;
        } else {
            // Métadonnées - stale-while-revalidate
            const staleWhileRevalidate = Math.min(ttl * 12, 3600); // Max 1h selon doc
            const sMaxAge = Math.max(ttl * 2, ttl); // s-maxage = 2x max-age pour métadonnées
            cacheControl = `public, max-age=${ttl}, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
        }
        headers.set('Cache-Control', cacheControl);
        
        // ETag si fourni
        if (options?.etag) {
            headers.set('ETag', options.etag);
        }
        
        // Vary headers pour les requêtes authentifiées
        if (options?.vary && options.vary.length > 0) {
            const existingVary = headers.get('Vary');
            const varyHeaders = existingVary 
                ? `${existingVary}, ${options.vary.join(', ')}`
                : options.vary.join(', ');
            headers.set('Vary', varyHeaders);
        }
        
        // Cache-Tags pour invalidation (si supporté)
        if (options?.cacheTags && options.cacheTags.length > 0) {
            headers.set('Cache-Tags', options.cacheTags.join(','));
        }
        
        // Date de création pour calculer l'expiration
        headers.set('X-Cache-Date', new Date().toISOString());
        headers.set('X-Cache-TTL', ttl.toString());
        
        // Créer une nouvelle réponse avec les headers de cache
        const cachedResponse = new Response(responseToCache.body, {
            status: responseToCache.status,
            statusText: responseToCache.statusText,
            headers: headers,
        });
        
        // Mettre en cache (clé = URL valide pour Cloudflare Cache API)
        const url = toCacheUrl(key);
        await cache.put(url, cachedResponse);
        
        console.log(`[CACHE] Mis en cache: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
        console.error(`[CACHE] Erreur mise en cache pour ${key}:`, error);
        // Ne pas faire échouer la requête si le cache échoue
    }
}

/**
 * Invalide une clé de cache ou toutes les clés correspondant à un pattern
 */
export async function invalidateCache(
    cache: Cache,
    pattern: string | string[]
): Promise<void> {
    try {
        const patterns = Array.isArray(pattern) ? pattern : [pattern];
        
        // Note: L'API Cache ne supporte pas la recherche par pattern
        // Cette fonction est prévue pour une implémentation future avec KV ou Durable Objects
        // Pour l'instant, on log l'intention d'invalidation
        
        console.log(`[CACHE] Invalidation demandée pour: ${patterns.join(', ')}`);
        
        // Suppression par clé exacte (Cache API exige des URLs valides, pas user:...)
        for (const logicalKey of patterns) {
            if (logicalKey.includes('*')) continue; // wildcard non supporté, skip
            try {
                const url = toCacheUrl(logicalKey);
                await cache.delete(url);
                console.log(`[CACHE] Clé invalidée: ${logicalKey}`);
            } catch (error) {
                console.error(`[CACHE] Erreur invalidation ${logicalKey}:`, error);
            }
        }
    } catch (error) {
        console.error(`[CACHE] Erreur invalidation cache:`, error);
    }
}

/**
 * Vérifie si une requête peut être mise en cache
 * (pas de données sensibles, méthode GET, etc.)
 */
export function canCache(
    request: Request,
    userId: string | null
): boolean {
    // Seulement GET requests
    if (request.method !== 'GET') {
        return false;
    }
    
    // Pas de cache pour les requêtes d'authentification
    if (request.url.includes('/api/auth/')) {
        return false;
    }
    
    // Pas de cache pour les watch progress (données temps réel)
    if (request.url.includes('/api/watch-progress/')) {
        return false;
    }
    
    // Pas de cache pour /api/stats : contient billableGB (facturation)
    // Doc : "Informations de facturation" jamais en cache Edge
    if (request.url.includes('/api/stats')) {
        return false;
    }
    
    // Pas de cache pour les uploads
    if (request.url.includes('/api/upload') && request.method !== 'GET') {
        return false;
    }
    
    return true;
}

/**
 * Récupère le TTL approprié pour une route donnée
 */
export function getTTLForRoute(route: string): number {
    if (route.includes('/api/upload/user/')) {
        return CACHE_TTL.USER_FILES;
    }
    if (route.includes('/api/stats')) {
        return CACHE_TTL.USER_STATS;
    }
    if (route.includes('/api/files/') && route.includes('/info')) {
        return CACHE_TTL.FILE_INFO;
    }
    if (route.includes('/api/files/') && route.includes('/thumbnail')) {
        return CACHE_TTL.THUMBNAIL;
    }
    if (route.includes('/api/ratings/top10')) {
        return CACHE_TTL.TOP10;
    }
    if (route.includes('/api/ratings/')) {
        return CACHE_TTL.RATINGS;
    }
    if (route.includes('/api/config')) {
        return CACHE_TTL.CONFIG;
    }
    
    // TTL par défaut (conservateur)
    return 60;
}

/**
 * Middleware Hono pour le cache Edge
 */
export function cacheMiddleware(
    cache: Cache,
    options?: {
        ttl?: number;
        generateKey?: (c: Context) => string;
        shouldCache?: (c: Context, response: Response) => boolean;
    }
) {
    return async (c: Context, next: () => Promise<void>) => {
        const request = c.req;
        
        // Vérifier si on peut mettre en cache
        if (!canCache(request.raw, null)) {
            return next();
        }
        
        // Générer la clé de cache
        const cacheKey = options?.generateKey 
            ? options.generateKey(c)
            : request.url;
        
        // Essayer de récupérer depuis le cache
        const cachedResponse = await getFromCache(cache, cacheKey);
        
        if (cachedResponse) {
            // Vérifier l'ETag si présent dans la requête
            const ifNoneMatch = request.header('If-None-Match');
            const etag = cachedResponse.headers.get('ETag');
            
            if (ifNoneMatch && etag && ifNoneMatch === etag) {
                // Contenu inchangé, retourner 304
                return c.body(null, 304);
            }
            
            // Servir depuis le cache
            console.log(`[CACHE] Hit: ${cacheKey}`);
            return new Response(cachedResponse.body, {
                status: cachedResponse.status,
                headers: cachedResponse.headers,
            });
        }
        
        // Pas dans le cache, exécuter la route
        await next();
        
        // Mettre en cache la réponse si appropriée
        const response = c.res;
        if (response && response.ok) {
            const shouldCache = options?.shouldCache 
                ? options.shouldCache(c, response)
                : true;
            
            if (shouldCache) {
                const ttl = options?.ttl || getTTLForRoute(request.path);
                const content = await response.clone().text();
                const etag = generateETag(content);
                
                await putInCache(cache, cacheKey, response.clone(), ttl, {
                    etag,
                    vary: ['Authorization'],
                });
            }
        }
    };
}
