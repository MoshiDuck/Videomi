// INFO : app/utils/mediaMetadata.ts
// Intégration avec TMDb, TVDb, OMDb et MusicBrainz pour enrichir les métadonnées des fichiers

type FileCategory = 'videos' | 'musics' | 'images' | 'documents' | 'archives' | 'executables' | 'others';

// Types pour les métadonnées
export interface MediaMetadata {
    // Commun
    thumbnail_url: string | null;
    backdrop_url: string | null; // URL du backdrop pour bannière/page info (films et séries)
    thumbnail_r2_path: string | null;
    source_api: 'tmdb' | 'tmdb_tv' | 'omdb' | 'musicbrainz' | 'spotify' | 'discogs' | null;
    source_id: string | null; // ID dans l'API source
    
    // Films
    genres: string[] | null; // Genres principaux
    subgenres: string[] | null; // Sous-genres
    
    // Séries
    season: number | null; // Saison de la série
    episode: number | null; // Épisode (optionnel)
    
    // Musique
    artists: string[] | null; // Liste des artistes
    albums: string[] | null; // Liste de TOUS les albums pour ce titre (si plusieurs)
    
    // Autres
    title: string | null; // Titre officiel
    year: number | null;
    description: string | null; // Synopsis de la série/film
    episode_description: string | null; // Synopsis de l'épisode (pour les épisodes de série uniquement)
}

// Type pour les correspondances proposées à l'utilisateur
export interface MediaMatch {
    // Informations de correspondance
    id: string; // ID unique pour cette correspondance
    title: string; // Titre proposé
    year: number | null;
    thumbnail_url: string | null; // URL de la miniature (pour affichage)
    
    // Source
    source_api: 'tmdb' | 'tmdb_tv' | 'omdb' | 'musicbrainz' | 'spotify' | 'discogs';
    source_id: string; // ID dans l'API source
    
    // Pour les films/séries
    genres?: string[] | null;
    description?: string | null;
    
    // Pour la musique
    artist?: string | null;
    album?: string | null;
    
    // Score de correspondance (optionnel, pour tri)
    score?: number;
}

// Résultat de recherche avec plusieurs correspondances
export interface MediaSearchResult {
    matches: MediaMatch[];
    total: number;
}

// Cache pour les résultats API (évite les appels répétés)
const apiCache = new Map<string, { result: any; timestamp: number }>();
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 jours

// Rate limiting (throttling)
class RateLimiter {
    private requests: number[] = [];
    private maxRequests: number;
    private windowMs: number;

    constructor(maxRequests: number, windowMs: number) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    async waitIfNeeded(): Promise<void> {
        const now = Date.now();
        
        // Nettoyer les requêtes anciennes
        this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);
        
        // Si on dépasse la limite, attendre
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = Math.min(...this.requests);
            const waitTime = this.windowMs - (now - oldestRequest) + 100; // +100ms de marge
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return this.waitIfNeeded(); // Re-vérifier après l'attente
            }
        }
        
        // Enregistrer cette requête
        this.requests.push(Date.now());
    }
}

// Rate limiters pour chaque API
const tmdbLimiter = new RateLimiter(40, 10000);
const tvdbLimiter = new RateLimiter(4, 1000);
const musicbrainzLimiter = new RateLimiter(1, 1000);
const omdbLimiter = new RateLimiter(10, 1000); // OMDb: 10 requêtes/seconde (gratuit)
const spotifyLimiter = new RateLimiter(10, 1000); // Spotify: 10 requêtes/seconde
const discogsLimiter = new RateLimiter(3, 1000); // Discogs: 3 requêtes/seconde (rate limit strict)
const coverArtArchiveLimiter = new RateLimiter(5, 1000); // Cover Art Archive: 5 requêtes/seconde

/**
 * Nettoie un titre pour la recherche API
 */
function cleanTitleForSearch(title: string): string {
    return title
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Génère des variantes de titre
 */
function generateTitleVariants(title: string): string[] {
    const variants: string[] = [title];
    const cleaned = cleanTitleForSearch(title);
    
    // Variante sans chiffres
    const noNumbers = cleaned.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
    if (noNumbers !== cleaned && noNumbers.length > 0) {
        variants.push(noNumbers);
    }
    
    // Variante sans année
    const noYear = cleaned.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
    if (noYear !== cleaned && noYear.length > 0) {
        variants.push(noYear);
    }
    
    // Variante sans "Part 1", "Part 2", etc. (garder juste "Part")
    const noPartNumber = cleaned.replace(/\s+Part\s+\d+/i, ' Part').replace(/\s+/g, ' ').trim();
    if (noPartNumber !== cleaned && noPartNumber.length > 0) {
        variants.push(noPartNumber);
    }
    
    // Variante sans "Live"
    const noLive = cleaned.replace(/\s+Live\b/i, '').replace(/\s+/g, ' ').trim();
    if (noLive !== cleaned && noLive.length > 0) {
        variants.push(noLive);
    }
    
    // Variante sans guillemets
    const noQuotes = cleaned.replace(/["'`「」『』【】《》〈〉『』＂]/g, '').replace(/\s+/g, ' ').trim();
    if (noQuotes !== cleaned && noQuotes.length > 0) {
        variants.push(noQuotes);
    }
    
    // Variante: seulement la première partie avant "Part" ou "-" ou "/"
    const firstPart = cleaned.split(/\s+(?:Part|[-/])\s+/i)[0].trim();
    if (firstPart !== cleaned && firstPart.length > 0 && firstPart.length >= 3) {
        variants.push(firstPart);
    }
    
    // Variante: chiffre 2 → II (romain)
    const romanNumeral = cleaned.replace(/\b2\b/i, 'II').replace(/\s+/g, ' ').trim();
    if (romanNumeral !== cleaned && romanNumeral.length > 0) {
        variants.push(romanNumeral);
    }
    
    // Variante: simplifier "Parts 1-5" → "Parts"
    const simplifiedParts = cleaned.replace(/\s+Parts?\s+\d+[-–]\d+/i, ' Parts').replace(/\s+/g, ' ').trim();
    if (simplifiedParts !== cleaned && simplifiedParts.length > 0) {
        variants.push(simplifiedParts);
    }
    
    return Array.from(new Set(variants)).filter(v => v.length >= 2);
}

/**
 * Nettoie un titre en retirant les "ft" / "feat" / "featuring" suivis d'un nom d'artiste
 * Retourne le titre nettoyé et le nom de l'artiste featuring si trouvé
 */
function cleanTitleFromFeaturing(title: string): { cleanedTitle: string; featuringArtist?: string } {
    // Patterns pour détecter "ft", "feat", "featuring" suivis d'un nom
    const featPatterns = [
        /\s+(?:ft|feat|featuring)\.?\s+([^,]+?)(?:\s*[,\-]|$)/i,
        /\s+(?:ft|feat|featuring)\.?\s+([^,]+?)(?:\s*\(|$)/i,
        /\s+\(ft\.?\s+([^)]+)\)/i,
        /\s+\(feat\.?\s+([^)]+)\)/i,
        /\s+\(featuring\s+([^)]+)\)/i,
    ];
    
    let cleanedTitle = title;
    let featuringArtist: string | undefined;
    
    for (const pattern of featPatterns) {
        const match = title.match(pattern);
        if (match && match[1]) {
            featuringArtist = match[1].trim();
            cleanedTitle = title.replace(pattern, '').trim();
            break; // Prendre le premier match trouvé
        }
    }
    
    return { cleanedTitle, featuringArtist };
}

/**
 * Nettoie un nom d'artiste en retirant "Official" si présent
 * Retourne un tableau avec l'artiste sans "Official" en premier (si différent), puis l'original
 * L'ordre est important : on essaie d'abord sans "Official", puis avec si on ne trouve rien
 */
function cleanArtistName(artist: string): string[] {
    const variants: string[] = [];
    
    // Retirer "Official" à la fin ou au début
    const withoutOfficial = artist
        .replace(/\s+Official\s*$/i, '')
        .replace(/^\s*Official\s+/i, '')
        .trim();
    
    if (withoutOfficial !== artist && withoutOfficial.length > 0) {
        // Mettre la variante sans "Official" en premier (priorité)
        variants.push(withoutOfficial);
        variants.push(artist); // Garder l'original en second
    } else {
        // Si pas de "Official", garder juste l'original
        variants.push(artist);
    }
    
    return Array.from(new Set(variants));
}

/**
 * Extrait les artistes multiples d'une chaîne (séparés par des virgules, "&", "and", etc.)
 * Retourne un tableau d'artistes nettoyés
 */
function extractMultipleArtists(artistString: string): string[] {
    // Séparer par virgule, "&", "and", "et", etc.
    const separators = /[,&]|\s+and\s+|\s+et\s+/i;
    const artists = artistString.split(separators)
        .map(a => a.trim())
        .filter(a => a.length > 0);
    
    // Nettoyer chaque artiste (retirer "Official", etc.)
    const cleanedArtists: string[] = [];
    for (const artist of artists) {
        const cleaned = cleanArtistName(artist);
        cleanedArtists.push(...cleaned);
    }
    
    return Array.from(new Set(cleanedArtists));
}

/**
 * Télécharge une image depuis une URL et la stocke dans R2 (via API)
 */
export async function downloadAndStoreThumbnail(
    imageUrl: string,
    fileId: string,
    category: FileCategory,
    maxRetries: number = 10
): Promise<string | null> {
    const baseUrl = 'https://videomi.uk/api/media/thumbnail';
    const preview = imageUrl.substring(0, 80) + (imageUrl.length > 80 ? '...' : '');
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                // Délais exponentiels: 300ms, 600ms, 1200ms, 2000ms max
                const delay = Math.min(300 * Math.pow(2, attempt - 1), 2000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            
            // Envoyer la requête au serveur pour télécharger et stocker la miniature
            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    imageUrl,
                    fileId,
                    category
                })
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.warn(`📸 [THUMBNAIL] ❌ Erreur stockage miniature (${response.status}):`, errorText.substring(0, 200));
                
                // Ne pas retry pour les erreurs 4xx (sauf 429 rate limit et 408 timeout)
                if (response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 408) {
                    console.warn(`📸 [THUMBNAIL] ⚠️ Erreur client (${response.status}), arrêt des retries`);
                    return null;
                }
                
                // Retry pour les erreurs 5xx, 429 (rate limit) ou 408 (timeout)
                if (attempt < maxRetries - 1) {
                    continue;
                }
                console.error(`📸 [THUMBNAIL] ❌ Échec après ${maxRetries} tentatives`);
                return null;
            }

            const data = await response.json() as { thumbnail_r2_path: string | null };
            if (data.thumbnail_r2_path) {
                return data.thumbnail_r2_path;
            } else {
                console.warn(`📸 [THUMBNAIL] ⚠️ Aucun thumbnail_r2_path retourné par le serveur (tentative ${attempt + 1}/${maxRetries})`);
                // Retry si pas de chemin retourné (peut être une erreur temporaire)
                if (attempt < maxRetries - 1) {
                    continue;
                }
                console.error(`📸 [THUMBNAIL] ❌ Échec: aucun thumbnail_r2_path après ${maxRetries} tentatives`);
                return null;
            }
        } catch (error) {
            console.warn(`📸 [THUMBNAIL] ❌ Erreur téléchargement miniature (tentative ${attempt + 1}/${maxRetries}):`, error);
            
            // Retry pour les erreurs réseau
            if (attempt < maxRetries - 1) {
                continue;
            }
            console.error(`📸 [THUMBNAIL] ❌ Échec réseau après ${maxRetries} tentatives:`, error);
            return null;
        }
    }
    
    return null;
}

/**
 * Recherche un film sur TMDb et récupère toutes les métadonnées
 */
