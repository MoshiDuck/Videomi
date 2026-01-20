// INFO : app/routes/films.tsx
// Page Films style Netflix

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '~/hooks/useAuth';
import { useConfig } from '~/hooks/useConfig';
import { Navigation } from '~/components/navigation/Navigation';
import { AuthGuard } from '~/components/auth/AuthGuard';
import type { FileCategory } from '~/utils/file/fileClassifier';
import { CategoryBar } from '~/components/ui/categoryBar';
import { VideoSubCategoryBar } from '~/components/ui/VideoSubCategoryBar';
import { NetflixCarousel } from '~/components/ui/NetflixCarousel';
import { getCategoryRoute } from '~/utils/routes';
import { formatDuration } from '~/utils/format';
import { useLanguage } from '~/contexts/LanguageContext';
import { useFloating, useHover, useInteractions, FloatingPortal } from '@floating-ui/react';

interface FileItem {
    file_id: string;
    category: string;
    size: number;
    mime_type: string;
    filename: string | null;
    created_at: number;
    uploaded_at: number;
    thumbnail_r2_path: string | null;
    thumbnail_url: string | null;
    backdrop_url: string | null;
    source_id: string | null;
    source_api: string | null;
    title: string | null;
    year: number | null;
    duration: number | null;
    season: number | null;
    episode: number | null;
    genres: string | null;
    collection_id: string | null;
    collection_name: string | null;
    description: string | null;
}

interface OrganizedMovies {
    unidentified: FileItem[];
    byGenre: Array<{ genre: string; movies: FileItem[] }>;
    recentlyAdded: FileItem[];
    top10: FileItem[];
    continueWatching: Array<FileItem & { progress_percent: number; current_time: number }>;
}

// Style Netflix moderne
const netflixTheme = {
    bg: {
        primary: '#141414',
        secondary: '#1a1a1a',
        card: '#181818',
        hover: '#2a2a2a',
        gradient: 'linear-gradient(to bottom, rgba(20,20,20,0) 0%, rgba(20,20,20,0.7) 50%, rgba(20,20,20,1) 100%)',
        gradientHero: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.7) 100%)'
    },
    text: {
        primary: '#ffffff',
        secondary: '#d2d2d2',
        muted: '#808080',
        accent: '#46d369'
    },
    accent: {
        red: '#e50914',
        redHover: '#f40612',
        green: '#46d369'
    },
    shadow: {
        card: '0 2px 8px rgba(0,0,0,0.3)',
        cardHover: '0 8px 24px rgba(0,0,0,0.6)',
        button: '0 2px 4px rgba(0,0,0,0.2)'
    }
};

