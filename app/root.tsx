// INFO : app/root.tsx
import React, { useEffect, useState } from 'react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { LinksFunction } from 'react-router';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { DragDropProvider } from './contexts/DragDropContext';
import { MiniPlayer } from './components/ui/MiniPlayer';
import { DropZoneOverlay } from './components/ui/DropZoneOverlay';
import { invalidateAllFileCache } from './hooks/useFiles';
import { useFilesPreloader } from './hooks/useFilesPreloader';
import { detectLanguage } from './utils/i18n';

export const links: LinksFunction = () => [
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
];

// Charger le polyfill Buffer uniquement côté client (nécessaire pour music-metadata-browser)
// Ne pas charger en SSR pour éviter les erreurs 500
if (typeof window !== 'undefined') {
    import('./utils/file/bufferPolyfill').catch(() => {
        // Ignorer silencieusement si le polyfill ne peut pas être chargé
    });
    
    // Enregistrer le Service Worker pour le cache des images
    import('./utils/cache/serviceWorker').then(({ initServiceWorker }) => {
        initServiceWorker();
    }).catch(() => {
        // Ignorer si le Service Worker ne peut pas être chargé
    });
    
    // Au chargement de l'app, vérifier si c'est le premier chargement
    // et invalider les caches si nécessaire
    const firstLoadKey = 'videomi_first_load_done';
    if (!localStorage.getItem(firstLoadKey)) {
        invalidateAllFileCache();
    }
}

export default function App() {
    // Toujours utiliser 'fr' comme langue initiale pour SSR
    // La langue sera mise à jour côté client par LanguageProvider
    return (
        <html lang="fr">
        <head>
            <meta charSet="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <Meta />
            <Links />
            <style dangerouslySetInnerHTML={{ __html: `
                /* Styles d'accessibilité globaux */
                
                /* Focus visible pour la navigation clavier */
                :focus-visible {
                    outline: 2px solid #3b82f6 !important;
                    outline-offset: 2px !important;
                }
                
                /* Reset outline par défaut mais garder focus-visible */
                :focus:not(:focus-visible) {
                    outline: none;
                }
                
                /* Focus spécifique pour les boutons */
                button:focus-visible,
                [role="button"]:focus-visible {
                    outline: 2px solid #3b82f6 !important;
                    outline-offset: 2px !important;
                    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3);
                }
                
                /* Focus pour les inputs */
                input:focus-visible,
                textarea:focus-visible,
                select:focus-visible {
                    outline: 2px solid #3b82f6 !important;
                    outline-offset: 0 !important;
                    border-color: #3b82f6 !important;
                }
                
                /* Focus pour les liens */
                a:focus-visible {
                    outline: 2px solid #3b82f6 !important;
                    outline-offset: 2px !important;
                }
                
                /* Respect de prefers-reduced-motion */
                @media (prefers-reduced-motion: reduce) {
                    *,
                    *::before,
                    *::after {
                        animation-duration: 0.01ms !important;
                        animation-iteration-count: 1 !important;
                        transition-duration: 0.01ms !important;
                        scroll-behavior: auto !important;
                    }
                }
                
                /* Skip link pour accessibilité */
                .skip-link {
                    position: absolute;
                    top: -40px;
                    left: 0;
                    background: #3b82f6;
                    color: white;
                    padding: 8px 16px;
                    z-index: 100000;
                    transition: top 0.2s;
                }
                
                .skip-link:focus {
                    top: 0;
                }
            ` }} />
        </head>
        <body style={{ backgroundColor: '#121212', color: '#e0e0e0', margin: 0, padding: 0 }}>
            <LanguageProvider>
                <AuthProvider>
                    <PlayerProvider>
                        <DragDropProvider>
                            <Outlet />
                            <MiniPlayer />
                            <DropZoneOverlay />
                        </DragDropProvider>
                    </PlayerProvider>
                </AuthProvider>
            </LanguageProvider>
        <ScrollRestoration />
        <Scripts />
        </body>
        </html>
    );
}