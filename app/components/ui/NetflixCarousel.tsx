// INFO : app/components/ui/NetflixCarousel.tsx
// Composant Carrousel style Netflix réutilisable

import React, { useState, useRef } from 'react';

const netflixTheme = {
    text: {
        primary: '#ffffff',
        secondary: '#d2d2d2'
    },
    bg: {
        primary: '#141414'
    }
};

interface NetflixCarouselProps {
    title: string;
    icon?: string;
    children: React.ReactNode;
}

export const NetflixCarousel = ({ title, icon, children }: NetflixCarouselProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(true);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const scrollAmount = scrollRef.current.clientWidth * 0.8;
            scrollRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    const handleScroll = () => {
        if (scrollRef.current) {
            setShowLeftArrow(scrollRef.current.scrollLeft > 0);
            setShowRightArrow(
                scrollRef.current.scrollLeft < scrollRef.current.scrollWidth - scrollRef.current.clientWidth - 10
            );
        }
    };

    return (
        <div style={{ marginBottom: '50px', position: 'relative' }}>
            <h2 style={{
                fontSize: 'clamp(18px, 2vw, 24px)',
                fontWeight: '800',
                color: netflixTheme.text.primary,
                marginBottom: '20px',
                marginLeft: 'clamp(40px, 4vw, 60px)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                letterSpacing: '-0.02em',
                textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
            }}>
                {icon && <span style={{ fontSize: '24px' }}>{icon}</span>} {title}
            </h2>
            
            <div style={{ position: 'relative', overflow: 'visible' }}>
                {/* Flèche gauche moderne */}
                {showLeftArrow && (
                    <button
                        onClick={() => scroll('left')}
                        aria-label="Défiler vers la gauche"
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: 'clamp(50px, 5vw, 80px)',
                            background: 'linear-gradient(to right, rgba(20,20,20,0.95) 0%, rgba(20,20,20,0.7) 50%, transparent 100%)',
                            border: 'none',
                            cursor: 'pointer',
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: 'clamp(32px, 4vw, 48px)',
                            opacity: 0,
                            transition: 'opacity 0.3s ease',
                            backdropFilter: 'blur(2px)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                        className="carousel-arrow"
                    >
                        ‹
                    </button>
                )}
                
                {/* Conteneur scrollable moderne */}
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    onMouseEnter={() => {
                        const arrows = document.querySelectorAll('.carousel-arrow');
                        arrows.forEach(arrow => (arrow as HTMLElement).style.opacity = '0.8');
                    }}
                    onMouseLeave={() => {
                        const arrows = document.querySelectorAll('.carousel-arrow');
                        arrows.forEach(arrow => (arrow as HTMLElement).style.opacity = '0');
                    }}
                    style={{
                        display: 'flex',
                        gap: '10px',
                        overflowX: 'auto',
                        overflowY: 'visible',
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        paddingLeft: 'clamp(40px, 4vw, 60px)',
                        paddingRight: 'clamp(40px, 4vw, 60px)',
                        paddingTop: '60px',
                        paddingBottom: '60px',
                        scrollBehavior: 'smooth'
                    }}
                >
                    {children}
                </div>
                
                {/* Flèche droite moderne */}
                {showRightArrow && (
                    <button
                        onClick={() => scroll('right')}
                        aria-label="Défiler vers la droite"
                        style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: 'clamp(50px, 5vw, 80px)',
                            background: 'linear-gradient(to left, rgba(20,20,20,0.95) 0%, rgba(20,20,20,0.7) 50%, transparent 100%)',
                            border: 'none',
                            cursor: 'pointer',
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: 'clamp(32px, 4vw, 48px)',
                            opacity: 0,
                            transition: 'opacity 0.3s ease',
                            backdropFilter: 'blur(2px)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                        className="carousel-arrow"
                    >
                        ›
                    </button>
                )}
            </div>
        </div>
    );
};
