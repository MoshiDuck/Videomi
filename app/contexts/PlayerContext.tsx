// INFO : app/contexts/PlayerContext.tsx
import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

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
    const [state, setState] = useState<PlayerState>({
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 1,
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

    const audioRef = useRef<HTMLAudioElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    const getActiveMedia = useCallback(() => {
        if (state.type === 'audio') return audioRef.current;
        if (state.type === 'video') return videoRef.current;
        return null;
    }, [state.type]);

    const [pendingSeek, setPendingSeek] = useState<number | null>(null);
    
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
