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
}

// Style Netflix
const netflixTheme = {
    bg: {
        primary: '#141414',
        secondary: '#1a1a1a',
        card: '#181818',
        hover: '#252525',
        gradient: 'linear-gradient(to bottom, rgba(20,20,20,0) 0%, rgba(20,20,20,0.8) 50%, rgba(20,20,20,1) 100%)'
    },
    text: {
        primary: '#ffffff',
        secondary: '#b3b3b3',
        muted: '#808080'
    },
    accent: {
        red: '#e50914',
        redHover: '#f40612'
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
        recentlyAdded: []
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
                const response = await fetch(
                    `https://videomi.uk/api/upload/user/${user.id}?category=videos`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );

                if (!response.ok) throw new Error('Erreur lors de la récupération des fichiers');

                const data = await response.json() as { files: FileItem[] };
                let files = data.files || [];


                organizeMovies(files);
                setLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Erreur inconnue');
                setLoading(false);
            }
        };

        fetchFiles();
    }, [user?.id, config]);

    const organizeMovies = useCallback((files: FileItem[]) => {
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

        // Sélectionner un film aléatoire pour le hero (parmi ceux avec thumbnail)
        const moviesWithThumbnail = allMovies.filter(m => m.thumbnail_url);
        if (moviesWithThumbnail.length > 0) {
            const randomIndex = Math.floor(Math.random() * moviesWithThumbnail.length);
            setHeroMovie(moviesWithThumbnail[randomIndex]);
        }

        setOrganizedMovies({
            unidentified: unidentified.sort((a, b) => b.uploaded_at - a.uploaded_at),
            byGenre,
            recentlyAdded
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
        navigate(`/reader/${category}/${fileId}`);
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
                borderRadius: '6px',
                overflow: 'hidden',
                backgroundColor: netflixTheme.bg.card,
                boxShadow: isZoomed ? '0 10px 40px rgba(0,0,0,0.8)' : 'none',
                transition: 'box-shadow 0.3s ease',
                width: '185px'
            }}>
                {/* Image */}
                <div style={{
                    width: '100%',
                    aspectRatio: '2/3',
                    backgroundColor: '#2a2a2a',
                    position: 'relative'
                }}>
                    {thumbnailUrl ? (
                        <img
                            src={thumbnailUrl}
                            alt={displayName}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%',
                            height: '100%',
                            color: netflixTheme.text.muted,
                            fontSize: '48px'
                        }}>
                            🎬
                        </div>
                    )}
                    
                    {/* Badge durée */}
                    {file.duration && (
                        <div style={{
                            position: 'absolute',
                            bottom: '8px',
                            right: '8px',
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            color: '#fff',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '11px',
                            fontWeight: '500'
                        }}>
                            {formatDuration(file.duration)}
                        </div>
                    )}
                </div>
                
                {/* Infos au hover */}
                {isZoomed && (
                    <div style={{
                        padding: '12px',
                        backgroundColor: netflixTheme.bg.card
                    }}>
                        {/* Boutons */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                            <button style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                backgroundColor: '#fff',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '18px'
                            }}>
                                ▶
                            </button>
                            <button style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                backgroundColor: 'transparent',
                                border: '2px solid rgba(255,255,255,0.5)',
                                cursor: 'pointer',
                                color: '#fff',
                                fontSize: '16px'
                            }}>
                                +
                            </button>
                        </div>
                        
                        {/* Titre */}
                        <div style={{
                            fontWeight: '600',
                            color: netflixTheme.text.primary,
                            fontSize: '13px',
                            marginBottom: '4px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {displayName}
                        </div>
                        
                        {/* Année */}
                        {file.year && (
                            <div style={{
                                color: '#46d369',
                                fontSize: '12px',
                                fontWeight: '600',
                                marginBottom: '4px'
                            }}>
                                {file.year}
                            </div>
                        )}
                        
                        {/* Genres */}
                        {genres.length > 0 && (
                            <div style={{
                                color: netflixTheme.text.secondary,
                                fontSize: '11px',
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '4px'
                            }}>
                                {genres.slice(0, 3).map((g: string, i: number) => (
                                    <span key={i}>
                                        {g}{i < Math.min(genres.length, 3) - 1 && ' •'}
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
                    
                    {/* Hero Banner */}
                    {heroMovie && (
                        <div style={{
                            position: 'relative',
                            height: '500px',
                            marginBottom: '40px',
                            overflow: 'hidden'
                        }}>
                            {/* Image de fond */}
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundImage: `url(${heroMovie.thumbnail_url?.replace('/w500/', '/original/') || heroMovie.thumbnail_url})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center top',
                                filter: 'brightness(0.6)'
                            }} />
                            
                            {/* Gradient */}
                            <div style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                height: '200px',
                                background: 'linear-gradient(to top, #141414, transparent)'
                            }} />
                            
                            {/* Gradient latéral */}
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                bottom: 0,
                                width: '50%',
                                background: 'linear-gradient(to right, rgba(20,20,20,0.9), transparent)'
                            }} />
                            
                            {/* Contenu */}
                            <div style={{
                                position: 'absolute',
                                bottom: '80px',
                                left: '60px',
                                maxWidth: '500px'
                            }}>
                                <h1 style={{
                                    fontSize: '48px',
                                    fontWeight: '800',
                                    color: '#fff',
                                    marginBottom: '16px',
                                    textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                                }}>
                                    {heroMovie.title}
                                </h1>
                                
                                {heroMovie.year && (
                                    <div style={{
                                        fontSize: '18px',
                                        color: '#46d369',
                                        fontWeight: '600',
                                        marginBottom: '16px'
                                    }}>
                                        {heroMovie.year}
                                    </div>
                                )}
                                
                                {heroMovie.description && (
                                    <p style={{
                                        fontSize: '16px',
                                        color: netflixTheme.text.primary,
                                        lineHeight: '1.5',
                                        marginBottom: '24px',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden'
                                    }}>
                                        {heroMovie.description}
                                    </p>
                                )}
                                
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button
                                        onClick={() => handleVideoClick(heroMovie.file_id, heroMovie.category)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '12px 28px',
                                            backgroundColor: '#fff',
                                            color: '#000',
                                            border: 'none',
                                            borderRadius: '4px',
                                            fontSize: '18px',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e6e6e6'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                                    >
                                        ▶ Lecture
                                    </button>
                                    <button style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '12px 28px',
                                        backgroundColor: 'rgba(109, 109, 110, 0.7)',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '4px',
                                        fontSize: '18px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s'
                                    }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(109, 109, 110, 0.4)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(109, 109, 110, 0.7)'}
                                    >
                                        ℹ Plus d'infos
                                    </button>
                                </div>
                            </div>
                        </div>
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