async function searchTMDbMovieComplete(
    title: string,
    apiKey?: string
): Promise<MediaMetadata | null> {
    if (!apiKey) return null;

    const cacheKey = `tmdb:movie:complete:${title.toLowerCase()}`;
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.result;
    }

    await tmdbLimiter.waitIfNeeded();

    try {
        const variants = generateTitleVariants(title);
        
        for (const variant of variants) {
            const encodedTitle = encodeURIComponent(variant);
            const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodedTitle}&language=fr-FR`;
            
            const searchResponse = await fetch(searchUrl);
            if (!searchResponse.ok) continue;
            
            const searchData = await searchResponse.json() as { results?: Array<{ id: number; title?: string; poster_path?: string | null; backdrop_path?: string | null }> };
            if (searchData.results && searchData.results.length > 0) {
                const movie = searchData.results[0];
                const movieId = movie.id;
                
                // Récupérer les détails complets du film
                const detailsUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=fr-FR&append_to_response=genres`;
                const detailsResponse = await fetch(detailsUrl);
                if (!detailsResponse.ok) continue;
                
                const detailsData = await detailsResponse.json() as { 
                    title?: string; 
                    genres?: Array<{ name: string }>; 
                    release_date?: string; 
                    overview?: string | null;
                    backdrop_path?: string | null;
                };
                
                // Extraire les genres
                const genres = detailsData.genres ? detailsData.genres.map((g) => g.name) : [];
                
                // Séparer backdrop_url (poster original pour bannière) et thumbnail_url (pour miniatures en 16:9)
                const backdropUrl = movie.poster_path
                    ? `https://image.tmdb.org/t/p/w1280${movie.poster_path}`
                    : null;
                const thumbnailUrl = (detailsData.backdrop_path || movie.backdrop_path)
                    ? `https://image.tmdb.org/t/p/w1280${detailsData.backdrop_path || movie.backdrop_path}`
                    : null;
                
                const metadata: MediaMetadata = {
                    thumbnail_url: thumbnailUrl, // Backdrop pour miniatures (16:9)
                    backdrop_url: backdropUrl, // Poster original pour bannière/page info
                    thumbnail_r2_path: null, // Sera rempli après téléchargement
                    source_api: 'tmdb',
                    source_id: String(movieId),
                    genres: genres.length > 0 ? genres : null,
                    subgenres: null, // TMDB ne fournit pas de sous-genres
                    season: null,
                    episode: null,
                    artists: null,
                    albums: null,
                    title: detailsData.title || movie.title || null,
                    year: detailsData.release_date ? parseInt(detailsData.release_date.substring(0, 4)) : null,
                    description: detailsData.overview || null,
                    episode_description: null
                };
                
                apiCache.set(cacheKey, { result: metadata, timestamp: Date.now() });
                return metadata;
            }
        }
        
        apiCache.set(cacheKey, { result: null, timestamp: Date.now() });
        return null;
    } catch (error) {
        console.warn('Erreur recherche TMDb complète:', error);
        return null;
    }
}

/**
 * Recherche une série sur TMDb TV et récupère toutes les métadonnées
 */
async function searchTMDbTVComplete(
    title: string,
    apiKey?: string
): Promise<MediaMetadata | null> {
    if (!apiKey) return null;

    const cacheKey = `tmdb:tv:complete:${title.toLowerCase()}`;
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.result;
    }

    await tmdbLimiter.waitIfNeeded();

    try {
        // Exception spéciale pour Doctor Who : détecter si c'est la série de 2005
        const isDoctorWho = /doctor\s*who/i.test(title);
        let requiresDoctorWho2005 = false;
        if (isDoctorWho) {
            // Chercher une année >= 2005 dans le titre
            const yearMatch = title.match(/\b(200[5-9]|20[1-9]\d)\b/);
            if (yearMatch) {
                const detectedYear = parseInt(yearMatch[1]);
                if (detectedYear >= 2005) {
                    requiresDoctorWho2005 = true;
                    console.log(`🩺 [METADATA] Doctor Who détecté avec année ${detectedYear} >= 2005 - Sélection de la série reprise (2005)`);
                }
            }
        }

        const variants = generateTitleVariants(title);
        
        for (const variant of variants) {
            const encodedTitle = encodeURIComponent(variant);
            const searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodedTitle}&language=fr-FR`;
            
            const searchResponse = await fetch(searchUrl);
            if (!searchResponse.ok) continue;
            
            const searchData = await searchResponse.json() as { results?: Array<{ id: number; name?: string; poster_path?: string | null; backdrop_path?: string | null; first_air_date?: string }> };
            if (searchData.results && searchData.results.length > 0) {
                let tvShow = searchData.results[0];
                
                // Exception Doctor Who : si on cherche la série de 2005, filtrer les résultats
                if (requiresDoctorWho2005) {
                    const doctorWho2005 = searchData.results.find(serie => {
                        const firstAirYear = serie.first_air_date ? parseInt(serie.first_air_date.substring(0, 4)) : 0;
                        return firstAirYear >= 2005;
                    });
                    if (doctorWho2005) {
                        tvShow = doctorWho2005;
                        console.log(`🩺 [METADATA] Doctor Who 2005 sélectionné: "${tvShow.name}" (ID: ${tvShow.id})`);
                    } else {
                        console.warn(`⚠️ [METADATA] Doctor Who 2005 demandé mais non trouvé dans les résultats, utilisation du premier résultat`);
                    }
                }
                const tvId = tvShow.id;
                
                // Récupérer les détails complets
                const detailsUrl = `https://api.themoviedb.org/3/tv/${tvId}?api_key=${apiKey}&language=fr-FR`;
                const detailsResponse = await fetch(detailsUrl);
                if (!detailsResponse.ok) continue;
                
                const detailsData = await detailsResponse.json() as { 
                    name?: string; 
                    genres?: Array<{ name: string }>; 
                    first_air_date?: string; 
                    overview?: string | null;
                    backdrop_path?: string | null;
                };
                
                // Extraire les genres
                const genres = detailsData.genres ? detailsData.genres.map((g) => g.name) : [];
                
                // Extraire la saison du titre si possible (ex: "Titre S01E01")
                let season: number | null = null;
                let episode: number | null = null;
                const seasonMatch = title.match(/\bS(\d+)\b/i);
                if (seasonMatch) {
                    season = parseInt(seasonMatch[1]);
                }
                const episodeMatch = title.match(/\bE(\d+)\b/i);
                if (episodeMatch) {
                    episode = parseInt(episodeMatch[1]);
                }
                
                // Pour les épisodes, récupérer le still_path et overview, sinon utiliser backdrop_path (format 16:9)
                let thumbnailUrl: string | null = null;
                let episodeOverview: string | null = null;
                if (season !== null && episode !== null) {
                    // C'est un épisode, récupérer le still_path et overview
                    try {
                        const seasonDetails = await getSeasonDetailsFromTMDB(tvId, season, apiKey);
                        if (seasonDetails && seasonDetails.episodes) {
                            const episodeData = seasonDetails.episodes.find(e => e.episode_number === episode);
                            if (episodeData) {
                                if (episodeData.still_path) {
                                    thumbnailUrl = `https://image.tmdb.org/t/p/w1280${episodeData.still_path}`;
                                }
                                if (episodeData.overview) {
                                    episodeOverview = episodeData.overview;
                                }
                            }
                        }
                    } catch (error) {
                        console.warn('Erreur récupération détails pour épisode:', error);
                    }
                }
                
                // Séparer backdrop_url (poster original pour bannière) et thumbnail_url (pour miniatures en 16:9)
                const backdropUrl = tvShow.poster_path
                    ? `https://image.tmdb.org/t/p/w1280${tvShow.poster_path}`
                    : null;
                
                if (!thumbnailUrl) {
                    // C'est une série (pas d'épisode), utiliser backdrop_path pour la miniature (16:9)
                    thumbnailUrl = (detailsData.backdrop_path || tvShow.backdrop_path)
                        ? `https://image.tmdb.org/t/p/w1280${detailsData.backdrop_path || tvShow.backdrop_path}`
                        : null;
                }
                
                const metadata: MediaMetadata = {
                    thumbnail_url: thumbnailUrl, // still_path pour épisodes (16:9), backdrop_path pour séries (16:9)
                    backdrop_url: backdropUrl, // Poster original pour bannière/page info
                    thumbnail_r2_path: null,
                    source_api: 'tmdb_tv',
                    source_id: String(tvId),
                    genres: genres.length > 0 ? genres : null,
                    subgenres: null,
                    season: season,
                    episode: episode,
                    artists: null,
                    albums: null,
                    title: detailsData.name || tvShow.name || null,
                    year: detailsData.first_air_date ? parseInt(detailsData.first_air_date.substring(0, 4)) : null,
                    description: detailsData.overview || null,
                    episode_description: episodeOverview
                };
                
                apiCache.set(cacheKey, { result: metadata, timestamp: Date.now() });
                return metadata;
            }
        }
        
        apiCache.set(cacheKey, { result: null, timestamp: Date.now() });
        return null;
    } catch (error) {
        console.warn('Erreur recherche TMDb TV complète:', error);
        return null;
    }
}

/**
 * Recherche un film sur OMDb (backup)
 */
async function searchOMDbMovie(
    title: string,
    apiKey?: string
): Promise<MediaMetadata | null> {
    if (!apiKey) return null;

    const cacheKey = `omdb:movie:${title.toLowerCase()}`;
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.result;
    }

    await omdbLimiter.waitIfNeeded();

    try {
        const variants = generateTitleVariants(title);
        
        for (const variant of variants) {
            const encodedTitle = encodeURIComponent(variant);
            const url = `https://www.omdbapi.com/?t=${encodedTitle}&apikey=${apiKey}`;
            
            const response = await fetch(url);
            if (!response.ok) continue;
            
            const data = await response.json() as any;
            if (data.Response === 'True' && data.Type === 'movie') {
                const genres = data.Genre ? data.Genre.split(',').map((g: string) => g.trim()) : [];
                
                const metadata: MediaMetadata = {
                    thumbnail_url: data.Poster !== 'N/A' ? data.Poster : null,
                    backdrop_url: null,
                    thumbnail_r2_path: null,
                    source_api: 'omdb',
                    source_id: data.imdbID || null,
                    genres: genres.length > 0 ? genres : null,
                    subgenres: null,
                    season: null,
                    episode: null,
                    artists: null,
                    albums: null,
                    title: data.Title || null,
                    year: data.Year ? parseInt(data.Year) : null,
                    description: data.Plot !== 'N/A' ? data.Plot : null,
                    episode_description: null
                };
                
                apiCache.set(cacheKey, { result: metadata, timestamp: Date.now() });
                return metadata;
            }
        }
        
        apiCache.set(cacheKey, { result: null, timestamp: Date.now() });
        return null;
    } catch (error) {
        console.warn('Erreur recherche OMDb:', error);
        return null;
    }
}

// ============================================================================
// TMDB - Fonctions avancées pour collections et séries TV
// ============================================================================

export interface TMDBMovieDetails {
    id: number;
    title: string;
    original_title: string;
    overview: string | null;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string | null;
    runtime: number | null;
    genres: Array<{ id: number; name: string }>;
    belongs_to_collection: {
        id: number;
        name: string;
        poster_path: string | null;
        backdrop_path: string | null;
    } | null;
    vote_average: number;
}

export interface TMDBTVDetails {
    id: number;
    name: string;
    original_name: string;
    overview: string | null;
    poster_path: string | null;
    backdrop_path: string | null;
    first_air_date: string | null;
    last_air_date: string | null;
    number_of_seasons: number;
    number_of_episodes: number;
    genres: Array<{ id: number; name: string }>;
    seasons: Array<{
        id: number;
        name: string;
        season_number: number;
        episode_count: number;
        poster_path: string | null;
        air_date: string | null;
        overview: string | null;
    }>;
    vote_average: number;
}

