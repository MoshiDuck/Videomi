// INFO : app/contexts/PlayerContext.tsx
import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

// Clé pour le stockage de session
const PLAYER_STATE_KEY = 'videomi_player_state';

// Structure de l'état persisté
interface PersistedPlayerState {
    fileId: string | null;
    category: string | null;
    fileUrl: string | null;
    title: string | null;
    artist: string | null;
    thumbnail: string | null;
    type: 'audio' | 'video' | null;
    playlist: PlaylistTrack[];
    currentTrackIndex: number;
    playlistContext: { type: 'artist' | 'album'; name: string } | null;
    currentTime: number;
    volume: number;
    isMiniPlayer: boolean;
    savedAt: number;
}

// Sauvegarder l'état dans sessionStorage
function savePlayerState(state: Partial<PersistedPlayerState>): void {
    if (typeof window === 'undefined') return;
    try {
        const current = loadPlayerState();
        const toSave: PersistedPlayerState = {
            fileId: state.fileId ?? current?.fileId ?? null,
            category: state.category ?? current?.category ?? null,
            fileUrl: state.fileUrl ?? current?.fileUrl ?? null,
            title: state.title ?? current?.title ?? null,
            artist: state.artist ?? current?.artist ?? null,
            thumbnail: state.thumbnail ?? current?.thumbnail ?? null,
            type: state.type ?? current?.type ?? null,
            playlist: state.playlist ?? current?.playlist ?? [],
            currentTrackIndex: state.currentTrackIndex ?? current?.currentTrackIndex ?? 0,
            playlistContext: state.playlistContext ?? current?.playlistContext ?? null,
            currentTime: state.currentTime ?? current?.currentTime ?? 0,
            volume: state.volume ?? current?.volume ?? 1,
            isMiniPlayer: state.isMiniPlayer ?? current?.isMiniPlayer ?? false,
            savedAt: Date.now()
        };
        sessionStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(toSave));
    } catch (error) {
        console.warn('⚠️ [PlayerContext] Erreur sauvegarde état:', error);
    }
}

// Charger l'état depuis sessionStorage
function loadPlayerState(): PersistedPlayerState | null {
    if (typeof window === 'undefined') return null;
    try {
        const saved = sessionStorage.getItem(PLAYER_STATE_KEY);
        if (!saved) return null;
        const parsed = JSON.parse(saved) as PersistedPlayerState;
        // Ignorer si sauvegardé il y a plus de 24h
        if (Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
            sessionStorage.removeItem(PLAYER_STATE_KEY);
            return null;
        }
        return parsed;
    } catch (error) {
        console.warn('⚠️ [PlayerContext] Erreur lecture état:', error);
        return null;
    }
}

// Effacer l'état persisté
function clearPlayerState(): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.removeItem(PLAYER_STATE_KEY);
    } catch (error) {
        console.warn('⚠️ [PlayerContext] Erreur suppression état:', error);
    }
}

interface PlaylistTrack {
    file_id: string;
    title: string;
    filename: string;
    category: string;
    artists?: string;
    albums?: string;
    album_thumbnails?: string;
    thumbnail_url?: string;
}

interface PlayerState {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    fileId: string | null;
    category: string | null;
    fileUrl: string | null;
    title: string | null;
    artist: string | null;
    thumbnail: string | null;
    type: 'audio' | 'video' | null;
    // Playlist
    playlist: PlaylistTrack[];
    currentTrackIndex: number;
    playlistContext: { type: 'artist' | 'album'; name: string } | null;
    // Mini player
    isMiniPlayer: boolean;
}

