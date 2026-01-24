// INFO : app/routes/reader.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useAuth } from '~/hooks/useAuth';
import { usePlayer } from '~/contexts/PlayerContext';
import { Navigation } from '~/components/navigation/Navigation';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { LoadingSpinner } from '~/components/ui/LoadingSpinner';
import { ErrorDisplay } from '~/components/ui/ErrorDisplay';
import { darkTheme } from '~/utils/ui/theme';
import type { FileCategory } from '~/utils/file/fileClassifier';

interface PlaylistTrack {
    file_id: string;
    title: string;
    filename: string;
    artists?: string;
    albums?: string;
    album_thumbnails?: string;
    thumbnail_url?: string;
    category: string;
}

interface LocationState {
    playlist?: PlaylistTrack[];
    playlistContext?: { type: 'artist' | 'album'; name: string };
    startIndex?: number;
    continuePlayback?: boolean;
    currentTime?: number;
}

export default function ReaderRoute() {
    const { user, logout } = useAuth();
    const { category: categoryParam, fileId: fileIdParam } = useParams<{ category: string; fileId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const player = usePlayer();
    const audioRef = useRef<HTMLAudioElement>(null);
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [fileInfo, setFileInfo] = useState<{ 
        title?: string; 
        filename?: string;
        artists?: string;
        albums?: string;
        album_thumbnails?: string;
        thumbnail_url?: string;
    } | null>(null);
    
    // Playlist states
    const [playlist, setPlaylist] = useState<PlaylistTrack[]>([]);
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
    const [showPlaylist, setShowPlaylist] = useState(false);
    const [playlistContext, setPlaylistContext] = useState<{ type: 'artist' | 'album'; name: string } | null>(null);
    
    // État pour le temps à restaurer (déclaré tôt pour être utilisé dans les effets)
    const [pendingSeekTime, setPendingSeekTime] = useState<number | null>(null);
    
    // État pour la progression de lecture
    const [currentProgress, setCurrentProgress] = useState<{ current_time: number; duration: number; progress_percent: number } | null>(null);
    const lastSavedProgress = useRef<number>(0);
    
    const category = categoryParam as FileCategory | null;
    const fileId = fileIdParam || '';
    
    // Récupérer la playlist depuis le state de navigation
    const locationState = location.state as LocationState | null;
    
    // Désactiver le mini player et récupérer le temps quand on est sur le reader
    useEffect(() => {
        // Si le player global est actif avec le même fichier, récupérer le temps
        const savedTime = player.state.fileId === fileId ? player.state.currentTime : 0;
        if (savedTime > 0) {
            setPendingSeekTime(savedTime);
        }
        // Désactiver le mini player mais ne pas arrêter le player 
        // (il sera arrêté quand le reader local prendra le relais)
        player.toggleMiniPlayer(false);
        // Ne pas appeler stop() ici car ça efface l'état avant qu'on puisse l'utiliser
    }, []);
    
    // Charger la playlist depuis le state de navigation
    useEffect(() => {
        if (locationState?.playlist && locationState.playlist.length > 0) {
            setPlaylist(locationState.playlist);
            
            if (locationState.playlistContext) {
                setPlaylistContext(locationState.playlistContext);
            }
            
            // Trouver l'index de la piste courante
            if (locationState.startIndex !== undefined) {
                setCurrentTrackIndex(locationState.startIndex);
            } else {
                const currentIndex = locationState.playlist.findIndex(t => t.file_id === fileId);
                if (currentIndex !== -1) {
                    setCurrentTrackIndex(currentIndex);
                }
            }
        }
        
        // Si on revient du mini player, sauvegarder le temps à restaurer
        if (locationState?.continuePlayback && locationState?.currentTime) {
            setPendingSeekTime(locationState.currentTime);
        }
    }, [locationState, fileId]);
    
    // Restaurer la position de lecture quand le média est prêt
    useEffect(() => {
        if (pendingSeekTime === null || !blobUrl || loading) return;
        
        const restorePlayback = () => {
            // Pour l'audio
            if (category === 'musics' && audioRef.current) {
                const handleCanPlay = () => {
                    if (pendingSeekTime > 0) {
                        audioRef.current!.currentTime = pendingSeekTime;
                    }
                    setPendingSeekTime(null);
                };
                
                if (audioRef.current.readyState >= 3) {
                    handleCanPlay();
                } else {
                    audioRef.current.addEventListener('canplay', handleCanPlay, { once: true });
                }
            }
            // Pour la vidéo
            else if (category === 'videos') {
                const videoEl = document.querySelector('video');
                if (videoEl) {
                    const handleCanPlay = () => {
                        if (pendingSeekTime > 0) {
                            videoEl.currentTime = pendingSeekTime;
                        }
                        setPendingSeekTime(null);
                    };
                    
                    if (videoEl.readyState >= 3) {
                        handleCanPlay();
                    } else {
                        videoEl.addEventListener('canplay', handleCanPlay, { once: true });
                    }
                }
            }
        };
        
        // Attendre un peu que le DOM soit prêt
        const timer = setTimeout(restorePlayback, 100);
        return () => clearTimeout(timer);
    }, [pendingSeekTime, blobUrl, loading, category]);
    
    useEffect(() => {
        if (!category || !fileId) {
            setError('Paramètres manquants');
            setLoading(false);
            return;
        }

        const loadFile = async () => {
            try {
                if (typeof window === 'undefined') return;
                
                const token = localStorage.getItem('videomi_token');
                if (!token) {
                    setError('Non authentifié');
                    setLoading(false);
                    return;
                }

                // Récupérer les infos du fichier (titre, nom, album, artiste)
                try {
                    const infoResponse = await fetch(
                        `https://videomi.uk/api/files/${category}/${fileId}/info`,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                    if (infoResponse.ok) {
                        const data = await infoResponse.json() as { file?: {
                            title?: string | null;
                            filename?: string | null;
                            artists?: string | null;
                            albums?: string | null;
                            album_thumbnails?: string | null;
                            thumbnail_url?: string | null;
                        } };
                        if (data.file) {
                            setFileInfo({
                                title: data.file.title ?? undefined,
                                filename: data.file.filename ?? undefined,
                                artists: data.file.artists ?? undefined,
                                albums: data.file.albums ?? undefined,
                                album_thumbnails: data.file.album_thumbnails ?? undefined,
                                thumbnail_url: data.file.thumbnail_url ?? undefined
                            });
                        }
                    }
                } catch (e) {
                    console.warn('Impossible de récupérer les infos du fichier:', e);
                }

                // Pour vidéo/audio, utiliser l'URL directe pour le streaming (pas de token nécessaire sur cette route)
                // Pour les autres fichiers, on peut télécharger le blob
                if (category === 'videos' || category === 'musics') {
                    // Utiliser l'URL directe pour streaming
                    const streamUrl = `https://videomi.uk/api/files/${category}/${fileId}`;
                    setBlobUrl(streamUrl);
                    setLoading(false);
                } else {
                    // Pour les autres fichiers (images, docs), télécharger en blob
                    const fileUrl = `https://videomi.uk/api/files/${category}/${fileId}`;
                    const response = await fetch(fileUrl, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (!response.ok) {
                        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
                    }

                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    setBlobUrl(url);
                    setLoading(false);
                }
            } catch (err) {
                console.error('Erreur chargement fichier:', err);
                setError(err instanceof Error ? err.message : 'Erreur de chargement');
                setLoading(false);
            }
        };

        loadFile();

        // Cleanup: révoquer le blob URL au démontage (seulement pour les blobs, pas les URLs directes)
        return () => {
            if (blobUrl && blobUrl.startsWith('blob:')) {
                URL.revokeObjectURL(blobUrl);
            }
        };
    }, [category, fileId]);
    

    const isVideo = (cat: FileCategory | null): boolean => cat === 'videos';
    const isAudio = (cat: FileCategory | null): boolean => cat === 'musics';
    const isImage = (cat: FileCategory | null): boolean => cat === 'images' || cat === 'raw_images';
    const isDocument = (cat: FileCategory | null): boolean => cat === 'documents';

    // Navigation dans la playlist
    const playTrack = useCallback((index: number) => {
        if (index >= 0 && index < playlist.length) {
            const track = playlist[index];
            setCurrentTrackIndex(index);
            // Naviguer vers la nouvelle piste en passant la playlist dans le state
            navigate(`/reader/${track.category}/${track.file_id}`, { 
                replace: true,
                state: {
                    playlist,
                    playlistContext,
                    startIndex: index
                }
            });
        }
    }, [playlist, playlistContext, navigate]);

    const playNext = useCallback(() => {
        if (currentTrackIndex < playlist.length - 1) {
            playTrack(currentTrackIndex + 1);
        }
    }, [currentTrackIndex, playlist.length, playTrack]);

    const playPrevious = useCallback(() => {
        if (currentTrackIndex > 0) {
            playTrack(currentTrackIndex - 1);
        }
    }, [currentTrackIndex, playTrack]);

    // Passer automatiquement à la piste suivante quand une piste se termine
    const handleTrackEnded = useCallback(() => {
        if (playlist.length > 0 && currentTrackIndex < playlist.length - 1) {
            playNext();
        }
    }, [playlist.length, currentTrackIndex, playNext]);

    // Fonction pour activer le mini player
    const handleMiniPlayer = () => {
        if (!blobUrl || (category !== 'musics' && category !== 'videos')) return;
        
        // Récupérer le temps actuel de lecture
        let currentTime = 0;
        if (category === 'musics' && audioRef.current) {
            currentTime = audioRef.current.currentTime;
        } else if (category === 'videos') {
            const videoEl = document.querySelector('video');
            if (videoEl) {
                currentTime = videoEl.currentTime;
            }
        }
        
        // Parser les infos pour le mini player
        let artist: string | null = null;
        let thumbnail: string | null = null;
        
        try {
            if (fileInfo?.artists) {
                try {
                    const parsed = typeof fileInfo.artists === 'string' ? JSON.parse(fileInfo.artists) : fileInfo.artists;
                    let artists: string[] = [];
                    if (Array.isArray(parsed)) {
                        artists = parsed.filter((a: any) => typeof a === 'string' && a.trim().length > 0);
                    } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                        artists = [parsed];
                    }
                    if (artists.length > 0) artist = artists[0];
                } catch {
                    // Si le parsing échoue, ignorer
                }
            }
            if (fileInfo?.album_thumbnails) {
                try {
                    const parsed = typeof fileInfo.album_thumbnails === 'string' ? JSON.parse(fileInfo.album_thumbnails) : fileInfo.album_thumbnails;
                    let thumbnails: string[] = [];
                    if (Array.isArray(parsed)) {
                        thumbnails = parsed.filter((t: any) => typeof t === 'string' && t.trim().length > 0);
                    } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                        thumbnails = [parsed];
                    }
                    if (thumbnails.length > 0) thumbnail = thumbnails[0];
                } catch {
                    // Si le parsing échoue, ignorer
                }
            }
            if (!thumbnail && fileInfo?.thumbnail_url) {
                thumbnail = fileInfo.thumbnail_url;
            }
        } catch {}
        
        // Calculer le titre
        const title = fileInfo?.title || fileInfo?.filename?.replace(/\.[^/.]+$/, '') || fileId;
        
        // Démarrer la lecture dans le contexte global avec le temps actuel ET en mode mini
        player.play({
            fileId,
            category: category!,
            fileUrl: blobUrl,
            title,
            artist: artist || undefined,
            thumbnail: thumbnail || undefined,
            type: category === 'musics' ? 'audio' : 'video',
            playlist,
            playlistContext: playlistContext || undefined,
            startIndex: currentTrackIndex,
            currentTime, // Passer le temps actuel
            startAsMiniPlayer: true // Démarrer directement en mode mini player
        });
        
        // Naviguer vers la page appropriée
        navigateBack();
    };
    
    const navigateBack = () => {
        if (category === 'musics') {
            navigate('/musics');
        } else if (category === 'images' || category === 'raw_images') {
            navigate('/images');
        } else if (category === 'documents') {
            navigate('/documents');
        } else {
            navigate('/films');
        }
    };
    
    const handleBack = () => {
        // Sauvegarder la progression finale avant de quitter
        if (category === 'videos' && currentProgress && user?.id) {
            const token = localStorage.getItem('auth_token');
            fetch(`https://videomi.uk/api/watch-progress/${fileId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    current_time: currentProgress.current_time,
                    duration: currentProgress.duration,
                    user_id: user.id
                })
            }).catch(error => {
                console.error('Erreur sauvegarde progression finale:', error);
            });
        }
        
        // Naviguer vers la page précédente
        navigateBack();
    };

    // Fonction pour nettoyer les chaînes JSON (retirer crochets, guillemets, etc.)
    const cleanString = (value: string | null | undefined): string => {
        if (!value) return '';
        let cleaned = value.trim();
        
        // Si c'est un JSON array, parser et prendre le premier élément
        if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
            try {
                const parsed = JSON.parse(cleaned);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    cleaned = typeof parsed[0] === 'string' ? parsed[0] : String(parsed[0]);
                }
            } catch {
                // Si le parsing échoue, essayer de nettoyer manuellement
                cleaned = cleaned.replace(/^\["?|"?\]$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, '');
            }
        }
        
        // Retirer les guillemets au début/fin
        cleaned = cleaned.replace(/^["']+|["']+$/g, '');
        
        return cleaned.trim();
    };
    
    const displayName = cleanString(fileInfo?.title) || cleanString(fileInfo?.filename)?.replace(/\.[^/.]+$/, '') || fileId;

    if (loading) {
        return (
            <AuthGuard>
                <div style={{ 
                    minHeight: '100vh', 
                    backgroundColor: '#000',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff'
                }}>
                    <div style={{ 
                        width: '60px', 
                        height: '60px', 
                        border: '4px solid rgba(255,255,255,0.2)',
                        borderTopColor: '#e50914',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <style>{`
                        @keyframes spin {
                            to { transform: rotate(360deg); }
                        }
                    `}</style>
                    <p style={{ marginTop: '20px', fontSize: '16px', color: '#b3b3b3' }}>
                        Chargement du fichier...
                    </p>
                </div>
            </AuthGuard>
        );
    }

    if (error || !category || !fileId) {
        const downloadUrl = blobUrl || (category && fileId ? `https://videomi.uk/api/files/${category}/${fileId}` : null);
        return (
            <AuthGuard>
                <div style={{ minHeight: '100vh', backgroundColor: darkTheme.background.primary }}>
                    <Navigation user={user!} onLogout={logout} />
                    <main style={{
                        maxWidth: 1400,
                        margin: '0 auto',
                        padding: '40px 20px',
                        textAlign: 'center'
                    }}>
                        <ErrorDisplay error={error || 'Fichier non trouvé'} />
                        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '20px' }}>
                            <button
                                onClick={handleBack}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: '#333',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '16px',
                                    fontWeight: '600'
                                }}
                            >
                                ← Retour
                            </button>
                            {downloadUrl && (
                                <a
                                    href={downloadUrl}
                                    download={fileId}
                                    style={{
                                        padding: '12px 24px',
                                        backgroundColor: '#e50914',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '16px',
                                        fontWeight: '600',
                                        textDecoration: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    ⬇️ Télécharger
                                </a>
                            )}
                        </div>
                    </main>
                </div>
            </AuthGuard>
        );
    }

    // Lecteur plein écran style Netflix
    if (isVideo(category) && blobUrl) {
        return (
            <AuthGuard>
                <div style={{ 
                    minHeight: '100vh', 
                    backgroundColor: '#000',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    {/* Header minimal */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        padding: '20px 30px',
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                        <button
                            onClick={handleBack}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 16px',
                                backgroundColor: 'rgba(255,255,255,0.1)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '600',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                        >
                            ← Retour
                        </button>
                        {/* Bouton Mini Player */}
                        <button
                            onClick={handleMiniPlayer}
                            aria-label="Mini lecteur"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '40px',
                                height: '40px',
                                backgroundColor: 'rgba(255,255,255,0.1)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '18px',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                        >
                            ⬇️
                        </button>
                        <h1 style={{
                            fontSize: '18px',
                            fontWeight: '600',
                            color: '#fff',
                            margin: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1
                        }}>
                            {displayName}
                        </h1>
                    </div>

                    {/* Lecteur vidéo */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <video
                            ref={(el) => {
                                if (el && category === 'videos') {
                                    // Sauvegarder la progression périodiquement
                                    const handleTimeUpdate = async () => {
                                        if (!user?.id || !el.duration) return;
                                        
                                        const current_time = el.currentTime;
                                        const duration = el.duration;
                                        const progress_percent = (current_time / duration) * 100;
                                        
                                        setCurrentProgress({ current_time, duration, progress_percent });
                                        
                                        // Sauvegarder toutes les 5 secondes ou si la progression change significativement
                                        if (Math.abs(progress_percent - lastSavedProgress.current) >= 5 || 
                                            Math.abs(current_time - lastSavedProgress.current * duration / 100) >= 5) {
                                            try {
                                                const token = localStorage.getItem('auth_token');
                                                await fetch(`https://videomi.uk/api/watch-progress/${fileId}`, {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'Authorization': `Bearer ${token}`
                                                    },
                                                    body: JSON.stringify({
                                                        current_time,
                                                        duration,
                                                        user_id: user.id
                                                    })
                                                });
                                                lastSavedProgress.current = progress_percent;
                                            } catch (error) {
                                                console.error('Erreur sauvegarde progression:', error);
                                            }
                                        }
                                    };
                                    
                                    // Détecter la fin de vidéo (100%)
                                    const handleEnded = () => {
                                        // La vidéo est terminée, rien à faire de spécial
                                    };
                                    
                                    el.addEventListener('timeupdate', handleTimeUpdate);
                                    el.addEventListener('ended', handleEnded);
                                    
                                    return () => {
                                        el.removeEventListener('timeupdate', handleTimeUpdate);
                                        el.removeEventListener('ended', handleEnded);
                                    };
                                }
                            }}
                            controls
                            autoPlay
                            style={{
                                width: '100%',
                                height: '100vh',
                                backgroundColor: '#000'
                            }}
                            onError={(e) => {
                                console.error('❌ [READER] Erreur vidéo:', e);
                                const extension = fileId.split('.').pop()?.toLowerCase();
                                if (extension === 'mkv' || extension === 'avi' || extension === 'wmv' || extension === 'flv') {
                                    setError(`Format ${extension?.toUpperCase()} non supporté par le navigateur. Téléchargez le fichier pour le lire avec VLC ou un autre lecteur.`);
                                } else {
                                    setError('Impossible de lire la vidéo. Format non supporté ou fichier inaccessible.');
                                }
                            }}
                        >
                            <source src={blobUrl} />
                            Votre navigateur ne supporte pas la lecture vidéo.
                        </video>
                    </div>
                </div>
            </AuthGuard>
        );
    }

    // Lecteur audio style Spotify/Apple Music
    if (isAudio(category) && blobUrl) {
        
        // Parser les infos de l'album
        let albumThumbnail: string | null = null;
        let albumName: string | null = null;
        let artistName: string | null = null;
        
        if (fileInfo) {
            try {
                if (fileInfo.album_thumbnails) {
                    try {
                        const parsed = typeof fileInfo.album_thumbnails === 'string' ? JSON.parse(fileInfo.album_thumbnails) : fileInfo.album_thumbnails;
                        let thumbnails: string[] = [];
                        if (Array.isArray(parsed)) {
                            thumbnails = parsed.filter((t: any) => typeof t === 'string' && t.trim().length > 0);
                        } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                            thumbnails = [parsed];
                        }
                        if (thumbnails.length > 0) albumThumbnail = thumbnails[0];
                    } catch {
                        // Si le parsing échoue, ignorer
                    }
                }
                if (!albumThumbnail && fileInfo.thumbnail_url) albumThumbnail = fileInfo.thumbnail_url;
                if (fileInfo.albums) {
                    try {
                        const parsed = typeof fileInfo.albums === 'string' ? JSON.parse(fileInfo.albums) : fileInfo.albums;
                        let albums: string[] = [];
                        if (Array.isArray(parsed)) {
                            albums = parsed.filter((a: any) => typeof a === 'string' && a.trim().length > 0);
                        } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                            albums = [parsed];
                        }
                        if (albums.length > 0) albumName = albums[0];
                    } catch {
                        // Si le parsing échoue, ignorer
                    }
                }
                if (fileInfo.artists) {
                    try {
                        const parsed = typeof fileInfo.artists === 'string' ? JSON.parse(fileInfo.artists) : fileInfo.artists;
                        let artists: string[] = [];
                        if (Array.isArray(parsed)) {
                            artists = parsed.filter((a: any) => typeof a === 'string' && a.trim().length > 0);
                        } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                            artists = [parsed];
                        }
                        if (artists.length > 0) artistName = artists[0];
                    } catch {
                        // Si le parsing échoue, ignorer
                    }
                }
            } catch (e) {
                console.warn('Erreur parsing infos album:', e);
            }
        }
        
        // Gradient de couleur basé sur la pochette ou dégradé violet/rose par défaut
        const gradientColors = albumThumbnail 
            ? 'linear-gradient(135deg, rgba(30,30,40,0.95) 0%, rgba(20,20,30,0.98) 50%, rgba(10,10,20,1) 100%)'
            : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f1a 100%)';
        
        return (
            <AuthGuard>
                <div style={{ 
                    minHeight: '100vh',
                    background: gradientColors,
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    {/* Background blur dynamique avec pochette */}
                    {albumThumbnail && (
                        <>
                            <div style={{
                                position: 'absolute',
                                top: '-20%',
                                left: '-10%',
                                width: '60%',
                                height: '80%',
                                backgroundImage: `url(${albumThumbnail})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                filter: 'blur(100px) saturate(1.5)',
                                opacity: 0.4,
                                transform: 'rotate(-5deg)'
                            }} />
                            <div style={{
                                position: 'absolute',
                                bottom: '-20%',
                                right: '-10%',
                                width: '50%',
                                height: '70%',
                                backgroundImage: `url(${albumThumbnail})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                filter: 'blur(80px) saturate(1.2)',
                                opacity: 0.3,
                                transform: 'rotate(10deg)'
                            }} />
                        </>
                    )}
                    
                    {/* Boutons flottants */}
                    <div style={{
                        position: 'fixed',
                        top: '24px',
                        left: '24px',
                        display: 'flex',
                        gap: '12px',
                        zIndex: 100
                    }}>
                        <button
                            onClick={handleBack}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '12px 20px',
                                background: 'rgba(255,255,255,0.08)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                color: '#fff',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '50px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500',
                                transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                                e.currentTarget.style.transform = 'scale(1.05)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                e.currentTarget.style.transform = 'scale(1)';
                            }}
                        >
                            ← Retour
                        </button>
                        {/* Bouton Mini Player */}
                        <button
                            onClick={handleMiniPlayer}
                            aria-label="Mini lecteur"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '44px',
                                height: '44px',
                                background: 'rgba(255,255,255,0.08)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                color: '#fff',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                fontSize: '18px',
                                transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                                e.currentTarget.style.transform = 'scale(1.1)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                e.currentTarget.style.transform = 'scale(1)';
                            }}
                        >
                            ⬇️
                        </button>
                    </div>

                    {/* Contenu principal centré */}
                    <div style={{ 
                        position: 'relative',
                        zIndex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 'calc(100vh - 120px)',
                        padding: '60px 40px 140px'
                    }}>
                        {/* Pochette avec effet 3D */}
                        <div style={{
                            position: 'relative',
                            marginBottom: '40px'
                        }}>
                            {/* Ombre portée */}
                            <div style={{
                                position: 'absolute',
                                bottom: '-20px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: '80%',
                                height: '40px',
                                background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, transparent 70%)',
                                filter: 'blur(15px)'
                            }} />
                            
                            {/* Pochette */}
                            <div style={{
                                width: '320px',
                                height: '320px',
                                borderRadius: '12px',
                                background: albumThumbnail ? 'transparent' : 'linear-gradient(135deg, #2a2a3e 0%, #1a1a2e 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 30px 60px rgba(0,0,0,0.4), 0 10px 20px rgba(0,0,0,0.3)',
                                overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.05)'
                            }}>
                                {albumThumbnail ? (
                                    <img 
                                        src={albumThumbnail} 
                                        alt={albumName || 'Album'} 
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover'
                                        }}
                                    />
                                ) : (
                                    <span style={{ fontSize: '100px', opacity: 0.6 }}>🎵</span>
                                )}
                            </div>
                        </div>

                        {/* Infos de la chanson */}
                        <div style={{ textAlign: 'center', maxWidth: '600px' }}>
                            <h1 style={{
                                fontSize: '32px',
                                fontWeight: '700',
                                color: '#fff',
                                margin: '0 0 12px 0',
                                letterSpacing: '-0.5px',
                                lineHeight: 1.2
                            }}>
                                {displayName}
                            </h1>
                            
                            {artistName && (
                                <p style={{
                                    fontSize: '20px',
                                    color: 'rgba(255,255,255,0.7)',
                                    margin: '0 0 6px 0',
                                    fontWeight: '500'
                                }}>
                                    {artistName}
                                </p>
                            )}
                            
                            {albumName && (
                                <p style={{
                                    fontSize: '16px',
                                    color: 'rgba(255,255,255,0.4)',
                                    margin: 0,
                                    fontWeight: '400'
                                }}>
                                    {albumName}
                                </p>
                            )}
                        </div>
                    </div>
                    
                    {/* Bouton Playlist si disponible */}
                    {playlist.length > 1 && (
                        <button
                            onClick={() => setShowPlaylist(!showPlaylist)}
                            style={{
                                position: 'fixed',
                                top: '24px',
                                right: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '12px 20px',
                                background: showPlaylist ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                color: '#fff',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '50px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500',
                                zIndex: 100,
                                transition: 'all 0.3s ease'
                            }}
                        >
                            🎵 {currentTrackIndex + 1}/{playlist.length}
                        </button>
                    )}

                    {/* Panel Playlist */}
                    {showPlaylist && playlist.length > 1 && (
                        <div style={{
                            position: 'fixed',
                            top: '80px',
                            right: '24px',
                            width: '350px',
                            maxHeight: 'calc(100vh - 200px)',
                            background: 'rgba(20,20,30,0.95)',
                            backdropFilter: 'blur(30px)',
                            WebkitBackdropFilter: 'blur(30px)',
                            borderRadius: '16px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            overflow: 'hidden',
                            zIndex: 99
                        }}>
                            <div style={{
                                padding: '16px 20px',
                                borderBottom: '1px solid rgba(255,255,255,0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#fff' }}>
                                        {playlistContext?.type === 'artist' ? '🎤 Artiste' : '💿 Album'}
                                    </h3>
                                    <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>
                                        {playlistContext?.name}
                                    </p>
                                </div>
                                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                                    {playlist.length} titres
                                </span>
                            </div>
                            <div style={{
                                maxHeight: '400px',
                                overflowY: 'auto'
                            }}>
                                {playlist.map((track, index) => {
                                    const isPlaying = index === currentTrackIndex;
                                    const trackTitle = cleanString(track.title) || cleanString(track.filename)?.replace(/\.[^/.]+$/, '') || 'Sans titre';
                                    return (
                                        <div
                                            key={track.file_id}
                                            onClick={() => playTrack(index)}
                                            style={{
                                                padding: '12px 20px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                cursor: 'pointer',
                                                background: isPlaying ? 'rgba(255,255,255,0.1)' : 'transparent',
                                                borderLeft: isPlaying ? '3px solid #1db954' : '3px solid transparent',
                                                transition: 'all 0.2s ease'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isPlaying) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isPlaying) e.currentTarget.style.background = 'transparent';
                                            }}
                                        >
                                            <span style={{
                                                width: '24px',
                                                textAlign: 'center',
                                                fontSize: '14px',
                                                color: isPlaying ? '#1db954' : 'rgba(255,255,255,0.4)'
                                            }}>
                                                {isPlaying ? '▶' : index + 1}
                                            </span>
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <p style={{
                                                    margin: 0,
                                                    fontSize: '14px',
                                                    fontWeight: isPlaying ? '600' : '400',
                                                    color: isPlaying ? '#1db954' : '#fff',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}>
                                                    {trackTitle}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Barre de lecture en bas - style glassmorphism */}
                    <div style={{
                        position: 'fixed',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        padding: '16px 24px 24px',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.8) 50%, transparent 100%)',
                        zIndex: 50
                    }}>
                        <div style={{
                            maxWidth: '900px',
                            margin: '0 auto',
                            background: 'rgba(255,255,255,0.05)',
                            backdropFilter: 'blur(30px)',
                            WebkitBackdropFilter: 'blur(30px)',
                            borderRadius: '16px',
                            padding: '16px 24px',
                            border: '1px solid rgba(255,255,255,0.08)'
                        }}>
                            {/* Contrôles de navigation si playlist */}
                            {playlist.length > 1 && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '24px',
                                    marginBottom: '12px'
                                }}>
                                    <button
                                        onClick={playPrevious}
                                        disabled={currentTrackIndex === 0}
                                        aria-label="Piste précédente"
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: currentTrackIndex === 0 ? 'rgba(255,255,255,0.4)' : '#fff',
                                            fontSize: '24px',
                                            cursor: currentTrackIndex === 0 ? 'not-allowed' : 'pointer',
                                            padding: '8px',
                                            transition: 'transform 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (currentTrackIndex > 0) e.currentTarget.style.transform = 'scale(1.2)';
                                        }}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        ⏮
                                    </button>
                                    <button
                                        onClick={playNext}
                                        disabled={currentTrackIndex === playlist.length - 1}
                                        aria-label="Piste suivante"
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: currentTrackIndex === playlist.length - 1 ? 'rgba(255,255,255,0.4)' : '#fff',
                                            fontSize: '24px',
                                            cursor: currentTrackIndex === playlist.length - 1 ? 'not-allowed' : 'pointer',
                                            padding: '8px',
                                            transition: 'transform 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (currentTrackIndex < playlist.length - 1) e.currentTarget.style.transform = 'scale(1.2)';
                                        }}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        ⏭
                                    </button>
                                </div>
                            )}
                            <audio
                                key={fileId}
                                ref={audioRef}
                                controls
                                autoPlay
                                src={blobUrl || undefined}
                                style={{
                                    width: '100%',
                                    height: '40px',
                                    borderRadius: '8px'
                                }}
                                onEnded={handleTrackEnded}
                                onError={(e) => {
                                    console.error('❌ [READER] Erreur audio:', e);
                                    setError('Impossible de lire le fichier audio.');
                                }}
                            />
                        </div>
                    </div>
                </div>
            </AuthGuard>
        );
    }

    // Affichage image
    if (isImage(category) && blobUrl) {
        return (
            <AuthGuard>
                <div style={{ 
                    minHeight: '100vh', 
                    backgroundColor: '#0a0a0a',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '20px 30px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '20px',
                        backgroundColor: '#141414'
                    }}>
                        <button
                            onClick={handleBack}
                            style={{
                                padding: '10px 16px',
                                backgroundColor: 'rgba(255,255,255,0.1)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '600'
                            }}
                        >
                            ← Retour
                        </button>
                        <h1 style={{
                            fontSize: '18px',
                            fontWeight: '600',
                            color: '#fff',
                            margin: 0
                        }}>
                            {displayName}
                        </h1>
                    </div>

                    {/* Image */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px'
                    }}>
                        <img
                            src={blobUrl}
                            alt={displayName}
                            style={{
                                maxWidth: '100%',
                                maxHeight: 'calc(100vh - 100px)',
                                objectFit: 'contain',
                                borderRadius: '4px'
                            }}
                        />
                    </div>
                </div>
            </AuthGuard>
        );
    }

    // Document (PDF, etc.)
    if (isDocument(category) && blobUrl) {
        return (
            <AuthGuard>
                <div style={{ 
                    minHeight: '100vh', 
                    backgroundColor: '#0a0a0a',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '20px 30px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '20px',
                        backgroundColor: '#141414'
                    }}>
                        <button
                            onClick={handleBack}
                            style={{
                                padding: '10px 16px',
                                backgroundColor: 'rgba(255,255,255,0.1)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '600'
                            }}
                        >
                            ← Retour
                        </button>
                        <h1 style={{
                            fontSize: '18px',
                            fontWeight: '600',
                            color: '#fff',
                            margin: 0
                        }}>
                            {displayName}
                        </h1>
                    </div>

                    {/* Document */}
                    <div style={{ flex: 1, padding: '20px' }}>
                        <iframe
                            src={blobUrl}
                            style={{
                                width: '100%',
                                height: 'calc(100vh - 120px)',
                                border: 'none',
                                borderRadius: '4px',
                                backgroundColor: '#fff'
                            }}
                            title={displayName}
                        />
                    </div>
                </div>
            </AuthGuard>
        );
    }

    // Fichier non supporté - téléchargement
    return (
        <AuthGuard>
            <div style={{ 
                minHeight: '100vh', 
                backgroundColor: '#0a0a0a',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px'
            }}>
                <button
                    onClick={handleBack}
                    style={{
                        position: 'absolute',
                        top: '30px',
                        left: '30px',
                        padding: '10px 16px',
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600'
                    }}
                >
                    ← Retour
                </button>

                <div style={{ fontSize: '80px', marginBottom: '30px' }}>📁</div>
                <h1 style={{
                    fontSize: '24px',
                    fontWeight: '600',
                    color: '#fff',
                    marginBottom: '16px'
                }}>
                    {displayName}
                </h1>
                <p style={{
                    fontSize: '16px',
                    color: '#b3b3b3',
                    marginBottom: '30px'
                }}>
                    Ce type de fichier ne peut pas être lu directement
                </p>
                {blobUrl && (
                    <a
                        href={blobUrl}
                        download={fileInfo?.filename || fileId}
                        style={{
                            display: 'inline-block',
                            padding: '14px 28px',
                            backgroundColor: '#e50914',
                            color: '#fff',
                            borderRadius: '4px',
                            textDecoration: 'none',
                            fontSize: '16px',
                            fontWeight: '600'
                        }}
                    >
                        Télécharger le fichier
                    </a>
                )}
            </div>
        </AuthGuard>
    );
}
