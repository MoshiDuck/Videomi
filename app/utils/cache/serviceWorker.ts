// INFO : app/utils/cache/serviceWorker.ts
// Utilitaires pour gérer le Service Worker
// ISOLATION STRICTE PAR UTILISATEUR

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
 * Définit l'utilisateur courant dans le Service Worker
 * CRITIQUE : Doit être appelé au login et au chargement si utilisateur connecté
 * Sans cet appel, le SW ne met PAS en cache (isolation stricte)
 */
export async function setServiceWorkerUserId(userId: string | null): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        
        if (registration.active) {
            registration.active.postMessage({
                type: 'SET_USER_ID',
                userId: userId,
            });
            console.log(`[SW] UserId envoyé au Service Worker: ${userId}`);
        }
    } catch (error) {
        console.error('[SW] Erreur envoi userId:', error);
    }
}

/**
 * Vide le cache du Service Worker.
 * @param userId - L'utilisateur dont vider le cache (ou null pour courant)
 * @param clearAll - Si true, vide TOUS les caches videomi (logout)
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
 * Récupère le statut du Service Worker (debug)
 */
export async function getServiceWorkerStatus(): Promise<{ currentUserId: string | null; cacheEnabled: boolean } | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        
        if (registration.active) {
            return new Promise((resolve) => {
                const channel = new MessageChannel();
                channel.port1.onmessage = (event) => {
                    resolve(event.data);
                };
                registration.active!.postMessage(
                    { type: 'GET_STATUS' },
                    [channel.port2]
                );
                // Timeout après 1s
                setTimeout(() => resolve(null), 1000);
            });
        }
        return null;
    } catch (error) {
        console.error('[SW] Erreur récupération statut:', error);
        return null;
    }
}

/**
 * Enregistre le Service Worker et configure l'utilisateur
 * À appeler dans root.tsx avec le userId si connecté
 */
export async function initServiceWorker(userId?: string | null): Promise<void> {
    if (typeof window !== 'undefined') {
        await registerServiceWorker();
        // Si userId fourni, l'envoyer immédiatement au SW
        if (userId) {
            // Petit délai pour s'assurer que le SW est prêt
            setTimeout(() => {
                setServiceWorkerUserId(userId);
            }, 100);
        }
    }
}
