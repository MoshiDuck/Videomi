// INFO : app/routes/series.tsx
// Page Séries style Netflix

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
    episode_description: string | null;
    collection_id: string | null;
    collection_name: string | null;
    description: string | null;
}

interface TVShow {
    showId: string;
    showName: string;
    showThumbnail: string | null;
    showBackdrop: string | null; // Poster original pour bannière
    year: number | null;
    description: string | null;
    genres: string[];
    totalEpisodes: number;
    seasons: Array<{
        seasonNumber: number;
        seasonName: string;
        episodes: Array<{
            file: FileItem;
            episodeNumber: number;
            title: string;
        }>;
    }>;
}

interface OrganizedSeries {
    unidentified: FileItem[];
    byGenre: Array<{ genre: string; shows: TVShow[] }>;
    continueWatching: Array<{ show: TVShow; lastEpisode: FileItem; progress_percent: number }>;
    top10: TVShow[];
    recentlyAdded: TVShow[];
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

export default function SeriesRoute() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const { config } = useConfig();
    const navigate = useNavigate();
    const [selectedCategory, setSelectedCategory] = useState<FileCategory>('videos');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [organizedSeries, setOrganizedSeries] = useState<OrganizedSeries>({
        unidentified: [],
        byGenre: [],
        continueWatching: [],
        top10: [],
        recentlyAdded: []
    });
    const [heroShow, setHeroShow] = useState<TVShow | null>(null);
    
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

