// INFO : app/routes/musics.tsx — contenu uniquement ; layout _app fournit Navigation + AuthGuard.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router';
import { useAuth } from '~/hooks/useAuth';
import { useConfig } from '~/hooks/useConfig';
import { darkTheme } from '~/utils/ui/theme';
import type { FileCategory } from '~/utils/file/fileClassifier';
import { CategoryBar } from '~/components/ui/categoryBar';
import { getCategoryRoute, getCategoryFromPathname } from '~/utils/routes';
import { formatDuration } from '~/utils/format';
import { useLanguage } from '~/contexts/LanguageContext';
import { LoadingSpinner } from '~/components/ui/LoadingSpinner';
import { PageSkeleton } from '~/components/ui/PageSkeleton';
import { useCacheInvalidationTrigger } from '~/utils/cache/cacheInvalidation';

export function meta() {
    return [
        { title: 'Musiques | Videomi' },
        { name: 'description', content: 'Vos musiques par artiste et album. Écoutez en streaming.' },
    ];
}

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
    artists: string | null;
    albums: string | null;
    year: number | null;
    duration: number | null;
    album_thumbnails: string | null;
}

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

export default function MusicsRoute() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const { config } = useConfig();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [selectedCategory, setSelectedCategory] = useState<FileCategory>('musics');
    
    // États de navigation (synchronisés avec l'URL pour deep linking / partage)
    const [viewMode, setViewMode] = useState<ViewMode>('artists');
    const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
    const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
    
    // Données
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [artists, setArtists] = useState<Artist[]>([]);
    const hasRestoredFromUrl = useRef(false);
    
    // Fonction pour nettoyer les chaînes JSON (retirer crochets, guillemets, etc.)
    const cleanString = useCallback((value: string | null | undefined): string => {
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
    }, []);
    
    useEffect(() => {
        const category = getCategoryFromPathname(location.pathname);
        if (category) {
            setSelectedCategory(category);
        }
    }, [location.pathname]);

    // Restaurer view / artist / album depuis l'URL au premier chargement des données
    useEffect(() => {
        if (artists.length === 0 || hasRestoredFromUrl.current) return;
        hasRestoredFromUrl.current = true;
        const view = searchParams.get('view') as ViewMode | null;
        const artistParam = searchParams.get('artist');
        const albumParam = searchParams.get('album');
        if (view === 'artist-albums' && artistParam) {
            const decoded = decodeURIComponent(artistParam);
            const artist = artists.find((a) => a.artistName === decoded);
            if (artist) {
                setSelectedArtist(artist);
                setSelectedAlbum(null);
                setViewMode('artist-albums');
            }
        } else if (view === 'album-tracks' && artistParam && albumParam) {
            const artistDecoded = decodeURIComponent(artistParam);
            const albumDecoded = decodeURIComponent(albumParam);
            const artist = artists.find((a) => a.artistName === artistDecoded);
            if (artist) {
                const album = artist.albums.find((a) => a.albumName === albumDecoded);
                if (album) {
                    setSelectedArtist(artist);
                    setSelectedAlbum(album);
                    setViewMode('album-tracks');
                }
            }
        }
    }, [artists, searchParams]);
    
    const handleCategoryChange = (category: FileCategory) => {
        setSelectedCategory(category);
        navigate(getCategoryRoute(category));
    };

    const cacheInvalidationTrigger = useCacheInvalidationTrigger(user?.id ?? null, 'musics');

    // Charger et organiser les fichiers
    useEffect(() => {
        const fetchFiles = async () => {
            if (!user?.id) return;

            setLoading(true);
            setError(null);

            try {
                const token = localStorage.getItem('videomi_token');
                const response = await fetch(
                    `https://videomi.uk/api/upload/user/${user.id}?category=musics`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );

                if (!response.ok) throw new Error('Erreur lors de la récupération des fichiers');

                const data = await response.json() as { files: FileItem[] };
                const files = data.files || [];

                // Organiser par artiste
                const artistMap = new Map<string, {
                    artistName: string;
                    artistThumbnail: string | null;
                    albums: Map<string, Album>;
                    trackCount: number;
                    isUnknown?: boolean;
                }>();

                // Fonctions helpers pour obtenir les thumbnails séparément
                // IMPORTANT: thumbnail_url = image de l'artiste, album_thumbnails = images des albums
                
                // Retourne l'image de l'artiste (thumbnail_url)
                const getArtistThumbnail = (file: FileItem): string | null => {
                    return file.thumbnail_url || null;
                };
                
                // Retourne un tableau des images d'albums (album_thumbnails)
                const getAlbumThumbnails = (file: FileItem): string[] => {
                    if (!file.album_thumbnails) {
                        return [];
                    }
                    try {
                        const parsed = JSON.parse(file.album_thumbnails);
                        if (Array.isArray(parsed)) {
                            return parsed.filter(t => t && typeof t === 'string');
                        }
                    } catch {}
                    return [];
                };

                let identifiedCount = 0;
                let unidentifiedCount = 0;
                
                for (const file of files) {
                    const title = cleanString(file.title) || cleanString(file.filename)?.replace(/\.[^/.]+$/, '') || 'Sans titre';
                    const artistThumbnail = getArtistThumbnail(file);
                    const albumThumbnails = getAlbumThumbnails(file);
                    
                    // Vérifier si fichier non identifié : pas de source_id = pas encore identifié
                    // Même s'il a des artists (récupérés depuis YouTube par exemple), il doit être dans "Artiste inconnu"
                    const isUnidentified = !file.source_id;
                    
                    if (isUnidentified) {
                        unidentifiedCount++;
                        // Ajouter à "Artiste inconnu"
                        const unknownArtist = 'Artiste inconnu';
                        if (!artistMap.has(unknownArtist)) {
                            artistMap.set(unknownArtist, {
                                artistName: unknownArtist,
                                artistThumbnail: artistThumbnail, // Image de l'artiste
                                albums: new Map(),
                                trackCount: 0,
                                isUnknown: true
                            });
                        }
                        
                        const artistData = artistMap.get(unknownArtist)!;
                        artistData.trackCount++;
                        
                        // Mettre à jour la thumbnail de l'artiste si pas encore définie
                        if (!artistData.artistThumbnail && artistThumbnail) {
                            artistData.artistThumbnail = artistThumbnail;
                        }
                        
                        // Album "À identifier"
                        const albumName = 'À identifier';
                        const albumThumbnail = albumThumbnails[0] || null; // Première image d'album, ou null
                        if (!artistData.albums.has(albumName)) {
                            artistData.albums.set(albumName, {
                                albumName,
                                albumThumbnail: albumThumbnail, // Image de l'album
                                year: null,
                                tracks: []
                            });
                        } else {
                            // Mettre à jour la thumbnail de l'album si manquante
                            const album = artistData.albums.get(albumName)!;
                            if (!album.albumThumbnail && albumThumbnail) {
                                album.albumThumbnail = albumThumbnail;
                            }
                        }
                        artistData.albums.get(albumName)!.tracks.push({ file, title });
                        continue;
                    }

                    try {
                        identifiedCount++;
                        // Parser les artistes en s'assurant que c'est un tableau valide
                        let artistsArray: string[] = [];
                        if (file.artists) {
                            try {
                                const parsed = typeof file.artists === 'string' ? JSON.parse(file.artists) : file.artists;
                                if (Array.isArray(parsed)) {
                                    artistsArray = parsed.filter((a: any) => typeof a === 'string' && a.trim().length > 0);
                                } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                                    artistsArray = [parsed];
                                }
                            } catch {
                                // Si le parsing échoue, ignorer
                            }
                        }
                        
                        let albumsArray: string[] = [];
                        if (file.albums) {
                            try {
                                const parsed = typeof file.albums === 'string' ? JSON.parse(file.albums) : file.albums;
                                if (Array.isArray(parsed)) {
                                    albumsArray = parsed.filter((a: any) => typeof a === 'string' && a.trim().length > 0);
                                } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                                    albumsArray = [parsed];
                                }
                            } catch {
                                // Si le parsing échoue, ignorer
                            }
                        }

                        // Pour les artistes identifiés mais sans nom d'artiste explicite
                        const artistNames = artistsArray.length > 0 
                            ? artistsArray.map(a => cleanString(a)).filter(a => a.length > 0)
                            : ['Artiste inconnu'];
                        
                        for (const rawArtistName of artistNames) {
                            const artistName = cleanString(rawArtistName) || 'Artiste inconnu';
                            // Flag pour savoir si c'est un artiste sans nom
                            const isUnknownArtist = artistName === 'Artiste inconnu';
                            
                            if (!artistMap.has(artistName)) {
                                artistMap.set(artistName, {
                                    artistName,
                                    artistThumbnail: artistThumbnail, // Image de l'artiste
                                    albums: new Map(),
                                    trackCount: 0,
                                    isUnknown: isUnknownArtist
                                });
                            }

                            const artistData = artistMap.get(artistName)!;
                            artistData.trackCount++;
                            
                            // Mettre à jour la thumbnail de l'artiste si pas encore définie
                            if (!artistData.artistThumbnail && artistThumbnail) {
                                artistData.artistThumbnail = artistThumbnail;
                            }

                            if (albumsArray.length > 0) {
                                for (let i = 0; i < albumsArray.length; i++) {
                                    const rawAlbumName = albumsArray[i];
                                    const albumName = cleanString(rawAlbumName) || 'Sans nom';
                                    // Utiliser l'image d'album correspondante à l'index, ou la première disponible, ou null
                                    const albumThumb = albumThumbnails[i] || albumThumbnails[0] || null;

                                    if (!artistData.albums.has(albumName)) {
                                        artistData.albums.set(albumName, {
                                            albumName,
                                            albumThumbnail: albumThumb, // Image de l'album
                                            year: file.year,
                                            tracks: []
                                        });
                                    } else {
                                        // Mettre à jour la thumbnail de l'album si manquante
                                        const album = artistData.albums.get(albumName)!;
                                        if (!album.albumThumbnail && albumThumb) {
                                            album.albumThumbnail = albumThumb;
                                        }
                                    }

                                    artistData.albums.get(albumName)!.tracks.push({ file, title });
                                }
                            } else {
                                // Singles
                                const singlesAlbumThumbnail = albumThumbnails[0] || null; // Première image d'album pour Singles
                                if (!artistData.albums.has('Singles')) {
                                    artistData.albums.set('Singles', {
                                        albumName: 'Singles',
                                        albumThumbnail: singlesAlbumThumbnail, // Image de l'album
                                        year: null,
                                        tracks: []
                                    });
                                }
                                artistData.albums.get('Singles')!.tracks.push({ file, title });
                            }
                        }
                    } catch {
                        // En cas d'erreur de parsing, ajouter à Artiste inconnu
                        const unknownArtist = 'Artiste inconnu';
                        if (!artistMap.has(unknownArtist)) {
                            artistMap.set(unknownArtist, {
                                artistName: unknownArtist,
                                artistThumbnail: null,
                                albums: new Map(),
                                trackCount: 0,
                                isUnknown: true
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
                                tracks: []
                            });
                        }
                        artistData.albums.get(albumName)!.tracks.push({ file, title });
                    }
                }

                // Convertir en array et trier
                const artistsArray = Array.from(artistMap.values())
                    .map(artist => ({
                        ...artist,
                        albums: Array.from(artist.albums.values()).sort((a, b) => {
                            if (a.albumName === 'Singles') return 1;
                            if (b.albumName === 'Singles') return -1;
                            if (a.albumName === 'À identifier') return 1;
                            if (b.albumName === 'À identifier') return -1;
                            if (a.year && b.year) return b.year - a.year;
                            return a.albumName.localeCompare(b.albumName);
                        })
                    }))
                    .sort((a, b) => {
                        // Artiste inconnu en dernier (utiliser isUnknown)
                        if (a.isUnknown && !b.isUnknown) return 1;
                        if (!a.isUnknown && b.isUnknown) return -1;
                        return a.artistName.localeCompare(b.artistName);
                    });

                setArtists(artistsArray);
            } catch (err) {
                console.error('Erreur fetch fichiers:', err);
                setError(err instanceof Error ? err.message : 'Erreur inconnue');
            } finally {
                setLoading(false);
            }
        };

        if (user?.id) fetchFiles();
    }, [user?.id, config, cleanString, cacheInvalidationTrigger]);


    // Navigation handlers (mise à jour URL pour partage / deep link)
    const handleArtistClick = (artist: Artist) => {
        setSelectedArtist(artist);
        setSelectedAlbum(null);
        setViewMode('artist-albums');
        setSearchParams(
            { view: 'artist-albums', artist: encodeURIComponent(artist.artistName) },
            { replace: true }
        );
    };

    const handleAlbumClick = (album: Album) => {
        if (!selectedArtist) return;
        setSelectedAlbum(album);
        setViewMode('album-tracks');
        setSearchParams(
            {
                view: 'album-tracks',
                artist: encodeURIComponent(selectedArtist.artistName),
                album: encodeURIComponent(album.albumName),
            },
            { replace: true }
        );
    };

    const handleBack = () => {
        if (viewMode === 'album-tracks') {
            setSelectedAlbum(null);
            setViewMode('artist-albums');
            setSearchParams(
                selectedArtist
                    ? { view: 'artist-albums', artist: encodeURIComponent(selectedArtist.artistName) }
                    : { view: 'artists' },
                { replace: true }
            );
        } else if (viewMode === 'artist-albums') {
            setSelectedArtist(null);
            setViewMode('artists');
            setSearchParams({}, { replace: true });
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
            <>
                <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
                    <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                    <PageSkeleton lines={6} minHeight="60vh" variant="cards" />
                </div>
            </>
        );
    }

    if (error) {
        return (
            <>
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
            </>
        );
    }

    return (
        <>
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
        </>
    );
}