export interface TMDBSeasonDetails {
    id: number;
    name: string;
    season_number: number;
    overview: string | null;
    poster_path: string | null;
    air_date: string | null;
    episodes: Array<{
        id: number;
        name: string;
        episode_number: number;
        season_number: number;
        overview: string | null;
        still_path: string | null;
        air_date: string | null;
        runtime: number | null;
        vote_average: number;
    }>;
}

export interface TMDBCollection {
    id: number;
    name: string;
    overview: string | null;
    poster_path: string | null;
    backdrop_path: string | null;
    parts: Array<{
        id: number;
        title: string;
        original_title: string;
        overview: string | null;
        poster_path: string | null;
        backdrop_path: string | null;
        release_date: string | null;
        vote_average: number;
    }>;
}

/**
 * Recherche des films sur TMDB avec résultats multiples
 */
export async function searchMoviesOnTMDB(
    query: string,
    apiKey: string,
    limit: number = 10
): Promise<MediaMatch[]> {
    if (!apiKey || !query) return [];

    await tmdbLimiter.waitIfNeeded();

    try {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodedQuery}&language=fr-FR&include_adult=false`;
        
        const response = await fetch(url);
        if (!response.ok) return [];
        
        const data = await response.json() as { results?: Array<any> };
        if (!data.results) return [];
        
        return data.results.slice(0, limit).map((movie: any) => ({
            id: `tmdb_movie_${movie.id}`,
            title: movie.title || movie.original_title,
            year: movie.release_date ? parseInt(movie.release_date.substring(0, 4)) : null,
            thumbnail_url: movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null,
            source_api: 'tmdb' as const,
            source_id: String(movie.id),
            description: movie.overview || null,
            score: movie.vote_average || 0
        }));
    } catch (error) {
        console.warn('Erreur recherche films TMDB:', error);
        return [];
    }
}

/**
 * Recherche des séries TV sur TMDB avec résultats multiples
 */
export async function searchTVShowsOnTMDB(
    query: string,
    apiKey: string,
    limit: number = 10
): Promise<MediaMatch[]> {
    if (!apiKey || !query) return [];

    await tmdbLimiter.waitIfNeeded();

    try {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodedQuery}&language=fr-FR`;
        
        const response = await fetch(url);
        if (!response.ok) return [];
        
        const data = await response.json() as { results?: Array<any> };
        if (!data.results) return [];
        
        return data.results.slice(0, limit).map((show: any) => ({
            id: `tmdb_tv_${show.id}`,
            title: show.name || show.original_name,
            year: show.first_air_date ? parseInt(show.first_air_date.substring(0, 4)) : null,
            thumbnail_url: show.backdrop_path ? `https://image.tmdb.org/t/p/w1280${show.backdrop_path}` : null,
            source_api: 'tmdb_tv' as const,
            source_id: String(show.id),
            description: show.overview || null,
            score: show.vote_average || 0
        }));
    } catch (error) {
        console.warn('Erreur recherche séries TMDB:', error);
        return [];
    }
}

/**
 * Récupère les détails complets d'un film TMDB (incluant collection)
 */
export async function getMovieDetailsFromTMDB(
    movieId: number | string,
    apiKey: string
): Promise<TMDBMovieDetails | null> {
    if (!apiKey) return null;

    const cacheKey = `tmdb:movie:details:${movieId}`;
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.result as TMDBMovieDetails;
    }

    await tmdbLimiter.waitIfNeeded();

    try {
        const url = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&language=fr-FR`;
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const data = await response.json() as TMDBMovieDetails;
        apiCache.set(cacheKey, { result: data, timestamp: Date.now() });
        return data;
    } catch (error) {
        console.warn('Erreur détails film TMDB:', error);
        return null;
    }
}

/**
 * Récupère les détails complets d'une série TV TMDB (incluant saisons)
 */
export async function getTVShowDetailsFromTMDB(
    tvId: number | string,
    apiKey: string
): Promise<TMDBTVDetails | null> {
    if (!apiKey) return null;

    const cacheKey = `tmdb:tv:details:${tvId}`;
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.result as TMDBTVDetails;
    }

    await tmdbLimiter.waitIfNeeded();

    try {
        const url = `https://api.themoviedb.org/3/tv/${tvId}?api_key=${apiKey}&language=fr-FR`;
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const data = await response.json() as TMDBTVDetails;
        apiCache.set(cacheKey, { result: data, timestamp: Date.now() });
        return data;
    } catch (error) {
        console.warn('Erreur détails série TMDB:', error);
        return null;
    }
}

/**
 * Récupère les détails d'une saison TV TMDB (avec tous les épisodes)
 */
export async function getSeasonDetailsFromTMDB(
    tvId: number | string,
    seasonNumber: number,
    apiKey: string
): Promise<TMDBSeasonDetails | null> {
    if (!apiKey) return null;

    const cacheKey = `tmdb:tv:${tvId}:season:${seasonNumber}`;
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.result as TMDBSeasonDetails;
    }

    await tmdbLimiter.waitIfNeeded();

    try {
        const url = `https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNumber}?api_key=${apiKey}&language=fr-FR`;
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const data = await response.json() as TMDBSeasonDetails;
        apiCache.set(cacheKey, { result: data, timestamp: Date.now() });
        return data;
    } catch (error) {
        console.warn('Erreur détails saison TMDB:', error);
        return null;
    }
}

/**
 * Récupère une collection de films TMDB (ex: Marvel, Harry Potter)
 */
export async function getCollectionFromTMDB(
    collectionId: number | string,
    apiKey: string
): Promise<TMDBCollection | null> {
    if (!apiKey) return null;

    const cacheKey = `tmdb:collection:${collectionId}`;
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.result as TMDBCollection;
    }

    await tmdbLimiter.waitIfNeeded();

    try {
        const url = `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${apiKey}&language=fr-FR`;
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const data = await response.json() as TMDBCollection;
        apiCache.set(cacheKey, { result: data, timestamp: Date.now() });
        return data;
    } catch (error) {
        console.warn('Erreur collection TMDB:', error);
        return null;
    }
}

/**
 * Récupère les genres de films TMDB
 */
export async function getMovieGenresFromTMDB(apiKey: string): Promise<Array<{ id: number; name: string }>> {
    if (!apiKey) return [];

    const cacheKey = 'tmdb:genres:movie';
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.result as Array<{ id: number; name: string }>;
    }

    await tmdbLimiter.waitIfNeeded();

    try {
        const url = `https://api.themoviedb.org/3/genre/movie/list?api_key=${apiKey}&language=fr-FR`;
        const response = await fetch(url);
        if (!response.ok) return [];
        
        const data = await response.json() as { genres?: Array<{ id: number; name: string }> };
        const genres = data.genres || [];
        apiCache.set(cacheKey, { result: genres, timestamp: Date.now() });
        return genres;
    } catch (error) {
        console.warn('Erreur genres films TMDB:', error);
        return [];
    }
}

/**
 * Récupère les genres de séries TV TMDB
 */
export async function getTVGenresFromTMDB(apiKey: string): Promise<Array<{ id: number; name: string }>> {
    if (!apiKey) return [];

    const cacheKey = 'tmdb:genres:tv';
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.result as Array<{ id: number; name: string }>;
    }

    await tmdbLimiter.waitIfNeeded();

    try {
        const url = `https://api.themoviedb.org/3/genre/tv/list?api_key=${apiKey}&language=fr-FR`;
        const response = await fetch(url);
        if (!response.ok) return [];
        
        const data = await response.json() as { genres?: Array<{ id: number; name: string }> };
        const genres = data.genres || [];
        apiCache.set(cacheKey, { result: genres, timestamp: Date.now() });
        return genres;
    } catch (error) {
        console.warn('Erreur genres séries TMDB:', error);
        return [];
    }
}

/**
 * Récupère un token d'accès Spotify via Client Credentials
 */
async function getSpotifyAccessToken(clientId?: string, clientSecret?: string): Promise<string | null> {
    if (!clientId || !clientSecret) return null;

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) return null;

        const data = await response.json() as { access_token?: string };
        return data.access_token || null;
    } catch (error) {
        console.warn('Erreur authentification Spotify:', error);
        return null;
    }
}

/**
 * Recherche une chanson sur Spotify et récupère les métadonnées
 */