                organizeSeries(files, progressions);
                setLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Erreur inconnue');
                setLoading(false);
            }
        };

        fetchFiles();
    }, [user?.id, config]);

    const organizeSeries = useCallback((files: FileItem[], progressions: Array<{ file_id: string; progress_percent: number; current_time: number }> = []) => {
        const unidentified: FileItem[] = [];
        const tvShowsMap = new Map<string, TVShow>();

        for (const file of files) {
            const filenameForPattern = file.filename?.replace(/\.[^/.]+$/, '') || '';
            const isTVShow = /\bS\d{1,2}E\d{1,2}\b/i.test(filenameForPattern) ||
                           (/\bS\d{1,2}\b/i.test(filenameForPattern) && /\bE\d{1,2}\b/i.test(filenameForPattern)) ||
                           file.source_api === 'tmdb_tv';
            
            if (!isTVShow) continue;

            if (!file.source_id || !file.source_api) {
                unidentified.push(file);
            } else if (file.source_api === 'tmdb_tv') {
                const showKey = file.source_id;
                const showName = file.title || 'Série inconnue';
                
                // Extraire S/E du filename si pas dans les métadonnées
                let seasonNum = file.season || 0;
                let episodeNum = file.episode || 0;
                
                if (seasonNum === 0 || episodeNum === 0) {
                    const combinedMatch = filenameForPattern.match(/\bS(\d{1,2})E(\d{1,2})\b/i);
                    if (combinedMatch) {
                        seasonNum = parseInt(combinedMatch[1]);
                        episodeNum = parseInt(combinedMatch[2]);
                    } else {
                        const seasonMatch = filenameForPattern.match(/\bS(\d{1,2})\b/i);
                        const episodeMatch = filenameForPattern.match(/\bE(\d{1,2})\b/i);
                        if (seasonMatch) seasonNum = parseInt(seasonMatch[1]);
                        if (episodeMatch) episodeNum = parseInt(episodeMatch[1]);
                    }
                }
                
                if (!tvShowsMap.has(showKey)) {
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
                        console.warn(`⚠️ [SERIES] Erreur parsing genres pour ${file.file_id}:`, parseError, `genres raw:`, file.genres);
                    }
                    // Pour les items de série : utiliser backdrop_url (poster original) pour les miniatures
                    // On évite d'utiliser thumbnail_url car il peut contenir le still d'un épisode
                    // backdrop_url contient toujours le poster de la série (même pour les épisodes)
                    tvShowsMap.set(showKey, {
                        showId: showKey,
                        showName: showName,
                        showThumbnail: file.backdrop_url, // Poster original de la série (pas les stills d'épisodes)
                        showBackdrop: file.backdrop_url, // Pour bannière (poster original)
                        year: file.year,
                        description: file.description,
                        genres: genres,
                        totalEpisodes: 0,
                        seasons: []
                    });
                }
                
                const show = tvShowsMap.get(showKey)!;
                show.totalEpisodes++;
                
                // Mettre à jour le thumbnail de la série si on trouve un fichier qui n'est pas un épisode
                // (pour avoir le backdrop de la série plutôt que le still d'un épisode)
                if (file.episode === null && file.thumbnail_url) {
                    // C'est la série elle-même, utiliser son thumbnail_url (backdrop de la série)
                    show.showThumbnail = file.thumbnail_url;
                }
                
                let season = show.seasons.find(s => s.seasonNumber === seasonNum);
                if (!season) {
                    season = {
                        seasonNumber: seasonNum,
                        seasonName: `${t('videos.season')} ${seasonNum}`,
                        episodes: []
                    };
                    show.seasons.push(season);
                }
                
                season.episodes.push({
                    file,
                    episodeNumber: episodeNum,
                    title: file.title || `${t('videos.episode')} ${episodeNum}`
                });
            }
        }

        // Trier les saisons et épisodes
        const tvShows = Array.from(tvShowsMap.values()).map(show => ({
            ...show,
            seasons: show.seasons
                .sort((a, b) => a.seasonNumber - b.seasonNumber)
                .map(season => ({
                    ...season,
                    episodes: season.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber)
                }))
        })).sort((a, b) => a.showName.localeCompare(b.showName));

        // Grouper par genre
        const genreMap = new Map<string, TVShow[]>();
        for (const show of tvShows) {
            const genres = show.genres && show.genres.length > 0 ? show.genres : ['Sans genre'];
            for (const genre of genres) {
                if (!genreMap.has(genre)) {
                    genreMap.set(genre, []);
                }
                genreMap.get(genre)!.push(show);
            }
        }

        // Convertir en tableau et trier par nom de genre
        const byGenre = Array.from(genreMap.entries())
            .map(([genre, shows]) => ({
                genre,
                shows: shows.sort((a, b) => a.showName.localeCompare(b.showName))
            }))
            .sort((a, b) => {
                // Mettre "Sans genre" à la fin
                if (a.genre === 'Sans genre') return 1;
                if (b.genre === 'Sans genre') return -1;
                return a.genre.localeCompare(b.genre);
            });

        // Sélectionner une série aléatoire pour le hero
        const showsWithThumbnail = tvShows.filter(s => s.showThumbnail);
        if (showsWithThumbnail.length > 0) {
            const randomIndex = Math.floor(Math.random() * showsWithThumbnail.length);
            setHeroShow(showsWithThumbnail[randomIndex]);
        }

        // Top 10 : les séries les plus récentes avec métadonnées complètes
        const top10 = [...tvShows]
            .filter(s => s.showThumbnail && s.genres.length > 0)
            .sort((a, b) => {
                // Prioriser celles avec description et plus d'épisodes
                const aScore = (a.description ? 10 : 0) + (a.totalEpisodes > 10 ? 5 : 0);
                const bScore = (b.description ? 10 : 0) + (b.totalEpisodes > 10 ? 5 : 0);
                if (bScore !== aScore) return bScore - aScore;
                return b.totalEpisodes - a.totalEpisodes;
            })
            .slice(0, 10);

        // Ajoutés récemment : séries triées par date d'upload
        const allEpisodes = Array.from(tvShowsMap.values()).flatMap(show => 
            show.seasons.flatMap(season => season.episodes.map(ep => ep.file))
        );
        const recentlyAddedShows = new Set<string>();
        const recentlyAdded = [...allEpisodes]
            .sort((a, b) => b.uploaded_at - a.uploaded_at)
            .filter(ep => {
                const showKey = ep.source_id || '';
                if (!recentlyAddedShows.has(showKey)) {
                    recentlyAddedShows.add(showKey);
                    return true;
                }
                return false;
            })
            .slice(0, 20)
            .map(ep => tvShowsMap.get(ep.source_id || '')!)
            .filter(Boolean)
            .slice(0, 20);

        // Continuer de regarder : séries avec progression
        const progressMap = new Map(progressions.map(p => [p.file_id, p]));
        const continueWatchingMap = new Map<string, { show: TVShow; lastEpisode: FileItem; progress_percent: number }>();
        
        for (const show of tvShows) {
            // Trouver le dernier épisode regardé de cette série
            let lastWatchedEpisode: FileItem | null = null;
            let maxProgress = 0;
            
            for (const season of show.seasons) {
                for (const episode of season.episodes) {
                    const progress = progressMap.get(episode.file.file_id);
                    if (progress && progress.progress_percent > 5 && progress.progress_percent < 95) {
                        if (progress.progress_percent > maxProgress) {
                            maxProgress = progress.progress_percent;
                            lastWatchedEpisode = episode.file;
                        }
                    }
                }
            }
            
            if (lastWatchedEpisode) {
                continueWatchingMap.set(show.showId, {
                    show,
                    lastEpisode: lastWatchedEpisode,
                    progress_percent: maxProgress
                });
            }
        }
        
        const continueWatching = Array.from(continueWatchingMap.values())
            .sort((a, b) => b.lastEpisode.uploaded_at - a.lastEpisode.uploaded_at)
            .slice(0, 20);

        setOrganizedSeries({
            unidentified: unidentified.sort((a, b) => b.uploaded_at - a.uploaded_at),
            byGenre,
            continueWatching,
            top10,
            recentlyAdded
        });
    }, [t]);

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

    const handlePlayEpisode = useCallback((fileId: string, category: string) => {
        // Lancer directement la lecture, pas vers /info
        navigate(`/reader/${category}/${fileId}`);
    }, [navigate]);

    const handleShowClick = useCallback((show: TVShow) => {
        // Rediriger vers la page info du premier épisode de la première saison
        if (show.seasons.length > 0 && show.seasons[0].episodes.length > 0) {
            const firstEpisode = show.seasons[0].episodes[0];
            navigate(`/info/${firstEpisode.file.category}/${firstEpisode.file.file_id}`);
        }
    }, [navigate]);

    const handleUnidentifiedClick = useCallback((fileId: string) => {
        navigate(`/match/videos/${fileId}`);
    }, [navigate]);


    // Carte Série Netflix
    const SeriesCard = ({ show, genre, onClick }: { show: TVShow; genre: string; onClick: () => void }) => {
        const cardId = `${genre}-${show.showId}`;
        
        // Utiliser Floating UI pour gérer le hover et le positionnement
        const [isOpen, setIsOpen] = useState(false);
        
        const { refs, floatingStyles, context } = useFloating({
            open: isOpen,
            onOpenChange: setIsOpen,
            placement: 'top',
            middleware: []
        });
        
        const hover = useHover(context, {
            delay: { open: 0, close: 200 },
            restMs: 25
        });

        const { getReferenceProps, getFloatingProps } = useInteractions([hover]);
        
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
                    {show.showThumbnail ? (
                        <img
                            src={show.showThumbnail}
                            alt={show.showName}
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
                            📺
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
                    
                    {/* Badge épisodes */}
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
                        {show.totalEpisodes} ép.
                    </div>
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
                                {show.showName}
                            </div>
                            
                        {/* Info saisons avec icône */}
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
                                {show.seasons.length} {t('videos.season')}{show.seasons.length > 1 ? 's' : ''}
                            </div>
                            
                        {/* Genres avec meilleur style */}
                            {show.genres.length > 0 && (
                                <div style={{
                                    color: netflixTheme.text.secondary,
                                fontSize: '12px',
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                gap: '6px',
                                lineHeight: '1.4'
                                }}>
                                    {show.genres.slice(0, 3).map((g, i) => (
                                    <span key={i} style={{
                                        padding: '2px 0',
                                        borderBottom: i < Math.min(show.genres.length, 3) - 1 ? 'none' : 'none'
                                    }}>
                                        {g}{i < Math.min(show.genres.length, 3) - 1 && <span style={{ margin: '0 4px', opacity: 0.5 }}>•</span>}
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

    // Carte Épisode
    const EpisodeCard = ({ episode, showName }: { episode: { file: FileItem; episodeNumber: number; title: string }; showName: string }) => {
        const thumbnailUrl = getThumbnailUrl(episode.file);
        
        return (
            <div
                onClick={() => handleVideoClick(episode.file.file_id, episode.file.category)}
                style={{
                    width: '280px',
                    flexShrink: 0,
                    cursor: 'pointer',
                    transition: 'transform 0.2s ease',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    backgroundColor: netflixTheme.bg.card
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
                {/* Thumbnail */}
                <div style={{
                    width: '100%',
                    aspectRatio: '16/9',
                    backgroundColor: '#2a2a2a',
                    position: 'relative'
                }}>
                    {thumbnailUrl ? (
                        <img
                            src={thumbnailUrl}
                            alt={episode.title}
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
                            fontSize: '40px'
                        }}>
                            📺
                        </div>
                    )}
                    
                    {/* Bouton play */}
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0,0,0,0.7)',
                        border: '2px solid #fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.9
                    }}>
                        <span style={{ color: '#fff', fontSize: '20px', marginLeft: '4px' }}>▶</span>
                    </div>
                    
                    {/* Durée */}
                    {episode.file.duration && (
                        <div style={{
                            position: 'absolute',
                            bottom: '8px',
                            right: '8px',
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            color: '#fff',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '11px'
                        }}>
                            {formatDuration(episode.file.duration)}
                        </div>
                    )}
                </div>
                
                {/* Info */}
                <div style={{ padding: '12px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px'
                    }}>
                        <span style={{
                            fontSize: '14px',
                            fontWeight: '700',
                            color: netflixTheme.text.primary
                        }}>
                            {episode.episodeNumber}.
                        </span>
                        <span style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            color: netflixTheme.text.primary,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}>
                            {t('videos.episode')} {episode.episodeNumber}
                        </span>
                    </div>
                    {(episode.file.episode_description || episode.file.description) && (
                        <div style={{
                            fontSize: '12px',
                            color: netflixTheme.text.secondary,
                            lineHeight: '1.4',
                            marginTop: '6px',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                        }}>
                            {episode.file.episode_description || episode.file.description}
                        </div>
                    )}
                </div>
            </div>
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
                <span style={{ fontSize: '48px', opacity: 0.5 }}>📺</span>
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
                        <VideoSubCategoryBar selectedSubCategory="series" onSubCategoryChange={handleSubCategoryChange} />
                        <div style={{ padding: '40px', textAlign: 'center', color: netflixTheme.accent.red }}>
                            Erreur : {error}
                        </div>
                    </div>
                </div>
            </AuthGuard>
        );
    }

    const hasContent = organizedSeries.unidentified.length > 0 || organizedSeries.byGenre.length > 0;

    return (
        <AuthGuard>
            <div style={{ minHeight: '100vh', backgroundColor: netflixTheme.bg.primary }}>
                <Navigation user={user!} onLogout={logout} />
                
                <div style={{ padding: '0 0 60px 0', overflow: 'visible' }}>
                    <div style={{ padding: '20px 60px' }}>
                        <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                        <VideoSubCategoryBar selectedSubCategory="series" onSubCategoryChange={handleSubCategoryChange} />
                    </div>
                    
                    {/* Hero Banner moderne */}
                    {heroShow && (
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
                                backgroundImage: `url(${heroShow.showBackdrop?.replace('/w500/', '/original/') || heroShow.showBackdrop || heroShow.showThumbnail})`,
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
                                    {heroShow.showName}
                                </h1>
                                
                                <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '20px', 
                                    marginBottom: '20px',
                                    flexWrap: 'wrap'
                                }}>
                                    {heroShow.year && (
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
                                            {heroShow.year}
                                        </div>
                                    )}
                                    <div style={{
                                        fontSize: '16px',
                                        color: netflixTheme.text.secondary,
                                        fontWeight: '500'
                                    }}>
                                        {heroShow.seasons.length} {t('videos.season')}{heroShow.seasons.length > 1 ? 's' : ''}
                                    </div>
                                    <div style={{
                                        fontSize: '16px',
                                        color: netflixTheme.text.secondary,
                                        fontWeight: '500'
                                    }}>
                                        {heroShow.totalEpisodes} {t('videos.episode')}{heroShow.totalEpisodes > 1 ? 's' : ''}
                                    </div>
                                    {heroShow.genres.length > 0 && (
                                        <div style={{
                                            fontSize: '16px',
                                            color: netflixTheme.text.secondary,
                                            fontWeight: '500'
                                        }}>
                                            {heroShow.genres.slice(0, 2).join(' • ')}
                                        </div>
                                    )}
                                </div>
                                
                                {heroShow.description && (
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
                                        {heroShow.description}
                                    </p>
                                )}
                                
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => {
                                            if (heroShow.seasons.length > 0 && heroShow.seasons[0].episodes.length > 0) {
                                                handlePlayEpisode(heroShow.seasons[0].episodes[0].file.file_id, heroShow.seasons[0].episodes[0].file.category);
                                            }
                                        }}
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
                                        onClick={() => handleShowClick(heroShow)}
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
                            
                            {/* Style pour animation */}
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
                    {organizedSeries.continueWatching.length > 0 && (
                        <NetflixCarousel title="Continuer de regarder">
                            {organizedSeries.continueWatching.map((item) => (
                                <div key={item.show.showId} style={{ position: 'relative' }}>
                                    <SeriesCard
                                        show={item.show}
                                        onClick={() => handleShowClick(item.show)}
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
                                            width: `${item.progress_percent}%`,
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
                    {organizedSeries.top10.length > 0 && (
                        <NetflixCarousel title="Top 10 en France">
                            {organizedSeries.top10.map((show, index) => (
                                <div key={show.showId} style={{ position: 'relative' }}>
                                    <SeriesCard
                                        show={show}
                                        onClick={() => handleShowClick(show)}
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
                    
                    {/* Ajoutés récemment */}
                    {organizedSeries.recentlyAdded.length > 0 && (
                        <NetflixCarousel title="Ajoutés récemment">
                            {organizedSeries.recentlyAdded.map((show) => (
                                <SeriesCard
                                    key={show.showId}
                                    show={show}
                                    onClick={() => handleShowClick(show)}
                                />
                            ))}
                        </NetflixCarousel>
                    )}
                    
                    {/* Fichiers non identifiés */}
                    {organizedSeries.unidentified.length > 0 && (
                        <NetflixCarousel title={t('videos.unidentifiedFiles')} icon="📁">
                            {organizedSeries.unidentified.map((file) => (
                                <UnidentifiedCard key={file.file_id} file={file} />
                            ))}
                        </NetflixCarousel>
                    )}
                    
                    {/* Séries par genre */}
                    {organizedSeries.byGenre.map((genreGroup) => (
                        <NetflixCarousel key={genreGroup.genre} title={genreGroup.genre}>
                            {genreGroup.shows.map((show) => (
                                <SeriesCard
                                    key={`${genreGroup.genre}-${show.showId}`}
                                    show={show}
                                    genre={genreGroup.genre}
                                    onClick={() => handleShowClick(show)}
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
                            <div style={{ fontSize: '80px', marginBottom: '24px' }}>📺</div>
                            <div style={{ 
                                fontSize: '28px', 
                                fontWeight: '700', 
                                marginBottom: '12px',
                                color: netflixTheme.text.primary
                            }}>
                                {t('emptyStates.noSeries')}
                            </div>
                            <div style={{ 
                                fontSize: '16px',
                                marginBottom: '32px',
                                maxWidth: '400px',
                                margin: '0 auto 32px'
                            }}>
                                {t('emptyStates.noSeriesDescription')}
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
                                    fontWeight: '600'
                                }}
                            >
                                {t('emptyStates.uploadFirstSeries')}
                            </button>
                        </div>
                    )}
                </div>
                
            </div>
        </AuthGuard>
    );
}
