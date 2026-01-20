// INFO : app/components/ui/NetflixCarousel.tsx
// Composant Carrousel style Netflix réutilisable

import React, { useState, useRef } from 'react';

const netflixTheme = {
    text: {
        primary: '#ffffff'
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
        <div style={{ marginBottom: '40px', position: 'relative' }}>
            <h2 style={{
                fontSize: '20px',
                fontWeight: '700',
                color: netflixTheme.text.primary,
                marginBottom: '16px',
                marginLeft: '60px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }}>
                {icon && <span>{icon}</span>} {title}
            </h2>
            
            <div style={{ position: 'relative', overflow: 'visible' }}>
                {/* Flèche gauche */}
                {showLeftArrow && (
                    <button
                        onClick={() => scroll('left')}
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: '60px',
                            background: 'linear-gradient(to right, rgba(20,20,20,0.9), transparent)',
                            border: 'none',
                            cursor: 'pointer',
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '40px',
                            opacity: 0.7,
                            transition: 'opacity 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                    >
                        ‹
                    </button>
                )}
                
                {/* Conteneur scrollable */}
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    style={{
                        display: 'flex',
                        gap: '8px',
                        overflowX: 'auto',
                        overflowY: 'visible',
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        paddingLeft: '60px',
                        paddingRight: '60px',
                        paddingTop: '60px',
                        paddingBottom: '60px'
                    }}
                >
                    {children}
                </div>
                
                {/* Flèche droite */}
                {showRightArrow && (
                    <button
                        onClick={() => scroll('right')}
                        style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: '60px',
                            background: 'linear-gradient(to left, rgba(20,20,20,0.9), transparent)',
                            border: 'none',
                            cursor: 'pointer',
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '40px',
                            opacity: 0.7,
                            transition: 'opacity 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                    >
                        ›
                    </button>
                )}
            </div>
        </div>
    );
};