async function searchSpotifyComplete(
    title: string,
    artist?: string,
    clientId?: string,
    clientSecret?: string
): Promise<MediaMetadata | null> {
    if (!clientId || !clientSecret) return null;

    const cacheKey = `spotify:complete:${artist ? `${artist}:` : ''}${title.toLowerCase()}`;
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.result;
    }

    await spotifyLimiter.waitIfNeeded();

    try {
        // Obtenir le token d'accès
        const accessToken = await getSpotifyAccessToken(clientId, clientSecret);
        if (!accessToken) {
            apiCache.set(cacheKey, { result: null, timestamp: Date.now() });
            return null;
        }

        const variants = generateTitleVariants(title);
        
        for (let i = 0; i < variants.length; i++) {
            const variant = variants[i];
            let query = `track:${encodeURIComponent(variant)}`;
            if (artist) {
                query += ` artist:${encodeURIComponent(artist)}`;
            }
            
            const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`;
            
            const searchResponse = await fetch(searchUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            
            if (!searchResponse.ok) {
                const errorText = await searchResponse.text().catch(() => '');
                continue;
            }
            
            const searchData = await searchResponse.json() as any;
            const tracksCount = searchData.tracks ? (searchData.tracks.items ? searchData.tracks.items.length : 0) : 0;
            
            if (searchData.tracks && searchData.tracks.items && searchData.tracks.items.length > 0) {
                const track = searchData.tracks.items[0];
                
                // Extraire les artistes
                const artistsArray: string[] = [];
                if (track.artists) {
                    for (const artistData of track.artists) {
                        if (artistData.name && !artistsArray.includes(artistData.name)) {
                            artistsArray.push(artistData.name);
                        }
                    }
                }
                
                // Extraire les albums (tous les albums où cette chanson apparaît)
                const albumsArray: string[] = [];
                if (track.album && track.album.name) {
                    albumsArray.push(track.album.name);
                }
                
                // URL de l'image de couverture (Spotify fournit généralement de meilleures images)
                let thumbnailUrl: string | null = null;
                if (track.album && track.album.images && track.album.images.length > 0) {
                    
                    // Trier par taille (plus grand en premier)
                    const images = track.album.images.sort((a: { width: number }, b: { width: number }) => (b.width || 0) - (a.width || 0));
                    
                    // Prendre une taille moyenne (300-500px) si disponible, sinon la plus grande
                    const mediumImage = images.find((img: { width?: number }) => img.width && img.width >= 300 && img.width <= 500) || images[0];
                    thumbnailUrl = mediumImage?.url || images[0]?.url || null;
                    
                    if (thumbnailUrl) {
                    } else {
                    }
                } else {
                }
                
                const metadata: MediaMetadata = {
                    thumbnail_url: thumbnailUrl,
                    backdrop_url: null,
                    thumbnail_r2_path: null,
                    source_api: 'musicbrainz', // On utilise musicbrainz comme source_api pour la cohérence
                    source_id: track.id || null,
                    genres: null,
                    subgenres: null,
                    season: null,
                    episode: null,
                    artists: artistsArray.length > 0 ? artistsArray : null,
                    albums: albumsArray.length > 0 ? albumsArray : null,
                    title: track.name || null,
                    year: track.album?.release_date ? parseInt(track.album.release_date.substring(0, 4)) : null,
                    description: null,
                    episode_description: null
                };
                
                apiCache.set(cacheKey, { result: metadata, timestamp: Date.now() });
                return metadata;
            } else {
            }
        }
        
        apiCache.set(cacheKey, { result: null, timestamp: Date.now() });
        return null;
    } catch (error) {
        console.error('🎵 [Spotify] ❌ Erreur recherche Spotify complète:', error);
        return null;
    }
}

/**
 * Recherche une chanson sur MusicBrainz et récupère TOUS les albums
 */
async function searchMusicBrainzComplete(
    title: string,
    artist?: string
): Promise<MediaMetadata | null> {
    const cacheKey = `musicbrainz:complete:${artist ? `${artist}:` : ''}${title.toLowerCase()}`;
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.result;
    }

    await musicbrainzLimiter.waitIfNeeded();

    try {
        const variants = generateTitleVariants(title);
        
        for (let i = 0; i < variants.length; i++) {
            const variant = variants[i];
            let query = `recording:${encodeURIComponent(variant)}`;
            if (artist) {
                query += ` AND artist:${encodeURIComponent(artist)}`;
            }
            
            const searchUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
            
            const searchResponse = await fetch(searchUrl, {
                headers: {
                    'User-Agent': 'Videomi/1.0 (https://videomi.uk)',
                    'Accept': 'application/json'
                }
            });
            
            
            if (!searchResponse.ok) {
                continue;
            }
            
            const searchData = await searchResponse.json() as { recordings?: Array<{ 
                id?: string; 
                title?: string; 
                'release-groups'?: Array<{ id?: string; title?: string }>; 
                'artist-credit'?: Array<{ artist?: { name?: string } }> 
            }> };
            
            if (searchData.recordings && searchData.recordings.length > 0) {
                const recording = searchData.recordings[0];
                if (recording['artist-credit'] && recording['artist-credit'].length > 0) {
                    const artistNames = recording['artist-credit'].map((ac: any) => ac.artist?.name).filter(Boolean);
                }
                
                // Récupérer tous les albums pour ce recording
                const albums: string[] = [];
                const artists: string[] = [];
                
                if (recording['release-groups']) {
                    for (const rg of recording['release-groups']) {
                        if (rg.title && !albums.includes(rg.title)) {
                            albums.push(rg.title);
                        }
                    }
                }
                
                // Extraire les artistes
                if (recording['artist-credit']) {
                    for (const ac of recording['artist-credit']) {
                        if (ac.artist && ac.artist.name && !artists.includes(ac.artist.name)) {
                            artists.push(ac.artist.name);
                        }
                    }
                }
                
                // Récupérer l'URL de la couverture d'album via Cover Art Archive
                // Essayer tous les release-groups jusqu'à trouver une image
                let thumbnailUrl: string | null = null;
                if (recording['release-groups'] && recording['release-groups'].length > 0) {
                    
                    for (let rgIndex = 0; rgIndex < recording['release-groups'].length; rgIndex++) {
                        const rg = recording['release-groups'][rgIndex];
                        if (thumbnailUrl) break; // Si on a déjà trouvé une image, arrêter
                        
                        const releaseGroupId = rg.id;
                        if (!releaseGroupId) {
                            continue;
                        }
                        
                        
                        try {
                            await coverArtArchiveLimiter.waitIfNeeded();
                            const coverArtUrl = `https://coverartarchive.org/release-group/${releaseGroupId}`;
                            const coverResponse = await fetch(coverArtUrl, {
                                headers: { 'Accept': 'application/json' }
                            });
                            
                            
                            if (coverResponse.ok) {
                                const coverData = await coverResponse.json() as { 
                                    images?: Array<{ 
                                        front?: boolean; 
                                        thumbnails?: { small?: string; '250'?: string; '500'?: string }; 
                                        image?: string 
                                    }> 
                                };
                                
                                if (coverData.images && coverData.images.length > 0) {
                                    // Chercher d'abord une image "front" (couverture avant), sinon prendre la première
                                    const frontImage = coverData.images.find((img) => img.front === true);
                                    const imageToUse = frontImage || coverData.images[0];
                                    
                                    
                                    if (imageToUse) {
                                        // Essayer de prendre une taille moyenne (250px) ou small (250px), sinon la grande
                                        thumbnailUrl = imageToUse.thumbnails?.small || 
                                                     imageToUse.thumbnails?.['250'] || 
                                                     imageToUse.thumbnails?.['500'] ||
                                                     imageToUse.image || 
                                                     null;
                                        
                                        if (thumbnailUrl) {
                                            break;
                                        }
                                    }
                                } else {
                                }
                            } else {
                            }
                        } catch (coverError) {
                            // Continuer avec le prochain release-group
                            console.warn(`🎵 [MusicBrainz] ❌ Erreur récupération couverture release-group ${releaseGroupId}:`, coverError);
                        }
                    }
                    
                    if (!thumbnailUrl) {
                    }
                } else {
                }
                
                const metadata: MediaMetadata = {
                    thumbnail_url: thumbnailUrl,
                    backdrop_url: null,
                    thumbnail_r2_path: null,
                    source_api: 'musicbrainz',
                    source_id: recording.id || null,
                    genres: null,
                    subgenres: null,
                    season: null,
                    episode: null,
                    artists: artists.length > 0 ? artists : null,
                    albums: albums.length > 0 ? albums : null, // TOUS les albums
                    title: recording.title || null,
                    year: null,
                    description: null,
                    episode_description: null
                };
                
                apiCache.set(cacheKey, { result: metadata, timestamp: Date.now() });
                return metadata;
            } else {
            }
        }
        
        apiCache.set(cacheKey, { result: null, timestamp: Date.now() });
        return null;
    } catch (error) {
        console.error('🎵 [MusicBrainz] ❌ Erreur recherche MusicBrainz complète:', error);
        return null;
    }
}

/**
 * Recherche une chanson via Cover Art Archive directement (si on a un release-group ID)
 */
async function getCoverArtFromReleaseGroup(releaseGroupId: string): Promise<string | null> {
    await coverArtArchiveLimiter.waitIfNeeded();
    
    try {
        const coverArtUrl = `https://coverartarchive.org/release-group/${releaseGroupId}`;
        
        const coverResponse = await fetch(coverArtUrl, {
            headers: { 'Accept': 'application/json' }
        });
        
        
        if (!coverResponse.ok) {
            if (coverResponse.status === 404) {
            }
            return null;
        }
        
        const coverData = await coverResponse.json() as { 
            images?: Array<{ 
                front?: boolean; 
                thumbnails?: { small?: string; '250'?: string; '500'?: string }; 
                image?: string 
            }> 
        };
        
        if (coverData.images && coverData.images.length > 0) {
            
            const frontImage = coverData.images.find((img) => img.front === true);
            const imageToUse = frontImage || coverData.images[0];
            
            const thumbnailUrl = imageToUse.thumbnails?.small || 
                               imageToUse.thumbnails?.['250'] || 
                               imageToUse.thumbnails?.['500'] ||
                               imageToUse.image || 
                               null;
            
            if (thumbnailUrl) {
            } else {
            }
            
            return thumbnailUrl;
        }
        
        return null;
    } catch (error) {
        console.warn('🎵 [Cover Art Archive] ❌ Erreur récupération couverture:', error);
        return null;
    }
}

/**
 * Recherche une chanson sur Discogs et récupère les métadonnées
 */
async function searchDiscogsComplete(
    title: string,
    artist?: string,
    apiToken?: string
): Promise<MediaMetadata | null> {
    const cacheKey = `discogs:complete:${artist ? `${artist}:` : ''}${title.toLowerCase()}`;
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.result;
    }

    await discogsLimiter.waitIfNeeded();

    try {
        const variants = generateTitleVariants(title);
        
        for (let i = 0; i < variants.length; i++) {
            const variant = variants[i];
            // Discogs Database API (pas besoin de clé API pour les requêtes simples)
            // Format de recherche: type=release&q=query
            let query = variant;
            if (artist) {
                query = `${artist} ${variant}`;
            }
            
            // Construire l'URL de recherche
            const searchUrl = `https://api.discogs.com/database/search?type=release&q=${encodeURIComponent(query)}&per_page=5`;
            
            // Construire les headers avec authentification si un token est fourni
            const headers: Record<string, string> = {
                'User-Agent': 'Videomi/1.0 (https://videomi.uk)',
                'Accept': 'application/json'
            };
            
            if (apiToken) {
                headers['Authorization'] = `Discogs token=${apiToken}`;
            }
            
            
            const searchResponse = await fetch(searchUrl, { headers });
            
            
            if (!searchResponse.ok) {
                if (searchResponse.status === 429) {
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Attendre 2 secondes
                }
                continue;
            }
            
            const searchData = await searchResponse.json() as { 
                results?: Array<{ 
                    id?: number; 
                    title?: string; 
                    cover_image?: string; 
                    year?: number;
                    genre?: string[];
                    style?: string[];
                    label?: string[];
                    format?: string[];
                }> 
            };
            const resultsCount = searchData.results ? searchData.results.length : 0;
            
            if (searchData.results && searchData.results.length > 0) {
                // Prendre le premier résultat (Discogs retourne déjà les résultats triés par pertinence)
                const release = searchData.results[0];
                
                // Extraire le titre et l'artiste depuis le titre Discogs
                // Format Discogs: "Artist - Title"
                let artistName: string | undefined;
                let trackTitle: string | undefined;
                if (release.title) {
                    const parts = release.title.split(/\s*-\s*/);
                    if (parts.length >= 2) {
                        artistName = parts[0].trim();
                        trackTitle = parts.slice(1).join(' - ').trim();
                    } else {
                        trackTitle = release.title;
                    }
                }
                
                // Extraire les artistes (peut être dans le titre ou depuis d'autres champs)
                const artistsArray: string[] = [];
                if (artistName && !artistsArray.includes(artistName)) {
                    artistsArray.push(artistName);
                }
                
                // Extraire les albums (basés sur le titre du release)
                const albumsArray: string[] = [];
                if (release.title && !albumsArray.includes(release.title)) {
                    albumsArray.push(release.title);
                }
                
                // URL de l'image de couverture
                const thumbnailUrl = release.cover_image && release.cover_image !== '' 
                    ? release.cover_image 
                    : null;
                
                if (thumbnailUrl) {
                } else {
                }
                
                // Combiner genres et styles comme genres
                const genres = release.genre || [];
                const styles = release.style || [];
                const allGenres = [...genres, ...styles].filter((g, i, arr) => arr.indexOf(g) === i);
                
                const metadata: MediaMetadata = {
                    thumbnail_url: thumbnailUrl,
                    backdrop_url: null,
                    thumbnail_r2_path: null,
                    source_api: 'discogs',
                    source_id: release.id ? String(release.id) : null,
                    genres: allGenres.length > 0 ? allGenres : null,
                    subgenres: null,
                    season: null,
                    episode: null,
                    artists: artistsArray.length > 0 ? artistsArray : null,
                    albums: albumsArray.length > 0 ? albumsArray : null,
                    title: trackTitle || release.title || null,
                    year: release.year || null,
                    description: null,
                    episode_description: null
                };
                
                apiCache.set(cacheKey, { result: metadata, timestamp: Date.now() });
                return metadata;
            } else {
            }
        }
        
        apiCache.set(cacheKey, { result: null, timestamp: Date.now() });
        return null;
    } catch (error) {
        console.error('🎵 [Discogs] ❌ Erreur recherche Discogs complète:', error);
        return null;
    }
}

/**
 * Extrait une image de couverture des métadonnées d'un fichier audio (tags ID3)
 * @param file Le fichier audio
 * @returns Une URL de données (data URL) de l'image ou null
 */
