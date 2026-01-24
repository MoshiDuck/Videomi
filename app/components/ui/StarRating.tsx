// INFO : app/components/ui/StarRating.tsx
import React, { useState, useEffect } from 'react';
import { darkTheme } from '~/utils/ui/theme';

interface StarRatingProps {
    userRating: number | null;
    averageRating: number | null;
    onRate: (rating: number) => void;
    disabled?: boolean;
}

export function StarRating({ userRating, averageRating, onRate, disabled = false }: StarRatingProps) {
    const [hoveredRating, setHoveredRating] = useState<number | null>(null);

    const displayRating = hoveredRating || userRating || 0;
    const showAverage = !userRating && averageRating !== null;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        }}>
            {/* Étoiles interactives */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
            }}>
                {[1, 2, 3, 4, 5].map((star) => {
                    let starColor = '#888'; // Gris par défaut (WCAG conforme)
                    
                    if (star <= displayRating) {
                        starColor = '#FFD700'; // Or si sélectionné/hover
                    } else if (showAverage && star <= Math.round(averageRating!)) {
                        starColor = '#a8a8a8'; // Gris clair pour la moyenne (WCAG conforme)
                    }
                    
                    return (
                        <button
                            key={star}
                            onClick={() => !disabled && onRate(star)}
                            onMouseEnter={() => !disabled && setHoveredRating(star)}
                            onMouseLeave={() => !disabled && setHoveredRating(null)}
                            disabled={disabled}
                            aria-label={`Noter ${star} étoile${star > 1 ? 's' : ''}`}
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: disabled ? 'default' : 'pointer',
                                padding: '2px',
                                fontSize: '32px',
                                lineHeight: '1',
                                color: starColor,
                                transition: 'transform 0.2s, color 0.2s',
                                transform: hoveredRating === star ? 'scale(1.15)' : 'scale(1)',
                                opacity: disabled ? 0.5 : 1
                            }}
                        >
                            ★
                        </button>
                    );
                })}
            </div>
            
            {/* Texte informatif */}
            <div style={{
                fontSize: '14px',
                color: darkTheme.text.secondary
            }}>
                {userRating ? (
                    <span>Votre note : {userRating}/5</span>
                ) : showAverage ? (
                    <span>Note moyenne : {averageRating!.toFixed(1)}/5</span>
                ) : (
                    <span>Cliquez pour noter</span>
                )}
            </div>
        </div>
    );
}
