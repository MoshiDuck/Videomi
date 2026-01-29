// INFO : app/routes/musics.tsx
// Page dédiée pour l'affichage des musiques, style Spotify
// Navigation : Artistes (rond) → Albums (carré) → Titres (liste)
// Cache : même stratégie que vidéos (useFiles = mémoire + localStorage)

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '~/hooks/useAuth';
import { useConfig } from '~/hooks/useConfig';
import { useFiles, type FileItem } from '~/hooks/useFiles';
import { Navigation } from '~/components/navigation/Navigation';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { darkTheme } from '~/utils/ui/theme';
import type { FileCategory } from '~/utils/file/fileClassifier';
import { CategoryBar } from '~/components/ui/categoryBar';
import { getCategoryRoute, getCategoryFromPathname } from '~/utils/routes';
import { formatDuration } from '~/utils/format';
import { useLanguage } from '~/contexts/LanguageContext';
import { LoadingSpinner } from '~/components/ui/LoadingSpinner';

interface Track {
    file: FileItem;
    title: string;
}

interface Album {
    albumName: string;
    albumThumbnail: string | null;
    year: number | null;
    tracks: Track[];
}

interface Artist {
    artistName: string;
    artistThumbnail: string | null;
    albums: Album[];
    trackCount: number;
    isUnknown?: boolean;
}

type ViewMode = 'artists' | 'artist-albums' | 'album-tracks';

function getAlbumThumbnails(file: FileItem): string[] {
    if (!file.album_thumbnails) return [];
    try {
        const parsed = JSON.parse(file.album_thumbnails);
        if (Array.isArray(parsed)) return parsed.filter((t: unknown) => t && typeof t === 'string');
    } catch {}
    return [];
}