async function extractImageFromAudioMetadata(file: File): Promise<string | null> {
    
    // Vérifier que le fichier n'est pas vide
    if (!file || file.size === 0) {
        console.warn(`🎵 [MUSIQUE] ⚠️ Fichier vide ou invalide pour extraction ID3`);
        return null;
    }
    
    try {
        // Importation dynamique de music-metadata-browser
        const mm = await import('music-metadata-browser');

        
        // Utiliser parseBlob pour analyser les métadonnées
        // Options: duration=false pour accélérer, skipCovers=false pour extraire les images
        const metadata = await mm.parseBlob(file, { 
            duration: false, 
            skipCovers: false,
            skipPostHeaders: false,
            includeChapters: false
        });


        if (metadata?.common?.picture && metadata.common.picture.length > 0) {
            // Trier les images par type (priorité: cover/artwork > other)
            const pictures = [...metadata.common.picture];
            pictures.sort((a, b) => {
                const aType = a.type || '';
                const bType = b.type || '';
                if (aType.includes('cover') || aType.includes('artwork') || aType.includes('front')) return -1;
                if (bType.includes('cover') || bType.includes('artwork') || bType.includes('front')) return 1;
                return 0;
            });
            
            const picture = pictures[0];
            const mime = picture.format || 'image/jpeg';
            
            
            // Convertir les données binaires en base64
            // picture.data peut être un Buffer (Node.js) ou un Uint8Array (browser)
            let dataArray: Uint8Array;
            if (picture.data instanceof Uint8Array) {
                dataArray = picture.data;
            } else if (Array.isArray(picture.data)) {
                dataArray = new Uint8Array(picture.data);
            } else if (picture.data && typeof (picture.data as any).buffer !== 'undefined') {
                // C'est peut-être un ArrayBuffer ou un Buffer-like
                dataArray = new Uint8Array((picture.data as any).buffer || picture.data);
            } else {
                console.warn(`🎵 [MUSIQUE] ⚠️ Format de données image ID3 non reconnu`);
                return null;
            }
            
            // Convertir en base64 par chunks pour éviter les limites de String.fromCharCode.apply
            // Méthode robuste qui fonctionne même pour de grandes images
            const CHUNK_SIZE = 8192;
            let binaryString = '';
            
            try {
                for (let i = 0; i < dataArray.length; i += CHUNK_SIZE) {
                    const chunk = dataArray.subarray(i, Math.min(i + CHUNK_SIZE, dataArray.length));
                    // Utiliser Array.from() pour convertir en tableau avant apply
                    binaryString += String.fromCharCode.apply(null, Array.from(chunk));
                }
                
                const base64 = btoa(binaryString);
                const dataUrl = `data:${mime};base64,${base64}`;
                
                return dataUrl;
            } catch (btoaError) {
                console.error(`🎵 [MUSIQUE] ❌ Erreur lors de la conversion base64 de l'image ID3:`, btoaError);
                return null;
            }
        } else {
        }
    } catch (error) {
        // Ne pas bloquer si l'extraction ID3 échoue - on continuera avec les APIs
        console.warn(`🎵 [MUSIQUE] ❌ Erreur lors de l'extraction d'image des métadonnées du fichier audio:`, error);
        
        // Logger plus de détails si possible
        if (error instanceof Error) {
            console.warn(`🎵 [MUSIQUE]    Message d'erreur: ${error.message}`);
            console.warn(`🎵 [MUSIQUE]    Stack: ${error.stack?.substring(0, 200)}`);
        }
    }
    return null;
}

/**
 * Enrichit un fichier avec toutes les métadonnées des APIs
 */
