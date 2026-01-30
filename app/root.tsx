// INFO : app/root.tsx
import React from 'react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from 'react-router';
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
                
                /* View Transitions API : ancienne page disparaît d'abord, puis la nouvelle apparaît (évite de voir les deux en même temps) */
                @supports (view-transition-name: none) {
                    ::view-transition-old(root) {
                        animation: view-transition-fade-out 0.08s ease-out forwards;
                    }
                    ::view-transition-new(root) {
                        animation: view-transition-fade-in 0.2s ease-out 0.06s forwards;
                    }
                    ::view-transition-old(main-content) {
                        animation: view-transition-fade-out 0.08s ease-out forwards;
                    }
                    ::view-transition-new(main-content) {
                        animation: view-transition-fade-in 0.2s ease-out 0.06s forwards;
                    }
                    @keyframes view-transition-fade-out {
                        from { opacity: 1; }
                        to { opacity: 0; }
                    }
                    @keyframes view-transition-fade-in {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                }
                @media (prefers-reduced-motion: reduce) {
                    ::view-transition-old(root),
                    ::view-transition-new(root),
                    ::view-transition-old(main-content),
                    ::view-transition-new(main-content) {
                        animation: none !important;
                    }
                }
                .app-main-view-transition {
                    view-transition-name: main-content;
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

/** ErrorBoundary racine : erreurs non gérées par les routes enfants. */
export function ErrorBoundary() {
    const error = useRouteError() as Error | { status?: number; statusText?: string } | undefined;
    const message =
        error instanceof Error
            ? error.message
            : error && typeof error === 'object' && 'statusText' in error
              ? (error.statusText as string) || `Erreur ${error.status ?? 500}`
              : 'Une erreur inattendue est survenue';

    return (
        <html lang="fr">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Erreur | Videomi</title>
                <Links />
            </head>
            <body style={{ backgroundColor: '#121212', color: '#e0e0e0', margin: 0, padding: 40, fontFamily: 'system-ui' }}>
                <h1 style={{ marginBottom: 16 }}>Erreur</h1>
                <p style={{ color: '#b0b0b0', marginBottom: 24 }}>{message}</p>
                <a href="/home" style={{ color: '#4285f4', textDecoration: 'underline' }}>
                    Retour à l&apos;accueil
                </a>
                <Scripts />
            </body>
        </html>
    );
}