function organizeFilesIntoArtists(
    files: FileItem[],
    cleanString: (v: string | null | undefined) => string
): Artist[] {
    const artistMap = new Map<string, {
        artistName: string;
        artistThumbnail: string | null;
        albums: Map<string, Album>;
        trackCount: number;
        isUnknown?: boolean;
    }>();

    for (const file of files) {
        const title = cleanString(file.title) || cleanString(file.filename ?? null)?.replace(/\.[^/.]+$/, '') || 'Sans titre';
        const artistThumbnail = file.thumbnail_url ?? null;
        const albumThumbnails = getAlbumThumbnails(file);
        const isUnidentified = !file.source_id;

        if (isUnidentified) {
            const unknownArtist = 'Artiste inconnu';
            if (!artistMap.has(unknownArtist)) {
                artistMap.set(unknownArtist, {
                    artistName: unknownArtist,
                    artistThumbnail,
                    albums: new Map(),
                    trackCount: 0,
                    isUnknown: true,
                });
            }
            const artistData = artistMap.get(unknownArtist)!;
            artistData.trackCount++;
            if (!artistData.artistThumbnail && artistThumbnail) artistData.artistThumbnail = artistThumbnail;
            const albumName = 'À identifier';
            if (!artistData.albums.has(albumName)) {
                artistData.albums.set(albumName, {
                    albumName,
                    albumThumbnail: albumThumbnails[0] ?? null,
                    year: null,
                    tracks: [],
                });
            } else {
                const album = artistData.albums.get(albumName)!;
                if (!album.albumThumbnail && albumThumbnails[0]) album.albumThumbnail = albumThumbnails[0];
            }
            artistData.albums.get(albumName)!.tracks.push({ file, title });
            continue;
        }

        try {
            let artistsArray: string[] = [];
            if (file.artists) {
                try {
                    const parsed = typeof file.artists === 'string' ? JSON.parse(file.artists) : file.artists;
                    if (Array.isArray(parsed)) {
                        artistsArray = parsed.filter((a: unknown) => typeof a === 'string' && (a as string).trim().length > 0);
                    } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                        artistsArray = [parsed];
                    }
                } catch {}
            }
            let albumsArray: string[] = [];
            if (file.albums) {
                try {
                    const parsed = typeof file.albums === 'string' ? JSON.parse(file.albums) : file.albums;
                    if (Array.isArray(parsed)) {
                        albumsArray = parsed.filter((a: unknown) => typeof a === 'string' && (a as string).trim().length > 0);
                    } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                        albumsArray = [parsed];
                    }
                } catch {}
            }

            const artistNames = artistsArray.length > 0
                ? artistsArray.map((a) => cleanString(a)).filter((a) => a.length > 0)
                : ['Artiste inconnu'];

            for (const rawArtistName of artistNames) {
                const artistName = cleanString(rawArtistName) || 'Artiste inconnu';
                const isUnknownArtist = artistName === 'Artiste inconnu';
                if (!artistMap.has(artistName)) {
                    artistMap.set(artistName, {
                        artistName,
                        artistThumbnail,
                        albums: new Map(),
                        trackCount: 0,
                        isUnknown: isUnknownArtist,
                    });
                }
                const artistData = artistMap.get(artistName)!;
                artistData.trackCount++;
                if (!artistData.artistThumbnail && artistThumbnail) artistData.artistThumbnail = artistThumbnail;

                if (albumsArray.length > 0) {
                    for (let i = 0; i < albumsArray.length; i++) {
                        const albumName = cleanString(albumsArray[i]) || 'Sans nom';
                        const albumThumb = albumThumbnails[i] ?? albumThumbnails[0] ?? null;
                        if (!artistData.albums.has(albumName)) {
                            artistData.albums.set(albumName, {
                                albumName,
                                albumThumbnail: albumThumb,
                                year: file.year ?? null,
                                tracks: [],
                            });
                        } else {
                            const album = artistData.albums.get(albumName)!;
                            if (!album.albumThumbnail && albumThumb) album.albumThumbnail = albumThumb;
                        }
                        artistData.albums.get(albumName)!.tracks.push({ file, title });
                    }
                } else {
                    const singlesAlbumThumbnail = albumThumbnails[0] ?? null;
                    if (!artistData.albums.has('Singles')) {
                        artistData.albums.set('Singles', {
                            albumName: 'Singles',
                            albumThumbnail: singlesAlbumThumbnail,
                            year: null,
                            tracks: [],
                        });
                    }
                    artistData.albums.get('Singles')!.tracks.push({ file, title });
                }
            }
        } catch {
            const unknownArtist = 'Artiste inconnu';
            if (!artistMap.has(unknownArtist)) {
                artistMap.set(unknownArtist, {
                    artistName: unknownArtist,
                    artistThumbnail: null,
                    albums: new Map(),
                    trackCount: 0,
                    isUnknown: true,
                });
            }
            const artistData = artistMap.get(unknownArtist)!;
            artistData.trackCount++;
            const albumName = 'À identifier';
            if (!artistData.albums.has(albumName)) {
                artistData.albums.set(albumName, {
                    albumName,
                    albumThumbnail: null,
                    year: null,
                    tracks: [],
                });
            }
            artistData.albums.get(albumName)!.tracks.push({ file, title });
        }
    }

    return Array.from(artistMap.values())
        .map((artist) => ({
            ...artist,
            albums: Array.from(artist.albums.values()).sort((a, b) => {
                if (a.albumName === 'Singles') return 1;
                if (b.albumName === 'Singles') return -1;
                if (a.albumName === 'À identifier') return 1;
                if (b.albumName === 'À identifier') return -1;
                if (a.year && b.year) return b.year - a.year;
                return a.albumName.localeCompare(b.albumName);
            }),
        }))
        .sort((a, b) => {
            if (a.isUnknown && !b.isUnknown) return 1;
            if (!a.isUnknown && b.isUnknown) return -1;
            return a.artistName.localeCompare(b.artistName);
        });
}