export async function enrichWithCompleteMetadata(
    cleanedTitle: string,
    category: FileCategory,
    originalFilename: string,
    fileId: string,
    file?: File,
    apiKeys?: {
        tmdb?: string;
        omdb?: string;
        spotifyClientId?: string;
        spotifyClientSecret?: string;
        discogsApiToken?: string;
    }
): Promise<{ title: string; metadata: MediaMetadata | null }> {
    // Extraire l'extension du nom original
    const extension = originalFilename.substring(originalFilename.lastIndexOf('.'));
    
    // Si cleanedTitle est vide ou trop court, garder le nom original (sans extension)
    const originalNameWithoutExt = originalFilename.substring(0, originalFilename.lastIndexOf('.'));
    if (!cleanedTitle || cleanedTitle.length < 2) {
        return { title: `${originalNameWithoutExt}${extension}`, metadata: null };
    }

    try {
        if (category === 'videos') {
            // Essayer TMDb Movie d'abord
            let metadata = await searchTMDbMovieComplete(cleanedTitle, apiKeys?.tmdb);
            
            // Si pas trouvé, essayer TMDb TV (séries)
            if (!metadata) {
                metadata = await searchTMDbTVComplete(cleanedTitle, apiKeys?.tmdb);
            }
            
            // Si toujours pas trouvé, essayer OMDb (backup)
            if (!metadata && apiKeys?.omdb) {
                metadata = await searchOMDbMovie(cleanedTitle, apiKeys?.omdb);
            }
            
            if (metadata) {
                // Télécharger la miniature si disponible
                if (metadata.thumbnail_url) {
                    metadata.thumbnail_r2_path = await downloadAndStoreThumbnail(
                        metadata.thumbnail_url,
                        fileId,
                        category
                    );
                }
                
                return {
                    title: metadata.title ? `${metadata.title}${extension}` : cleanedTitle + extension,
                    metadata
                };
            }
        } else if (category === 'musics') {
            
            // ÉTAPE 1: PRIORITÉ ABSOLUE - Extraire l'image depuis les métadonnées ID3 du fichier audio
            // C'est le plus fiable (100% si présent) et le plus rapide
            // Essayer même si le type MIME n'est pas défini (vérifier l'extension)
            let embeddedImageUrl: string | null = null;
            const isAudioFile = file && (
                (file.type && file.type.startsWith('audio/')) || 
                /\.(mp3|m4a|flac|ogg|wav|aac|wma|opus|mp4|m4p)$/i.test(originalFilename)
            );
            
            if (isAudioFile && file) {
                try {
                    embeddedImageUrl = await extractImageFromAudioMetadata(file);
                    if (embeddedImageUrl) {
                    } else {
                    }
                } catch (id3Error) {
                    console.warn(`🎵 [MUSIQUE] ⚠️ Erreur lors de l'extraction ID3 (continuons avec les APIs):`, id3Error);
                }
            } else if (!file) {
            } else {
            }
            
            // Extraire artiste, titre et album du nom de fichier original
            // Formats courants: "Artiste - Titre.mp3", "Artiste - Titre - Album.mp3", "001 - Artiste - Titre.mp3"
            const nameWithoutExt = originalNameWithoutExt;
            
            // Nettoyer les numéros de piste au début
            const cleanedName = nameWithoutExt.replace(/^\d{2,3}\s*-\s*/, '').trim();
            
            // Séparer par "-" ou "–" (tiret ou tiret cadratin)
            const parts = cleanedName.split(/\s*[-–]\s*/).map(p => p.trim()).filter(p => p.length > 0);
            
            let artist: string | undefined;
            let title = cleanedTitle;
            let album: string | undefined;
            
            // Essayer d'extraire artiste, titre, album
            if (parts.length >= 1) {
                // Le premier élément est souvent l'artiste
                artist = parts[0];
            }
            if (parts.length >= 2) {
                // Le deuxième élément est souvent le titre (mais on utilise cleanedTitle qui est mieux nettoyé)
                // Si cleanedTitle est vide, utiliser parts[1]
                if (!title || title.length < 2) {
                    title = parts[1];
                }
            }
            if (parts.length >= 3) {
                // Le troisième élément pourrait être un album ou des infos supplémentaires
                album = parts.slice(2).join(' ');
                // Nettoyer les mots-clés techniques de l'album (Live, Remastered, etc.)
                album = album.replace(/\b(Live|Remastered|Remix|Version|Extended|Deluxe|Edition)\b.*$/i, '').trim();
            }
            
            // Nettoyer le titre pour retirer les "ft" / "feat" / "featuring"
            if (title) {
                const { cleanedTitle: titleWithoutFeat, featuringArtist } = cleanTitleFromFeaturing(title);
                // Utiliser le titre sans "feat" comme titre principal, mais garder l'original en variante
                title = titleWithoutFeat || title;
            }
            
            // Nettoyer l'artiste (enlever les numéros, mots techniques)
            if (artist) {
                artist = artist.replace(/^\d+\s*/, '').trim();
                artist = artist.replace(/\s+(Live|Remastered|Remix|Version|Extended|Deluxe|Edition).*$/i, '').trim();
            }
            
            // Extraire les artistes multiples (séparés par virgules, "&", "and", etc.)
            let artistVariants: string[] = [];
            if (artist) {
                // D'abord, extraire tous les artistes possibles
                const multipleArtists = extractMultipleArtists(artist);
                if (multipleArtists.length > 1) {
                    // Si plusieurs artistes trouvés, on va essayer chacun séparément
                    artistVariants = multipleArtists;
                } else {
                    // Sinon, générer les variantes avec/sans "Official"
                    artistVariants = cleanArtistName(artist);
                }
            }
            
            
            // Générer toutes les variantes de recherche possibles
            // On va tester plusieurs combinaisons pour maximiser les chances de trouver
            const searchVariants: Array<{ title: string; artist?: string; album?: string; description: string }> = [];
            
            // Variante 1: Titre seul
            if (title && title.length >= 2) {
                searchVariants.push({ title, description: 'titre seul' });
            }
            
            // Variante 2: Artiste(s) + Titre
            // Si plusieurs artistes, essayer chacun séparément
            if (title && title.length >= 2 && artistVariants.length > 0) {
                for (const artistVariant of artistVariants) {
                    if (artistVariant.length >= 2) {
                        searchVariants.push({ title, artist: artistVariant, description: `artiste + titre: ${artistVariant}` });
                    }
                }
            }
            
            // Variante 3: Titre seul (variantes générées) - PRIORITÉ HAUTE
            if (title && title.length >= 2) {
                const titleVariants = generateTitleVariants(title);
                for (const variant of titleVariants) {
                    if (variant !== title && !searchVariants.some(v => v.title === variant && !v.artist)) {
                        searchVariants.push({ title: variant, description: `titre variant: ${variant}` });
                    }
                }
            }
            
            // Variante 4: Artiste(s) + Titre (variantes) - PRIORITÉ HAUTE
            // Si plusieurs artistes, essayer chacun avec les variantes de titre
            if (title && title.length >= 2 && artistVariants.length > 0) {
                const titleVariants = generateTitleVariants(title);
                for (const artistVariant of artistVariants) {
                    if (artistVariant.length >= 2) {
                        for (const variant of titleVariants) {
                            if (variant !== title && !searchVariants.some(v => v.title === variant && v.artist === artistVariant)) {
                                searchVariants.push({ title: variant, artist: artistVariant, description: `artiste + titre variant: ${artistVariant} - ${variant}` });
                            }
                        }
                    }
                }
            }
            
            // Variante 5b: Titre sans "Part" ou numéros (pour les chansons avec plusieurs parties)
            if (title && title.length >= 2) {
                const titleWithoutPart = title.replace(/\s+Part\s+\d+/i, '').replace(/\s+Parts?\s+\d+[-–]\d+/i, '').trim();
                if (titleWithoutPart !== title && titleWithoutPart.length >= 2 && !searchVariants.some(v => v.title === titleWithoutPart && !v.artist)) {
                    searchVariants.push({ title: titleWithoutPart, description: `titre sans Part: ${titleWithoutPart}` });
                    // Ajouter avec chaque variante d'artiste
                    for (const artistVariant of artistVariants) {
                        if (artistVariant.length >= 2) {
                            searchVariants.push({ title: titleWithoutPart, artist: artistVariant, description: `artiste + titre sans Part: ${artistVariant} - ${titleWithoutPart}` });
                        }
                    }
                }
            }
            
            // Variante 6: Titre + Album (si disponible) - PRIORITÉ BASSE
            if (title && title.length >= 2 && album && album.length >= 2) {
                searchVariants.push({ title, album, description: 'titre + album' });
            }
            
            // Variante 7: Artiste(s) + Titre + Album - PRIORITÉ BASSE
            if (title && title.length >= 2 && album && album.length >= 2 && artistVariants.length > 0) {
                for (const artistVariant of artistVariants) {
                    if (artistVariant.length >= 2) {
                        searchVariants.push({ title, artist: artistVariant, album, description: `artiste + titre + album: ${artistVariant}` });
                    }
                }
            }
            
            // Limiter à 20 variantes maximum pour éviter trop de requêtes
            if (searchVariants.length > 20) {
                searchVariants.splice(20);
            }
            
            
            // Essayer MusicBrainz avec toutes les variantes
            // CONTINUER à chercher même après avoir trouvé des métadonnées si on n'a pas encore d'image
            let metadata: MediaMetadata | null = null;
            let hasImageUrl: boolean = false; // Suivre si on a une URL d'image (pas encore téléchargée)
            
            // Parcourir TOUTES les variantes pour maximiser les chances de trouver une image
            for (let i = 0; i < searchVariants.length; i++) {
                const variant = searchVariants[i];
                const mbResult = await searchMusicBrainzComplete(variant.title, variant.artist);
                if (mbResult) {
                    // Toujours mettre à jour les métadonnées si meilleures (priorité à celles avec image)
                    if (!metadata || (!hasImageUrl && mbResult.thumbnail_url)) {
                        // Si on a déjà des métadonnées sans image et que cette variante a une image, remplacer
                        // Sinon, fusionner intelligemment
                        if (!metadata) {
                            metadata = mbResult; // Première métadonnée trouvée
                        } else if (mbResult.thumbnail_url && !metadata.thumbnail_url) {
                            // On a des métadonnées mais pas d'image, et cette variante a une image
                            metadata = mbResult; // Remplacer complètement si on trouve une image
                        } else if (mbResult.thumbnail_url && metadata && metadata.thumbnail_url) {
                            // Les deux ont des images, fusionner (garder la nouvelle si meilleure)
                            // Utiliser une variable locale pour garantir à TypeScript que metadata n'est pas null
                            const currentMetadata: MediaMetadata = metadata;
                            metadata = { ...currentMetadata, ...mbResult };
                        }
                        // metadata est garanti non-null ici
                        hasImageUrl = !!(metadata && metadata.thumbnail_url);
                    }
                }
            }
            
            if (metadata) {
            } else {
            }
            
            // Si on n'a pas d'image ou pas de métadonnées, essayer Spotify avec toutes les variantes
            // CONTINUER à chercher même après avoir trouvé des métadonnées si on n'a pas encore d'image
            if ((!metadata || !hasImageUrl) && apiKeys?.spotifyClientId && apiKeys?.spotifyClientSecret) {
                
                // Parcourir TOUTES les variantes pour maximiser les chances de trouver une image
                for (let i = 0; i < searchVariants.length; i++) {
                    const variant = searchVariants[i];
                    const spotifyResult = await searchSpotifyComplete(variant.title, variant.artist, apiKeys.spotifyClientId, apiKeys.spotifyClientSecret);
                    if (spotifyResult) {
                        // Toujours mettre à jour si meilleur (priorité à celles avec image)
                        if (!metadata || (!hasImageUrl && spotifyResult.thumbnail_url)) {
                            if (metadata) {
                                // Si on a déjà des métadonnées mais pas d'image, et que Spotify a une image, remplacer
                                if (spotifyResult.thumbnail_url && !metadata.thumbnail_url) {
                                    metadata = spotifyResult;
                                } else if (spotifyResult.thumbnail_url) {
                                    // Les deux ont des images, garder la meilleure (celle de Spotify si plus grande)
                                    metadata = { ...metadata, ...spotifyResult };
                                } else if (!metadata.thumbnail_url) {
                                    // Ni l'un ni l'autre n'a d'image, garder les meilleures métadonnées
                                    metadata = spotifyResult.title && spotifyResult.artists ? spotifyResult : metadata;
                                }
                            } else {
                                metadata = spotifyResult;
                            }
                            hasImageUrl = !!(metadata.thumbnail_url);
                        }
                    }
                }
                
                if (metadata) {
                } else {
                }
            } else if ((!metadata || !hasImageUrl) && (!apiKeys?.spotifyClientId || !apiKeys?.spotifyClientSecret)) {
            }
            
            // Si on n'a pas d'image ou pas de métadonnées, essayer Discogs avec toutes les variantes
            // CONTINUER à chercher même après avoir trouvé des métadonnées si on n'a pas encore d'image
            if (!metadata || !hasImageUrl) {
                
                // Parcourir TOUTES les variantes pour maximiser les chances de trouver une image
                for (let i = 0; i < searchVariants.length; i++) {
                    const variant = searchVariants[i];
                    const discogsResult = await searchDiscogsComplete(
                        variant.title, 
                        variant.artist,
                        apiKeys?.discogsApiToken
                    );
                    if (discogsResult) {
                        // Toujours mettre à jour si meilleur (priorité à celles avec image)
                        if (!metadata || (!hasImageUrl && discogsResult.thumbnail_url)) {
                            if (metadata) {
                                // Si on a déjà des métadonnées mais pas d'image, et que Discogs a une image, remplacer
                                if (discogsResult.thumbnail_url && !metadata.thumbnail_url) {
                                    metadata = discogsResult;
                                } else if (discogsResult.thumbnail_url) {
                                    // Les deux ont des images, fusionner
                                    metadata = { ...metadata, ...discogsResult };
                                } else if (!metadata.thumbnail_url) {
                                    // Ni l'un ni l'autre n'a d'image, garder les meilleures métadonnées
                                    metadata = discogsResult.title ? discogsResult : metadata;
                                }
                            } else {
                                metadata = discogsResult;
                            }
                            hasImageUrl = !!(metadata.thumbnail_url);
                        }
                    }
                }
                
                if (metadata) {
                } else {
                }
            }
            
            // Si on n'a PAS de métadonnées mais qu'on a un artiste et un titre, essayer quand même Cover Art Archive
            if (!metadata && artist && title && title.length >= 2) {
                
                try {
                    await musicbrainzLimiter.waitIfNeeded();
                    const query = `recording:${encodeURIComponent(title)} AND artist:${encodeURIComponent(artist)}`;
                    const searchUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=3`;
                    
                    const mbResponse = await fetch(searchUrl, {
                        headers: {
                            'User-Agent': 'Videomi/1.0 (https://videomi.uk)',
                            'Accept': 'application/json'
                        }
                    });
                    
                    if (mbResponse.ok) {
                        const mbData = await mbResponse.json() as { 
                            recordings?: Array<{ 
                                id?: string;
                                title?: string;
                                'release-groups'?: Array<{ id?: string; title?: string }>;
                                'artist-credit'?: Array<{ artist?: { name?: string } }>;
                            }> 
                        };
                        
                        if (mbData.recordings && mbData.recordings.length > 0) {
                            // Créer des métadonnées basiques avec l'image trouvée
                            const recording = mbData.recordings[0];
                            const artists: string[] = [];
                            if (recording['artist-credit']) {
                                for (const ac of recording['artist-credit']) {
                                    if (ac.artist?.name) {
                                        artists.push(ac.artist.name);
                                    }
                                }
                            }
                            
                            let thumbnailUrl: string | null = null;
                            if (recording['release-groups']) {
                                for (const rg of recording['release-groups']) {
                                    if (rg.id && !thumbnailUrl) {
                                        thumbnailUrl = await getCoverArtFromReleaseGroup(rg.id);
                                        if (thumbnailUrl) break;
                                    }
                                }
                            }
                            
                            if (thumbnailUrl || recording.title) {
                                metadata = {
                                    thumbnail_url: thumbnailUrl,
                                    backdrop_url: null,
                                    thumbnail_r2_path: null,
                                    source_api: 'musicbrainz',
                                    source_id: recording.id || null,
                                    genres: null,
                                    subgenres: null,
                                    season: null,
                                    episode: null,
                                    artists: artists.length > 0 ? artists : [artist],
                                    albums: null,
                                    title: recording.title || title,
                                    year: null,
                                    description: null,
                                    episode_description: null
                                };
                            }
                        }
                    }
                } catch (coverArtError) {
                    console.warn('🎵 [MUSIQUE] ⚠️ Erreur recherche Cover Art Archive sans métadonnées:', coverArtError);
                }
            }
            
            if (metadata) {
                // Si on a des métadonnées mais pas d'image, essayer de trouver une image via Cover Art Archive
                if (!metadata.thumbnail_url && (metadata.artists && metadata.artists.length > 0) && metadata.title) {
                    
                    // Essayer de trouver un release-group ID via MusicBrainz pour utiliser Cover Art Archive
                    try {
                        await musicbrainzLimiter.waitIfNeeded();
                        const artistName = metadata.artists[0];
                        const searchTitle = metadata.title;
                        
                        // Recherche rapide dans MusicBrainz pour obtenir un release-group ID
                        const query = `recording:${encodeURIComponent(searchTitle)} AND artist:${encodeURIComponent(artistName)}`;
                        const searchUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
                        
                        
                        const mbResponse = await fetch(searchUrl, {
                            headers: {
                                'User-Agent': 'Videomi/1.0 (https://videomi.uk)',
                                'Accept': 'application/json'
                            }
                        });
                        
                        if (mbResponse.ok) {
                            const mbData = await mbResponse.json() as { 
                                recordings?: Array<{ 
                                    'release-groups'?: Array<{ id?: string }> 
                                }> 
                            };
                            
                            if (mbData.recordings && mbData.recordings.length > 0) {
                                // Chercher dans tous les release-groups jusqu'à trouver une image
                                for (const recording of mbData.recordings) {
                                    if (recording['release-groups']) {
                                        for (const rg of recording['release-groups']) {
                                            if (rg.id && !metadata.thumbnail_url) {
                                                const coverArtUrl = await getCoverArtFromReleaseGroup(rg.id);
                                                if (coverArtUrl) {
                                                    metadata.thumbnail_url = coverArtUrl;
                                                    break;
                                                }
                                            }
                                        }
                                        if (metadata.thumbnail_url) break;
                                    }
                                }
                            }
                        }
                    } catch (coverArtError) {
                        console.warn('🎵 [MUSIQUE] ⚠️ Erreur recherche Cover Art Archive:', coverArtError);
                    }
                }
                
                // Gérer les images : Priorité 1 = Image ID3 (déjà extraite), Priorité 2 = Image API
                // OBJECTIF: Garantir qu'au moins une image est téléchargée et stockée (80% minimum de succès)
                let finalImageUrl: string | null = null;
                let finalImageR2Path: string | null = null;
                
                // PRIORITÉ 1: Si on a une image ID3, l'utiliser en priorité et s'assurer qu'elle est téléchargée
                if (embeddedImageUrl) {
                    
                    // Télécharger l'image ID3 avec retries maximisés (maxRetries = 10 pour ID3)
                    // L'image ID3 est le plus fiable car elle vient directement du fichier
                    finalImageR2Path = await downloadAndStoreThumbnail(
                        embeddedImageUrl,
                        fileId,
                        category,
                        10 // 10 retries pour maximiser le succès (ID3 est la source la plus fiable)
                    ).catch((err) => {
                        console.warn(`🎵 [MUSIQUE] ⚠️ Échec téléchargement image ID3 (10 tentatives épuisées):`, err);
                        return null;
                    });
                    
                    if (finalImageR2Path) {
                        finalImageUrl = embeddedImageUrl;
                    } else {
                        console.warn(`🎵 [MUSIQUE] ⚠️ Image ID3 trouvée mais échec stockage dans R2 après 10 tentatives`);
                    }
                }
                
                // PRIORITÉ 2: Si on n'a pas d'image ID3 stockée mais que l'API a trouvé une image, la télécharger
                if (!finalImageR2Path && metadata.thumbnail_url) {
                    const apiImageR2Path = await downloadAndStoreThumbnail(
                        metadata.thumbnail_url,
                        fileId,
                        category,
                        10 // 10 retries pour maximiser le succès
                    ).catch((err) => {
                        console.warn(`🎵 [MUSIQUE] ⚠️ Échec téléchargement/stockage miniature depuis API (10 tentatives épuisées):`, err);
                        return null;
                    });
                    
                    if (apiImageR2Path) {
                        finalImageUrl = metadata.thumbnail_url;
                        finalImageR2Path = apiImageR2Path;
                    } else {
                        console.warn(`🎵 [MUSIQUE] ⚠️ Échec téléchargement/stockage miniature depuis API après 10 tentatives`);
                        
                        // DERNIER RECOURS: Si l'image API a échoué mais qu'on a une image ID3, réessayer l'ID3
                        if (embeddedImageUrl) {
                            finalImageR2Path = await downloadAndStoreThumbnail(
                                embeddedImageUrl,
                                fileId,
                                category,
                                5 // 5 tentatives supplémentaires avec backoff plus long
                            ).catch((err) => {
                                console.warn(`🎵 [MUSIQUE] ⚠️ Échec réessai image ID3 (dernier recours):`, err);
                                return null;
                            });
                            
                            if (finalImageR2Path) {
                                finalImageUrl = embeddedImageUrl;
                            } else {
                                console.error(`🎵 [MUSIQUE] ❌ Échec total: Image ID3 et API ont toutes les deux échoué`);
                            }
                        }
                    }
                }
                
                // Vérification finale: si on a toujours aucune image stockée, logger un avertissement
                if (!finalImageR2Path) {
                    console.warn(`🎵 [MUSIQUE] ❌ AUCUNE IMAGE N'A PU ÊTRE TÉLÉCHARGÉE ET STOCKÉE`);
                    console.warn(`🎵 [MUSIQUE]    - Image ID3 disponible: ${!!embeddedImageUrl}`);
                    console.warn(`🎵 [MUSIQUE]    - Image API disponible: ${!!metadata.thumbnail_url}`);
                } else {
                }
                
                // Mettre à jour les métadonnées avec l'image finale (même si le téléchargement a échoué, on garde l'URL)
                metadata.thumbnail_url = finalImageUrl || metadata.thumbnail_url;
                metadata.thumbnail_r2_path = finalImageR2Path;
                
                // RETOURNER UNIQUEMENT LE TITRE (pas "Artiste - Titre")
                // Les infos d'artiste et d'album sont sauvegardées dans les métadonnées
                const finalTitle = metadata.title || title || originalNameWithoutExt;
                
                return {
                    title: `${finalTitle}${extension}`,
                    metadata
                };
            }
            
            // Si aucune métadonnée n'a été trouvée mais qu'on a une image ID3, créer des métadonnées minimales
            if (!metadata && embeddedImageUrl) {
                
                // Télécharger l'image ID3 avec retries maximisés
                const id3ImageR2Path = await downloadAndStoreThumbnail(
                    embeddedImageUrl,
                    fileId,
                    category,
                    10 // 10 tentatives pour maximiser le succès
                ).catch((err) => {
                    console.warn(`🎵 [MUSIQUE] ⚠️ Échec téléchargement image ID3 (métadonnées minimales, 10 tentatives épuisées):`, err);
                    return null;
                });
                
                metadata = {
                    thumbnail_url: embeddedImageUrl,
                    backdrop_url: null,
                    thumbnail_r2_path: id3ImageR2Path,
                    source_api: null,
                    source_id: null,
                    genres: null,
                    subgenres: null,
                    season: null,
                    episode: null,
                    artists: artist ? [artist] : null,
                    albums: null,
                    title: title || null,
                    year: null,
                    description: null,
                    episode_description: null
                };
                
                if (id3ImageR2Path) {
                } else {
                    console.warn(`🎵 [MUSIQUE] ⚠️ Image ID3 trouvée mais échec stockage dans R2 après 5 tentatives`);
                }
            }
            
            // Si aucune API n'a trouvé, retourner le titre nettoyé si valide, sinon le nom original
            // IMPORTANT: Garantir qu'on retourne toujours quelque chose
            let finalTitle: string;
            
            // Priorité 1: Utiliser le titre nettoyé s'il est valide
            if (title && title.length >= 1) {
                finalTitle = title;
            } else {
                // Priorité 2: Utiliser le nom nettoyé (sans numéro de piste)
                const cleanedNameFallback = cleanedName.replace(/^\d{2,3}\s*-\s*/, '').replace(/^\d{2,3}\s+/, '').trim();
                if (cleanedNameFallback && cleanedNameFallback.length >= 1) {
                    // Extraire juste le titre si format "Artiste - Titre"
                    const fallbackParts = cleanedNameFallback.split(/\s*[-–]\s*/);
                    if (fallbackParts.length >= 2) {
                        finalTitle = fallbackParts.slice(1).join(' - ').trim();
                        // Nettoyer rapidement
                        finalTitle = finalTitle.replace(/^["'`＂]|["'`＂]$/g, '').trim();
                        finalTitle = finalTitle.replace(/\s+(Remastered|Live|Official|Video|HD|PULSE).*$/i, '').trim();
                    } else {
                        finalTitle = cleanedNameFallback;
                    }
                } else {
                    // Priorité 3: Utiliser le nom original
                    finalTitle = originalNameWithoutExt || 'Unknown';
                }
            }
            
            // S'assurer que le titre final n'est jamais vide
            if (!finalTitle || finalTitle.length === 0) {
                finalTitle = originalNameWithoutExt || 'Unknown';
            }
            
            
            return {
                title: `${finalTitle}${extension}`,
                metadata: null
            };
        }
    } catch (error) {
        console.warn('Erreur enrichissement métadonnées:', error);
    }

    // En cas d'erreur ou si aucune catégorie n'a été traitée, retourner le titre nettoyé si valide, sinon le nom original
    const finalTitle = cleanedTitle && cleanedTitle.length >= 2 ? cleanedTitle : originalNameWithoutExt;
    return { title: `${finalTitle}${extension}`, metadata: null };
}

/**
 * Nettoie le cache API
 */
export function clearExpiredApiCache(): void {
    const now = Date.now();
    for (const [key, value] of apiCache.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
            apiCache.delete(key);
        }
    }
}

/**
 * Recherche plusieurs correspondances de films sur TMDb (pour sélection utilisateur)
 */
export async function searchMovies(
    title: string,
    year?: number | null,
    apiKey?: string,
    maxResults: number = 10
): Promise<MediaSearchResult> {
    if (!apiKey) {
        return { matches: [], total: 0 };
    }

    const matches: MediaMatch[] = [];

    try {
        await tmdbLimiter.waitIfNeeded();
        
        const encodedTitle = encodeURIComponent(title);
        let searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodedTitle}&language=fr-FR`;
        if (year) {
            searchUrl += `&year=${year}`;
        }
        
        const searchResponse = await fetch(searchUrl);
        if (!searchResponse.ok) {
            return { matches: [], total: 0 };
        }
        
        const searchData = await searchResponse.json() as { 
            results?: Array<{ 
                id: number; 
                title?: string; 
                release_date?: string;
                poster_path?: string | null;
                backdrop_path?: string | null;
                overview?: string | null;
            }> 
        };
        
        if (searchData.results && searchData.results.length > 0) {
            const limitedResults = searchData.results.slice(0, maxResults);
            
            for (const movie of limitedResults) {
                const movieYear = movie.release_date ? parseInt(movie.release_date.substring(0, 4)) : null;
                const thumbnailUrl = movie.backdrop_path 
                    ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`
                    : null;
                
                matches.push({
                    id: `tmdb_movie_${movie.id}`,
                    title: movie.title || 'Sans titre',
                    year: movieYear,
                    thumbnail_url: thumbnailUrl,
                    source_api: 'tmdb',
                    source_id: String(movie.id),
                    description: movie.overview || null,
                    score: calculateScore(title, movie.title || '', year, movieYear)
                });
            }
        }
    } catch (error) {
        console.warn('Erreur recherche films TMDb:', error);
    }
    
    return { matches, total: matches.length };
}

