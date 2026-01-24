// INFO : app/routes/info.tsx
// Page d'info/détail style Netflix pour films et séries

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useAuth } from '~/hooks/useAuth';
import { useConfig } from '~/hooks/useConfig';
import { Navigation } from '~/components/navigation/Navigation';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { LoadingSpinner } from '~/components/ui/LoadingSpinner';
import { ErrorDisplay } from '~/components/ui/ErrorDisplay';
import { formatDuration } from '~/utils/format';
import { useLanguage } from '~/contexts/LanguageContext';
import { StarRating } from '~/components/ui/StarRating';
import { handleCacheInvalidation } from '~/utils/cache/cacheInvalidation';

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
    episode_description: string | null;
    collection_name: string | null;
    description: string | null;
}

interface WatchProgress {
    file_id: string;
    current_time: number;
    duration: number;
    progress_percent: number;
    last_watched: number;
}

interface Episode {
    file: FileItem;
    episodeNumber: number;
    title: string;
}

interface Season {
    seasonNumber: number;
    seasonName: string;
    episodes: Episode[];
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

export default function InfoRoute() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const { config } = useConfig();
    const navigate = useNavigate();
    const location = useLocation();
    const { category, fileId } = useParams<{ category: string; fileId: string }>();
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [file, setFile] = useState<FileItem | null>(null);
    const [watchProgress, setWatchProgress] = useState<WatchProgress | null>(null);
    const [relatedFiles, setRelatedFiles] = useState<FileItem[]>([]);
    const [isTVShow, setIsTVShow] = useState(false);
    const [seasons, setSeasons] = useState<Season[]>([]);
    const [selectedSeason, setSelectedSeason] = useState<number>(1);
    const [userRating, setUserRating] = useState<number | null>(null);
    const [averageRating, setAverageRating] = useState<number | null>(null);