export default function MusicsRoute() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const { config } = useConfig();
    const navigate = useNavigate();
    const location = useLocation();
    const [selectedCategory, setSelectedCategory] = useState<FileCategory>('musics');
    
    // États de navigation
    const [viewMode, setViewMode] = useState<ViewMode>('artists');
    const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
    const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
    
    // Cache comme vidéos : useFiles (mémoire + localStorage, même stratégie)
    const { files, loading, error, refetch } = useFiles({
        category: 'musics',
        userId: user?.id ?? null,
        enabled: !!user?.id,
    });

    // Fonction pour nettoyer les chaînes JSON (retirer crochets, guillemets, etc.)
    const cleanString = useCallback((value: string | null | undefined): string => {
        if (!value) return '';
        let cleaned = value.trim();
        if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
            try {
                const parsed = JSON.parse(cleaned);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    cleaned = typeof parsed[0] === 'string' ? parsed[0] : String(parsed[0]);
                }
            } catch {
                cleaned = cleaned.replace(/^\["?|"?\]$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, '');
            }
        }
        cleaned = cleaned.replace(/^["']+|["']+$/g, '');
        return cleaned.trim();
    }, []);

    useEffect(() => {
        const category = getCategoryFromPathname(location.pathname);
        if (category) {
            setSelectedCategory(category);
        }
    }, [location.pathname]);

    const handleCategoryChange = (category: FileCategory) => {
        setSelectedCategory(category);
        navigate(getCategoryRoute(category));
    };

    // Dériver artists/albums depuis files (même logique qu'avant, alimentée par le cache useFiles)
    const artists = useMemo(() => organizeFilesIntoArtists(files, cleanString), [files, cleanString]);


    // Navigation handlers
    const handleArtistClick = (artist: Artist) => {
        setSelectedArtist(artist);
        setSelectedAlbum(null);
        setViewMode('artist-albums');
    };

    const handleAlbumClick = (album: Album) => {
        setSelectedAlbum(album);
        setViewMode('album-tracks');
    };

    const handleBack = () => {
        if (viewMode === 'album-tracks') {
            setSelectedAlbum(null);
            setViewMode('artist-albums');
        } else if (viewMode === 'artist-albums') {
            setSelectedArtist(null);
            setViewMode('artists');
        }
    };

    // Lecture
    const handlePlayTrack = (track: Track, playlist: Track[], index: number) => {
        // Parser et nettoyer les artistes et albums pour éviter d'avoir des chaînes JSON brutes
        const parseJsonField = (value: string | null | undefined): string | undefined => {
            if (!value) return undefined;
            try {
                const parsed = typeof value === 'string' ? JSON.parse(value) : value;
                let result: string | undefined;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    result = parsed[0]; // Prendre le premier élément
                } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                    result = parsed;
                }
                // Nettoyer le résultat
                return result ? cleanString(result) : undefined;
            } catch {
                // Si ce n'est pas du JSON, nettoyer tel quel
                if (typeof value === 'string' && value.trim().length > 0) {
                    return cleanString(value);
                }
            }
            return undefined;
        };
        
        navigate(`/reader/${track.file.category}/${track.file.file_id}`, {
            state: {
                playlist: playlist.map(t => {
                    const cleanedArtist = parseJsonField(t.file.artists);
                    const cleanedAlbum = parseJsonField(t.file.albums);
                    return {
                        file_id: t.file.file_id,
                        title: t.title,
                        filename: t.file.filename,
                        category: t.file.category,
                        artists: cleanedArtist ? JSON.stringify([cleanedArtist]) : null,
                        albums: cleanedAlbum ? JSON.stringify([cleanedAlbum]) : null,
                        album_thumbnails: t.file.album_thumbnails,
                        thumbnail_url: t.file.thumbnail_url
                    };
                }),
                currentTrackIndex: index,
                context: selectedAlbum 
                    ? { type: 'album' as const, name: selectedAlbum.albumName }
                    : selectedArtist 
                        ? { type: 'artist' as const, name: selectedArtist.artistName }
                        : null
            }
        });
    };

    const handlePlayAll = (tracks: Track[]) => {
        if (tracks.length === 0) return;
        handlePlayTrack(tracks[0], tracks, 0);
    };

    // Afficher le spinner uniquement au chargement initial (pas de données)
    if (loading && artists.length === 0) {
        return (
            <AuthGuard>
                <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0a' }}>
                    <Navigation user={user!} onLogout={logout} />
                    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
                        <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                            <LoadingSpinner size="large" message={t('common.loading')} />
                        </div>
                    </div>
                </div>
            </AuthGuard>
        );
    }

    if (error) {
        return (
            <AuthGuard>
                <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0a' }}>
                    <Navigation user={user!} onLogout={logout} />
                    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
                        <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                        <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column',
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            minHeight: '60vh',
                            gap: '16px'
                        }}>
                            <div style={{ 
                                fontSize: '48px',
                                marginBottom: '8px'
                            }}>
                                ⚠️
                            </div>
                            <div style={{ 
                                color: '#ff4444',
                                fontSize: '16px',
                                textAlign: 'center'
                            }}>
                                {error}
                            </div>
                            <button
                                onClick={() => window.location.reload()}
                                style={{
                                    marginTop: '16px',
                                    padding: '12px 24px',
                                    backgroundColor: darkTheme.accent.blue,
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    transition: 'transform 0.2s, opacity 0.2s'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.opacity = '0.9'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1'; }}
                            >
                                Réessayer
                            </button>
                        </div>
                    </div>
                </div>
            </AuthGuard>
        );
    }

    return (
        <AuthGuard>
            <div style={{ 
                minHeight: '100vh', 
                backgroundColor: '#0a0a0a',
                fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
                <Navigation user={user!} onLogout={logout} />
                <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
                    <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                    
                    {/* Header avec navigation */}
                    {viewMode !== 'artists' && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            marginBottom: '32px',
                            marginTop: '24px'
                        }}>
                            <button
                                onClick={handleBack}
                                aria-label="Retour à la liste"
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '50%',
                                    backgroundColor: 'rgba(255,255,255,0.1)',
                                    border: 'none',
                                    color: '#fff',
                                    fontSize: '20px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                            >
                                ←
                            </button>
                            
                            {viewMode === 'artist-albums' && selectedArtist && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{
                                        width: '80px',
                                        height: '80px',
                                        borderRadius: '50%',
                                        background: selectedArtist.artistThumbnail 
                                            ? `url(${selectedArtist.artistThumbnail}) center/cover`
                                            : 'linear-gradient(135deg, #1db954, #191414)',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
                                    }} />
                                    <div>
                                        <div style={{ color: '#b3b3b3', fontSize: '12px', textTransform: 'uppercase' }}>Artiste</div>
                                        <h1 style={{ color: '#fff', fontSize: '32px', fontWeight: '700', margin: '4px 0' }}>
                                            {selectedArtist.artistName}
                                        </h1>
                                        <div style={{ color: '#b3b3b3', fontSize: '14px' }}>
                                            {selectedArtist.albums.length} album{selectedArtist.albums.length > 1 ? 's' : ''} • {selectedArtist.trackCount} titre{selectedArtist.trackCount > 1 ? 's' : ''}
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {viewMode === 'album-tracks' && selectedAlbum && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    <div style={{
                                        width: '120px',
                                        height: '120px',
                                        borderRadius: '8px',
                                        background: selectedAlbum.albumThumbnail 
                                            ? `url(${selectedAlbum.albumThumbnail}) center/cover`
                                            : 'linear-gradient(135deg, #282828, #121212)',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                                    }} />
                                    <div>
                                        <div style={{ color: '#b3b3b3', fontSize: '12px', textTransform: 'uppercase' }}>Album</div>
                                        <h1 style={{ color: '#fff', fontSize: '28px', fontWeight: '700', margin: '4px 0' }}>
                                            {selectedAlbum.albumName}
                                        </h1>
                                        <div style={{ color: '#b3b3b3', fontSize: '14px' }}>
                                            {selectedArtist?.artistName} {selectedAlbum.year && `• ${selectedAlbum.year}`} • {selectedAlbum.tracks.length} titre{selectedAlbum.tracks.length > 1 ? 's' : ''}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Bouton Play All pour album (pas pour "À identifier") */}
                    {viewMode === 'album-tracks' && selectedAlbum && selectedAlbum.albumName !== 'À identifier' && (
                        <div style={{ marginBottom: '24px' }}>
                            <button
                                onClick={() => handlePlayAll(selectedAlbum.tracks)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '14px 32px',
                                    backgroundColor: '#1db954',
                                    color: '#000',
                                    border: 'none',
                                    borderRadius: '50px',
                                    fontSize: '16px',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                ▶ Tout lire
                            </button>
                        </div>
                    )}

                    {/* VUE ARTISTES */}
                    {viewMode === 'artists' && (
                        <>
                            {/* Titre de section */}
                            <h2 style={{
                                fontSize: '24px',
                                fontWeight: '700',
                                color: '#fff',
                                marginBottom: '24px',
                                marginTop: '24px'
                            }}>
                                {artists.length > 0 ? 'Vos artistes' : ''}
                            </h2>
                            
                            {/* Grille d'artistes */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                gap: '24px'
                            }}>
                                {artists.map((artist) => (
                                    <div
                                        key={artist.artistName}
                                        onClick={() => handleArtistClick(artist)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleArtistClick(artist);
                                            }
                                        }}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`Voir les albums de ${artist.artistName}`}
                                        style={{
                                            padding: '20px',
                                            borderRadius: '8px',
                                            backgroundColor: '#181818',
                                            cursor: 'pointer',
                                            transition: 'all 0.3s',
                                            textAlign: 'center',
                                            border: artist.isUnknown ? '2px dashed #444' : 'none'
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.backgroundColor = '#282828';
                                            e.currentTarget.style.transform = 'translateY(-4px)';
                                            if (artist.isUnknown) e.currentTarget.style.borderColor = '#1db954';
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.backgroundColor = '#181818';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            if (artist.isUnknown) e.currentTarget.style.borderColor = '#444';
                                        }}
                                    >
                                        {/* Photo ronde */}
                                        <div style={{
                                            width: '140px',
                                            height: '140px',
                                            borderRadius: '50%',
                                            margin: '0 auto 16px',
                                            background: artist.artistThumbnail 
                                                ? `url(${artist.artistThumbnail}) center/cover`
                                                : artist.isUnknown
                                                    ? 'linear-gradient(135deg, #333, #1a1a1a)'
                                                    : 'linear-gradient(135deg, #535353, #282828)',
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: artist.isUnknown ? '2px dashed #555' : 'none'
                                        }}>
                                            {!artist.artistThumbnail && (
                                                <span style={{ fontSize: '48px', opacity: 0.5 }}>
                                                    {artist.isUnknown ? '❓' : '👤'}
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Nom de l'artiste */}
                                        <div style={{
                                            color: artist.isUnknown ? '#b3b3b3' : '#fff',
                                            fontWeight: '700',
                                            fontSize: '16px',
                                            marginBottom: '4px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {artist.artistName}
                                        </div>
                                        
                                        {/* Info */}
                                        <div style={{
                                            color: artist.isUnknown ? '#1db954' : '#b3b3b3',
                                            fontSize: '14px'
                                        }}>
                                            {artist.isUnknown 
                                                ? `${artist.trackCount} à identifier` 
                                                : 'Artiste'}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* État vide */}
                            {artists.length === 0 && !loading && (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '80px 20px',
                                    color: '#b3b3b3'
                                }}>
                                    <div style={{ fontSize: '64px', marginBottom: '24px' }}>🎵</div>
                                    <h2 style={{ color: '#fff', fontSize: '24px', marginBottom: '8px' }}>
                                        Aucune musique
                                    </h2>
                                    <p style={{ marginBottom: '24px' }}>Uploadez des fichiers musicaux pour commencer</p>
                                    <button
                                        onClick={() => navigate('/upload')}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '14px 28px',
                                            backgroundColor: '#1db954',
                                            color: '#000',
                                            border: 'none',
                                            borderRadius: '50px',
                                            fontSize: '16px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'scale(1.05)';
                                            e.currentTarget.style.backgroundColor = '#1ed760';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'scale(1)';
                                            e.currentTarget.style.backgroundColor = '#1db954';
                                        }}
                                    >
                                        <span>⬆️</span>
                                        Uploader ma première musique
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* VUE ALBUMS D'UN ARTISTE */}
                    {viewMode === 'artist-albums' && selectedArtist && (
                        <>
                            {/* Bouton Play All Artiste (pas pour "Artiste inconnu") */}
                            {!selectedArtist.isUnknown && (
                                <div style={{ marginBottom: '32px' }}>
                                    <button
                                        onClick={() => {
                                            const allTracks = selectedArtist.albums.flatMap(a => a.tracks);
                                            handlePlayAll(allTracks);
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '14px 32px',
                                            backgroundColor: '#1db954',
                                            color: '#000',
                                            border: 'none',
                                            borderRadius: '50px',
                                            fontSize: '16px',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        ▶ Tout lire
                                    </button>
                                </div>
                            )}

                            {/* Grille d'albums */}
                            <h3 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', marginBottom: '16px' }}>
                                Albums
                            </h3>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                gap: '24px'
                            }}>
                                {selectedArtist.albums.map((album) => (
                                    <div
                                        key={album.albumName}
                                        onClick={() => handleAlbumClick(album)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleAlbumClick(album);
                                            }
                                        }}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`Voir les titres de ${album.albumName}`}
                                        style={{
                                            padding: '16px',
                                            borderRadius: '8px',
                                            backgroundColor: '#181818',
                                            cursor: 'pointer',
                                            transition: 'all 0.3s'
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.backgroundColor = '#282828';
                                            e.currentTarget.style.transform = 'translateY(-4px)';
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.backgroundColor = '#181818';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }}
                                    >
                                        {/* Pochette carrée */}
                                        <div style={{
                                            width: '100%',
                                            aspectRatio: '1/1',
                                            borderRadius: '4px',
                                            marginBottom: '16px',
                                            background: album.albumThumbnail 
                                                ? `url(${album.albumThumbnail}) center/cover`
                                                : 'linear-gradient(135deg, #535353, #282828)',
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            {!album.albumThumbnail && (
                                                <span style={{ fontSize: '40px', opacity: 0.5 }}>💿</span>
                                            )}
                                        </div>
                                        
                                        {/* Nom de l'album */}
                                        <div style={{
                                            color: '#fff',
                                            fontWeight: '700',
                                            fontSize: '16px',
                                            marginBottom: '4px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {album.albumName}
                                        </div>
                                        
                                        {/* Info */}
                                        <div style={{
                                            color: '#b3b3b3',
                                            fontSize: '14px'
                                        }}>
                                            {album.year || ''} • {album.tracks.length} titre{album.tracks.length > 1 ? 's' : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* VUE TITRES D'UN ALBUM */}
                    {viewMode === 'album-tracks' && selectedAlbum && (
                        <div style={{
                            backgroundColor: '#181818',
                            borderRadius: '8px',
                            overflow: 'hidden'
                        }}>
                            {/* Header de la liste */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: selectedAlbum.albumName === 'À identifier' ? '50px 1fr 140px' : '50px 1fr 120px',
                                gap: '16px',
                                padding: '12px 24px',
                                borderBottom: '1px solid #282828',
                                color: '#b3b3b3',
                                fontSize: '12px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em'
                            }}>
                                <div>#</div>
                                <div>Titre</div>
                                <div style={{ textAlign: 'right' }}>
                                    {selectedAlbum.albumName === 'À identifier' ? 'Action' : 'Durée'}
                                </div>
                            </div>
                            
                            {/* Liste des titres */}
                            {selectedAlbum.tracks.map((track, index) => {
                                const isToIdentify = selectedAlbum.albumName === 'À identifier';
                                
                                const handleTrackClick = () => {
                                    if (isToIdentify) {
                                        navigate(`/match/musics/${track.file.file_id}`);
                                    } else {
                                        handlePlayTrack(track, selectedAlbum.tracks, index);
                                    }
                                };
                                
                                return (
                                    <div
                                        key={track.file.file_id}
                                        onClick={handleTrackClick}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleTrackClick();
                                            }
                                        }}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={isToIdentify ? `Identifier ${track.title}` : `Lire ${track.title}`}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: isToIdentify ? '50px 1fr 140px' : '50px 1fr 120px',
                                            gap: '16px',
                                            padding: '12px 24px',
                                            cursor: 'pointer',
                                            transition: 'background-color 0.2s',
                                            alignItems: 'center'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#282828'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        {/* Numéro ou icône */}
                                        <div style={{
                                            color: isToIdentify ? '#ff9800' : '#b3b3b3',
                                            fontSize: '16px'
                                        }}>
                                            {isToIdentify ? '❓' : index + 1}
                                        </div>
                                        
                                        {/* Titre */}
                                        <div>
                                            <div style={{
                                                color: '#fff',
                                                fontSize: '16px',
                                                fontWeight: '500',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {track.title}
                                            </div>
                                            <div style={{
                                                color: isToIdentify ? '#ff9800' : '#b3b3b3',
                                                fontSize: '14px'
                                            }}>
                                                {isToIdentify ? 'Cliquer pour identifier' : selectedArtist?.artistName}
                                            </div>
                                        </div>
                                        
                                        {/* Durée ou bouton */}
                                        <div style={{
                                            textAlign: 'right'
                                        }}>
                                            {isToIdentify ? (
                                                <span style={{
                                                    padding: '6px 16px',
                                                    backgroundColor: '#1db954',
                                                    color: '#000',
                                                    borderRadius: '50px',
                                                    fontSize: '12px',
                                                    fontWeight: '600'
                                                }}>
                                                    Identifier
                                                </span>
                                            ) : (
                                                <span style={{ color: '#b3b3b3', fontSize: '14px' }}>
                                                    {track.file.duration ? formatDuration(track.file.duration) : '--:--'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </AuthGuard>
    );
}
