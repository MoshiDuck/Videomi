// INFO : app/root.tsx
import React, { useEffect, useState } from 'react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { LinksFunction } from 'react-router';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { MiniPlayer } from './components/ui/MiniPlayer';
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
        </head>
        <body style={{ backgroundColor: '#121212', color: '#e0e0e0', margin: 0, padding: 0 }}>
            <LanguageProvider>
                <AuthProvider>
                    <PlayerProvider>
                        <Outlet />
                        <MiniPlayer />
                    </PlayerProvider>
                </AuthProvider>
            </LanguageProvider>
        <ScrollRestoration />
        <Scripts />
        </body>
        </html>
    );
}