/**
 * Recherche plusieurs correspondances de séries sur TMDb (pour sélection utilisateur)
 */
export async function searchTVShows(
    title: string,
    year?: number | null,
    apiKey?: string,
    maxResults: number = 10
): Promise<MediaSearchResult> {
    if (!apiKey) {
        return { matches: [], total: 0 };
    }

    const matches: MediaMatch[] = [];

    try {
        await tmdbLimiter.waitIfNeeded();
        
        const encodedTitle = encodeURIComponent(title);
        let searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodedTitle}&language=fr-FR`;
        if (year) {
            searchUrl += `&first_air_date_year=${year}`;
        }
        
        const searchResponse = await fetch(searchUrl);
        if (!searchResponse.ok) {
            return { matches: [], total: 0 };
        }
        
        const searchData = await searchResponse.json() as { 
            results?: Array<{ 
                id: number; 
                name?: string; 
                first_air_date?: string;
                poster_path?: string | null;
                backdrop_path?: string | null;
                overview?: string | null;
            }> 
        };
        
        if (searchData.results && searchData.results.length > 0) {
            const limitedResults = searchData.results.slice(0, maxResults);
            
            for (const tvShow of limitedResults) {
                const tvYear = tvShow.first_air_date ? parseInt(tvShow.first_air_date.substring(0, 4)) : null;
                const thumbnailUrl = tvShow.backdrop_path 
                    ? `https://image.tmdb.org/t/p/w1280${tvShow.backdrop_path}`
                    : null;
                
                matches.push({
                    id: `tmdb_tv_${tvShow.id}`,
                    title: tvShow.name || 'Sans titre',
                    year: tvYear,
                    thumbnail_url: thumbnailUrl,
                    source_api: 'tmdb_tv',
                    source_id: String(tvShow.id),
                    description: tvShow.overview || null,
                    score: calculateScore(title, tvShow.name || '', year, tvYear)
                });
            }
        }
    } catch (error) {
        console.warn('Erreur recherche séries TMDb:', error);
    }
    
    return { matches, total: matches.length };
}

/**
 * Recherche plusieurs correspondances de musique sur Spotify (pour sélection utilisateur)
 */
