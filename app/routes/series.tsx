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
import { getCategoryRoute } from '~/utils/routes';
import { formatDuration } from '~/utils/format';
import { useLanguage } from '~/contexts/LanguageContext';

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

interface TVShow {
    showId: string;
    showName: string;
    showThumbnail: string | null;
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
    tvShows: TVShow[];
    continueWatching: FileItem[];
}

// Style Netflix
const netflixTheme = {
    bg: {
        primary: '#141414',
        secondary: '#1a1a1a',
        card: '#181818',
        hover: '#252525',
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
        tvShows: [],
        continueWatching: []
    });
    const [heroShow, setHeroShow] = useState<TVShow | null>(null);
    const [selectedShow, setSelectedShow] = useState<string | null>(null);
    const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
    const [hoveredCard, setHoveredCard] = useState<string | null>(null);
    
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

                // AUTO-MATCHING TMDB pour les séries non identifiées
                if (config && config.tmdbApiKey) {
                    const { searchTVShowsOnTMDB, getTVShowDetailsFromTMDB } = 
                        await import('~/utils/media/mediaMetadata');
                    
                    const prepareTitle = (title: string): string => {
                        return title
                            .replace(/\./g, ' ').replace(/-/g, ' ').replace(/_/g, ' ')
                            .replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '')
                            .replace(/\s+/g, ' ').trim();
                    };
                    
                    const searchProgressively = async (
                        words: string[], 
                        searchFn: (query: string) => Promise<any[]>,
                        extractedYear: number | null
                    ): Promise<{ result: any; usedWords: number } | null> => {
                        for (let wordCount = words.length; wordCount >= 1; wordCount--) {
                            const searchQuery = words.slice(0, wordCount).join(' ');
                            if (searchQuery.length < 2) continue;
                            const results = await searchFn(searchQuery);
                            if (results.length > 0) {
                                if (extractedYear) {
                                    const matchingYear = results.find((r: any) => r.year === extractedYear);
                                    if (matchingYear) return { result: matchingYear, usedWords: wordCount };
                                }
                                return { result: results[0], usedWords: wordCount };
                            }
                        }
                        return null;
                    };
                    
                    for (const file of files) {
                        if (!file.source_id || !file.source_api) {
                            try {
                                const filenameForPattern = file.filename?.replace(/\.[^/.]+$/, '') || '';
                                
                                const combinedMatch = filenameForPattern.match(/\bS(\d{1,2})E(\d{1,2})\b/i);
                                const seasonOnlyMatch = !combinedMatch ? filenameForPattern.match(/\bS(\d{1,2})\b/i) : null;
                                const episodeOnlyMatch = !combinedMatch ? filenameForPattern.match(/\bE(\d{1,2})\b/i) : null;
                                
                                const isTVShow = combinedMatch !== null || (seasonOnlyMatch !== null && episodeOnlyMatch !== null);
                                
                                if (!isTVShow) continue;
                                
                                const seasonNumber = combinedMatch ? parseInt(combinedMatch[1]) : (seasonOnlyMatch ? parseInt(seasonOnlyMatch[1]) : null);
                                const episodeNumber = combinedMatch ? parseInt(combinedMatch[2]) : (episodeOnlyMatch ? parseInt(episodeOnlyMatch[1]) : null);
                                
                                const preparedTitle = prepareTitle(filenameForPattern);
                                const yearMatch = filenameForPattern.match(/\b(19\d{2}|20\d{2})\b/);
                                const extractedYear = yearMatch ? parseInt(yearMatch[1]) : null;
                                const words = preparedTitle.split(' ').filter(w => w.length > 0);
                                
                                if (words.length < 1) continue;
                                
                                const searchResult = await searchProgressively(
                                    words,
                                    (query) => searchTVShowsOnTMDB(query, config.tmdbApiKey!, 5),
                                    extractedYear
                                );
                                
                                if (searchResult) {
                                    const tvDetails = await getTVShowDetailsFromTMDB(searchResult.result.source_id, config.tmdbApiKey!);
                                    if (tvDetails) {
                                        const metadata = {
                                            source_api: 'tmdb_tv',
                                            source_id: searchResult.result.source_id,
                                            title: tvDetails.name,
                                            year: tvDetails.first_air_date ? parseInt(tvDetails.first_air_date.substring(0, 4)) : null,
                                            thumbnail_url: tvDetails.poster_path ? `https://image.tmdb.org/t/p/w500${tvDetails.poster_path}` : null,
                                            genres: tvDetails.genres?.map(g => g.name) || [],
                                            season: seasonNumber,
                                            episode: episodeNumber,
                                            description: tvDetails.overview
                                        };
                                        
                                        const baseUrl = window.location.origin;
                                        const metadataResponse = await fetch(`${baseUrl}/api/files/${file.file_id}/metadata`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                            body: JSON.stringify(metadata)
                                        });
                                        
                                        if (metadataResponse.ok) {
                                            Object.assign(file, {
                                                source_id: metadata.source_id,
                                                source_api: metadata.source_api,
                                                title: metadata.title,
                                                year: metadata.year,
                                                thumbnail_url: metadata.thumbnail_url,
                                                genres: JSON.stringify(metadata.genres),
                                                season: metadata.season,
                                                episode: metadata.episode,
                                                description: metadata.description
                                            });
                                        }
                                    }
                                }
                            } catch (err) {
                                console.warn(`⚠️ Erreur auto-match:`, err);
                            }
                        }
                    }
                }

                organizeSeries(files);
                setLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Erreur inconnue');
                setLoading(false);
            }
        };

        fetchFiles();
    }, [user?.id, config]);

    const organizeSeries = useCallback((files: FileItem[]) => {
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
                    const genres = file.genres ? JSON.parse(file.genres) : [];
                    tvShowsMap.set(showKey, {
                        showId: showKey,
                        showName: showName,
                        showThumbnail: file.thumbnail_url,
                        year: file.year,
                        description: file.description,
                        genres: genres,
                        totalEpisodes: 0,
                        seasons: []
                    });
                }
                
                const show = tvShowsMap.get(showKey)!;
                show.totalEpisodes++;
                
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

        // Sélectionner une série aléatoire pour le hero
        const showsWithThumbnail = tvShows.filter(s => s.showThumbnail);
        if (showsWithThumbnail.length > 0) {
            const randomIndex = Math.floor(Math.random() * showsWithThumbnail.length);
            setHeroShow(showsWithThumbnail[randomIndex]);
        }

        setOrganizedSeries({
            unidentified: unidentified.sort((a, b) => b.uploaded_at - a.uploaded_at),
            tvShows,
            continueWatching: [] // À implémenter avec le watch history
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
        navigate(`/reader/${category}/${fileId}`);
    }, [navigate]);

    const handleUnidentifiedClick = useCallback((fileId: string) => {
        navigate(`/match/videos/${fileId}`);
    }, [navigate]);

    // Composant Carrousel Netflix
    const NetflixCarousel = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => {
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
                    <span>{icon}</span> {title}
                </h2>
                
                <div style={{ position: 'relative' }}>
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
                    
                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        style={{
                            display: 'flex',
                            gap: '8px',
                            overflowX: 'auto',
                            scrollbarWidth: 'none',
                            msOverflowStyle: 'none',
                            paddingLeft: '60px',
                            paddingRight: '60px',
                            paddingTop: '10px',
                            paddingBottom: '10px'
                        }}
                    >
                        {children}
                    </div>
                    
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

    // Carte Série Netflix
    const SeriesCard = ({ show, onClick }: { show: TVShow; onClick: () => void }) => {
        const isHovered = hoveredCard === show.showId;

        return (
            <div
                onClick={onClick}
                onMouseEnter={() => setHoveredCard(show.showId)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{
                    position: 'relative',
                    width: '185px',
                    flexShrink: 0,
                    cursor: 'pointer',
                    transition: 'transform 0.3s ease, z-index 0s 0.3s',
                    transform: isHovered ? 'scale(1.3)' : 'scale(1)',
                    zIndex: isHovered ? 100 : 1,
                    transformOrigin: 'center center'
                }}
            >
                <div style={{
                    borderRadius: '6px',
                    overflow: 'hidden',
                    backgroundColor: netflixTheme.bg.card,
                    boxShadow: isHovered ? '0 10px 40px rgba(0,0,0,0.8)' : 'none',
                    transition: 'box-shadow 0.3s ease'
                }}>
                    {/* Image */}
                    <div style={{
                        width: '100%',
                        aspectRatio: '2/3',
                        backgroundColor: '#2a2a2a',
                        position: 'relative'
                    }}>
                        {show.showThumbnail ? (
                            <img
                                src={show.showThumbnail}
                                alt={show.showName}
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
                                📺
                            </div>
                        )}
                        
                        {/* Badge épisodes */}
                        <div style={{
                            position: 'absolute',
                            bottom: '8px',
                            right: '8px',
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            color: '#fff',
                            padding: '4px 8px',
                            borderRadius: '3px',
                            fontSize: '11px',
                            fontWeight: '600'
                        }}>
                            {show.totalEpisodes} ép.
                        </div>
                    </div>
                    
                    {/* Infos au hover */}
                    {isHovered && (
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
                                {show.showName}
                            </div>
                            
                            {/* Info saisons */}
                            <div style={{
                                color: '#46d369',
                                fontSize: '12px',
                                fontWeight: '600',
                                marginBottom: '4px'
                            }}>
                                {show.seasons.length} {t('videos.season')}{show.seasons.length > 1 ? 's' : ''}
                            </div>
                            
                            {/* Genres */}
                            {show.genres.length > 0 && (
                                <div style={{
                                    color: netflixTheme.text.secondary,
                                    fontSize: '11px',
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '4px'
                                }}>
                                    {show.genres.slice(0, 3).map((g, i) => (
                                        <span key={i}>{g}{i < Math.min(show.genres.length, 3) - 1 && ' •'}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
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

    // Modal détail série
    const SeriesDetailModal = ({ show, onClose }: { show: TVShow; onClose: () => void }) => {
        const [activeSeason, setActiveSeason] = useState(show.seasons[0]?.seasonNumber || 1);
        const currentSeason = show.seasons.find(s => s.seasonNumber === activeSeason);

        return (
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    zIndex: 1000,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    paddingTop: '50px',
                    overflowY: 'auto'
                }}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        width: '95%',
                        maxWidth: '900px',
                        backgroundColor: netflixTheme.bg.primary,
                        borderRadius: '8px',
                        overflow: 'hidden',
                        marginBottom: '50px'
                    }}
                >
                    {/* Header avec image */}
                    <div style={{
                        position: 'relative',
                        height: '400px',
                        backgroundImage: `url(${show.showThumbnail?.replace('/w500/', '/original/') || show.showThumbnail})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center top'
                    }}>
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'linear-gradient(to top, #141414 0%, transparent 50%)'
                        }} />
                        
                        {/* Bouton fermer */}
                        <button
                            onClick={onClose}
                            style={{
                                position: 'absolute',
                                top: '16px',
                                right: '16px',
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                backgroundColor: netflixTheme.bg.primary,
                                border: 'none',
                                cursor: 'pointer',
                                color: '#fff',
                                fontSize: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            ✕
                        </button>
                        
                        {/* Titre */}
                        <div style={{
                            position: 'absolute',
                            bottom: '30px',
                            left: '40px',
                            right: '40px'
                        }}>
                            <h1 style={{
                                fontSize: '42px',
                                fontWeight: '800',
                                color: '#fff',
                                marginBottom: '16px'
                            }}>
                                {show.showName}
                            </h1>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                {show.year && (
                                    <span style={{ color: '#46d369', fontWeight: '600' }}>{show.year}</span>
                                )}
                                <span style={{ color: netflixTheme.text.secondary }}>
                                    {show.seasons.length} {t('videos.season')}{show.seasons.length > 1 ? 's' : ''}
                                </span>
                                <span style={{ color: netflixTheme.text.secondary }}>
                                    {show.totalEpisodes} {t('videos.episode')}{show.totalEpisodes > 1 ? 's' : ''}
                                </span>
                            </div>
                            
                            {/* Bouton lecture */}
                            {currentSeason && currentSeason.episodes.length > 0 && (
                                <button
                                    onClick={() => handleVideoClick(currentSeason.episodes[0].file.file_id, currentSeason.episodes[0].file.category)}
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
                                        cursor: 'pointer'
                                    }}
                                >
                                    ▶ Lecture
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {/* Contenu */}
                    <div style={{ padding: '20px 40px 40px' }}>
                        {/* Description */}
                        {show.description && (
                            <p style={{
                                color: netflixTheme.text.primary,
                                fontSize: '15px',
                                lineHeight: '1.6',
                                marginBottom: '30px'
                            }}>
                                {show.description}
                            </p>
                        )}
                        
                        {/* Genres */}
                        {show.genres.length > 0 && (
                            <div style={{
                                color: netflixTheme.text.secondary,
                                fontSize: '14px',
                                marginBottom: '30px'
                            }}>
                                <strong style={{ color: netflixTheme.text.muted }}>Genres: </strong>
                                {show.genres.join(', ')}
                            </div>
                        )}
                        
                        {/* Sélecteur de saison */}
                        <div style={{ marginBottom: '20px' }}>
                            <select
                                value={activeSeason}
                                onChange={(e) => setActiveSeason(parseInt(e.target.value))}
                                style={{
                                    backgroundColor: netflixTheme.bg.secondary,
                                    color: netflixTheme.text.primary,
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    borderRadius: '4px',
                                    padding: '12px 20px',
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }}
                            >
                                {show.seasons.map(season => (
                                    <option key={season.seasonNumber} value={season.seasonNumber}>
                                        {t('videos.season')} {season.seasonNumber}
                                    </option>
                                ))}
                            </select>
                        </div>
                        
                        {/* Liste des épisodes */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {currentSeason?.episodes.map((episode) => (
                                <div
                                    key={episode.file.file_id}
                                    onClick={() => handleVideoClick(episode.file.file_id, episode.file.category)}
                                    style={{
                                        display: 'flex',
                                        gap: '16px',
                                        padding: '16px',
                                        backgroundColor: netflixTheme.bg.secondary,
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = netflixTheme.bg.hover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = netflixTheme.bg.secondary}
                                >
                                    {/* Numéro */}
                                    <div style={{
                                        fontSize: '24px',
                                        fontWeight: '600',
                                        color: netflixTheme.text.muted,
                                        width: '40px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {episode.episodeNumber}
                                    </div>
                                    
                                    {/* Thumbnail */}
                                    <div style={{
                                        width: '140px',
                                        aspectRatio: '16/9',
                                        backgroundColor: '#2a2a2a',
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                        position: 'relative'
                                    }}>
                                        {getThumbnailUrl(episode.file) ? (
                                            <img
                                                src={getThumbnailUrl(episode.file)!}
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
                                                fontSize: '24px'
                                            }}>
                                                📺
                                            </div>
                                        )}
                                        <div style={{
                                            position: 'absolute',
                                            top: '50%',
                                            left: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            width: '35px',
                                            height: '35px',
                                            borderRadius: '50%',
                                            backgroundColor: 'rgba(0,0,0,0.7)',
                                            border: '2px solid #fff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <span style={{ color: '#fff', fontSize: '14px', marginLeft: '2px' }}>▶</span>
                                        </div>
                                    </div>
                                    
                                    {/* Info */}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        <div style={{
                                            fontSize: '16px',
                                            fontWeight: '600',
                                            color: netflixTheme.text.primary,
                                            marginBottom: '4px'
                                        }}>
                                            {t('videos.episode')} {episode.episodeNumber}
                                        </div>
                                        {episode.file.duration && (
                                            <div style={{
                                                fontSize: '13px',
                                                color: netflixTheme.text.secondary
                                            }}>
                                                {formatDuration(episode.file.duration)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

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

    const hasContent = organizedSeries.unidentified.length > 0 || organizedSeries.tvShows.length > 0;

    return (
        <AuthGuard>
            <div style={{ minHeight: '100vh', backgroundColor: netflixTheme.bg.primary }}>
                <Navigation user={user!} onLogout={logout} />
                
                <div style={{ padding: '0 0 60px 0' }}>
                    <div style={{ padding: '20px 60px' }}>
                        <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                        <VideoSubCategoryBar selectedSubCategory="series" onSubCategoryChange={handleSubCategoryChange} />
                    </div>
                    
                    {/* Hero Banner */}
                    {heroShow && (
                        <div style={{
                            position: 'relative',
                            height: '500px',
                            marginBottom: '40px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundImage: `url(${heroShow.showThumbnail?.replace('/w500/', '/original/') || heroShow.showThumbnail})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center top',
                                filter: 'brightness(0.6)'
                            }} />
                            
                            <div style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                height: '200px',
                                background: 'linear-gradient(to top, #141414, transparent)'
                            }} />
                            
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                bottom: 0,
                                width: '50%',
                                background: 'linear-gradient(to right, rgba(20,20,20,0.9), transparent)'
                            }} />
                            
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
                                    {heroShow.showName}
                                </h1>
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                    {heroShow.year && (
                                        <span style={{ color: '#46d369', fontWeight: '600', fontSize: '18px' }}>{heroShow.year}</span>
                                    )}
                                    <span style={{ color: netflixTheme.text.secondary, fontSize: '16px' }}>
                                        {heroShow.seasons.length} {t('videos.season')}{heroShow.seasons.length > 1 ? 's' : ''}
                                    </span>
                                </div>
                                
                                {heroShow.description && (
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
                                        {heroShow.description}
                                    </p>
                                )}
                                
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button
                                        onClick={() => setSelectedShow(heroShow.showId)}
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
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ▶ Lecture
                                    </button>
                                    <button
                                        onClick={() => setSelectedShow(heroShow.showId)}
                                        style={{
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
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ℹ Plus d'infos
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Fichiers non identifiés */}
                    {organizedSeries.unidentified.length > 0 && (
                        <NetflixCarousel title={t('videos.unidentifiedFiles')} icon="📁">
                            {organizedSeries.unidentified.map((file) => (
                                <UnidentifiedCard key={file.file_id} file={file} />
                            ))}
                        </NetflixCarousel>
                    )}
                    
                    {/* Mes Séries */}
                    {organizedSeries.tvShows.length > 0 && (
                        <NetflixCarousel title={t('videos.mySeries')} icon="📺">
                            {organizedSeries.tvShows.map((show) => (
                                <SeriesCard
                                    key={show.showId}
                                    show={show}
                                    onClick={() => setSelectedShow(show.showId)}
                                />
                            ))}
                        </NetflixCarousel>
                    )}
                    
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
                
                {/* Modal détail série */}
                {selectedShow && (
                    <SeriesDetailModal
                        show={organizedSeries.tvShows.find(s => s.showId === selectedShow)!}
                        onClose={() => setSelectedShow(null)}
                    />
                )}
            </div>
        </AuthGuard>
    );
}