export default function FilmsRoute() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const { config } = useConfig();
    const navigate = useNavigate();
    const [selectedCategory, setSelectedCategory] = useState<FileCategory>('videos');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [organizedMovies, setOrganizedMovies] = useState<OrganizedMovies>({
        unidentified: [],
        byGenre: [],
        recentlyAdded: [],
        top10: [],
        continueWatching: []
    });
    const [heroMovie, setHeroMovie] = useState<FileItem | null>(null);
    
    const handleCategoryChange = useCallback((category: FileCategory) => {
        setSelectedCategory(category);
        navigate(getCategoryRoute(category));
    }, [navigate]);

    const handleSubCategoryChange = useCallback((subCategory: 'films' | 'series') => {
        navigate(subCategory === 'films' ? '/films' : '/series');
    }, [navigate]);

    useEffect(() => {
        const fetchFiles = async () => {
            if (!user?.id) return;
            if (typeof window === 'undefined') return;

            setLoading(true);
            setError(null);

            try {
                const token = localStorage.getItem('videomi_token');
                
                // Récupérer les fichiers
                const response = await fetch(
                    `https://videomi.uk/api/upload/user/${user.id}?category=videos`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );

                if (!response.ok) throw new Error('Erreur lors de la récupération des fichiers');

                const data = await response.json() as { files: FileItem[] };
                let files = data.files || [];

                // Récupérer les progressions de lecture
                let progressions: Array<{ file_id: string; progress_percent: number; current_time: number }> = [];
                try {
                    const progressResponse = await fetch(
                        `https://videomi.uk/api/watch-progress/user/${user.id}`,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                    if (progressResponse.ok) {
                        const progressData = await progressResponse.json() as { progressions: Array<{ file_id: string; progress_percent: number; current_time: number }> };
                        progressions = progressData.progressions || [];
                                }
                            } catch (err) {
                    console.warn('Impossible de récupérer les progressions:', err);
                }

                organizeMovies(files, progressions);
                setLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Erreur inconnue');
                setLoading(false);
            }
        };

        fetchFiles();
    }, [user?.id, config]);

    const organizeMovies = useCallback((files: FileItem[], progressions: Array<{ file_id: string; progress_percent: number; current_time: number }> = []) => {
        const unidentified: FileItem[] = [];
        const genreMap = new Map<string, FileItem[]>();
        const allMovies: FileItem[] = [];

        for (const file of files) {
            const filenameForPattern = file.filename?.replace(/\.[^/.]+$/, '') || '';
            const isTVShow = /\bS\d{1,2}E\d{1,2}\b/i.test(filenameForPattern) ||
                           (/\bS\d{1,2}\b/i.test(filenameForPattern) && /\bE\d{1,2}\b/i.test(filenameForPattern)) ||
                           file.source_api === 'tmdb_tv';
            
            if (isTVShow) continue;

            if (!file.source_id || !file.source_api) {
                unidentified.push(file);
            } else if (file.source_api === 'tmdb' || file.source_api === 'omdb') {
                allMovies.push(file);
                
                // Grouper par genre
                let genres: string[] = [];
                try {
                    if (file.genres) {
                        if (typeof file.genres === 'string') {
                            genres = JSON.parse(file.genres);
                        } else if (Array.isArray(file.genres)) {
                            genres = file.genres;
                        }
                    }
                } catch (parseError) {
                    console.warn(`⚠️ [FILMS] Erreur parsing genres pour ${file.file_id}:`, parseError, `genres raw:`, file.genres);
                }
                
                if (genres.length > 0) {
                    for (const genre of genres) {
                        if (!genreMap.has(genre)) {
                            genreMap.set(genre, []);
                        }
                        genreMap.get(genre)!.push(file);
                    }
                } else {
                    // Si pas de genre, mettre dans "Sans genre"
                    if (!genreMap.has('Sans genre')) {
                        genreMap.set('Sans genre', []);
                    }
                    genreMap.get('Sans genre')!.push(file);
                }
            }
        }

        // Convertir en tableau et trier par nom de genre
        const byGenre = Array.from(genreMap.entries())
            .map(([genre, movies]) => ({
                genre,
                movies: movies.sort((a, b) => (b.year || 0) - (a.year || 0)) // Trier par année décroissante
            }))
            .sort((a, b) => {
                // Mettre "Sans genre" à la fin
                if (a.genre === 'Sans genre') return 1;
                if (b.genre === 'Sans genre') return -1;
                return a.genre.localeCompare(b.genre);
            });

        // Trier par date d'ajout pour les récents
        const recentlyAdded = [...allMovies].sort((a, b) => b.uploaded_at - a.uploaded_at).slice(0, 20);
        
        // Top 10 : les plus récents avec métadonnées complètes
        const top10 = [...allMovies]
            .filter(m => m.title && m.thumbnail_url)
            .sort((a, b) => {
                // Prioriser ceux avec année et genres
                const aScore = (a.year ? 10 : 0) + (a.genres ? 5 : 0) + (a.description ? 3 : 0);
                const bScore = (b.year ? 10 : 0) + (b.genres ? 5 : 0) + (b.description ? 3 : 0);
                if (bScore !== aScore) return bScore - aScore;
                return b.uploaded_at - a.uploaded_at;
            })
            .slice(0, 10);
        
        // Continuer de regarder : fichiers avec progression entre 5% et 95%
        const progressMap = new Map(progressions.map(p => [p.file_id, p]));
        const continueWatching = allMovies
            .filter(m => {
                const progress = progressMap.get(m.file_id);
                return progress && progress.progress_percent > 5 && progress.progress_percent < 95;
            })
            .map(m => ({
                ...m,
                progress_percent: progressMap.get(m.file_id)!.progress_percent,
                current_time: progressMap.get(m.file_id)!.current_time
            }))
            .sort((a, b) => {
                // Trier par dernière date de visionnage (on utilise uploaded_at comme proxy)
                return b.uploaded_at - a.uploaded_at;
            })
            .slice(0, 20);

        // Sélectionner un film aléatoire pour le hero (parmi ceux avec thumbnail)
        const moviesWithThumbnail = allMovies.filter(m => m.thumbnail_url);
        if (moviesWithThumbnail.length > 0) {
            const randomIndex = Math.floor(Math.random() * moviesWithThumbnail.length);
            setHeroMovie(moviesWithThumbnail[randomIndex]);
        }

        setOrganizedMovies({
            unidentified: unidentified.sort((a, b) => b.uploaded_at - a.uploaded_at),
            byGenre,
            recentlyAdded,
            top10,
            continueWatching
        });
    }, []);

    const getThumbnailUrl = useCallback((file: FileItem): string | null => {
        if (file.thumbnail_r2_path) {
            const match = file.thumbnail_r2_path.match(/thumbnail\.(\w+)$/);
            if (match) return `https://videomi.uk/api/files/videos/${file.file_id}/thumbnail.${match[1]}`;
        }
        return file.thumbnail_url || null;
    }, []);

    const handleVideoClick = useCallback((fileId: string, category: string) => {
        navigate(`/info/${category}/${fileId}`);
    }, [navigate]);

    const handleUnidentifiedClick = useCallback((fileId: string) => {
        navigate(`/match/videos/${fileId}`);
    }, [navigate]);


    // Carte Film Netflix
    const MovieCard = ({ file, genre, onClick }: { file: FileItem; genre?: string; onClick: () => void }) => {
        const thumbnailUrl = getThumbnailUrl(file);
        const displayName = file.title || file.filename?.replace(/\.[^/.]+$/, '') || 'Sans titre';
        const cardId = genre ? `${genre}-${file.file_id}` : file.file_id;
        const genres = file.genres ? JSON.parse(file.genres) : [];
        
        // Utiliser Floating UI pour gérer le hover et le positionnement
        const [isOpen, setIsOpen] = useState(false);
        
        const { refs, floatingStyles, context } = useFloating({
            open: isOpen,
            onOpenChange: setIsOpen,
            placement: 'top',
            middleware: []
        });
        
        // Calculer la position centrée manuellement et la mettre à jour
        const [customPosition, setCustomPosition] = useState<{ top: number; left: number } | null>(null);
        const rafRef = useRef<number | null>(null);
        
        useEffect(() => {
            if (isOpen && refs.reference.current) {
                const updatePosition = () => {
                    if (refs.reference.current) {
                        const referenceRect = refs.reference.current.getBoundingClientRect();
                        const centerX = referenceRect.left + referenceRect.width / 2;
                        const centerY = referenceRect.top + referenceRect.height / 2;
                        setCustomPosition({ top: centerY, left: centerX });
                    }
                };
                
                updatePosition();
                
                // Optimiser avec requestAnimationFrame
                const handleUpdate = () => {
                    if (rafRef.current) {
                        cancelAnimationFrame(rafRef.current);
                    }
                    rafRef.current = requestAnimationFrame(updatePosition);
                };
                
                // Mettre à jour la position lors du scroll avec throttling
                window.addEventListener('scroll', handleUpdate, { passive: true });
                window.addEventListener('resize', handleUpdate, { passive: true });
                
                return () => {
                    window.removeEventListener('scroll', handleUpdate);
                    window.removeEventListener('resize', handleUpdate);
                    if (rafRef.current) {
                        cancelAnimationFrame(rafRef.current);
                    }
                };
            } else {
                setCustomPosition(null);
            }
        }, [isOpen, refs.reference]);

        const hover = useHover(context, {
            delay: { open: 0, close: 200 },
            restMs: 25
        });

        const { getReferenceProps, getFloatingProps } = useInteractions([hover]);

        const renderCardContent = (isZoomed = false) => (
            <div style={{
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: netflixTheme.bg.card,
                boxShadow: isZoomed ? netflixTheme.shadow.cardHover : netflixTheme.shadow.card,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                width: '185px',
                border: isZoomed ? '1px solid rgba(255,255,255,0.1)' : 'none',
                position: 'relative'
            }}>
                {/* Conteneur image - TOUT est superposé ici */}
                <div style={{
                    width: '100%',
                    aspectRatio: '2/3',
                    backgroundColor: '#2a2a2a',
                    position: 'relative'
                }}>
                    {/* Image - couche 1 */}
                    {thumbnailUrl ? (
                        <img
                            src={thumbnailUrl}
                            alt={displayName}
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                objectFit: 'cover',
                                display: 'block'
                            }}
                        />
                    ) : (
                        <div style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: netflixTheme.text.muted,
                            fontSize: '48px',
                            background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)'
                        }}>
                            🎬
                        </div>
                    )}
                    
                    {/* Overlay + Boutons - couche 2 (superposés sur l'image) */}
                    {isZoomed && (
                        <>
                            {/* Overlay sombre */}
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'rgba(0,0,0,0.5)',
                                pointerEvents: 'none'
                            }} />
                            
                            {/* Boutons centrés sur l'image */}
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '12px',
                                pointerEvents: 'auto'
                            }}>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onClick();
                                    }}
                                    style={{
                                        width: '48px',
                                        height: '48px',
                                        borderRadius: '50%',
                                        backgroundColor: '#fff',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '18px',
                                        transition: 'all 0.2s ease',
                                        boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
                                        paddingLeft: '2px'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'scale(1.15)';
                                        e.currentTarget.style.backgroundColor = '#f0f0f0';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'scale(1)';
                                        e.currentTarget.style.backgroundColor = '#fff';
                                    }}
                                >
                                    ▶
                                </button>
                                <button 
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                        width: '48px',
                                        height: '48px',
                                        borderRadius: '50%',
                                        backgroundColor: 'rgba(42, 42, 42, 0.85)',
                                        border: '2px solid rgba(255,255,255,0.8)',
                                        cursor: 'pointer',
                                        color: '#fff',
                                        fontSize: '24px',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backdropFilter: 'blur(10px)',
                                        boxShadow: '0 4px 16px rgba(0,0,0,0.7)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,1)';
                                        e.currentTarget.style.transform = 'scale(1.15)';
                                        e.currentTarget.style.backgroundColor = 'rgba(42, 42, 42, 0.95)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.8)';
                                        e.currentTarget.style.transform = 'scale(1)';
                                        e.currentTarget.style.backgroundColor = 'rgba(42, 42, 42, 0.85)';
                                    }}
                                >
                                    +
                                </button>
                            </div>
                        </>
                    )}
                    
                    {/* Badge durée */}
                    {file.duration && (
                        <div style={{
                            position: 'absolute',
                            bottom: '8px',
                            right: '8px',
                            backgroundColor: 'rgba(0,0,0,0.85)',
                            color: '#fff',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            backdropFilter: 'blur(4px)',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            {formatDuration(file.duration)}
                        </div>
                    )}
                </div>
                
                {/* Infos au hover avec animation */}
                {isZoomed && (
                    <div style={{
                        padding: '14px',
                        backgroundColor: netflixTheme.bg.card,
                        animation: 'fadeIn 0.2s ease-out'
                    }}>
                        
                        {/* Titre avec meilleure typographie */}
                        <div style={{
                            fontWeight: '700',
                                color: netflixTheme.text.primary,
                            fontSize: '14px',
                            marginBottom: '6px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            letterSpacing: '-0.01em'
                            }}>
                                {displayName}
                            </div>
                            
                        {/* Année avec icône */}
                            {file.year && (
                                <div style={{
                                color: netflixTheme.accent.green,
                                fontSize: '13px',
                                fontWeight: '700',
                                marginBottom: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <span style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    backgroundColor: netflixTheme.accent.green
                                }} />
                                    {file.year}
                                </div>
                            )}
                            
                        {/* Genres avec meilleur style */}
                            {genres.length > 0 && (
                                <div style={{
                                    color: netflixTheme.text.secondary,
                                fontSize: '12px',
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                gap: '6px',
                                lineHeight: '1.4'
                                }}>
                                    {genres.slice(0, 3).map((g: string, i: number) => (
                                    <span key={i} style={{
                                        padding: '2px 0',
                                        borderBottom: i < Math.min(genres.length, 3) - 1 ? 'none' : 'none'
                                    }}>
                                        {g}{i < Math.min(genres.length, 3) - 1 && <span style={{ margin: '0 4px', opacity: 0.5 }}>•</span>}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
        );

        return (
            <>
                <div
                    ref={refs.setReference}
                    {...getReferenceProps()}
                    onClick={onClick}
                    style={{
                        position: 'relative',
                        width: '185px',
                        height: 'calc(185px * 1.5)',
                        flexShrink: 0,
                        cursor: 'pointer',
                        opacity: isOpen ? 0 : 1,
                        transition: 'opacity 0.3s ease'
                    }}
                >
                    {renderCardContent(false)}
            </div>
                
                {isOpen && customPosition && (
                    <FloatingPortal>
                        <div
                            ref={refs.setFloating}
                            {...getFloatingProps({
                                onMouseEnter: () => {},
                                onMouseLeave: () => {}
                            })}
                            onClick={onClick}
                            style={{
                                position: 'fixed',
                                top: `${customPosition.top}px`,
                                left: `${customPosition.left}px`,
                                transform: 'translate(-50%, -50%) scale(1.3)',
                                transformOrigin: 'center center',
                                zIndex: 1000,
                                pointerEvents: 'auto',
                                transition: 'transform 0.3s ease',
                                willChange: 'transform'
                            }}
                        >
                            {renderCardContent(true)}
                        </div>
                    </FloatingPortal>
                )}
            </>
        );
    };

    // Carte non identifiée
    const UnidentifiedCard = ({ file }: { file: FileItem }) => (
        <div
            onClick={() => handleUnidentifiedClick(file.file_id)}
            style={{
                width: '185px',
                flexShrink: 0,
                cursor: 'pointer',
                transition: 'transform 0.2s ease',
                borderRadius: '6px',
                overflow: 'hidden',
                border: '2px dashed rgba(255,255,255,0.3)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
            <div style={{
                width: '100%',
                aspectRatio: '2/3',
                backgroundColor: netflixTheme.bg.card,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px'
            }}>
                <span style={{ fontSize: '48px', opacity: 0.5 }}>🎬</span>
                <div style={{
                    color: netflixTheme.text.secondary,
                    fontSize: '12px',
                    textAlign: 'center',
                    padding: '0 12px'
                }}>
                    {file.filename?.replace(/\.[^/.]+$/, '').substring(0, 30)}...
                </div>
                <div style={{
                    color: netflixTheme.accent.red,
                    fontSize: '11px',
                    fontWeight: '600'
                }}>
                    {t('videos.clickToIdentify')}
                </div>
            </div>
        </div>
    );


    if (error) {
        return (
            <AuthGuard>
                <div style={{ minHeight: '100vh', backgroundColor: netflixTheme.bg.primary }}>
                    <Navigation user={user!} onLogout={logout} />
                    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
                        <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                        <VideoSubCategoryBar selectedSubCategory="films" onSubCategoryChange={handleSubCategoryChange} />
                        <div style={{ padding: '40px', textAlign: 'center', color: netflixTheme.accent.red }}>
                            Erreur : {error}
                        </div>
                    </div>
                </div>
            </AuthGuard>
        );
    }

    const hasContent = organizedMovies.unidentified.length > 0 || 
                       organizedMovies.byGenre.length > 0;

    return (
        <AuthGuard>
            <div style={{ minHeight: '100vh', backgroundColor: netflixTheme.bg.primary }}>
                <Navigation user={user!} onLogout={logout} />
                
                <div style={{ padding: '0 0 60px 0', overflow: 'visible' }}>
                    <div style={{ padding: '20px 60px' }}>
                        <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                        <VideoSubCategoryBar selectedSubCategory="films" onSubCategoryChange={handleSubCategoryChange} />
                    </div>
                    
                    {/* Hero Banner moderne */}
                    {heroMovie && (
                        <div style={{
                            position: 'relative',
                            height: '80vh',
                            minHeight: '600px',
                            maxHeight: '900px',
                            marginBottom: '60px',
                            overflow: 'hidden'
                        }}>
                            {/* Image de fond avec parallaxe effect */}
                            <div style={{
                                position: 'absolute',
                                top: '-10%',
                                left: 0,
                                right: 0,
                                bottom: '-10%',
                                backgroundImage: `url(${heroMovie.backdrop_url?.replace('/w500/', '/original/') || heroMovie.backdrop_url || heroMovie.thumbnail_url})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center center',
                                filter: 'brightness(0.4)',
                                transform: 'scale(1.1)',
                                transition: 'transform 0.3s ease'
                            }} />
                            
                            {/* Gradient overlay moderne */}
                            <div style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                height: '60%',
                                background: netflixTheme.bg.gradientHero
                            }} />
                            
                            {/* Gradient latéral amélioré - style Netflix */}
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                bottom: 0,
                                width: '50%',
                                background: 'linear-gradient(to right, rgba(20,20,20,1) 0%, rgba(20,20,20,0.9) 30%, rgba(20,20,20,0.5) 60%, transparent 100%)',
                                zIndex: 1
                            }} />
                            
                            {/* Contenu avec animation */}
                            <div style={{
                                position: 'absolute',
                                bottom: '10%',
                                left: '4%',
                                maxWidth: '600px',
                                zIndex: 3,
                                animation: 'fadeInUp 0.8s ease-out'
                            }}>
                                <h1 style={{
                                    fontSize: 'clamp(32px, 5vw, 72px)',
                                    fontWeight: '900',
                                    color: '#fff',
                                    marginBottom: '20px',
                                    textShadow: '2px 2px 8px rgba(0,0,0,0.8)',
                                    lineHeight: '1.1',
                                    letterSpacing: '-0.02em'
                                }}>
                                    {heroMovie.title}
                                </h1>
                                
                                <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '20px', 
                                    marginBottom: '20px',
                                    flexWrap: 'wrap'
                                }}>
                                {heroMovie.year && (
                                    <div style={{
                                        fontSize: '18px',
                                            color: netflixTheme.accent.green,
                                            fontWeight: '700',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            <span style={{
                                                width: '8px',
                                                height: '8px',
                                                borderRadius: '50%',
                                                backgroundColor: netflixTheme.accent.green
                                            }} />
                                        {heroMovie.year}
                                    </div>
                                )}
                                    {heroMovie.duration && (
                                        <div style={{
                                            fontSize: '16px',
                                            color: netflixTheme.text.secondary,
                                            fontWeight: '500'
                                        }}>
                                            {formatDuration(heroMovie.duration)}
                                        </div>
                                    )}
                                    {heroMovie.genres && (() => {
                                        const genres = JSON.parse(heroMovie.genres);
                                        return genres.length > 0 && (
                                            <div style={{
                                                fontSize: '16px',
                                                color: netflixTheme.text.secondary,
                                                fontWeight: '500'
                                            }}>
                                                {genres.slice(0, 2).join(' • ')}
                                            </div>
                                        );
                                    })()}
                                </div>
                                
                                {heroMovie.description && (
                                    <p style={{
                                        fontSize: 'clamp(14px, 1.5vw, 20px)',
                                        color: netflixTheme.text.primary,
                                        lineHeight: '1.6',
                                        marginBottom: '32px',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 4,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                                        maxWidth: '550px'
                                    }}>
                                        {heroMovie.description}
                                    </p>
                                )}
                                
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => handleVideoClick(heroMovie.file_id, heroMovie.category)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            padding: '14px 36px',
                                            backgroundColor: '#fff',
                                            color: '#000',
                                            border: 'none',
                                            borderRadius: '6px',
                                            fontSize: '18px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            boxShadow: netflixTheme.shadow.button,
                                            letterSpacing: '0.5px'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = '#e6e6e6';
                                            e.currentTarget.style.transform = 'scale(1.05)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = '#fff';
                                            e.currentTarget.style.transform = 'scale(1)';
                                        }}
                                    >
                                        <span style={{ fontSize: '20px' }}>▶</span>
                                        <span>Lecture</span>
                                    </button>
                                    <button
                                        onClick={() => handleVideoClick(heroMovie.file_id, heroMovie.category)}
                                        style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                            gap: '10px',
                                            padding: '14px 36px',
                                            backgroundColor: 'rgba(109, 109, 110, 0.6)',
                                        color: '#fff',
                                        border: 'none',
                                            borderRadius: '6px',
                                        fontSize: '18px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            backdropFilter: 'blur(10px)'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'rgba(109, 109, 110, 0.8)';
                                            e.currentTarget.style.transform = 'scale(1.05)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'rgba(109, 109, 110, 0.6)';
                                            e.currentTarget.style.transform = 'scale(1)';
                                        }}
                                    >
                                        <span style={{ fontSize: '20px' }}>ℹ</span>
                                        <span>Plus d'infos</span>
                                    </button>
                                </div>
                            </div>
                            
                            {/* Styles pour animations */}
                            <style>{`
                                @keyframes fadeInUp {
                                    from {
                                        opacity: 0;
                                        transform: translateY(30px);
                                    }
                                    to {
                                        opacity: 1;
                                        transform: translateY(0);
                                    }
                                }
                                @keyframes fadeIn {
                                    from { opacity: 0; }
                                    to { opacity: 1; }
                                }
                            `}</style>
                        </div>
                    )}
                    
                    {/* Continuer de regarder */}
                    {organizedMovies.continueWatching.length > 0 && (
                        <NetflixCarousel title="Continuer de regarder">
                            {organizedMovies.continueWatching.map((file) => (
                                <div key={file.file_id} style={{ position: 'relative' }}>
                                    <MovieCard
                                        file={file}
                                        onClick={() => handleVideoClick(file.file_id, file.category)}
                                    />
                                    {/* Barre de progression */}
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '0',
                                        left: '0',
                                        right: '0',
                                        height: '4px',
                                        backgroundColor: 'rgba(255,255,255,0.3)',
                                        borderRadius: '0 0 6px 6px'
                                    }}>
                                        <div style={{
                                            width: `${file.progress_percent}%`,
                                            height: '100%',
                                            backgroundColor: netflixTheme.accent.red,
                                            transition: 'width 0.3s ease'
                                        }} />
                                    </div>
                                </div>
                            ))}
                        </NetflixCarousel>
                    )}
                    
                    {/* Top 10 */}
                    {organizedMovies.top10.length > 0 && (
                        <NetflixCarousel title="Top 10 en France">
                            {organizedMovies.top10.map((file, index) => (
                                <div key={file.file_id} style={{ position: 'relative' }}>
                                    <MovieCard
                                        file={file}
                                        onClick={() => handleVideoClick(file.file_id, file.category)}
                                    />
                                    {/* Badge numéro */}
                                    <div style={{
                                        position: 'absolute',
                                        top: '-10px',
                                        left: '-10px',
                                        width: '40px',
                                        height: '40px',
                                        backgroundColor: netflixTheme.accent.red,
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#fff',
                                        fontSize: '20px',
                                        fontWeight: '700',
                                        zIndex: 10,
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                                    }}>
                                        {index + 1}
                                    </div>
                                </div>
                            ))}
                        </NetflixCarousel>
                    )}
                    
                    {/* Fichiers non identifiés */}
                    {organizedMovies.unidentified.length > 0 && (
                        <NetflixCarousel title={t('videos.unidentifiedFiles')} icon="📁">
                            {organizedMovies.unidentified.map((file) => (
                                <UnidentifiedCard key={file.file_id} file={file} />
                            ))}
                        </NetflixCarousel>
                    )}
                    
                    {/* Ajoutés récemment */}
                    {organizedMovies.recentlyAdded.length > 0 && (
                        <NetflixCarousel title={t('videos.recentlyAdded') || 'Ajoutés récemment'} icon="🆕">
                            {organizedMovies.recentlyAdded.map((file) => (
                                <MovieCard
                                    key={file.file_id}
                                    file={file}
                                    onClick={() => handleVideoClick(file.file_id, file.category)}
                                />
                            ))}
                        </NetflixCarousel>
                    )}
                    
                    {/* Films par genre */}
                    {organizedMovies.byGenre.map((genreGroup) => (
                        <NetflixCarousel key={genreGroup.genre} title={genreGroup.genre}>
                            {genreGroup.movies.map((file) => (
                                <MovieCard
                                    key={`${genreGroup.genre}-${file.file_id}`}
                                    file={file}
                                    genre={genreGroup.genre}
                                    onClick={() => handleVideoClick(file.file_id, file.category)}
                                />
                            ))}
                        </NetflixCarousel>
                    ))}
                    
                    {/* Message si aucun contenu */}
                    {!hasContent && !loading && (
                        <div style={{
                            textAlign: 'center',
                            padding: '120px 20px',
                            color: netflixTheme.text.secondary
                        }}>
                            <div style={{ fontSize: '80px', marginBottom: '24px' }}>🎬</div>
                            <div style={{ 
                                fontSize: '28px', 
                                fontWeight: '700', 
                                marginBottom: '12px',
                                color: netflixTheme.text.primary
                            }}>
                                {t('emptyStates.noFilms')}
                            </div>
                            <div style={{ 
                                fontSize: '16px',
                                marginBottom: '32px',
                                maxWidth: '400px',
                                margin: '0 auto 32px'
                            }}>
                                {t('emptyStates.noFilmsDescription')}
                            </div>
                            <button
                                onClick={() => navigate('/upload')}
                                style={{
                                    padding: '16px 32px',
                                    backgroundColor: netflixTheme.accent.red,
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = netflixTheme.accent.redHover}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = netflixTheme.accent.red}
                            >
                                {t('emptyStates.uploadFirstFilm')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </AuthGuard>
    );
}
