/**
 * Barre de chargement fine en haut de l'écran pendant la navigation (loader/action).
 * Indique visuellement que la page est en cours de chargement sans bloquer l'UI.
 */
import React, { useEffect, useState } from 'react';
import { darkTheme } from '~/utils/ui/theme';

interface AppLayoutLoadingBarProps {
    visible: boolean;
}

export function AppLayoutLoadingBar({ visible }: AppLayoutLoadingBarProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || !visible) return null;

    return (
        <div
            role="progressbar"
            aria-hidden="true"
            aria-label="Chargement de la page"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                backgroundColor: darkTheme.background.tertiary,
                zIndex: 10000,
                overflow: 'hidden',
            }}
        >
            <div
                className="app-loading-bar-indicator"
                style={{
                    height: '100%',
                    width: '30%',
                    backgroundColor: darkTheme.accent.blue,
                    animation: 'appLoadingBar 1.2s ease-in-out infinite',
                }}
            />
            <style>{`
                @keyframes appLoadingBar {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(200%); }
                    100% { transform: translateX(-100%); }
                }
                @media (prefers-reduced-motion: reduce) {
                    .app-loading-bar-indicator {
                        animation: none;
                        width: 100%;
                        transform: translateX(-70%);
                    }
                }
            `}</style>
        </div>
    );
}