interface PlayerContextType {
    state: PlayerState;
    // État de restauration disponible
    canRestore: boolean;
    restoredState: PersistedPlayerState | null;
    restorePlayback: () => void; // Reprendre la lecture depuis l'état sauvegardé
    dismissRestore: () => void;  // Ignorer la restauration
    play: (params: {
        fileId: string;
        category: string;
        fileUrl: string;
        title: string;
        artist?: string;
        thumbnail?: string;
        type: 'audio' | 'video';
        playlist?: PlaylistTrack[];
        playlistContext?: { type: 'artist' | 'album'; name: string };
        startIndex?: number;
        currentTime?: number;
        startAsMiniPlayer?: boolean;
    }) => void;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    seek: (time: number) => void;
    setVolume: (volume: number) => void;
    playNext: () => void;
    playPrevious: () => void;
    toggleMiniPlayer: (show: boolean) => void;
    expandPlayer: () => void;
    audioRef: React.RefObject<HTMLAudioElement>;
    videoRef: React.RefObject<HTMLVideoElement>;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
    // Charger le volume depuis l'état sauvegardé (seul élément restauré automatiquement)
    const savedState = typeof window !== 'undefined' ? loadPlayerState() : null;
    
    const [state, setState] = useState<PlayerState>({
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: savedState?.volume ?? 1, // Restaurer le volume automatiquement
        fileId: null,
        category: null,
        fileUrl: null,
        title: null,
        artist: null,
        thumbnail: null,
        type: null,
        playlist: [],
        currentTrackIndex: 0,
        playlistContext: null,
        isMiniPlayer: false,
    });

    // État de restauration disponible (lecture interrompue)
    const [restoredState, setRestoredState] = useState<PersistedPlayerState | null>(null);
    const [canRestore, setCanRestore] = useState(false);

    const audioRef = useRef<HTMLAudioElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const saveTimeoutRef = useRef<number | null>(null);

    const getActiveMedia = useCallback(() => {
        if (state.type === 'audio') return audioRef.current;
        if (state.type === 'video') return videoRef.current;
        return null;
    }, [state.type]);

    const [pendingSeek, setPendingSeek] = useState<number | null>(null);

    // Vérifier s'il y a un état à restaurer au montage
    useEffect(() => {
        const saved = loadPlayerState();
        if (saved && saved.fileId && saved.fileUrl && saved.currentTime > 10) {
            // Il y a une lecture interrompue avec au moins 10 secondes de progression
            setRestoredState(saved);
            setCanRestore(true);
        }
    }, []);

    // Restaurer la lecture depuis l'état sauvegardé
    const restorePlayback = useCallback(() => {
        if (!restoredState || !restoredState.fileId || !restoredState.fileUrl || !restoredState.type) {
            setCanRestore(false);
            setRestoredState(null);
            return;
        }

        // Restaurer l'état complet
        setPendingSeek(restoredState.currentTime);
        setState(prev => ({
            ...prev,
            isPlaying: true,
            currentTime: restoredState.currentTime,
            fileId: restoredState.fileId,
            category: restoredState.category,
            fileUrl: restoredState.fileUrl,
            title: restoredState.title,
            artist: restoredState.artist,
            thumbnail: restoredState.thumbnail,
            type: restoredState.type,
            playlist: restoredState.playlist || [],
            playlistContext: restoredState.playlistContext,
            currentTrackIndex: restoredState.currentTrackIndex || 0,
            isMiniPlayer: true, // Reprendre en mini player
        }));

        setCanRestore(false);
        setRestoredState(null);
    }, [restoredState]);

    // Ignorer la restauration
    const dismissRestore = useCallback(() => {
        setCanRestore(false);
        setRestoredState(null);
        clearPlayerState();
    }, []);

