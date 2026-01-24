// INFO : app/routes/match.tsx
// Page de sélection des correspondances pour les fichiers médias
// Workflow en étapes : pour musique (artiste → album), pour films/séries (direct)

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useConfig } from '~/hooks/useConfig';
import { Navigation } from '~/components/navigation/Navigation';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { useAuth } from '~/hooks/useAuth';
import { searchMovies, searchTVShows, searchMusicOnSpotify, searchArtistsOnSpotify, searchAlbumsForArtistOnSpotify, downloadAndStoreThumbnail, type MediaMatch } from '~/utils/media/mediaMetadata';
import { darkTheme } from '~/utils/ui/theme';
import type { FileCategory } from '~/utils/file/fileClassifier';

type MatchStep = 'artist' | 'title' | 'album' | 'movie' | 'confirm';

export default function MatchRoute() {
    const { fileId, category } = useParams<{ fileId: string; category: FileCategory }>();
    const navigate = useNavigate();
    const { config } = useConfig();
    const { user, logout } = useAuth();
    
    const [loading, setLoading] = useState(true);
    const [step, setStep] = useState<MatchStep>('artist');
    
    // Données de base du fichier
    const [fileInfo, setFileInfo] = useState<{
        filename: string | null;
        title?: string | null;
        artist?: string | null;
        album?: string | null;
        year?: number | null;
    } | null>(null);
    
    // Pour musique : liste des artistes, puis titre, puis albums
    const [artists, setArtists] = useState<Array<{ id: string; name: string; thumbnail_url: string | null }>>([]);
    const [selectedArtist, setSelectedArtist] = useState<{ id: string; name: string } | null>(null);
    const [titleQuery, setTitleQuery] = useState(''); // Titre recherché pour la musique
    const [albums, setAlbums] = useState<MediaMatch[]>([]);
    const [selectedAlbums, setSelectedAlbums] = useState<MediaMatch[]>([]); // Permettre plusieurs albums
    const [allowNoAlbum, setAllowNoAlbum] = useState(false); // Permettre de ne pas sélectionner d'album
    const [showingAllAlbums, setShowingAllAlbums] = useState(false); // Indique si on affiche tous les albums de l'artiste
    const [loadingAllAlbums, setLoadingAllAlbums] = useState(false); // État de chargement pour tous les albums
    
    // Pour films/séries : liste des matches
    const [matches, setMatches] = useState<MediaMatch[]>([]);
    const [selectedMatch, setSelectedMatch] = useState<MediaMatch | null>(null);
    
    // Recherche
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    useEffect(() => {
        if (!fileId || !category || (category !== 'videos' && category !== 'musics')) {
            navigate('/films');
            return;
        }

        loadFileInfo();
    }, [fileId, category]);

    useEffect(() => {
        // Si musique, commencer par l'étape artiste
        // Si vidéo, commencer par l'étape movie
        if (category === 'musics') {
            setStep('artist');
            // Recherche automatique basée sur les métadonnées du fichier
            if (fileInfo?.artist || fileInfo?.title) {
                performArtistSearch(fileInfo.artist || fileInfo.title || '');
            }
        } else if (category === 'videos') {
            setStep('movie');
            // Recherche automatique basée sur le nom du fichier
            if (fileInfo?.title || fileInfo?.filename) {
                const searchTerm = fileInfo.title || fileInfo.filename?.replace(/\.[^/.]+$/, '') || '';
                if (searchTerm) {
                    performMovieSearch(searchTerm);
                }
            }
        }
    }, [fileInfo, category]);

    const loadFileInfo = async () => {
        try {
            const token = localStorage.getItem('videomi_token');
            const baseUrl = window.location.origin;
            const response = await fetch(`${baseUrl}/api/files/${category}/${fileId}/info`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Fichier non trouvé');
            }

            const data = await response.json() as { 
                file: { 
                    filename?: string | null;
                    title?: string | null;
                    artists?: string | null;
                    albums?: string | null;
                    year?: number | null;
                } 
            };
            
            const file = data.file;
            const filename = file.filename || '';
            const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');
            
            // Extraire l'année du filename si disponible (fallback)
            let year: number | null = null;
            const yearMatch = filenameWithoutExt.match(/\b(19|20)\d{2}\b/);
            if (yearMatch) {
                const extractedYear = parseInt(yearMatch[0]);
                if (extractedYear >= 1900 && extractedYear <= new Date().getFullYear() + 1) {
                    year = extractedYear;
                }
            }
            
            // Extraire les métadonnées de file_metadata (artists et albums sont en JSON)
            let artistFromMetadata: string | null = null;
            let albumFromMetadata: string | null = null;
            let titleFromMetadata: string | null = null;
            
            try {
                if (file.artists) {
                    try {
                        const parsed = typeof file.artists === 'string' ? JSON.parse(file.artists) : file.artists;
                        let artistsArray: string[] = [];
                        if (Array.isArray(parsed)) {
                            artistsArray = parsed.filter((a: any) => typeof a === 'string' && a.trim().length > 0);
                        } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                            artistsArray = [parsed];
                        }
                        if (artistsArray.length > 0) {
                            artistFromMetadata = artistsArray[0];
                        }
                    } catch {
                        // Si le parsing échoue, ignorer
                    }
                }
                if (file.albums) {
                    try {
                        const parsed = typeof file.albums === 'string' ? JSON.parse(file.albums) : file.albums;
                        let albumsArray: string[] = [];
                        if (Array.isArray(parsed)) {
                            albumsArray = parsed.filter((a: any) => typeof a === 'string' && a.trim().length > 0);
                        } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                            albumsArray = [parsed];
                        }
                        if (albumsArray.length > 0) {
                            albumFromMetadata = albumsArray[0];
                        }
                    } catch {
                        // Si le parsing échoue, ignorer
                    }
                }
                if (file.title) {
                    titleFromMetadata = file.title;
                }
            } catch (parseError) {
                console.warn('Erreur parsing métadonnées JSON:', parseError);
            }
            
            // Déterminer les valeurs à utiliser : métadonnées en priorité, sinon filename
            const finalArtist = artistFromMetadata || null;
            const finalTitle = titleFromMetadata || filenameWithoutExt;
            const finalAlbum = albumFromMetadata || null;
            const finalYear = file.year || year;
            
            setFileInfo({
                filename,
                title: finalTitle,
                artist: finalArtist,
                album: finalAlbum,
                year: finalYear
            });
            
            // Pré-remplir la recherche d'artiste avec l'artiste des métadonnées si disponible
            if (finalArtist) {
                setSearchQuery(finalArtist);
            } else {
                // Si pas d'artiste dans les métadonnées, laisser vide pour que l'utilisateur entre manuellement
                setSearchQuery('');
            }
            
            // Pré-remplir le titre si disponible (pour l'étape title)
            if (finalTitle && finalTitle !== filenameWithoutExt) {
                // Utiliser le titre des métadonnées si différent du filename
                setTitleQuery(finalTitle);
            } else {
                // Utiliser le filename sans extension comme fallback
                setTitleQuery(filenameWithoutExt);
            }
        } catch (error) {
            console.error('Erreur chargement métadonnées:', error);
            setLoading(false);
        }
    };

    // Pour musique : rechercher des artistes directement sur Spotify
    const performArtistSearch = async (query: string) => {
        if (!query || query.trim() === '' || category !== 'musics') return;
        
        setSearching(true);
        setSearchQuery(query);
        setSearchError(null);
        
        try {
            // Rechercher directement des artistes sur Spotify
            const artistResults = await searchArtistsOnSpotify(
                query,
                config?.spotifyClientId || undefined,
                config?.spotifyClientSecret || undefined,
                30
            );
            
            // Si on n'a pas trouvé d'artistes, essayer aussi de chercher des tracks et extraire les artistes
            if (artistResults.length === 0) {
                const musicResult = await searchMusicOnSpotify(
                    query,
                    undefined,
                    config?.spotifyClientId || undefined,
                    config?.spotifyClientSecret || undefined,
                    50
                );
                
                // Extraire les artistes uniques des résultats
                const artistMap = new Map<string, { id: string; name: string; thumbnail_url: string | null }>();
                
                for (const match of musicResult.matches) {
                    if (match.artist) {
                        const artistKey = match.artist.toLowerCase().trim();
                        if (!artistMap.has(artistKey)) {
                            artistMap.set(artistKey, {
                                id: match.source_id, // Utiliser le track ID temporairement
                                name: match.artist,
                                thumbnail_url: match.thumbnail_url
                            });
                        }
                    }
                }
                
                setArtists(Array.from(artistMap.values()));
            } else {
                setArtists(artistResults);
            }
        } catch (error) {
            console.error('Erreur recherche artistes:', error);
            setSearchError('Impossible de rechercher les artistes. Vérifiez votre connexion ou réessayez.');
        } finally {
            setSearching(false);
            setLoading(false);
        }
    };

    // Pour musique : rechercher tous les albums contenant un titre spécifique pour un artiste
    const performAlbumSearch = async (artistId: string, artistName: string, title: string) => {
        if (!artistId || !artistName || !title || category !== 'musics') return;
        
        setSearching(true);
        setShowingAllAlbums(false); // Réinitialiser l'état
        setSearchError(null);
        
        try {
            // Rechercher des tracks avec ce titre exact et cet artiste
            const musicResult = await searchMusicOnSpotify(
                title,
                artistName || undefined,
                config?.spotifyClientId || undefined,
                config?.spotifyClientSecret || undefined,
                50 // Augmenter pour avoir plus de résultats (différents albums)
            );
            
            // Extraire tous les albums uniques contenant ce titre
            const albumMap = new Map<string, MediaMatch>();
            
            for (const match of musicResult.matches) {
                // Filtrer uniquement les matches avec le même titre et le même artiste
                if (match.title && match.artist && 
                    match.title.toLowerCase().trim() === title.toLowerCase().trim() &&
                    match.artist.toLowerCase().trim() === artistName.toLowerCase().trim() &&
                    match.album) {
                    // Utiliser album + year comme clé pour distinguer les versions différentes
                    const albumKey = `${match.album.toLowerCase()}_${match.year || 'unknown'}`;
                    if (!albumMap.has(albumKey)) {
                        albumMap.set(albumKey, match);
                    }
                }
            }
            
            // Trier par année (plus récent en premier)
            const albumsList = Array.from(albumMap.values()).sort((a, b) => {
                const yearA = a.year || 0;
                const yearB = b.year || 0;
                return yearB - yearA;
            });
            
            setAlbums(albumsList);
        } catch (error) {
            console.error('Erreur recherche albums:', error);
            setSearchError('Impossible de rechercher les albums. Vérifiez votre connexion ou réessayez.');
            setAlbums([]);
        } finally {
            setSearching(false);
        }
    };

    // Pour musique : charger tous les albums de l'artiste
    const loadAllArtistAlbums = async (artistId: string, artistName: string) => {
        if (!artistId || !artistName || category !== 'musics') return;
        
        setLoadingAllAlbums(true);
        setShowingAllAlbums(true);
        
        try {
            // Utiliser searchAlbumsForArtistOnSpotify sans titre pour récupérer tous les albums
            const albumsResult = await searchAlbumsForArtistOnSpotify(
                artistId,
                null, // Pas de titre spécifique
                config?.spotifyClientId || undefined,
                config?.spotifyClientSecret || undefined,
                50,
                artistName
            );
            
            // Trier par année (plus récent en premier)
            const albumsList = albumsResult.matches.sort((a, b) => {
                const yearA = a.year || 0;
                const yearB = b.year || 0;
                return yearB - yearA;
            });
            
            setAlbums(albumsList);
        } catch (error) {
            console.error('Erreur chargement albums artiste:', error);
            setSearchError('Impossible de charger les albums. Vérifiez votre connexion ou réessayez.');
            setAlbums([]);
        } finally {
            setLoadingAllAlbums(false);
        }
    };

    // Pour films/séries : rechercher films et séries
    const performMovieSearch = async (query: string) => {
        if (!query || query.trim() === '' || category !== 'videos') return;
        
        setSearching(true);
        setSearchQuery(query);
        setSearchError(null);
        
        try {
            const [moviesResult, tvResult] = await Promise.all([
                searchMovies(query, fileInfo?.year || undefined, config?.tmdbApiKey || undefined, 20),
                searchTVShows(query, fileInfo?.year || undefined, config?.tmdbApiKey || undefined, 20)
            ]);
            
            // Combiner et trier par score
            const allMatches = [...moviesResult.matches, ...tvResult.matches]
                .sort((a, b) => (b.score || 0) - (a.score || 0));
            
            setMatches(allMatches);
        } catch (error) {
            console.error('Erreur recherche correspondances:', error);
            setSearchError('Impossible de rechercher les films/séries. Vérifiez votre connexion ou réessayez.');
        } finally {
            setSearching(false);
            setLoading(false);
        }
    };

    const handleArtistSelect = (artist: { id: string; name: string }) => {
        setSelectedArtist(artist);
        setStep('title'); // Passer à l'étape titre
        setAlbums([]);
        setSelectedAlbums([]);
        setAllowNoAlbum(false);
        setShowingAllAlbums(false);
        setLoadingAllAlbums(false);
    };

    const handleTitleSubmit = () => {
        if (!selectedArtist || !titleQuery.trim()) {
            alert('Veuillez entrer un titre');
            return;
        }
        setStep('album');
        // Rechercher tous les albums contenant ce titre pour cet artiste
        performAlbumSearch(selectedArtist.id, selectedArtist.name, titleQuery.trim());
    };

    const handleAlbumToggle = (album: MediaMatch) => {
        setSelectedAlbums(prev => {
            const isSelected = prev.some(a => a.id === album.id);
            if (isSelected) {
                // Désélectionner
                return prev.filter(a => a.id !== album.id);
            } else {
                // Sélectionner (permet plusieurs)
                return [...prev, album];
            }
        });
    };

    const handleSkipAlbum = () => {
        setAllowNoAlbum(true);
        setSelectedAlbums([]);
        setStep('confirm');
    };

    const handleMovieSelect = (match: MediaMatch) => {
        setSelectedMatch(match);
        setStep('confirm');
    };

    const handleConfirm = async () => {
        if (!fileId || !category) return;
        
        // Pour musique : vérifier qu'on a au moins un artiste sélectionné
        if (category === 'musics' && !selectedArtist) {
            alert('Veuillez sélectionner un artiste');
            return;
        }
        
        // Pour vidéo : vérifier qu'on a une sélection
        if (category === 'videos' && !selectedMatch) {
            alert('Veuillez sélectionner un film ou une série');
            return;
        }
        
        // Pour musique : on peut confirmer même sans album
        const matchToSave = category === 'musics' ? (selectedAlbums[0] || null) : selectedMatch;
        
        try {
            setLoading(true);
            
            // Télécharger et stocker la miniature si disponible
            let thumbnailR2Path: string | null = null;
            // Pour musique, utiliser la première miniature d'album sélectionné, sinon celle du premier match
            const thumbnailUrl = category === 'musics' 
                ? (selectedAlbums[0]?.thumbnail_url || null)
                : (matchToSave?.thumbnail_url || null);
            
            if (thumbnailUrl) {
                thumbnailR2Path = await downloadAndStoreThumbnail(
                    thumbnailUrl,
                    fileId,
                    category
                );
            }
            
            // Enregistrer la correspondance dans D1
            const token = localStorage.getItem('videomi_token');
            const baseUrl = window.location.origin;
            const metadata: any = {
                thumbnail_url: thumbnailUrl,
                thumbnail_r2_path: thumbnailR2Path,
                source_api: matchToSave?.source_api || null,
                source_id: matchToSave?.source_id || null,
                title: matchToSave?.title || fileInfo?.title || null,
                year: matchToSave?.year || fileInfo?.year || null,
                genres: matchToSave?.genres || null,
                description: matchToSave?.description || null
            };
            
            if (category === 'musics' && selectedArtist) {
                metadata.artists = [selectedArtist.name];
                // Permettre plusieurs albums ou aucun album
                if (selectedAlbums.length > 0) {
                    metadata.albums = selectedAlbums.map(a => a.album || a.title).filter(Boolean);
                    // Stocker les thumbnails de chaque album pour affichage en grille
                    metadata.album_thumbnails = selectedAlbums.map(a => a.thumbnail_url || null).filter(Boolean);
                } else if (allowNoAlbum) {
                    metadata.albums = null; // Pas d'album
                    metadata.album_thumbnails = null;
                } else {
                    // Si on a un match mais pas d'albums sélectionnés, utiliser le premier match
                    metadata.albums = matchToSave?.album ? [matchToSave.album] : null;
                    metadata.album_thumbnails = matchToSave?.thumbnail_url ? [matchToSave.thumbnail_url] : null;
                }
            }
            
            const response = await fetch(`${baseUrl}/api/files/${fileId}/metadata`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(metadata)
            });
            
            if (!response.ok) {
                throw new Error('Erreur lors de la sauvegarde');
            }
            
            // Rediriger vers la page appropriée selon la catégorie
            if (category === 'musics') {
                navigate('/musics');
            } else {
                navigate('/films');
            }
        } catch (error) {
            console.error('Erreur sauvegarde correspondance:', error);
            alert('Erreur lors de la sauvegarde. Veuillez réessayer.');
            setLoading(false);
        }
    };

    if (loading && !fileInfo) {
        return (
            <AuthGuard>
                <div style={{ 
                    minHeight: '100vh', 
                    backgroundColor: darkTheme.background.primary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            border: `4px solid ${darkTheme.border.primary}`,
                            borderTopColor: darkTheme.accent.blue,
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            margin: '0 auto 16px'
                        }} />
                        <p style={{ color: darkTheme.text.secondary }}>
                            Chargement des informations...
                        </p>
                    </div>
                </div>
            </AuthGuard>
        );
    }

    return (
        <AuthGuard>
            <div style={{ minHeight: '100vh', backgroundColor: darkTheme.background.primary }}>
                <Navigation user={user!} onLogout={logout} />
                
                <main style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '40px 20px',
                    fontFamily: 'system-ui, sans-serif'
                }}>
                    {/* En-tête */}
                    <div style={{ marginBottom: '32px' }}>
                        <h1 style={{
                            fontSize: '32px',
                            fontWeight: 'bold',
                            marginBottom: '8px',
                            color: darkTheme.text.primary
                        }}>
                            Identifier ce {category === 'musics' ? 'morceau' : 'film/série'}
                        </h1>
                        <p style={{
                            color: darkTheme.text.secondary,
                            fontSize: '16px',
                            marginBottom: '8px'
                        }}>
                            {fileInfo?.filename && (
                                <>Fichier : <strong>{fileInfo.filename}</strong></>
                            )}
                        </p>
                        {fileInfo?.title && fileInfo.title !== fileInfo.filename?.replace(/\.[^/.]+$/, '') && (
                            <p style={{
                                color: darkTheme.text.tertiary,
                                fontSize: '14px',
                                fontStyle: 'italic'
                            }}>
                                Titre détecté dans les métadonnées : <strong>{fileInfo.title}</strong>
                            </p>
                        )}
                        {fileInfo?.artist && category === 'musics' && (
                            <p style={{
                                color: darkTheme.text.tertiary,
                                fontSize: '14px',
                                fontStyle: 'italic'
                            }}>
                                Artiste détecté : <strong>{fileInfo.artist}</strong>
                            </p>
                        )}
                    </div>

                    {/* Indicateur d'étapes pour musique */}
                    {category === 'musics' && (
                        <div style={{
                            display: 'flex',
                            gap: '16px',
                            marginBottom: '32px',
                            paddingBottom: '16px',
                            borderBottom: `1px solid ${darkTheme.border.primary}`
                        }}>
                            <div style={{
                                flex: 1,
                                padding: '12px',
                                borderRadius: '8px',
                                backgroundColor: step === 'artist' ? darkTheme.accent.blue : darkTheme.background.secondary,
                                color: step === 'artist' ? '#fff' : darkTheme.text.secondary,
                                textAlign: 'center',
                                fontWeight: step === 'artist' ? '600' : '400'
                            }}>
                                1. Choisir l'artiste
                            </div>
                            <div style={{
                                flex: 1,
                                padding: '12px',
                                borderRadius: '8px',
                                backgroundColor: step === 'title' ? darkTheme.accent.blue : darkTheme.background.secondary,
                                color: step === 'title' ? '#fff' : darkTheme.text.secondary,
                                textAlign: 'center',
                                fontWeight: step === 'title' ? '600' : '400',
                                opacity: step === 'album' || step === 'confirm' || step === 'title' ? 1 : 0.5
                            }}>
                                2. Entrer le titre
                            </div>
                            <div style={{
                                flex: 1,
                                padding: '12px',
                                borderRadius: '8px',
                                backgroundColor: step === 'album' ? darkTheme.accent.blue : darkTheme.background.secondary,
                                color: step === 'album' ? '#fff' : darkTheme.text.secondary,
                                textAlign: 'center',
                                fontWeight: step === 'album' ? '600' : '400',
                                opacity: step === 'confirm' || step === 'album' ? 1 : 0.5
                            }}>
                                3. Choisir l'album
                            </div>
                            <div style={{
                                flex: 1,
                                padding: '12px',
                                borderRadius: '8px',
                                backgroundColor: step === 'confirm' ? darkTheme.accent.blue : darkTheme.background.secondary,
                                color: step === 'confirm' ? '#fff' : darkTheme.text.secondary,
                                textAlign: 'center',
                                fontWeight: step === 'confirm' ? '600' : '400',
                                opacity: step === 'confirm' ? 1 : 0.5
                            }}>
                                4. Confirmer
                            </div>
                        </div>
                    )}

                    {/* Étape 1 : Choisir l'artiste (musique uniquement) */}
                    {category === 'musics' && step === 'artist' && (
                        <div>
                            <div style={{
                                backgroundColor: darkTheme.background.secondary,
                                borderRadius: '12px',
                                padding: '24px',
                                marginBottom: '24px',
                                boxShadow: darkTheme.shadow.medium
                            }}>
                                <h2 style={{
                                    fontSize: '20px',
                                    fontWeight: '600',
                                    marginBottom: '16px',
                                    color: darkTheme.text.primary
                                }}>
                                    Rechercher l'artiste
                                </h2>
                                {fileInfo?.artist && (
                                    <p style={{
                                        color: darkTheme.text.secondary,
                                        fontSize: '14px',
                                        marginBottom: '12px',
                                        fontStyle: 'italic'
                                    }}>
                                        Artiste détecté dans les métadonnées : <strong>{fileInfo.artist}</strong>
                                    </p>
                                )}
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                performArtistSearch(searchQuery);
                                            }
                                        }}
                                        placeholder="Nom de l'artiste..."
                                        style={{
                                            flex: 1,
                                            padding: '12px 16px',
                                            backgroundColor: darkTheme.background.primary,
                                            border: `1px solid ${darkTheme.border.primary}`,
                                            borderRadius: '8px',
                                            color: darkTheme.text.primary,
                                            fontSize: '16px',
                                            outline: 'none'
                                        }}
                                    />
                                    <button
                                        onClick={() => performArtistSearch(searchQuery)}
                                        disabled={searching || !searchQuery.trim()}
                                        style={{
                                            padding: '12px 24px',
                                            backgroundColor: searching || !searchQuery.trim() ? darkTheme.text.disabled : darkTheme.accent.blue,
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '8px',
                                            fontSize: '16px',
                                            fontWeight: '500',
                                            cursor: searching || !searchQuery.trim() ? 'not-allowed' : 'pointer',
                                            transition: 'background-color 0.2s'
                                        }}
                                    >
                                        {searching ? 'Recherche...' : 'Rechercher'}
                                    </button>
                            </div>
                        </div>

                            {/* Erreur de recherche */}
                            {searchError && (
                                <div style={{
                                    padding: '16px',
                                    backgroundColor: 'rgba(229, 9, 20, 0.1)',
                                    border: '1px solid rgba(229, 9, 20, 0.3)',
                                    borderRadius: '8px',
                                    marginBottom: '24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e50914' }}>
                                        <span>⚠️</span>
                                        <span>{searchError}</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setSearchError(null);
                                            if (searchQuery) performArtistSearch(searchQuery);
                                        }}
                                        style={{
                                            padding: '8px 16px',
                                            backgroundColor: darkTheme.accent.blue,
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '14px'
                                        }}
                                    >
                                        Réessayer
                                    </button>
                                </div>
                            )}

                            {/* Liste des artistes */}
                            {artists.length > 0 ? (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                    gap: '16px'
                                }}>
                                    {artists.map((artist, index) => (
                                        <div
                                            key={`${artist.id}-${index}`}
                                            onClick={() => handleArtistSelect(artist)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    handleArtistSelect(artist);
                                                }
                                            }}
                                            tabIndex={0}
                                            role="button"
                                            aria-label={`Sélectionner ${artist.name}`}
                                            style={{
                                                backgroundColor: darkTheme.background.secondary,
                                                borderRadius: '12px',
                                                padding: '16px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                border: `2px solid ${darkTheme.border.primary}`,
                                                textAlign: 'center'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.borderColor = darkTheme.accent.blue;
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.boxShadow = darkTheme.shadow.medium;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = darkTheme.border.primary;
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = 'none';
                                            }}
                                        >
                                            {artist.thumbnail_url ? (
                                                <img
                                                    src={artist.thumbnail_url}
                                                    alt={artist.name}
                                                    style={{
                                                        width: '100%',
                                                        aspectRatio: '1',
                                                        objectFit: 'cover',
                                                        borderRadius: '8px',
                                                        marginBottom: '12px'
                                                    }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: '100%',
                                                    aspectRatio: '1',
                                                    backgroundColor: darkTheme.background.tertiary,
                                                    borderRadius: '8px',
                                                    marginBottom: '12px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '48px'
                                                }}>
                                                    🎵
                                                </div>
                                            )}
                                            <div style={{
                                                fontWeight: '600',
                                                color: darkTheme.text.primary,
                                                fontSize: '16px'
                                            }}>
                                                {artist.name}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : searchQuery && !searching ? (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '40px',
                                    color: darkTheme.text.tertiary
                                }}>
                                    Aucun artiste trouvé. Essayez une autre recherche.
                                </div>
                            ) : null}
                        </div>
                    )}

                    {/* Étape 2 : Entrer le titre (musique uniquement) */}
                    {category === 'musics' && step === 'title' && selectedArtist && (
                        <div>
                            <div style={{
                                backgroundColor: darkTheme.background.secondary,
                                borderRadius: '12px',
                                padding: '24px',
                                marginBottom: '24px',
                                boxShadow: darkTheme.shadow.medium
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: '16px'
                                }}>
                                    <div>
                                        <h2 style={{
                                            fontSize: '20px',
                                            fontWeight: '600',
                                            color: darkTheme.text.primary,
                                            marginBottom: '4px'
                                        }}>
                                            Entrer le titre de la chanson
                                        </h2>
                                        <p style={{
                                            color: darkTheme.text.secondary,
                                            fontSize: '14px'
                                        }}>
                                            Artiste sélectionné : <strong>{selectedArtist.name}</strong>
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setStep('artist');
                                            setSelectedArtist(null);
                                            // Garder le titleQuery (l'utilisateur peut l'avoir modifié)
                                            setAlbums([]);
                                            setSelectedAlbums([]);
                                            setAllowNoAlbum(false);
                                        }}
                                        style={{
                                            padding: '8px 16px',
                                            backgroundColor: 'transparent',
                                            border: `1px solid ${darkTheme.border.primary}`,
                                            borderRadius: '6px',
                                            color: darkTheme.text.secondary,
                                            fontSize: '14px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ← Retour
                                    </button>
                                </div>
                                
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <input
                                        type="text"
                                        value={titleQuery}
                                        onChange={(e) => setTitleQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleTitleSubmit();
                                            }
                                        }}
                                        placeholder="Titre de la chanson..."
                                        style={{
                                            flex: 1,
                                            padding: '12px 16px',
                                            backgroundColor: darkTheme.background.primary,
                                            border: `1px solid ${darkTheme.border.primary}`,
                                            borderRadius: '8px',
                                            color: darkTheme.text.primary,
                                            fontSize: '16px',
                                            outline: 'none'
                                        }}
                                    />
                                    <button
                                        onClick={handleTitleSubmit}
                                        disabled={searching || !titleQuery.trim()}
                                        style={{
                                            padding: '12px 24px',
                                            backgroundColor: (searching || !titleQuery.trim()) ? darkTheme.text.disabled : darkTheme.accent.blue,
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '8px',
                                            fontSize: '16px',
                                            fontWeight: '500',
                                            cursor: (searching || !titleQuery.trim()) ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {searching ? 'Recherche...' : 'Rechercher'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Étape 3 : Choisir l'album (musique uniquement) */}
                    {category === 'musics' && step === 'album' && selectedArtist && titleQuery && (
                        <div>
                            <div style={{
                                backgroundColor: darkTheme.background.secondary,
                                borderRadius: '12px',
                                padding: '24px',
                                marginBottom: '24px',
                                boxShadow: darkTheme.shadow.medium
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: '16px'
                                }}>
                                    <div style={{ flex: 1 }}>
                                        <h2 style={{
                                            fontSize: '20px',
                                            fontWeight: '600',
                                            color: darkTheme.text.primary,
                                            marginBottom: '4px'
                                        }}>
                                            {showingAllAlbums 
                                                ? `Tous les albums de ${selectedArtist.name}`
                                                : `Albums contenant "${titleQuery}"`
                                            }
                                        </h2>
                                        <p style={{
                                            color: darkTheme.text.secondary,
                                            fontSize: '14px'
                                        }}>
                                            Artiste : <strong>{selectedArtist.name}</strong>
                                        </p>
                                        {fileInfo?.album && (
                                            <p style={{
                                                color: darkTheme.text.tertiary,
                                                fontSize: '12px',
                                                marginTop: '4px',
                                                fontStyle: 'italic'
                                            }}>
                                                Album détecté dans les métadonnées : <strong>{fileInfo.album}</strong>
                                            </p>
                                        )}
                                        {showingAllAlbums && (
                                            <button
                                                onClick={() => {
                                                    setShowingAllAlbums(false);
                                                    setAlbums([]);
                                                    setSelectedAlbums([]);
                                                    performAlbumSearch(selectedArtist.id, selectedArtist.name, titleQuery.trim());
                                                }}
                                                style={{
                                                    marginTop: '12px',
                                                    padding: '8px 16px',
                                                    backgroundColor: 'transparent',
                                                    border: `1px solid ${darkTheme.border.primary}`,
                                                    borderRadius: '6px',
                                                    color: darkTheme.text.secondary,
                                                    fontSize: '14px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.borderColor = darkTheme.accent.blue;
                                                    e.currentTarget.style.color = darkTheme.accent.blue;
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.borderColor = darkTheme.border.primary;
                                                    e.currentTarget.style.color = darkTheme.text.secondary;
                                                }}
                                            >
                                                ← Revenir à la recherche par titre
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setStep('title');
                                            setAlbums([]);
                                            setSelectedAlbums([]);
                                            setAllowNoAlbum(false);
                                            setShowingAllAlbums(false);
                                            setLoadingAllAlbums(false);
                                        }}
                                        style={{
                                            padding: '8px 16px',
                                            backgroundColor: 'transparent',
                                            border: `1px solid ${darkTheme.border.primary}`,
                                            borderRadius: '6px',
                                            color: darkTheme.text.secondary,
                                            fontSize: '14px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ← Retour
                                    </button>
                                </div>
                            </div>

                            {/* Liste des albums */}
                            {albums.length > 0 ? (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                    gap: '16px'
                                }}>
                                    {albums.map((album) => {
                                        const isSelected = selectedAlbums.some(a => a.id === album.id);
                                        return (
                                            <div
                                                key={album.id}
                                                onClick={() => handleAlbumToggle(album)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        handleAlbumToggle(album);
                                                    }
                                                }}
                                                tabIndex={0}
                                                role="button"
                                                aria-label={`${isSelected ? 'Désélectionner' : 'Sélectionner'} ${album.album || album.title}`}
                                                aria-pressed={isSelected}
                                                style={{
                                                    backgroundColor: darkTheme.background.secondary,
                                                    borderRadius: '12px',
                                                    padding: '16px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    border: `2px solid ${isSelected ? darkTheme.accent.blue : darkTheme.border.primary}`,
                                                    textAlign: 'center',
                                                    position: 'relative'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isSelected) {
                                                        e.currentTarget.style.borderColor = darkTheme.accent.blue;
                                                    }
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                    e.currentTarget.style.boxShadow = darkTheme.shadow.medium;
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isSelected) {
                                                        e.currentTarget.style.borderColor = darkTheme.border.primary;
                                                    }
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                }}
                                            >
                                                {/* Indicateur de sélection */}
                                                {isSelected && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '8px',
                                                        right: '8px',
                                                        width: '24px',
                                                        height: '24px',
                                                        borderRadius: '50%',
                                                        backgroundColor: darkTheme.accent.blue,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: '#fff',
                                                        fontSize: '14px',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        ✓
                                                    </div>
                                                )}
                                                {album.thumbnail_url ? (
                                                    <img
                                                        src={album.thumbnail_url}
                                                        alt={album.album || album.title}
                                                        style={{
                                                            width: '100%',
                                                            aspectRatio: '1',
                                                            objectFit: 'cover',
                                                            borderRadius: '8px',
                                                            marginBottom: '12px'
                                                        }}
                                                    />
                                                ) : (
                                                    <div style={{
                                                        width: '100%',
                                                        aspectRatio: '1',
                                                        backgroundColor: darkTheme.background.tertiary,
                                                        borderRadius: '8px',
                                                        marginBottom: '12px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '48px'
                                                    }}>
                                                        💿
                                                    </div>
                                                )}
                                                <div style={{
                                                    fontWeight: '600',
                                                    color: darkTheme.text.primary,
                                                    fontSize: '16px',
                                                    marginBottom: '4px'
                                                }}>
                                                    {album.album || album.title}
                                                </div>
                                                {album.year && (
                                                    <div style={{
                                                        color: darkTheme.text.tertiary,
                                                        fontSize: '12px'
                                                    }}>
                                                        {album.year}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : searching || loadingAllAlbums ? (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '40px',
                                    color: darkTheme.text.tertiary
                                }}>
                                    {loadingAllAlbums ? 'Chargement des albums...' : 'Recherche en cours...'}
                                </div>
                            ) : (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '40px',
                                    color: darkTheme.text.tertiary
                                }}>
                                    <p style={{ marginBottom: '24px' }}>
                                        Aucun album trouvé contenant "{titleQuery}".
                                    </p>
                                    {selectedArtist && !showingAllAlbums && (
                                        <button
                                            onClick={() => loadAllArtistAlbums(selectedArtist.id, selectedArtist.name)}
                                            disabled={loadingAllAlbums}
                                            style={{
                                                padding: '12px 24px',
                                                backgroundColor: loadingAllAlbums ? darkTheme.text.disabled : darkTheme.accent.blue,
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '8px',
                                                fontSize: '16px',
                                                fontWeight: '500',
                                                cursor: loadingAllAlbums ? 'not-allowed' : 'pointer',
                                                transition: 'background-color 0.2s'
                                            }}
                                        >
                                            {loadingAllAlbums ? 'Chargement...' : `Voir tous les albums de ${selectedArtist.name}`}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Boutons d'action */}
                            <div style={{
                                display: 'flex',
                                gap: '12px',
                                marginTop: '24px',
                                justifyContent: 'center'
                            }}>
                                <button
                                    onClick={handleSkipAlbum}
                                    style={{
                                        padding: '12px 24px',
                                        backgroundColor: 'transparent',
                                        border: `1px solid ${darkTheme.border.primary}`,
                                        borderRadius: '8px',
                                        color: darkTheme.text.secondary,
                                        fontSize: '16px',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = darkTheme.accent.blue;
                                        e.currentTarget.style.color = darkTheme.accent.blue;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = darkTheme.border.primary;
                                        e.currentTarget.style.color = darkTheme.text.secondary;
                                    }}
                                >
                                    Sans album
                                </button>
                                <button
                                    onClick={() => {
                                        if (selectedAlbums.length > 0 || allowNoAlbum) {
                                            setStep('confirm');
                                        } else {
                                            alert('Veuillez sélectionner au moins un album ou choisir "Sans album"');
                                        }
                                    }}
                                    disabled={selectedAlbums.length === 0 && !allowNoAlbum}
                                    style={{
                                        padding: '12px 24px',
                                        backgroundColor: (selectedAlbums.length > 0 || allowNoAlbum) ? darkTheme.accent.blue : darkTheme.text.disabled,
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '16px',
                                        fontWeight: '500',
                                        cursor: (selectedAlbums.length > 0 || allowNoAlbum) ? 'pointer' : 'not-allowed',
                                        transition: 'background-color 0.2s'
                                    }}
                                >
                                    Continuer {selectedAlbums.length > 0 && `(${selectedAlbums.length} sélectionné${selectedAlbums.length > 1 ? 's' : ''})`}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Étape : Choisir film/série (vidéos) */}
                    {category === 'videos' && step === 'movie' && (
                        <div>
                            <div style={{
                                backgroundColor: darkTheme.background.secondary,
                                borderRadius: '12px',
                                padding: '24px',
                                marginBottom: '24px',
                                boxShadow: darkTheme.shadow.medium
                            }}>
                                <h2 style={{
                                    fontSize: '20px',
                                    fontWeight: '600',
                                    marginBottom: '16px',
                                    color: darkTheme.text.primary
                                }}>
                                    Rechercher un film ou une série
                                </h2>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                performMovieSearch(searchQuery);
                                            }
                                        }}
                                        placeholder="Titre du film ou de la série..."
                                        style={{
                                            flex: 1,
                                            padding: '12px 16px',
                                            backgroundColor: darkTheme.background.primary,
                                            border: `1px solid ${darkTheme.border.primary}`,
                                            borderRadius: '8px',
                                            color: darkTheme.text.primary,
                                            fontSize: '16px',
                                            outline: 'none'
                                        }}
                                    />
                                    <button
                                        onClick={() => performMovieSearch(searchQuery)}
                                        disabled={searching || !searchQuery.trim()}
                                        style={{
                                            padding: '12px 24px',
                                            backgroundColor: searching || !searchQuery.trim() ? darkTheme.text.disabled : darkTheme.accent.blue,
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '8px',
                                            fontSize: '16px',
                                            fontWeight: '500',
                                            cursor: searching || !searchQuery.trim() ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {searching ? 'Recherche...' : 'Rechercher'}
                                    </button>
                                </div>
                            </div>

                            {/* Erreur de recherche */}
                            {searchError && (
                                <div style={{
                                    padding: '16px',
                                    backgroundColor: 'rgba(229, 9, 20, 0.1)',
                                    border: '1px solid rgba(229, 9, 20, 0.3)',
                                    borderRadius: '8px',
                                    marginBottom: '24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e50914' }}>
                                        <span>⚠️</span>
                                        <span>{searchError}</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setSearchError(null);
                                            if (searchQuery) performMovieSearch(searchQuery);
                                        }}
                                        style={{
                                            padding: '8px 16px',
                                            backgroundColor: darkTheme.accent.blue,
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '14px'
                                        }}
                                    >
                                        Réessayer
                                    </button>
                                </div>
                            )}

                            {/* Liste des films/séries */}
                            {matches.length > 0 ? (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                    gap: '16px'
                                }}>
                                    {matches.map((match) => (
                                        <div
                                            key={match.id}
                                            onClick={() => handleMovieSelect(match)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    handleMovieSelect(match);
                                                }
                                            }}
                                            tabIndex={0}
                                            role="button"
                                            aria-label={`Sélectionner ${match.title}${match.year ? ` (${match.year})` : ''}`}
                                            style={{
                                                backgroundColor: darkTheme.background.secondary,
                                                borderRadius: '12px',
                                                padding: '16px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                border: `2px solid ${selectedMatch?.id === match.id ? darkTheme.accent.blue : darkTheme.border.primary}`,
                                                textAlign: 'center'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (selectedMatch?.id !== match.id) {
                                                    e.currentTarget.style.borderColor = darkTheme.accent.blue;
                                                }
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.boxShadow = darkTheme.shadow.medium;
                                            }}
                                            onMouseLeave={(e) => {
                                                if (selectedMatch?.id !== match.id) {
                                                    e.currentTarget.style.borderColor = darkTheme.border.primary;
                                                }
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = 'none';
                                            }}
                                        >
                                            {match.thumbnail_url ? (
                                                <img
                                                    src={match.thumbnail_url}
                                                    alt={match.title}
                                                    style={{
                                                        width: '100%',
                                                        aspectRatio: '2/3',
                                                        objectFit: 'cover',
                                                        borderRadius: '8px',
                                                        marginBottom: '12px'
                                                    }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: '100%',
                                                    aspectRatio: '2/3',
                                                    backgroundColor: darkTheme.background.tertiary,
                                                    borderRadius: '8px',
                                                    marginBottom: '12px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '48px'
                                                }}>
                                                    🎬
                                                </div>
                                            )}
                                            <div style={{
                                                fontWeight: '600',
                                                color: darkTheme.text.primary,
                                                fontSize: '16px',
                                                marginBottom: '4px'
                                            }}>
                                                {match.title}
                                            </div>
                                            {match.year && (
                                                <div style={{
                                                    color: darkTheme.text.tertiary,
                                                    fontSize: '12px'
                                                }}>
                                                    {match.year}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : searchQuery && !searching ? (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '40px',
                                    color: darkTheme.text.tertiary
                                }}>
                                    Aucun résultat trouvé. Essayez une autre recherche.
                                </div>
                            ) : null}
                        </div>
                    )}

                    {/* Étape de confirmation */}
                    {step === 'confirm' && (
                        <div>
                            <div style={{
                                backgroundColor: darkTheme.background.secondary,
                                borderRadius: '12px',
                                padding: '32px',
                                boxShadow: darkTheme.shadow.medium,
                                textAlign: 'center'
                            }}>
                                <h2 style={{
                                    fontSize: '24px',
                                    fontWeight: '600',
                                    marginBottom: '24px',
                                    color: darkTheme.text.primary
                                }}>
                                    Confirmer la sélection
                                </h2>
                                
                                {category === 'musics' && selectedArtist ? (
                                    <div>
                                        {selectedAlbums.length > 0 && selectedAlbums[0].thumbnail_url && (
                                            <img
                                                src={selectedAlbums[0].thumbnail_url}
                                                alt={selectedAlbums[0].album || selectedAlbums[0].title}
                                                style={{
                                                    width: '200px',
                                                    height: '200px',
                                                    objectFit: 'cover',
                                                    borderRadius: '12px',
                                                    margin: '0 auto 24px'
                                                }}
                                            />
                                        )}
                                        <div style={{
                                            fontSize: '20px',
                                            fontWeight: '600',
                                            color: darkTheme.text.primary,
                                            marginBottom: '8px'
                                        }}>
                                            {fileInfo?.title || 'Titre'}
                                        </div>
                                        <div style={{
                                            fontSize: '16px',
                                            color: darkTheme.text.secondary,
                                            marginBottom: '4px'
                                        }}>
                                            Artiste : {selectedArtist.name}
                                        </div>
                                        {selectedAlbums.length > 0 ? (
                                            <div style={{
                                                fontSize: '16px',
                                                color: darkTheme.text.secondary,
                                                marginBottom: '24px'
                                            }}>
                                                {selectedAlbums.length === 1 ? (
                                                    <>Album : {selectedAlbums[0].album || selectedAlbums[0].title}</>
                                                ) : (
                                                    <>Albums ({selectedAlbums.length}) : {selectedAlbums.map(a => a.album || a.title).join(', ')}</>
                                                )}
                                            </div>
                                        ) : allowNoAlbum ? (
                                            <div style={{
                                                fontSize: '16px',
                                                color: darkTheme.text.tertiary,
                                                marginBottom: '24px',
                                                fontStyle: 'italic'
                                            }}>
                                                Sans album
                                            </div>
                                        ) : null}
                                    </div>
                                ) : selectedMatch ? (
                                    <div>
                                        {selectedMatch.thumbnail_url && (
                                            <img
                                                src={selectedMatch.thumbnail_url}
                                                alt={selectedMatch.title}
                                                style={{
                                                    width: '200px',
                                                    aspectRatio: '2/3',
                                                    objectFit: 'cover',
                                                    borderRadius: '12px',
                                                    margin: '0 auto 24px'
                                                }}
                                            />
                                        )}
                                        <div style={{
                                            fontSize: '20px',
                                            fontWeight: '600',
                                            color: darkTheme.text.primary,
                                            marginBottom: '8px'
                                        }}>
                                            {selectedMatch.title}
                                        </div>
                                        {selectedMatch.year && (
                                            <div style={{
                                                fontSize: '16px',
                                                color: darkTheme.text.secondary,
                                                marginBottom: '24px'
                                            }}>
                                                {selectedMatch.year}
                                            </div>
                                        )}
                                    </div>
                                ) : null}
                                
                                <div style={{
                                    display: 'flex',
                                    gap: '12px',
                                    justifyContent: 'center',
                                    marginTop: '32px'
                                }}>
                                    <button
                                        onClick={() => {
                                            if (category === 'musics') {
                                                setStep('album');
                                            } else {
                                                setStep('movie');
                                            }
                                        }}
                                        style={{
                                            padding: '12px 24px',
                                            backgroundColor: 'transparent',
                                            border: `1px solid ${darkTheme.border.primary}`,
                                            borderRadius: '8px',
                                            color: darkTheme.text.secondary,
                                            fontSize: '16px',
                                            fontWeight: '500',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ← Retour
                                    </button>
                                    <button
                                        onClick={handleConfirm}
                                        disabled={loading}
                                        style={{
                                            padding: '12px 24px',
                                            backgroundColor: loading ? darkTheme.text.disabled : darkTheme.accent.green,
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '8px',
                                            fontSize: '16px',
                                            fontWeight: '500',
                                            cursor: loading ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {loading ? 'Sauvegarde...' : 'Confirmer'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Bouton retour */}
                    <div style={{ marginTop: '32px', textAlign: 'center' }}>
                        <button
                            onClick={() => {
                                if (category === 'musics') {
                                    navigate('/musics');
                                } else {
                                    navigate('/films');
                                }
                            }}
                            style={{
                                padding: '12px 24px',
                                backgroundColor: 'transparent',
                                border: `1px solid ${darkTheme.border.primary}`,
                                borderRadius: '8px',
                                color: darkTheme.text.secondary,
                                fontSize: '16px',
                                cursor: 'pointer'
                            }}
                        >
                            Annuler et retourner aux fichiers
                        </button>
                    </div>
                </main>
            </div>
        </AuthGuard>
    );
}
