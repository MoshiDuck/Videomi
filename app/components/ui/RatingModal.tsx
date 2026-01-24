// INFO : app/components/ui/RatingModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { darkTheme } from '~/utils/ui/theme';
import { LoadingSpinner } from '~/components/ui/LoadingSpinner';

interface RatingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRate: (rating: number) => void | Promise<void>;
    title: string;
    thumbnail?: string | null;
}

export function RatingModal({ isOpen, onClose, onRate, title, thumbnail }: RatingModalProps) {
    const [hoveredRating, setHoveredRating] = useState<number | null>(null);
    const [selectedRating, setSelectedRating] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (isOpen) {
            setSelectedRating(null);
            setHoveredRating(null);
            setIsSubmitting(false);
        }
    }, [isOpen]);

    // Gérer la fermeture avec Escape
    useEffect(() => {
        if (!isOpen) return;
        
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isSubmitting) {
                onClose();
            }
        };
        
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, isSubmitting, onClose]);

    // Focus sur le bouton fermer à l'ouverture
    useEffect(() => {
        if (isOpen && closeButtonRef.current) {
            closeButtonRef.current.focus();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleStarClick = async (rating: number) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        setSelectedRating(rating);
        try {
            await onRate(rating);
        } finally {
            setIsSubmitting(false);
        }
    };

    const displayRating = hoveredRating || selectedRating || 0;

    const dialogId = 'rating-dialog';
    const titleId = `${dialogId}-title`;

    return (
        <div 
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                backdropFilter: 'blur(8px)'
            }}
            onClick={onClose}
            aria-hidden="true"
        >
            <div 
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: darkTheme.background.secondary,
                    borderRadius: '12px',
                    padding: '40px',
                    maxWidth: '500px',
                    width: '90%',
                    textAlign: 'center',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
                }}
            >
                {thumbnail && (
                    <img
                        src={thumbnail}
                        alt={title}
                        style={{
                            width: '120px',
                            height: '180px',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            marginBottom: '24px',
                            margin: '0 auto 24px'
                        }}
                    />
                )}
                
                <h2 
                    id={titleId}
                    style={{
                        fontSize: '24px',
                        fontWeight: '700',
                        color: darkTheme.text.primary,
                        marginBottom: '12px'
                    }}
                >
                    Que pensez-vous de "{title}" ?
                </h2>
                
                <p style={{
                    fontSize: '16px',
                    color: darkTheme.text.secondary,
                    marginBottom: '32px'
                }}>
                    Donnez une note sur 5 étoiles
                </p>
                
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '32px',
                    alignItems: 'center',
                    minHeight: '60px'
                }}>
                    {isSubmitting ? (
                        <LoadingSpinner size="medium" message="Envoi de la note..." />
                    ) : (
                        [1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                onClick={() => handleStarClick(star)}
                                onMouseEnter={() => setHoveredRating(star)}
                                onMouseLeave={() => setHoveredRating(null)}
                                disabled={isSubmitting}
                                aria-label={`Noter ${star} étoile${star > 1 ? 's' : ''}`}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                    padding: '4px',
                                    fontSize: '48px',
                                    lineHeight: '1',
                                    color: star <= displayRating ? '#FFD700' : '#888',
                                    transition: 'transform 0.2s, color 0.2s',
                                    transform: hoveredRating === star ? 'scale(1.2)' : 'scale(1)',
                                    opacity: isSubmitting ? 0.5 : 1
                                }}
                            >
                                ★
                            </button>
                        ))
                    )}
                </div>
                
                {selectedRating && (
                    <p style={{
                        fontSize: '18px',
                        color: darkTheme.text.primary,
                        fontWeight: '600',
                        marginBottom: '24px'
                    }}>
                        {selectedRating === 5 && 'Excellent !'}
                        {selectedRating === 4 && 'Très bien !'}
                        {selectedRating === 3 && 'Bien !'}
                        {selectedRating === 2 && 'Pas mal'}
                        {selectedRating === 1 && 'Bof'}
                    </p>
                )}
                
                <button
                    ref={closeButtonRef}
                    onClick={onClose}
                    style={{
                        padding: '12px 24px',
                        backgroundColor: darkTheme.background.secondary,
                        color: darkTheme.text.primary,
                        border: `1px solid ${darkTheme.border.primary}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkTheme.background.tertiary}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = darkTheme.background.secondary}
                >
                    {selectedRating ? 'Fermer' : 'Plus tard'}
                </button>
            </div>
        </div>
    );
}