    // Sauvegarder l'état périodiquement (throttled)
    const saveCurrentState = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = window.setTimeout(() => {
            // Ne sauvegarder que si on a un fichier en cours
            if (state.fileId && state.fileUrl) {
                savePlayerState({
                    fileId: state.fileId,
                    category: state.category,
                    fileUrl: state.fileUrl,
                    title: state.title,
                    artist: state.artist,
                    thumbnail: state.thumbnail,
                    type: state.type,
                    playlist: state.playlist,
                    currentTrackIndex: state.currentTrackIndex,
                    playlistContext: state.playlistContext,
                    currentTime: state.currentTime,
                    volume: state.volume,
                    isMiniPlayer: state.isMiniPlayer,
                });
            }
        }, 2000); // Throttle à 2 secondes
    }, [state]);

    // Sauvegarder quand l'état change significativement
    useEffect(() => {
        if (state.fileId) {
            saveCurrentState();
        }
    }, [state.fileId, state.currentTrackIndex, state.volume, state.isMiniPlayer, saveCurrentState]);

    // Sauvegarder le temps de lecture toutes les 10 secondes
    useEffect(() => {
        if (!state.isPlaying || !state.fileId) return;
        
        const interval = setInterval(() => {
            saveCurrentState();
        }, 10000);
        
        return () => clearInterval(interval);
    }, [state.isPlaying, state.fileId, saveCurrentState]);

    // Sauvegarder avant fermeture/refresh de la page
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (state.fileId && state.fileUrl) {
                // Sauvegarde synchrone
                try {
                    const toSave: PersistedPlayerState = {
                        fileId: state.fileId,
                        category: state.category,
                        fileUrl: state.fileUrl,
                        title: state.title,
                        artist: state.artist,
                        thumbnail: state.thumbnail,
                        type: state.type,
                        playlist: state.playlist,
                        currentTrackIndex: state.currentTrackIndex,
                        playlistContext: state.playlistContext,
                        currentTime: state.currentTime,
                        volume: state.volume,
                        isMiniPlayer: state.isMiniPlayer,
                        savedAt: Date.now()
                    };
                    sessionStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(toSave));
                } catch {}
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [state]);
    
    const play = useCallback((params: {
        fileId: string;
        category: string;
        fileUrl: string;
        title: string;
        artist?: string;
        thumbnail?: string;
        type: 'audio' | 'video';
        playlist?: PlaylistTrack[];
        playlistContext?: { type: 'artist' | 'album'; name: string };
        startIndex?: number;
        currentTime?: number;
        startAsMiniPlayer?: boolean;
    }) => {
        
        // Sauvegarder le temps pour le seek après le chargement
        if (params.currentTime && params.currentTime > 0) {
            setPendingSeek(params.currentTime);
        }
        
        setState(prev => ({
            ...prev,
            isPlaying: true,
            currentTime: params.currentTime || 0,
            fileId: params.fileId,
            category: params.category,
            fileUrl: params.fileUrl,
            title: params.title,
            artist: params.artist || null,
            thumbnail: params.thumbnail || null,
            type: params.type,
            playlist: params.playlist || [],
            playlistContext: params.playlistContext || null,
            currentTrackIndex: params.startIndex || 0,
            isMiniPlayer: params.startAsMiniPlayer || false,
        }));
    }, []);

    const pause = useCallback(() => {
        const media = getActiveMedia();
        if (media) {
            media.pause();
            setState(prev => ({ ...prev, isPlaying: false }));
        }
    }, [getActiveMedia]);

    const resume = useCallback(() => {
        const media = getActiveMedia();
        if (media) {
            media.play();
            setState(prev => ({ ...prev, isPlaying: true }));
        }
    }, [getActiveMedia]);

    const stop = useCallback(() => {
        const media = getActiveMedia();
        if (media) {
            media.pause();
            media.currentTime = 0;
        }
        // Effacer l'état persisté quand on arrête volontairement
        clearPlayerState();
        setState(prev => ({
            ...prev,
            isPlaying: false,
            fileId: null,
            fileUrl: null,
            title: null,
            artist: null,
            thumbnail: null,
            type: null,
            playlist: [],
            currentTrackIndex: 0,
            playlistContext: null,
            isMiniPlayer: false,
        }));
    }, [getActiveMedia]);

    const seek = useCallback((time: number) => {
        const media = getActiveMedia();
        if (media) {
            media.currentTime = time;
            setState(prev => ({ ...prev, currentTime: time }));
        }
    }, [getActiveMedia]);

    const setVolume = useCallback((volume: number) => {
        const media = getActiveMedia();
        if (media) {
            media.volume = volume;
        }
        setState(prev => ({ ...prev, volume }));
        // Sauvegarder le volume immédiatement (préférence utilisateur)
        savePlayerState({ volume });
    }, [getActiveMedia]);

    const playTrackAtIndex = useCallback((index: number) => {
        if (index >= 0 && index < state.playlist.length) {
            const track = state.playlist[index];
            const fileUrl = `https://videomi.uk/api/files/${track.category}/${track.file_id}`;
            
            let artist: string | null = null;
            let thumbnail: string | null = null;
            
            try {
                if (track.artists) {
                    try {
                        const parsed = typeof track.artists === 'string' ? JSON.parse(track.artists) : track.artists;
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
                if (track.album_thumbnails) {
                    try {
                        const parsed = typeof track.album_thumbnails === 'string' ? JSON.parse(track.album_thumbnails) : track.album_thumbnails;
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
                if (!thumbnail && track.thumbnail_url) {
                    thumbnail = track.thumbnail_url;
                }
            } catch {}
            
            setState(prev => ({
                ...prev,
                fileId: track.file_id,
                category: track.category,
                fileUrl,
                title: track.title || track.filename?.replace(/\.[^/.]+$/, '') || 'Sans titre',
                artist,
                thumbnail,
                currentTrackIndex: index,
                isPlaying: true,
            }));
        }
    }, [state.playlist]);

    const playNext = useCallback(() => {
        if (state.currentTrackIndex < state.playlist.length - 1) {
            playTrackAtIndex(state.currentTrackIndex + 1);
        }
    }, [state.currentTrackIndex, state.playlist.length, playTrackAtIndex]);

    const playPrevious = useCallback(() => {
        if (state.currentTrackIndex > 0) {
            playTrackAtIndex(state.currentTrackIndex - 1);
        }
    }, [state.currentTrackIndex, playTrackAtIndex]);

    const toggleMiniPlayer = useCallback((show: boolean) => {
        setState(prev => ({ ...prev, isMiniPlayer: show }));
    }, []);

    const expandPlayer = useCallback(() => {
        if (state.fileId && state.category) {
            setState(prev => ({ ...prev, isMiniPlayer: false }));
        }
    }, [state.fileId, state.category]);

    // Restaurer la position quand le média est chargé
    useEffect(() => {
        if (pendingSeek === null) return;
        
        const media = getActiveMedia();
        if (!media) return;
        
        const handleCanPlay = () => {
            if (pendingSeek !== null && pendingSeek > 0) {
                media.currentTime = pendingSeek;
                setPendingSeek(null);
            }
        };
        
        // Si le média est déjà prêt, seek immédiatement
        if (media.readyState >= 3) {
            handleCanPlay();
        } else {
            media.addEventListener('canplay', handleCanPlay, { once: true });
            return () => media.removeEventListener('canplay', handleCanPlay);
        }
    }, [pendingSeek, getActiveMedia]);
    
    // Update current time
    useEffect(() => {
        const media = getActiveMedia();
        if (!media) return;

        const handleTimeUpdate = () => {
            setState(prev => ({ ...prev, currentTime: media.currentTime }));
        };

        const handleDurationChange = () => {
            setState(prev => ({ ...prev, duration: media.duration }));
        };

        const handleEnded = () => {
            if (state.playlist.length > 0 && state.currentTrackIndex < state.playlist.length - 1) {
                playNext();
            } else {
                setState(prev => ({ ...prev, isPlaying: false }));
            }
        };

        media.addEventListener('timeupdate', handleTimeUpdate);
        media.addEventListener('durationchange', handleDurationChange);
        media.addEventListener('ended', handleEnded);

        return () => {
            media.removeEventListener('timeupdate', handleTimeUpdate);
            media.removeEventListener('durationchange', handleDurationChange);
            media.removeEventListener('ended', handleEnded);
        };
    }, [getActiveMedia, state.playlist.length, state.currentTrackIndex, playNext]);

    return (
        <PlayerContext.Provider value={{
            state,
            canRestore,
            restoredState,
            restorePlayback,
            dismissRestore,
            play,
            pause,
            resume,
            stop,
            seek,
            setVolume,
            playNext,
            playPrevious,
            toggleMiniPlayer,
            expandPlayer,
            audioRef,
            videoRef,
        }}>
            {children}
        </PlayerContext.Provider>
    );
}

export function usePlayer() {
    const context = useContext(PlayerContext);
    if (!context) {
        throw new Error('usePlayer must be used within a PlayerProvider');
    }
    return context;
}
