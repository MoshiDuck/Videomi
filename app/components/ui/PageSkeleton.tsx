/**
 * Skeleton générique pour états de chargement de page.
 * Barres animées (shimmer) pour une meilleure perception de vitesse.
 * Respecte prefers-reduced-motion.
 */
import React from 'react';
import { darkTheme } from '~/utils/ui/theme';

interface PageSkeletonProps {
    /** Nombre de lignes (barres) à afficher */
    lines?: number;
    /** Hauteur min du conteneur (ex: "60vh") */
    minHeight?: string;
    /** Variante : "bars" (lignes) | "cards" (grille de cartes) */
    variant?: 'bars' | 'cards';
}

function SkeletonBar({ width }: { width: string }) {
    return (
        <div
            className="page-skeleton-bar"
            style={{
                height: 16,
                borderRadius: darkTheme.radius.small,
                backgroundColor: darkTheme.background.tertiary,
                width,
                maxWidth: '100%',
            }}
        />
    );
}

export function PageSkeleton({
    lines = 5,
    minHeight = '40vh',
    variant = 'bars',
}: PageSkeletonProps) {
    return (
        <div
            style={{
                minHeight,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                padding: 24,
            }}
            aria-hidden="true"
        >
            <style>{`
                .page-skeleton-bar,
                .page-skeleton-card {
                    animation: page-skeleton-shimmer 1.5s ease-in-out infinite;
                }
                @keyframes page-skeleton-shimmer {
                    0%, 100% { opacity: 0.6; }
                    50% { opacity: 1; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .page-skeleton-bar,
                    .page-skeleton-card {
                        animation: none;
                        opacity: 0.7;
                    }
                }
            `}</style>
            {variant === 'bars' &&
                Array.from({ length: lines }, (_, i) => (
                    <SkeletonBar
                        key={i}
                        width={i === 0 ? '80%' : i === 1 ? '60%' : `${90 - i * 15}%`}
                    />
                ))}
            {variant === 'cards' && (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                        gap: 16,
                    }}
                >
                    {Array.from({ length: 8 }, (_, i) => (
                        <div
                            key={i}
                            className="page-skeleton-card"
                            style={{
                                aspectRatio: '2/3',
                                borderRadius: darkTheme.radius.medium,
                                backgroundColor: darkTheme.background.tertiary,
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