export async function searchMusicOnSpotify(
    title: string,
    artist?: string | null,
    spotifyClientId?: string,
    spotifyClientSecret?: string,
    maxResults: number = 20
): Promise<MediaSearchResult> {
    if (!spotifyClientId || !spotifyClientSecret) {
        return { matches: [], total: 0 };
    }

    const matches: MediaMatch[] = [];

    try {
        // Obtenir un token d'accès Spotify
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `grant_type=client_credentials&client_id=${encodeURIComponent(spotifyClientId)}&client_secret=${encodeURIComponent(spotifyClientSecret)}`
        });

        if (!tokenResponse.ok) {
            return { matches: [], total: 0 };
        }

        const tokenData = await tokenResponse.json() as { access_token?: string };
        if (!tokenData.access_token) {
            return { matches: [], total: 0 };
        }

        await spotifyLimiter.waitIfNeeded();

        // Rechercher des tracks
        let query = title;
        if (artist) {
            query = `track:${title} artist:${artist}`;
        }
        
        const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${maxResults}`;
        const searchResponse = await fetch(searchUrl, {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });

        if (!searchResponse.ok) {
            return { matches: [], total: 0 };
        }

        const searchData = await searchResponse.json() as {
            tracks?: {
                items?: Array<{
                    id: string;
                    name: string;
                    artists?: Array<{ name: string }>;
                    album?: { 
                        id: string;
                        name: string; 
                        images?: Array<{ url: string }>; 
                        release_date?: string;
                        album_type?: 'album' | 'single' | 'compilation';
                    };
                }>;
            };
        };

        if (searchData.tracks?.items && searchData.tracks.items.length > 0) {
            for (const track of searchData.tracks.items) {
                const trackArtist = track.artists && track.artists.length > 0 ? track.artists[0].name : null;
                const albumName = track.album?.name || null;
                const albumType = track.album?.album_type;
                const thumbnailUrl = track.album?.images && track.album.images.length > 0 
                    ? track.album.images[0].url 
                    : null;
                const year = track.album?.release_date ? parseInt(track.album.release_date.substring(0, 4)) : null;

                // FILTRER : Ne garder que les albums studio (album) ou singles, PAS les compilations
                // Vérifier aussi le nom pour exclure les compilations typiques
                if (!albumName || 
                    (albumType && albumType === 'compilation') ||
                    isCompilationAlbum(albumName)) {
                    // Album exclu (compilation ou nom indique une compilation)
                    if (albumName) {
                    }
                    continue;
                }

                // Créer un ID unique en combinant artist et title
                const matchId = `spotify_${track.id}`;
                
                matches.push({
                    id: matchId,
                    title: track.name,
                    year: year,
                    thumbnail_url: thumbnailUrl,
                    source_api: 'spotify',
                    source_id: track.id,
                    artist: trackArtist,
                    album: albumName,
                    score: calculateScore(title, track.name, null, year, artist, trackArtist)
                });
            }
        }
    } catch (error) {
        console.warn('Erreur recherche musique Spotify:', error);
    }
    
    return { matches, total: matches.length };
}

/**
 * Recherche des artistes directement sur Spotify (pour sélection utilisateur)
 */
export async function searchArtistsOnSpotify(
    query: string,
    spotifyClientId?: string,
    spotifyClientSecret?: string,
    maxResults: number = 20
): Promise<Array<{ id: string; name: string; thumbnail_url: string | null }>> {
    if (!spotifyClientId || !spotifyClientSecret) {
        return [];
    }

    const artists: Array<{ id: string; name: string; thumbnail_url: string | null }> = [];

    try {
        // Obtenir un token d'accès Spotify
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `grant_type=client_credentials&client_id=${encodeURIComponent(spotifyClientId)}&client_secret=${encodeURIComponent(spotifyClientSecret)}`
        });

        if (!tokenResponse.ok) {
            return [];
        }

        const tokenData = await tokenResponse.json() as { access_token?: string };
        if (!tokenData.access_token) {
            return [];
        }

        await spotifyLimiter.waitIfNeeded();

        // Rechercher directement des artistes
        const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=${maxResults}`;
        const searchResponse = await fetch(searchUrl, {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });

        if (!searchResponse.ok) {
            return [];
        }

        const searchData = await searchResponse.json() as {
            artists?: {
                items?: Array<{
                    id: string;
                    name: string;
                    images?: Array<{ url: string }>;
                }>;
            };
        };

        if (searchData.artists?.items && searchData.artists.items.length > 0) {
            for (const artist of searchData.artists.items) {
                const thumbnailUrl = artist.images && artist.images.length > 0 
                    ? artist.images[0].url 
                    : null;
                
                artists.push({
                    id: artist.id,
                    name: artist.name,
                    thumbnail_url: thumbnailUrl
                });
            }
        }
    } catch (error) {
        console.warn('Erreur recherche artistes Spotify:', error);
    }
    
    return artists;
}

/**
 * Fonction utilitaire pour détecter si un nom d'album est une compilation
 */
function isCompilationAlbum(albumName: string): boolean {
    const name = albumName.toLowerCase();
    const compilationPatterns = [
        /^hits/i,
        /best of/i,
        /greatest hits/i,
        /greatest/i,
        /classic.*rock.*songs/i,
        /rock.*songs.*\d{2}s/i,
        /\d{2}s.*rock/i,
        /ultimate collection/i,
        /complete collection/i,
        /anthology/i,
        /the collection/i,
        /gold/i,
        /platinum/i,
        /essential/i,
        /very best/i,
        /top.*hits/i,
        /chart.*hits/i,
        /radio.*hits/i,
        /party.*hits/i,
        /summer.*hits/i,
        /winter.*hits/i,
        /christmas.*hits/i,
        /remastered.*collection/i,
        /box.*set/i,
        /deluxe.*edition.*collection/i,
        /now.*that.*what/i, // "Now That's What I Call Music!"
        /karaoke/i,
        /instrumental.*versions/i,
        /acoustic.*versions/i,
        /remixes/i,
        /tribute.*to/i,
        /cover.*versions/i
    ];
    
    return compilationPatterns.some(pattern => pattern.test(name));
}

/**
 * Recherche des albums pour un artiste spécifique sur Spotify
 */
export async function searchAlbumsForArtistOnSpotify(
    artistId: string,
    title?: string | null,
    spotifyClientId?: string,
    spotifyClientSecret?: string,
    maxResults: number = 50,
    artistName?: string // Ajouter le nom de l'artiste pour la recherche
): Promise<MediaSearchResult> {
    if (!spotifyClientId || !spotifyClientSecret) {
        return { matches: [], total: 0 };
    }

    const matches: MediaMatch[] = [];

    try {
        // Obtenir un token d'accès Spotify
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `grant_type=client_credentials&client_id=${encodeURIComponent(spotifyClientId)}&client_secret=${encodeURIComponent(spotifyClientSecret)}`
        });

        if (!tokenResponse.ok) {
            return { matches: [], total: 0 };
        }

        const tokenData = await tokenResponse.json() as { access_token?: string };
        if (!tokenData.access_token) {
            return { matches: [], total: 0 };
        }

        await spotifyLimiter.waitIfNeeded();

        // Rechercher des tracks de cet artiste
        let searchUrl: string;
        if (title && artistName) {
            // Si on a un titre et un nom d'artiste, utiliser la recherche directe comme en Python
            // Format: track:"Titre" artist:"Nom Artiste"
            const query = `track:"${title}" artist:"${artistName}"`;
            searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${maxResults}`;
        } else if (title) {
            // Fallback: utiliser l'ID d'artiste si pas de nom
            searchUrl = `https://api.spotify.com/v1/search?q=artist:${encodeURIComponent(artistId)} track:${encodeURIComponent(title)}&type=track&limit=${maxResults}`;
        } else {
            // Sinon, récupérer les albums de l'artiste
            searchUrl = `https://api.spotify.com/v1/artists/${artistId}/albums?limit=${maxResults}&include_groups=album,single`;
        }

        const searchResponse = await fetch(searchUrl, {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });

        if (!searchResponse.ok) {
            return { matches: [], total: 0 };
        }

        const searchData = await searchResponse.json() as {
            tracks?: {
                items?: Array<{
                    id: string;
                    name: string;
                    artists?: Array<{ name: string }>;
                    album?: { 
                        id: string;
                        name: string; 
                        images?: Array<{ url: string }>; 
                        release_date?: string;
                        album_type?: 'album' | 'single' | 'compilation';
                    };
                }>;
            };
            items?: Array<{
                id: string;
                name: string;
                images?: Array<{ url: string }>;
                release_date?: string;
                artists?: Array<{ name: string }>;
                album_type?: 'album' | 'single' | 'compilation';
            }>;
        };

        // Si on a des tracks, extraire les albums uniques (uniquement albums studio/singles, pas compilations)
        if (searchData.tracks?.items) {
            const albumMap = new Map<string, MediaMatch>();
            
            for (const track of searchData.tracks.items) {
                const trackArtist = track.artists && track.artists.length > 0 ? track.artists[0].name : null;
                const albumName = track.album?.name || null;
                const albumType = track.album?.album_type;
                const thumbnailUrl = track.album?.images && track.album.images.length > 0 
                    ? track.album.images[0].url 
                    : null;
                const year = track.album?.release_date ? parseInt(track.album.release_date.substring(0, 4)) : null;

                // FILTRER : Ne garder que les albums studio (album) ou singles, PAS les compilations
                // Vérifier aussi le nom pour exclure les compilations typiques
                if (albumName && albumType && 
                    (albumType === 'album' || albumType === 'single') &&
                    !isCompilationAlbum(albumName)) {
                    
                    const albumKey = `${albumName.toLowerCase()}_${year || ''}`;
                    if (!albumMap.has(albumKey)) {
                        albumMap.set(albumKey, {
                            id: `spotify_album_${track.album?.id || track.id}`,
                            title: track.name,
                            year: year,
                            thumbnail_url: thumbnailUrl,
                            source_api: 'spotify',
                            source_id: track.album?.id || track.id,
                            artist: trackArtist,
                            album: albumName,
                            score: title ? calculateScore(title, track.name, null, year, null, trackArtist) : 100
                        });
                    }
                } else {
                    // Log pour debug : pourquoi l'album a été exclu
                    if (albumName) {
                    }
                }
            }
            
            matches.push(...Array.from(albumMap.values()));
        } else if (searchData.items) {
            // Si on a des albums directement, les filtrer (uniquement albums studio/singles, pas compilations)
            const artistName = searchData.items[0]?.artists?.[0]?.name || null;
            
            for (const album of searchData.items) {
                const albumType = album.album_type;
                const albumName = album.name;
                
                // FILTRER : Ne garder que les albums studio (album) ou singles, PAS les compilations
                // Vérifier aussi le nom pour exclure les compilations typiques
                if ((albumType === 'album' || albumType === 'single') &&
                    !isCompilationAlbum(albumName)) {
                    
                    const thumbnailUrl = album.images && album.images.length > 0 
                        ? album.images[0].url 
                        : null;
                    const year = album.release_date ? parseInt(album.release_date.substring(0, 4)) : null;
                    
                    matches.push({
                        id: `spotify_album_${album.id}`,
                        title: title || album.name, // Utiliser le titre du fichier si disponible
                        year: year,
                        thumbnail_url: thumbnailUrl,
                        source_api: 'spotify',
                        source_id: album.id,
                        artist: artistName,
                        album: album.name,
                        score: 100
                    });
                } else {
                    // Log pour debug : pourquoi l'album a été exclu
                }
            }
        }
    } catch (error) {
        console.warn('Erreur recherche albums pour artiste Spotify:', error);
    }
    
    return { matches, total: matches.length };
}

/**
 * Calcule un score de correspondance (0-100)
 */
function calculateScore(
    searchTitle: string,
    resultTitle: string,
    searchYear?: number | null,
    resultYear?: number | null,
    searchArtist?: string | null,
    resultArtist?: string | null
): number {
    let score = 0;
    
    // Correspondance du titre (pondération 60%)
    const titleSimilarity = calculateStringSimilarity(
        searchTitle.toLowerCase(),
        resultTitle.toLowerCase()
    );
    score += titleSimilarity * 0.6;
    
    // Correspondance de l'année (pondération 20%)
    if (searchYear && resultYear) {
        const yearDiff = Math.abs(searchYear - resultYear);
        if (yearDiff === 0) {
            score += 20;
        } else if (yearDiff === 1) {
            score += 15;
        } else if (yearDiff <= 3) {
            score += 10;
        }
    }
    
    // Correspondance de l'artiste pour la musique (pondération 20%)
    if (searchArtist && resultArtist) {
        const artistSimilarity = calculateStringSimilarity(
            searchArtist.toLowerCase(),
            resultArtist.toLowerCase()
        );
        score += artistSimilarity * 0.2;
    }
    
    return Math.round(score * 100) / 100;
}

/**
 * Calcule la similarité entre deux chaînes (0-1)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
    // Simple correspondance basée sur les sous-chaînes communes
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(str1, str2);
    return (longer.length - distance) / longer.length;
}

/**
 * Calcule la distance de Levenshtein entre deux chaînes
 */
function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

// Export de l'ancienne fonction pour compatibilité
export async function enrichFilenameWithMetadata(
    cleanedTitle: string,
    category: FileCategory,
    originalFilename: string,
    apiKeys?: {
        tmdb?: string;
        tvdb?: string;
    }
): Promise<string> {
    const result = await enrichWithCompleteMetadata(
        cleanedTitle,
        category,
        originalFilename,
        '', // fileId vide pour l'ancienne fonction
        undefined, // Pas de fichier pour l'ancienne fonction
        { tmdb: apiKeys?.tmdb, omdb: undefined }
    );
    return result.title;
}
