/**
 * Enveloppe les changements de page. Le fade est géré par la View Transitions API (root.tsx).
 * Si le navigateur ne supporte pas les view transitions, un court fade est appliqué.
 * Respecte prefers-reduced-motion pour l'accessibilité.
 */
import React from 'react';

interface PageTransitionProps {
    children: React.ReactNode;
    /** Durée en ms du fade de secours (sans View Transitions API) */
    duration?: number;
}

export function PageTransition({ children, duration = 120 }: PageTransitionProps) {
    return (
        <div className="page-transition-wrapper" style={{ ['--page-fallback-duration' as string]: `${duration}ms` }}>
            <style>{`
                .page-transition-wrapper {
                    /* Pas d'animation quand View Transitions API gère le cross-fade (évite double fade) */
                }
                @supports not (view-transition-name: none) {
                    .page-transition-wrapper {
                        animation: pageTransitionFallback var(--page-fallback-duration, 120ms) ease-out;
                    }
                }
                @keyframes pageTransitionFallback {
                    from { opacity: 0.7; }
                    to { opacity: 1; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .page-transition-wrapper {
                        animation: none !important;
                    }
                }
            `}</style>
            {children}
        </div>
    );
}
