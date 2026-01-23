// INFO : app/utils/cache/serviceWorker.ts
// Utilitaires pour gérer le Service Worker

/**
 * Enregistre le Service Worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
        });

        console.log('[SW] Service Worker enregistré:', registration.scope);

        // Vérifier les mises à jour
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[SW] Nouvelle version disponible');
                        // Optionnel : notifier l'utilisateur
                    }
                });
            }
        });

        return registration;
    } catch (error) {
        console.error('[SW] Erreur enregistrement:', error);
        return null;
    }
}

/**
 * Vide le cache du Service Worker.
 * Au logout : clearAll=true pour vider tous les caches (fetch utilise public, isolation).
 */
export async function clearServiceWorkerCache(userId?: string | null, clearAll = true): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        
        if (registration.active) {
            registration.active.postMessage({
                type: 'CLEAR_CACHE',
                userId: userId ?? null,
                clearAll: clearAll,
            });
        }
    } catch (error) {
        console.error('[SW] Erreur vidage cache:', error);
    }
}

/**
 * Invalide le cache pour un pattern donné
 */
export async function invalidateServiceWorkerCache(pattern: string, userId?: string | null): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        
        if (registration.active) {
            registration.active.postMessage({
                type: 'INVALIDATE_PATTERN',
                pattern,
                userId: userId || null,
            });
        }
    } catch (error) {
        console.error('[SW] Erreur invalidation cache:', error);
    }
}

/**
 * Enregistre le Service Worker (à appeler dans root.tsx)
 */
export function initServiceWorker() {
    if (typeof window !== 'undefined') {
        registerServiceWorker().catch(console.error);
    }
}
