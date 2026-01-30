/**
 * Skeleton ciblé pour pages type Netflix (films, séries) : structure fidèle à la page réelle.
 * Hero 80vh, barres catégories + sous-catégories, 5 lignes de carousels.
 */
import React from 'react';

export function MediaPageSkeleton() {
    return (
        <div
            className="media-page-skeleton"
            style={{
                padding: '0 0 60px 0',
                maxWidth: 1400,
                margin: '0 auto',
                minHeight: '60vh',
            }}
            aria-hidden="true"
        >
            <style>{`
                .media-page-skeleton .media-skeleton-hero,
                .media-page-skeleton .media-skeleton-bar,
                .media-page-skeleton .media-skeleton-card {
                    animation: media-skeleton-shimmer 1.5s ease-in-out infinite;
                }
                @keyframes media-skeleton-shimmer {
                    0%, 100% { opacity: 0.5; }
                    50% { opacity: 1; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .media-page-skeleton .media-skeleton-hero,
                    .media-page-skeleton .media-skeleton-bar,
                    .media-page-skeleton .media-skeleton-card {
                        animation: none;
                        opacity: 0.7;
                    }
                }
            `}</style>
            {/* Barres catégories + sous-catégories (comme VideoSubCategoryBar) */}
            <div style={{ padding: '20px 60px' }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div
                            key={i}
                            className="media-skeleton-bar"
                            style={{
                                width: i === 1 ? 70 : 90,
                                height: 28,
                                borderRadius: 6,
                                backgroundColor: '#2a2a2a',
                            }}
                        />
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {[1, 2].map((i) => (
                        <div
                            key={i}
                            className="media-skeleton-bar"
                            style={{
                                width: 60,
                                height: 24,
                                borderRadius: 4,
                                backgroundColor: '#252525',
                            }}
                        />
                    ))}
                </div>
            </div>
            {/* Hero 80vh (comme la page films) */}
            <div
                className="media-skeleton-hero"
                style={{
                    height: '80vh',
                    minHeight: 400,
                    maxHeight: 900,
                    marginBottom: 60,
                    borderRadius: 0,
                    backgroundColor: '#1a1a1a',
                }}
            />
            {/* 5 lignes de carousels (genres / sections) */}
            {[1, 2, 3, 4, 5].map((row) => (
                <div key={row} style={{ marginBottom: 40 }}>
                    <div
                        className="media-skeleton-bar"
                        style={{
                            width: 140,
                            height: 22,
                            borderRadius: 4,
                            backgroundColor: '#2a2a2a',
                            marginBottom: 16,
                            marginLeft: 60,
                        }}
                    />
                    <div
                        style={{
                            display: 'flex',
                            gap: 8,
                            overflow: 'hidden',
                            paddingLeft: 60,
                        }}
                    >
                        {Array.from({ length: 8 }, (_, i) => (
                            <div
                                key={i}
                                className="media-skeleton-card"
                                style={{
                                    width: 220,
                                    minWidth: 220,
                                    aspectRatio: '2/3',
                                    borderRadius: 8,
                                    backgroundColor: '#252525',
                                }}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
