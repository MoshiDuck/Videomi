// INFO : app/hooks/useFilesPreloader.ts
// Hook pour précharger les fichiers de toutes les catégories en arrière-plan

import { useEffect, useCallback } from 'react';
import type { FileCategory } from '~/utils/file/fileClassifier';

const ALL_CATEGORIES: FileCategory[] = ['videos', 'musics', 'images', 'documents', 'archives', 'executables', 'others'];

interface UseFilesPreloaderOptions {
    userId: string | null;
    enabled?: boolean;
    preloadOnHover?: boolean; // Précharger quand on survole un bouton de catégorie
}

/**
 * Hook pour précharger les fichiers de toutes les catégories en arrière-plan
 * Cela permet une navigation instantanée entre les catégories
 */
export function useFilesPreloader({ userId, enabled = true, preloadOnHover = true }: UseFilesPreloaderOptions) {
    // Précharger toutes les catégories une fois que l'utilisateur est chargé
    useEffect(() => {
        if (!userId || !enabled) return;

        // Précharger toutes les catégories en arrière-plan avec un léger délai
        // pour ne pas bloquer le chargement initial
        const timeoutId = setTimeout(() => {
            ALL_CATEGORIES.forEach(category => {
                // Créer une instance silencieuse du hook pour chaque catégorie
                // Le cache sera rempli automatiquement
                fetch(`https://videomi.uk/api/upload/user/${userId}?category=${category}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('videomi_token') || ''}`
                    }
                }).catch(() => {
                    // Ignorer silencieusement les erreurs de préchargement
                });
            });
        }, 1000); // Délai de 1 seconde après le chargement de l'utilisateur

        return () => {
            clearTimeout(timeoutId);
        };
    }, [userId, enabled]);

    // Fonction pour précharger une catégorie spécifique (utile pour le hover)
    const preloadCategory = useCallback((category: FileCategory) => {
        if (!userId || !enabled) return;

        // Vérifier si la catégorie est déjà en cache (mémoire ou localStorage)
        const cacheKey = `videomi_files_${userId}_${category}`;
        const memoryCacheKey = `files_${userId}_${category}`;
        
        // Vérifier le cache mémoire global
        const fileCache = (window as any).__fileCache;
        if (fileCache && fileCache.has(memoryCacheKey)) {
            const cached = fileCache.get(memoryCacheKey);
            if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
                return; // Déjà en cache récent
            }
        }
        
        // Vérifier le cache localStorage
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                // Si le cache est récent (< 5 min), pas besoin de précharger
                if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
                    return; // Déjà en cache récent
                }
            } catch {
                // Cache corrompu, continuer le préchargement
            }
        }

        // Précharger la catégorie en arrière-plan
        fetch(`https://videomi.uk/api/upload/user/${userId}?category=${category}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('videomi_token') || ''}`
            }
        } as RequestInit).then(response => {
            if (response.ok) {
                return response.json();
            }
        }).then((data: unknown) => {
            const d = data as { files?: unknown[] } | undefined;
            if (d?.files) {
                // Sauvegarder dans le cache persistant et mémoire
                try {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        data: d.files,
                        timestamp: Date.now(),
                        version: '1.0'
                    }));
                    // Mettre aussi dans le cache mémoire pour accès instantané
                    if (fileCache) {
                        fileCache.set(memoryCacheKey, {
                            data: d.files,
                            timestamp: Date.now()
                        });
                    }
                } catch (error) {
                    // Ignorer les erreurs de localStorage (quota dépassé, etc.)
                }
            }
        }).catch(() => {
            // Ignorer silencieusement les erreurs
        });
    }, [userId, enabled]);

    return {
        preloadCategory
    };
}