    useEffect(() => {
        const fetchFileInfo = async () => {
            if (!user?.id || !fileId) return;

            setLoading(true);
            setError(null);

            try {
                // Récupérer les infos du fichier
                const token = localStorage.getItem('videomi_token');
                const response = await fetch(`https://videomi.uk/api/upload/user/${user.id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Erreur lors de la récupération des fichiers');
                }

                const data = await response.json();
                const foundFile = data.files?.find((f: FileItem) => f.file_id === fileId);

                if (!foundFile) {
                    throw new Error('Fichier non trouvé');
                }

                setFile(foundFile);

                // Détecter si c'est une série
                const filenameForPattern = foundFile.filename?.replace(/\.[^/.]+$/, '') || '';
                const isTVShow = /\bS\d{1,2}E\d{1,2}\b/i.test(filenameForPattern) ||
                               (/\bS\d{1,2}\b/i.test(filenameForPattern) && /\bE\d{1,2}\b/i.test(filenameForPattern)) ||
                               foundFile.source_api === 'tmdb_tv';
                
                setIsTVShow(isTVShow);

                // Si c'est une série, organiser les épisodes par saison
                if (isTVShow && foundFile.source_id) {
                    const showSourceId = foundFile.source_id;
                    const allEpisodes = data.files?.filter((f: FileItem) => {
                        if (f.source_api !== 'tmdb_tv') return false;
                        return f.source_id === showSourceId;
                    }) || [];

                    // Organiser par saison
                    const seasonsMap = new Map<number, Episode[]>();
                    
                    for (const episodeFile of allEpisodes) {
                        let seasonNum = episodeFile.season || 0;
                        let episodeNum = episodeFile.episode || 0;
                        
                        // Extraire S/E du filename si pas dans les métadonnées
                        if (seasonNum === 0 || episodeNum === 0) {
                            const epFilename = episodeFile.filename?.replace(/\.[^/.]+$/, '') || '';
                            const combinedMatch = epFilename.match(/\bS(\d{1,2})E(\d{1,2})\b/i);
                            if (combinedMatch) {
                                seasonNum = parseInt(combinedMatch[1]);
                                episodeNum = parseInt(combinedMatch[2]);
                            } else {
                                const seasonMatch = epFilename.match(/\bS(\d{1,2})\b/i);
                                const episodeMatch = epFilename.match(/\bE(\d{1,2})\b/i);
                                if (seasonMatch) seasonNum = parseInt(seasonMatch[1]);
                                if (episodeMatch) episodeNum = parseInt(episodeMatch[1]);
                            }
                        }
                        
                        if (seasonNum > 0 && episodeNum > 0) {
                            if (!seasonsMap.has(seasonNum)) {
                                seasonsMap.set(seasonNum, []);
                            }
                            seasonsMap.get(seasonNum)!.push({
                                file: episodeFile,
                                episodeNumber: episodeNum,
                                title: episodeFile.title || `${t('videos.episode')} ${episodeNum}`
                            });
                        }
                    }
                    
                    // Convertir en tableau et trier
                    const organizedSeasons = Array.from(seasonsMap.entries())
                        .map(([seasonNumber, episodes]) => ({
                            seasonNumber,
                            seasonName: `${t('videos.season')} ${seasonNumber}`,
                            episodes: episodes.sort((a, b) => a.episodeNumber - b.episodeNumber)
                        }))
                        .sort((a, b) => a.seasonNumber - b.seasonNumber);
                    
                    setSeasons(organizedSeasons);
                    if (organizedSeasons.length > 0) {
                        setSelectedSeason(organizedSeasons[0].seasonNumber);
                    }
                }

                // Récupérer la progression de lecture
                try {
                    const progressResponse = await fetch(`https://videomi.uk/api/watch-progress/${fileId}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (progressResponse.ok) {
                        const progressData = await progressResponse.json();
                        setWatchProgress(progressData);
                    }
                } catch (err) {
                    console.warn('Impossible de récupérer la progression:', err);
                }

                // Récupérer les fichiers similaires (même genre ou collection)
                // Pour les séries, exclure les épisodes de la même série
                const related = data.files?.filter((f: FileItem) => {
                    if (f.file_id === fileId) return false;
                    if (f.category !== foundFile.category) return false;
                    
                    // Exclure les épisodes de la même série si c'est une série
                    if (isTVShow && foundFile.source_id && f.source_id === foundFile.source_id) {
                        return false;
                    }
                    
                    // Même collection
                    if (foundFile.collection_id && f.collection_id === foundFile.collection_id) return true;
                    
                    // Même genre
                    if (foundFile.genres && f.genres) {
                        const fileGenres = JSON.parse(foundFile.genres);
                        const foundGenres = JSON.parse(foundFile.genres);
                        return fileGenres.some((g: string) => foundGenres.includes(g));
                    }
                    
                    return false;
                }).slice(0, 10) || [];

                setRelatedFiles(related);

            } catch (err) {
                setError(err instanceof Error ? err.message : 'Erreur inconnue');
            } finally {
                setLoading(false);
            }
        };

        fetchFileInfo();
    }, [user?.id, fileId, location]);
    
    // Charger les notes (personnelle et moyenne globale)
    useEffect(() => {
        const fetchRatings = async () => {
            if (!user?.id || !fileId) return;
            
            try {
                const token = localStorage.getItem('videomi_token');
                const response = await fetch(`https://videomi.uk/api/ratings/${fileId}?user_id=${user.id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json() as { userRating: number | null; averageRating: number | null };
                    setUserRating(data.userRating);
                    setAverageRating(data.averageRating);
                }
            } catch (error) {
                console.error('Erreur chargement notes:', error);
            }
        };
        
        fetchRatings();
    }, [user?.id, fileId]);
    
    // Fonction pour sauvegarder une note
    const handleRate = async (rating: number) => {
        if (!user?.id || !fileId) return;
        
        try {
            const token = localStorage.getItem('videomi_token');
            const response = await fetch(`https://videomi.uk/api/ratings/${fileId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    rating,
                    user_id: user.id
                })
            });
            
            if (response.ok) {
                const data = await response.json() as { userRating: number; averageRating: number | null };
                setUserRating(data.userRating);
                setAverageRating(data.averageRating);
                
                // Invalider le cache après un nouveau rating (doc: invalidation rating:new)
                await handleCacheInvalidation({
                    type: 'rating:new',
                    userId: user.id,
                    fileId: fileId,
                });
            }
        } catch (error) {
            console.error('Erreur sauvegarde note:', error);
        }
    };

    const getThumbnailUrl = (file: FileItem): string | null => {
        if (file.thumbnail_r2_path) {
            const match = file.thumbnail_r2_path.match(/thumbnail\.(\w+)$/);
            if (match) return `https://videomi.uk/api/files/videos/${file.file_id}/thumbnail.${match[1]}`;
        }
        return file.thumbnail_url || null;
    };

    const handlePlay = async () => {
        if (!file) return;
        
        // Si c'est une série, rediriger vers le premier épisode de la première saison
        if (isTVShow && seasons.length > 0) {
            const firstSeason = seasons[0];
            if (firstSeason.episodes.length > 0) {
                const firstEpisode = firstSeason.episodes[0];
                
                // Récupérer la progression spécifique du premier épisode
                let episodeProgress: WatchProgress | null = null;
                try {
                    const token = localStorage.getItem('videomi_token');
                    const progressResponse = await fetch(`https://videomi.uk/api/watch-progress/${firstEpisode.file.file_id}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    if (progressResponse.ok) {
                        episodeProgress = await progressResponse.json();
                    }
                } catch (err) {
                    console.warn('Impossible de récupérer la progression:', err);
                }
                
                // Lancer directement la lecture, pas vers /info
                navigate(`/reader/${firstEpisode.file.category}/${firstEpisode.file.file_id}`, {
                    state: {
                        continuePlayback: episodeProgress ? true : false,
                        currentTime: episodeProgress?.current_time || 0
                    }
                });
                return;
            }
        }
        
        // Sinon, rediriger vers le fichier actuel (film)
        navigate(`/reader/${file.category}/${file.file_id}`, {
            state: {
                continuePlayback: watchProgress ? true : false,
                currentTime: watchProgress?.current_time || 0
            }
        });
    };

    if (loading) {
        return (
            <AuthGuard>
                {user && <Navigation user={user} onLogout={logout} />}
                <div style={{ minHeight: '100vh', backgroundColor: netflixTheme.bg.primary, paddingTop: '80px' }}>
                    <LoadingSpinner />
                </div>
            </AuthGuard>
        );
    }

    if (error || !file) {
        return (
            <AuthGuard>
                {user && <Navigation user={user} onLogout={logout} />}
                <div style={{ minHeight: '100vh', backgroundColor: netflixTheme.bg.primary, paddingTop: '80px' }}>
                    <ErrorDisplay message={error || 'Fichier non trouvé'} />
                </div>
            </AuthGuard>
        );
    }

    const thumbnailUrl = getThumbnailUrl(file);
    // Utiliser backdrop_url pour la bannière (poster original), distinct de thumbnail_url (backdrop/still)
    const backdropUrl = file.backdrop_url;
    
    // Debug: vérifier que les deux images sont différentes
    console.log('🔍 [INFO] Images pour', file.file_id, ':', {
        backdrop_url: backdropUrl,
        thumbnail_url: thumbnailUrl,
        sontIdentiques: backdropUrl && thumbnailUrl && backdropUrl === thumbnailUrl
    });
    
    if (backdropUrl && thumbnailUrl && backdropUrl === thumbnailUrl) {
        console.warn('⚠️ backdrop_url et thumbnail_url sont identiques pour', file.file_id, backdropUrl);
    }
    const genres = file.genres ? JSON.parse(file.genres) : [];
    const displayName = file.title || file.filename?.replace(/\.[^/.]+$/, '') || 'Sans titre';

    return (
        <AuthGuard>
            {user && <Navigation user={user} onLogout={logout} />}
            <div style={{ 
                minHeight: '100vh', 
                backgroundColor: netflixTheme.bg.primary,
                paddingTop: '80px'
            }}>
                {/* Hero Section avec backdrop */}
                <div style={{
                    position: 'relative',
                    width: '100%',
                    height: '80vh',
                    minHeight: '500px',
                    overflow: 'hidden'
                }}>
                    {/* Backdrop Image */}
                    {backdropUrl && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            backgroundImage: `url(${backdropUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center center',
                            filter: 'brightness(0.4)'
                        }} />
                    )}

                    {/* Gradient overlay vertical (bas) */}
                    <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '60%',
                        background: 'linear-gradient(to top, rgba(20,20,20,1) 0%, rgba(20,20,20,0.7) 40%, transparent 100%)'
                    }} />
                    
                    {/* Gradient latéral (gauche) - style Netflix */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        bottom: 0,
                        width: '50%',
                        background: 'linear-gradient(to right, rgba(20,20,20,1) 0%, rgba(20,20,20,0.9) 30%, rgba(20,20,20,0.5) 60%, transparent 100%)',
                        zIndex: 1
                    }} />

                    {/* Content */}
                    <div style={{
                        position: 'relative',
                        zIndex: 2,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        padding: '0 60px 80px 60px',
                        maxWidth: '1400px',
                        margin: '0 auto'
                    }}>
                        <h1 style={{
                            fontSize: '64px',
                            fontWeight: '700',
                            color: netflixTheme.text.primary,
                            marginBottom: '16px',
                            textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
                        }}>
                            {displayName}
                        </h1>

                        <div style={{
                            display: 'flex',
                            gap: '16px',
                            marginBottom: '24px',
                            flexWrap: 'wrap'
                        }}>
                            {file.year && (
                                <span style={{
                                    color: '#46d369',
                                    fontSize: '18px',
                                    fontWeight: '600'
                                }}>
                                    {file.year}
                                </span>
                            )}
                            {file.duration && (
                                <span style={{
                                    color: netflixTheme.text.secondary,
                                    fontSize: '18px'
                                }}>
                                    {formatDuration(file.duration)}
                                </span>
                            )}
                            {genres.length > 0 && (
                                <span style={{
                                    color: netflixTheme.text.secondary,
                                    fontSize: '18px'
                                }}>
                                    {genres.join(' • ')}
                                </span>
                            )}
                        </div>

                        {file.description && (
                            <p style={{
                                color: netflixTheme.text.primary,
                                fontSize: '20px',
                                lineHeight: '1.5',
                                maxWidth: '600px',
                                marginBottom: '24px',
                                textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
                            }}>
                                {file.description}
                            </p>
                        )}
                        
                        {/* Système de notation */}
                        <div style={{
                            marginBottom: '24px'
                        }}>
                            <StarRating
                                userRating={userRating}
                                averageRating={averageRating}
                                onRate={handleRate}
                            />
                        </div>

                        {/* Progress bar si progression existante */}
                        {watchProgress && watchProgress.progress_percent > 5 && (
                            <div style={{
                                width: '100%',
                                maxWidth: '600px',
                                marginBottom: '24px'
                            }}>
                                <div style={{
                                    width: '100%',
                                    height: '4px',
                                    backgroundColor: 'rgba(255,255,255,0.3)',
                                    borderRadius: '2px',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        width: `${watchProgress.progress_percent}%`,
                                        height: '100%',
                                        backgroundColor: netflixTheme.accent.red,
                                        transition: 'width 0.3s ease'
                                    }} />
                                </div>
                                <div style={{
                                    color: netflixTheme.text.secondary,
                                    fontSize: '14px',
                                    marginTop: '8px'
                                }}>
                                    Reprendre à {formatDuration(watchProgress.current_time)}
                                </div>
                            </div>
                        )}

                        {/* Action buttons */}
                        <div style={{
                            display: 'flex',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <button
                                onClick={handlePlay}
                                style={{
                                    padding: '12px 32px',
                                    fontSize: '18px',
                                    fontWeight: '600',
                                    backgroundColor: netflixTheme.accent.red,
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'background-color 0.2s',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = netflixTheme.accent.redHover}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = netflixTheme.accent.red}
                            >
                                <span>▶</span>
                                <span>{watchProgress && watchProgress.progress_percent > 5 ? 'Reprendre' : 'Lecture'}</span>
                            </button>

                            <button
                                style={{
                                    padding: '12px 32px',
                                    fontSize: '18px',
                                    fontWeight: '600',
                                    backgroundColor: 'rgba(255,255,255,0.2)',
                                    color: '#fff',
                                    border: '2px solid rgba(255,255,255,0.5)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.3)';
                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.8)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
                                }}
                            >
                                <span>+</span>
                                <span>Ma liste</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Saisons et épisodes pour les séries */}
                {isTVShow && seasons.length > 0 && (
                    <div style={{
                        padding: '40px 60px',
                        maxWidth: '1400px',
                        margin: '0 auto'
                    }}>
                        {/* Sélecteur de saison */}
                        <div style={{ marginBottom: '24px' }}>
                            <select
                                value={selectedSeason}
                                onChange={(e) => setSelectedSeason(parseInt(e.target.value))}
                                style={{
                                    backgroundColor: netflixTheme.bg.secondary,
                                    color: netflixTheme.text.primary,
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    borderRadius: '4px',
                                    padding: '12px 20px',
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    minWidth: '200px'
                                }}
                            >
                                {seasons.map(season => (
                                    <option key={season.seasonNumber} value={season.seasonNumber}>
                                        {season.seasonName}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Liste des épisodes */}
                        {seasons.find(s => s.seasonNumber === selectedSeason) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {seasons.find(s => s.seasonNumber === selectedSeason)!.episodes.map((episode) => {
                                    const episodeThumbnail = getThumbnailUrl(episode.file);
                                    const episodeProgress = watchProgress?.file_id === episode.file.file_id ? watchProgress : null;
                                    
                                    return (
                                        <div
                                            key={episode.file.file_id}
                                            onClick={() => {
                                                // Lancer directement la lecture, pas vers /info
                                                navigate(`/reader/${episode.file.category}/${episode.file.file_id}`, {
                                                    state: {
                                                        continuePlayback: episodeProgress ? true : false,
                                                        currentTime: episodeProgress?.current_time || 0
                                                    }
                                                });
                                            }}
                                            style={{
                                                display: 'flex',
                                                gap: '16px',
                                                padding: '16px',
                                                backgroundColor: netflixTheme.bg.secondary,
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                transition: 'background-color 0.2s',
                                                position: 'relative'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = netflixTheme.bg.hover}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = netflixTheme.bg.secondary}
                                        >
                                            {/* Numéro d'épisode */}
                                            <div style={{
                                                fontSize: '24px',
                                                fontWeight: '600',
                                                color: netflixTheme.text.muted,
                                                width: '40px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0
                                            }}>
                                                {episode.episodeNumber}
                                            </div>
                                            
                                            {/* Thumbnail */}
                                            <div style={{
                                                width: '280px',
                                                aspectRatio: '16/9',
                                                backgroundColor: '#2a2a2a',
                                                borderRadius: '4px',
                                                overflow: 'hidden',
                                                flexShrink: 0,
                                                position: 'relative'
                                            }}>
                                                {episodeThumbnail ? (
                                                    <img
                                                        src={episodeThumbnail}
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
                                                        fontSize: '48px'
                                                    }}>
                                                        📺
                                                    </div>
                                                )}
                                                
                                                {/* Badge durée */}
                                                {episode.file.duration && (
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
                                                        {formatDuration(episode.file.duration)}
                                                    </div>
                                                )}
                                                
                                                {/* Barre de progression si regardé */}
                                                {episodeProgress && episodeProgress.progress_percent > 5 && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        bottom: 0,
                                                        left: 0,
                                                        right: 0,
                                                        height: '4px',
                                                        backgroundColor: 'rgba(255,255,255,0.3)'
                                                    }}>
                                                        <div style={{
                                                            width: `${episodeProgress.progress_percent}%`,
                                                            height: '100%',
                                                            backgroundColor: netflixTheme.accent.red,
                                                            transition: 'width 0.3s ease'
                                                        }} />
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Infos épisode */}
                                            <div style={{
                                                flex: 1,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'center',
                                                gap: '8px'
                                            }}>
                                                <div style={{
                                                    fontSize: '18px',
                                                    fontWeight: '600',
                                                    color: netflixTheme.text.primary
                                                }}>
                                                    {episode.title}
                                                </div>
                                                
                                                {(episode.file.episode_description || episode.file.description) && (
                                                    <div style={{
                                                        fontSize: '14px',
                                                        color: netflixTheme.text.secondary,
                                                        lineHeight: '1.5',
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical',
                                                        overflow: 'hidden'
                                                    }}>
                                                        {episode.file.episode_description || episode.file.description}
                                                    </div>
                                                )}
                                                
                                                {episodeProgress && episodeProgress.progress_percent > 5 && (
                                                    <div style={{
                                                        fontSize: '12px',
                                                        color: netflixTheme.text.muted
                                                    }}>
                                                        Reprendre à {formatDuration(episodeProgress.current_time)}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Bouton play */}
                                            <div 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/reader/${episode.file.category}/${episode.file.file_id}`, {
                                                        state: {
                                                            continuePlayback: episodeProgress ? true : false,
                                                            currentTime: episodeProgress?.current_time || 0
                                                        }
                                                    });
                                                }}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: '48px',
                                                    height: '48px',
                                                    borderRadius: '50%',
                                                    backgroundColor: netflixTheme.accent.red,
                                                    color: '#fff',
                                                    fontSize: '20px',
                                                    flexShrink: 0,
                                                    cursor: 'pointer',
                                                    transition: 'transform 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                            >
                                                ▶
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Related content - seulement pour les films */}
                {!isTVShow && relatedFiles.length > 0 && (
                    <div style={{
                        padding: '40px 60px',
                        maxWidth: '1400px',
                        margin: '0 auto'
                    }}>
                        <h2 style={{
                            fontSize: '24px',
                            fontWeight: '700',
                            color: netflixTheme.text.primary,
                            marginBottom: '24px'
                        }}>
                            Contenu similaire
                        </h2>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                            gap: '16px'
                        }}>
                            {relatedFiles.map((relatedFile) => {
                                const relatedThumbnail = getThumbnailUrl(relatedFile);
                                const relatedName = relatedFile.title || relatedFile.filename?.replace(/\.[^/.]+$/, '') || 'Sans titre';
                                
                                return (
                                    <div
                                        key={relatedFile.file_id}
                                        onClick={() => navigate(`/info/${relatedFile.category}/${relatedFile.file_id}`)}
                                        style={{
                                            cursor: 'pointer',
                                            transition: 'transform 0.2s',
                                            borderRadius: '6px',
                                            overflow: 'hidden',
                                            backgroundColor: netflixTheme.bg.card
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        <div style={{
                                            width: '100%',
                                            aspectRatio: '2/3',
                                            backgroundColor: '#2a2a2a',
                                            position: 'relative'
                                        }}>
                                            {relatedThumbnail ? (
                                                <img
                                                    src={relatedThumbnail}
                                                    alt={relatedName}
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
                                        </div>
                                        <div style={{
                                            padding: '12px',
                                            color: netflixTheme.text.primary,
                                            fontSize: '14px',
                                            fontWeight: '600',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {relatedName}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
