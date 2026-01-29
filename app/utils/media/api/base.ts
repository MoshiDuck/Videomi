// INFO: app/utils/media/api/base.ts
// Classes de base et utilitaires pour les intégrations API

import type { MetadataSource, MediaMatch, MediaSearchResult } from '../../../types/metadata.js';

/** TTL du cache en millisecondes (7 jours) */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Nombre max de tentatives pour les erreurs 5xx */
export const RETRY_MAX_ATTEMPTS = 3;

/** Délai de base pour le backoff exponentiel (ms) */
export const RETRY_BASE_DELAY_MS = 500;

/**
 * Configuration d'une API
 */
export interface ApiConfig {
    enabled: boolean;
    apiKey?: string;
    clientId?: string;
    clientSecret?: string;
    token?: string;
    userAgent?: string;
    rateLimit?: {
        maxRequests: number;
        windowMs: number;
    };
}

/**
 * Rate limiter pour respecter les limites des API
 */
export class RateLimiter {
    private requests: number[] = [];
    private maxRequests: number;
    private windowMs: number;

    constructor(maxRequests: number, windowMs: number) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    async waitIfNeeded(): Promise<void> {
        const now = Date.now();
        
        // Nettoyer les requêtes anciennes
        this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);
        
        // Si on dépasse la limite, attendre
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = Math.min(...this.requests);
            const waitTime = this.windowMs - (now - oldestRequest) + 100; // +100ms de marge
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return this.waitIfNeeded(); // Re-vérifier après l'attente
            }
        }
        
        // Enregistrer cette requête
        this.requests.push(Date.now());
    }
}

/**
 * Cache simple pour les résultats API
 */
export class ApiCache {
    private cache = new Map<string, { result: unknown; timestamp: number }>();
    private defaultDuration: number;

    constructor(ttlMs: number = CACHE_TTL_MS) {
        this.defaultDuration = ttlMs;
    }

    get(key: string): unknown | null {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        const now = Date.now();
        if (now - cached.timestamp > this.defaultDuration) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.result;
    }

    set(key: string, result: unknown): void {
        this.cache.set(key, {
            result,
            timestamp: Date.now()
        });
    }

    clear(): void {
        this.cache.clear();
    }
}

/**
 * Classe de base pour toutes les intégrations API
 */
export abstract class BaseMetadataApi {
    protected config: ApiConfig;
    protected rateLimiter: RateLimiter | null = null;
    protected cache: ApiCache = new ApiCache();
    protected source: MetadataSource;

    constructor(config: ApiConfig, source: MetadataSource) {
        this.config = config;
        this.source = source;
        
        if (config.rateLimit) {
            this.rateLimiter = new RateLimiter(
                config.rateLimit.maxRequests,
                config.rateLimit.windowMs
            );
        }
    }

    /**
     * Vérifie si l'API est configurée et activée
     */
    isAvailable(): boolean {
        return this.config.enabled && this.hasRequiredCredentials();
    }

    /**
     * Vérifie si les credentials requis sont présents
     */
    protected abstract hasRequiredCredentials(): boolean;

    /**
     * Effectue une requête HTTP avec rate limiting, retry (5xx) et cache
     */
    protected async fetchWithCache(
        url: string,
        options: RequestInit = {},
        cacheKey?: string,
        _cacheDuration?: number
    ): Promise<Response> {
        // Vérifier le cache
        if (cacheKey) {
            const cached = this.cache.get(cacheKey);
            if (cached !== null && cached !== undefined) {
                return new Response(JSON.stringify(cached), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // Rate limiting
        if (this.rateLimiter) {
            await this.rateLimiter.waitIfNeeded();
        }

        // Requête avec retry et backoff exponentiel pour 5xx
        let lastResponse: Response | null = null;
        for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'User-Agent': this.config.userAgent || 'Videomi/1.0',
                    ...(options.headers as Record<string, string>)
                }
            });
            lastResponse = response;

            if (response.status >= 500 && response.status < 600 && attempt < RETRY_MAX_ATTEMPTS) {
                const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            if (response.ok && cacheKey) {
                const data = await response.clone().json();
                this.cache.set(cacheKey, data);
            }
            return response;
        }

        return lastResponse!;
    }

    /**
     * Recherche des correspondances pour un média
     */
    abstract search(query: string, options?: any): Promise<MediaSearchResult>;

    /**
     * Récupère les détails complets d'un média par son ID source
     */
    abstract getDetails(sourceId: string, options?: any): Promise<MediaMatch | null>;

    /**
     * Nettoie un titre pour la recherche
     */
    protected cleanTitle(title: string): string {
        return title
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Génère des variantes de titre pour améliorer les recherches
     */
    protected generateTitleVariants(title: string): string[] {
        const variants: string[] = [title];
        const cleaned = this.cleanTitle(title);
        
        // Variante sans chiffres
        const noNumbers = cleaned.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
        if (noNumbers !== cleaned && noNumbers.length > 0) {
            variants.push(noNumbers);
        }
        
        // Variante sans année
        const noYear = cleaned.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
        if (noYear !== cleaned && noYear.length > 0) {
            variants.push(noYear);
        }
        
        // Variante sans "Part 1", "Part 2", etc.
        const noPartNumber = cleaned.replace(/\s+Part\s+\d+/i, ' Part').replace(/\s+/g, ' ').trim();
        if (noPartNumber !== cleaned && noPartNumber.length > 0) {
            variants.push(noPartNumber);
        }
        
        // Variante sans "Live"
        const noLive = cleaned.replace(/\s+Live\b/i, '').replace(/\s+/g, ' ').trim();
        if (noLive !== cleaned && noLive.length > 0) {
            variants.push(noLive);
        }
        
        // Variante sans guillemets
        const noQuotes = cleaned.replace(/["'`「」『』【】《》〈〉『』＂]/g, '').replace(/\s+/g, ' ').trim();
        if (noQuotes !== cleaned && noQuotes.length > 0) {
            variants.push(noQuotes);
        }
        
        return Array.from(new Set(variants)).filter(v => v.length >= 2);
    }
}

/**
 * Gestionnaire de fallback entre plusieurs API
 */
export class MetadataApiFallback {
    private apis: BaseMetadataApi[];

    constructor(apis: BaseMetadataApi[]) {
        this.apis = apis.filter(api => api.isAvailable());
    }

    /**
     * Recherche dans toutes les API disponibles jusqu'à trouver un résultat
     */
    async search(query: string, options?: any): Promise<MediaSearchResult | null> {
        for (const api of this.apis) {
            try {
                const result = await api.search(query, options);
                if (result.matches.length > 0) {
                    return result;
                }
            } catch (error) {
                console.warn(`[API Fallback] Erreur avec ${api.source}:`, error);
                continue; // Essayer l'API suivante
            }
        }
        return null;
    }

    /**
     * Récupère les détails depuis la première API disponible
     */
    async getDetails(sourceId: string, source: MetadataSource, options?: any): Promise<MediaMatch | null> {
        const api = this.apis.find(a => a.source === source);
        if (!api) return null;

        try {
            return await api.getDetails(sourceId, options);
        } catch (error) {
            console.warn(`[API Fallback] Erreur récupération détails depuis ${source}:`, error);
            return null;
        }
    }
}
