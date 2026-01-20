// INFO : workers/app.ts
import { Hono } from 'hono';
import { createRequestHandler } from 'react-router';
import type { Bindings } from './types.js';
import { registerAuthRoutes } from './auth.js';
import { generateGoogleAuthUrl, corsHeaders, noCacheHeaders } from './utils.js';
import uploadRoutes from './upload.js';

const app = new Hono<{ Bindings: Bindings }>();

// Fonctions utilitaires pour l'enrichissement (similaires à mediaMetadata.ts)
function cleanTitleForSearch(title: string): string {
    return title
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

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
    
    // Variante sans "Part 1", "Part 2", etc.
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
    return Array.from(new Set(variants)).filter(v => v.length >= 2);
}

// Nettoie un nom de fichier vidéo pour extraire un titre de base
function cleanVideoFilenameForEnrichment(rawTitleOrFilename: string): { baseTitle: string; progressiveVariants: string[] } {
    // Retirer l'extension si présente
    let name = rawTitleOrFilename.replace(/\.[^/.]+$/, '');
    
    // Remplacer points/underscores par des espaces
    name = name.replace(/[._]+/g, ' ');
    
    // Normaliser les espaces
    name = name.replace(/\s+/g, ' ').trim();
    
    const tokens = name.split(' ').filter(t => t.length > 0);
    
    // Mots techniques/qualité à couper (tout ce qui est à droite sera ignoré)
    const stopWords = new Set([
        '1080p','720p','480p','2160p','4k',
        'webrip','webdl','bdrip','brrip','bluray','blu-ray','hdrip','dvdrip','hdtv','tvrip','cam','ts','hc',
        'proper','repack','rerip',
        'vostfr','multi','truefrench','vf','vf2','vo','subfrench','fansub',
        'eac3','ddp5','ddp','aac','ac3','mp3','dts','xvid','x264','x265','h264','h265','hevc',
        'hmax','web','web-dl','web-rip'
    ]);
    
    let cutIndex = tokens.length;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i].toLowerCase();
        if (stopWords.has(t)) {
            cutIndex = i;
            break;
        }
    }
    
    let baseTokens = tokens.slice(0, cutIndex);
    if (baseTokens.length === 0) {
        baseTokens = tokens;
    }
    
    const baseTitle = baseTokens.join(' ').trim();
    
    // Variantes progressives en enlevant les mots de droite
    const progressiveVariants: string[] = [];
    for (let len = baseTokens.length; len >= 1; len--) {
        const v = baseTokens.slice(0, len).join(' ').trim();
        if (v.length >= 2) {
            progressiveVariants.push(v);
        }
    }
    
    return {
        baseTitle: baseTitle || rawTitleOrFilename,
        progressiveVariants: Array.from(new Set(progressiveVariants))
    };
}

function cleanTitleFromFeaturing(title: string): string {
    const featPatterns = [
        /\s+(?:ft|feat|featuring)\.?\s+([^,]+?)(?:\s*[,\-]|$)/i,
        /\s+(?:ft|feat|featuring)\.?\s+([^,]+?)(?:\s*\(|$)/i,
        /\s+\(ft\.?\s+([^)]+)\)/i,
        /\s+\(feat\.?\s+([^)]+)\)/i,
        /\s+\(featuring\s+([^)]+)\)/i,
    ];
    
    let cleanedTitle = title;
    for (const pattern of featPatterns) {
        if (pattern.test(cleanedTitle)) {
            cleanedTitle = cleanedTitle.replace(pattern, '').trim();
        }
    }
    
    return cleanedTitle;
}

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
    }
    
    // Toujours ajouter l'original (au cas où "Official" serait nécessaire)
    if (artist.length > 0) {
        variants.push(artist);
    }
    
    return Array.from(new Set(variants)).filter(v => v.length > 0);
}

// Fonction interne pour télécharger et stocker les miniatures (utilisée par l'enrichissement)
async function downloadAndStoreThumbnailInternal(
    imageUrl: string,
    fileId: string,
    category: string,
    storage: R2Bucket
): Promise<string | null> {
    try {
        let imageBuffer: ArrayBuffer;
        let contentType: string;

        // Vérifier si c'est une data URL (extraction depuis métadonnées audio ID3)
        if (imageUrl.startsWith('data:')) {
            // Extraire le MIME type et les données base64
            const dataUrlMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!dataUrlMatch) {
                console.error(`📸 [THUMBNAIL] Format data URL invalide`);
                return null;
            }
            
            contentType = dataUrlMatch[1];
            const base64Data = dataUrlMatch[2];
            
            // Décoder la base64 en ArrayBuffer
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            imageBuffer = bytes.buffer;
            
        } else {
            // URL normale, télécharger l'image
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) {
                console.error(`📸 [THUMBNAIL] Échec téléchargement: ${imageResponse.status} ${imageResponse.statusText}`);
                return null;
            }

            imageBuffer = await imageResponse.arrayBuffer();
            contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        }

        // Stocker dans R2
        // Normaliser l'extension : jpeg -> jpg
        let ext = contentType.split('/')[1] || 'jpg';
        if (ext === 'jpeg') ext = 'jpg';
        const thumbnailR2Path = `${category}/${fileId}/thumbnail.${ext}`;
        await storage.put(thumbnailR2Path, imageBuffer, {
            httpMetadata: {
                contentType: contentType,
                cacheControl: 'public, max-age=31536000, immutable'
            }
        });

        return thumbnailR2Path;
    } catch (error) {
        console.error('📸 [THUMBNAIL] ❌ Erreur:', error);
        return null;
    }
}

// Fonction pour nettoyer les chaînes de caractères
function cleanString(value: string | null | undefined): string | null {
    if (!value) return null;
    let cleaned = String(value).trim();
    
    // Si c'est un JSON array, parser et prendre le premier élément
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
    
    // Si c'est un JSON object, essayer d'extraire une valeur utile
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
        try {
            const parsed = JSON.parse(cleaned);
            if (typeof parsed === 'object' && parsed !== null) {
                const firstStringValue = Object.values(parsed).find(v => typeof v === 'string');
                if (firstStringValue) {
                    cleaned = String(firstStringValue);
                }
            }
        } catch {
            cleaned = cleaned.replace(/^\{|^\}|"|'/g, '');
        }
    }
    
    cleaned = cleaned.replace(/^["'\[\{]+|["'\]\}]+$/g, '');
    cleaned = cleaned.replace(/^,+\s*|,+\s*$/g, '');
    
    return cleaned.trim() || null;
}

// Fonction pour nettoyer un tableau de chaînes
function cleanStringArray(arr: any[] | null | undefined): string[] | null {
    if (!arr || !Array.isArray(arr)) return null;
    const cleaned = arr
        .map(item => {
            if (typeof item === 'string') {
                return cleanString(item);
            } else if (item && typeof item === 'object') {
                const firstStringValue = Object.values(item).find(v => typeof v === 'string');
                return firstStringValue ? cleanString(String(firstStringValue)) : null;
            }
            return null;
        })
        .filter((item): item is string => item !== null && item.length > 0);
    return cleaned.length > 0 ? cleaned : null;
}

// Constantes
const OAUTH_REDIRECT_URI = 'https://videomi.uk/oauth-callback';
const CORS_ALLOWED_METHODS = 'GET, POST, OPTIONS';

// Middleware CORS pour les routes API
app.use('/api/*', async (c, next) => {
    // Log pour diagnostic des routes /api/upload/*
    const path = new URL(c.req.url).pathname;
    if (path.startsWith('/api/upload/')) {
    }
    await next();
    c.res.headers.set('Access-Control-Allow-Origin', '*');
    c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    c.res.headers.set('Access-Control-Allow-Credentials', 'true');
    c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    c.res.headers.set('Cross-Origin-Embedder-Policy', 'unsafe-none');
});

// Handler global pour OPTIONS (CORS preflight)
app.options('*', (c) => {
    return c.json({}, {
        headers: {
            ...corsHeaders(CORS_ALLOWED_METHODS),
            'Access-Control-Max-Age': '86400'
        }
    });
});

// API publique
app.get('/api/config', (c) => {
    return c.json(
        {
            googleClientId: c.env.GOOGLE_CLIENT_ID || null,
            tmdbApiKey: c.env.TMDB_API_KEY || null,
            omdbApiKey: c.env.OMDB_API_KEY || null,
            spotifyClientId: c.env.SPOTIFY_CLIENT_ID || null,
            spotifyClientSecret: c.env.SPOTIFY_CLIENT_SECRET || null,
            discogsApiToken: c.env.DISCOGS_API_TOKEN || null
        },
        { headers: noCacheHeaders() }
    );
});

app.post('/api/upload', async (c) => {
    try {
        const authHeader = c.req.header('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const formData = await c.req.formData();
        const file = formData.get('file') as File;
        const userId = formData.get('userId') as string;
        const basicMetadataStr = formData.get('basicMetadata') as string | null;
        let basicMetadata: any = null;
        
        // Parser les métadonnées de base si présentes
        if (basicMetadataStr) {
            try {
                basicMetadata = JSON.parse(basicMetadataStr);
            } catch (parseError) {
                console.warn('⚠️ Erreur parsing basicMetadata:', parseError);
            }
        }

        if (!file || !userId) {
            return c.json({ error: 'Missing file or userId' }, 400);
        }

        // Vérifier que l'utilisateur existe
        const user = await c.env.DATABASE.prepare(
            `SELECT id FROM profil WHERE id = ?`
        ).bind(userId).first();

        if (!user) {
            return c.json({ error: 'User not found' }, 404);
        }

        // 1. Calculer le hash SHA-256 du fichier
        const fileBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // 2. Classifier le fichier
        const category = classifyFileByMimeType(file.type);

        // 3. Générer un fileId basé sur le hash
        const timestamp = Date.now();
        const extension = file.name.split('.').pop() || 'bin';
        const fileId = `${hash.slice(0, 16)}_${timestamp}.${extension}`;

        // 4. Vérifier si le fichier existe déjà (déduplication)
        const existingFile = await c.env.DATABASE.prepare(
            `SELECT file_id FROM files WHERE hash = ?`
        ).bind(hash).first();

        if (existingFile) {
            // Fichier existe déjà, juste lier l'utilisateur
            const existingFileId = existingFile.file_id as string;

            await c.env.DATABASE.prepare(
                `INSERT OR IGNORE INTO user_files (user_id, file_id) VALUES (?, ?)`
            ).bind(userId, existingFileId).run();

            return c.json({
                success: true,
                file: {
                    id: existingFileId,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    url: `/api/files/${category}/${existingFileId}`,
                    exists: true
                }
            });
        }

        // 5. Uploader le fichier sur R2 avec la bonne extension
        const fileExtension = file.name.split('.').pop() || 'bin';
        await c.env.STORAGE.put(
            `${category}/${fileId}/content.${fileExtension}`,
            fileBuffer,
            {
                httpMetadata: {
                    contentType: file.type,
                    cacheControl: 'public, max-age=31536000, immutable'
                }
            }
        );

        // 6. Enregistrer dans la table files avec le nom original du fichier
        await c.env.DATABASE.prepare(
            `INSERT INTO files (file_id, category, size, mime_type, hash, filename, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            fileId,
            category,
            file.size,
            file.type,
            hash,
            file.name, // TOUJOURS utiliser le nom original du fichier
            Math.floor(Date.now() / 1000)
        ).run();

        // 7. Lier l'utilisateur au fichier
        await c.env.DATABASE.prepare(
            `INSERT INTO user_files (user_id, file_id) VALUES (?, ?)`
        ).bind(userId, fileId).run();

        // 8. Stocker les métadonnées de base (ID3 tags) si disponibles
        if (basicMetadata && (category === 'musics' || category === 'videos')) {
            try {
                
                if (category === 'musics') {
                    const artists = basicMetadata.artist ? JSON.stringify([basicMetadata.artist]) : null;
                    const albums = basicMetadata.album ? JSON.stringify([basicMetadata.album]) : null;
                    // IMPORTANT: Utiliser le title des métadonnées SEULEMENT s'il existe et n'est pas vide
                    const title = (basicMetadata.title && basicMetadata.title.trim() !== '') ? basicMetadata.title.trim() : null;
                    const year = basicMetadata.year || null;
                    
                    await c.env.DATABASE.prepare(
                        `INSERT OR REPLACE INTO file_metadata 
                        (file_id, title, artists, albums, year, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`
                    ).bind(
                        fileId,
                        title, // NULL si pas de titre dans les métadonnées (ne pas utiliser filename)
                        artists,
                        albums,
                        year,
                        Math.floor(Date.now() / 1000),
                        Math.floor(Date.now() / 1000)
                    ).run();
                    
                } else if (category === 'videos') {
                    // IMPORTANT: Utiliser le title des métadonnées SEULEMENT s'il existe et n'est pas vide
                    const title = (basicMetadata.title && basicMetadata.title.trim() !== '') ? basicMetadata.title.trim() : null;
                    const year = basicMetadata.year || null;
                    
                    await c.env.DATABASE.prepare(
                        `INSERT OR REPLACE INTO file_metadata 
                        (file_id, title, year, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?)`
                    ).bind(
                        fileId,
                        title, // NULL si pas de titre dans les métadonnées (ne pas utiliser filename)
                        year,
                        Math.floor(Date.now() / 1000),
                        Math.floor(Date.now() / 1000)
                    ).run();
                    
                }
            } catch (metadataError) {
                console.error('❌ Erreur stockage métadonnées de base (non-bloquant):', metadataError);
                // Ne pas bloquer l'upload si le stockage des métadonnées échoue
            }
        }

        // Identification automatique APRÈS que le fichier soit créé dans la base de données
        // Faire cela en arrière-plan pour ne pas bloquer la réponse
        console.log(`\n🔍 [ENRICHMENT] ==========================================`);
        console.log(`🔍 [ENRICHMENT] Vérification enrichissement (upload simple) pour ${fileId}`);
        console.log(`🔍 [ENRICHMENT] Catégorie: ${category}`);
        console.log(`🔍 [ENRICHMENT] basicMetadata présent: ${basicMetadata ? 'OUI' : 'NON'}`);
        if (basicMetadata) {
            console.log(`🔍 [ENRICHMENT] basicMetadata:`, JSON.stringify(basicMetadata, null, 2));
        }
        console.log(`🔍 [ENRICHMENT] ==========================================\n`);
        
        if (category === 'musics' || category === 'videos') {
            console.log(`✅ [ENRICHMENT] Catégorie ${category} nécessite enrichissement, lancement...`);
            // Lancer l'enrichissement de manière asynchrone (ne pas attendre)
            const enrichmentPromise = (async () => {
                try {
                    console.log(`🚀 [ENRICHMENT] Début identification automatique pour ${fileId} (${category})`);
                    
                    // Préparer le titre pour l'enrichissement
                    let cleanedTitle: string;
                    if (basicMetadata?.title && typeof basicMetadata.title === 'string' && basicMetadata.title.trim().length >= 2) {
                        cleanedTitle = basicMetadata.title.trim();
                        console.log(`🔍 [ENRICHMENT] Titre depuis métadonnées ID3: "${cleanedTitle}"`);
                    } else {
                        // Extraire le nom sans extension
                        const filenameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
                        cleanedTitle = filenameWithoutExt.trim();
                        console.log(`🔍 [ENRICHMENT] Titre depuis filename: "${cleanedTitle}"`);
                    }
                    
                    if (!cleanedTitle || cleanedTitle.length < 2) {
                        console.warn(`⚠️ [ENRICHMENT] Titre trop court ou vide, abandon de l'enrichissement pour ${fileId}`);
                        return;
                    }
                    
                    let enrichedMetadata: any = null;
                    
                    if (category === 'videos') {
                        // Enrichissement pour les vidéos (TMDb / OMDb) avec variantes de titre
                        console.log(`🎬 [ENRICHMENT] Recherche vidéo pour: "${cleanedTitle}"`);
                        const tmdbApiKey = c.env.TMDB_API_KEY;
                        const omdbApiKey = c.env.OMDB_API_KEY;

                        // Détecter si c'est une série (pattern SxxExx dans le filename)
                        const filenameForPattern = file.name.replace(/\.[^/.]+$/, '');
                        const seriesPatternMatch = filenameForPattern.match(/\bS(\d{1,2})E(\d{1,2})\b/i);
                        const isLikelySeries = !!seriesPatternMatch;
                        let detectedSeason: number | null = null;
                        let detectedEpisode: number | null = null;
                        
                        if (seriesPatternMatch) {
                            detectedSeason = parseInt(seriesPatternMatch[1]);
                            detectedEpisode = parseInt(seriesPatternMatch[2]);
                            console.log(`📺 [ENRICHMENT] Pattern série détecté: S${detectedSeason}E${detectedEpisode} - Recherche prioritaire sur TMDb TV`);
                        }

                        // Nettoyer d'abord le filename pour extraire un vrai titre de base
                        const { baseTitle, progressiveVariants } = cleanVideoFilenameForEnrichment(cleanedTitle);
                        const titleVariants = Array.from(new Set([
                            ...generateTitleVariants(baseTitle),
                            ...progressiveVariants
                        ]));
                        console.log(`🎬 [ENRICHMENT] Titre de base: "${baseTitle}"`);
                        console.log(`🎬 [ENRICHMENT] Variantes de titre générées (${titleVariants.length}):`, titleVariants);

                        if (!tmdbApiKey && !omdbApiKey) {
                            console.warn(`⚠️ [ENRICHMENT] Aucune clé API vidéo configurée (TMDb/OMDb)`);
                        } else {
                            // Fonction helper pour récupérer les genres TMDb (film ou série)
                            const fetchTmdbGenres = async (
                                type: 'movie' | 'tv',
                                id: number
                            ): Promise<string[] | null> => {
                                try {
                                    console.log(`[GENRES] [ENRICHMENT] Récupération genres TMDb pour ${type} ID ${id}...`);
                                    const detailsUrl = `https://api.themoviedb.org/3/${type}/${id}?api_key=${tmdbApiKey}&language=fr-FR`;
                                    const detailsResp = await fetch(detailsUrl);
                                    if (!detailsResp.ok) {
                                        console.warn(`⚠️ [ENRICHMENT] Impossible de récupérer les genres TMDb (${type}) pour ID ${id}: ${detailsResp.status}`);
                                        return null;
                                    }
                                    const details = await detailsResp.json() as { genres?: Array<{ id: number; name?: string | null }> };
                                    console.log(`[GENRES] [ENRICHMENT] Réponse TMDb details pour ${type} ID ${id}:`, JSON.stringify(details.genres || [], null, 2));
                                    if (details.genres && Array.isArray(details.genres)) {
                                        const names = details.genres
                                            .map(g => (g && typeof g.name === 'string' ? g.name.trim() : ''))
                                            .filter(n => n.length > 0);
                                        console.log(`[GENRES] [ENRICHMENT] Genres extraits pour ${type} ID ${id}:`, names);
                                        return names.length > 0 ? names : null;
                                    }
                                    console.warn(`⚠️ [ENRICHMENT] Aucun genre trouvé dans la réponse TMDb pour ${type} ID ${id}`);
                                } catch (genreError) {
                                    console.warn(`⚠️ [ENRICHMENT] Erreur récupération genres TMDb (${type}) pour ID ${id}:`, genreError);
                                }
                                return null;
                            };

                            // Si pattern série détecté, chercher d'abord sur TMDb TV
                            if (isLikelySeries && tmdbApiKey) {
                                for (const variant of titleVariants) {
                                    if (enrichedMetadata) break;
                                    console.log(`📺 [ENRICHMENT] Tentative TMDb TV (prioritaire - pattern série détecté) avec variante: "${variant}"`);
                                    const tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(variant)}&language=fr-FR`;
                                    const tvResponse = await fetch(tvUrl);
                                    
                                    if (tvResponse.ok) {
                                        const tvData = await tvResponse.json() as { results?: Array<{ id: number; name?: string; poster_path?: string | null; first_air_date?: string; overview?: string | null }> };
                                        if (tvData.results && tvData.results.length > 0) {
                                            const tv = tvData.results[0];
                                            console.log(`✅ [ENRICHMENT] Série trouvée sur TMDb: "${tv.name}" (ID: ${tv.id}, Année: ${tv.first_air_date ? tv.first_air_date.substring(0, 4) : 'N/A'}) avec variante "${variant}"`);
                                            const genres = await fetchTmdbGenres('tv', tv.id);
                                            console.log(`[GENRES] [ENRICHMENT] Genres récupérés pour série "${tv.name}":`, genres);
                                            enrichedMetadata = {
                                                source_api: 'tmdb_tv',
                                                source_id: String(tv.id),
                                                title: tv.name || null,
                                                year: tv.first_air_date ? parseInt(tv.first_air_date.substring(0, 4)) : null,
                                                thumbnail_url: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : null,
                                                description: tv.overview || null,
                                                genres: genres || undefined,
                                                season: detectedSeason,
                                                episode: detectedEpisode
                                            };
                                            console.log(`[GENRES] [ENRICHMENT] Métadonnées avec genres:`, JSON.stringify({ genres: enrichedMetadata.genres }, null, 2));
                                        }
                                    } else {
                                        console.error(`❌ [ENRICHMENT] Erreur API TMDb TV (${tvResponse.status}) pour variante "${variant}"`);
                                    }
                                }
                            }
                            
                            // 1) Essayer TMDb Movie avec toutes les variantes (seulement si pas de pattern série ou si série non trouvée)
                            if (!enrichedMetadata && tmdbApiKey && !isLikelySeries) {
                                for (const variant of titleVariants) {
                                    if (enrichedMetadata) break;
                                    console.log(`🎬 [ENRICHMENT] Tentative TMDb Movie avec variante: "${variant}"`);
                                    const movieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(variant)}&language=fr-FR`;
                                    const movieResponse = await fetch(movieUrl);
                                    
                                    if (movieResponse.ok) {
                                        const movieData = await movieResponse.json() as { results?: Array<{ id: number; title?: string; poster_path?: string | null; release_date?: string; overview?: string | null }> };
                                        if (movieData.results && movieData.results.length > 0) {
                                            const movie = movieData.results[0];
                                            console.log(`✅ [ENRICHMENT] Film trouvé sur TMDb: "${movie.title}" (ID: ${movie.id}, Année: ${movie.release_date ? movie.release_date.substring(0, 4) : 'N/A'}) avec variante "${variant}"`);
                                            const genres = await fetchTmdbGenres('movie', movie.id);
                                            console.log(`[GENRES] [ENRICHMENT] Genres récupérés pour film "${movie.title}":`, genres);
                                            enrichedMetadata = {
                                                source_api: 'tmdb',
                                                source_id: String(movie.id),
                                                title: movie.title || null,
                                                year: movie.release_date ? parseInt(movie.release_date.substring(0, 4)) : null,
                                                thumbnail_url: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
                                                description: movie.overview || null,
                                                genres: genres || undefined
                                            };
                                            console.log(`[GENRES] [ENRICHMENT] Métadonnées avec genres:`, JSON.stringify({ genres: enrichedMetadata.genres }, null, 2));
                                        }
                                    } else {
                                        console.error(`❌ [ENRICHMENT] Erreur API TMDb Movie (${movieResponse.status}) pour variante "${variant}"`);
                                    }
                                }
                            }

                            // 2) Si pas trouvé et pas de pattern série, essayer TMDb TV (séries) avec toutes les variantes
                            if (!enrichedMetadata && tmdbApiKey && !isLikelySeries) {
                                for (const variant of titleVariants) {
                                    if (enrichedMetadata) break;
                                    console.log(`🎬 [ENRICHMENT] Tentative TMDb TV avec variante: "${variant}"`);
                                    const tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(variant)}&language=fr-FR`;
                                    const tvResponse = await fetch(tvUrl);
                                    
                                    if (tvResponse.ok) {
                                        const tvData = await tvResponse.json() as { results?: Array<{ id: number; name?: string; poster_path?: string | null; first_air_date?: string; overview?: string | null }> };
                                        if (tvData.results && tvData.results.length > 0) {
                                            const tv = tvData.results[0];
                                            console.log(`✅ [ENRICHMENT] Série trouvée sur TMDb: "${tv.name}" (ID: ${tv.id}, Année: ${tv.first_air_date ? tv.first_air_date.substring(0, 4) : 'N/A'}) avec variante "${variant}"`);
                                            const genres = await fetchTmdbGenres('tv', tv.id);
                                            console.log(`[GENRES] [ENRICHMENT] Genres récupérés pour série "${tv.name}":`, genres);
                                            enrichedMetadata = {
                                                source_api: 'tmdb_tv',
                                                source_id: String(tv.id),
                                                title: tv.name || null,
                                                year: tv.first_air_date ? parseInt(tv.first_air_date.substring(0, 4)) : null,
                                                thumbnail_url: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : null,
                                                description: tv.overview || null,
                                                genres: genres || undefined
                                            };
                                            console.log(`[GENRES] [ENRICHMENT] Métadonnées avec genres:`, JSON.stringify({ genres: enrichedMetadata.genres }, null, 2));
                                            console.log(`[GENRES] [ENRICHMENT] Métadonnées avec genres:`, JSON.stringify({ genres: enrichedMetadata.genres }, null, 2));
                                        }
                                    } else {
                                        console.error(`❌ [ENRICHMENT] Erreur API TMDb TV (${tvResponse.status}) pour variante "${variant}"`);
                                    }
                                }
                            }

                            // 3) Si toujours pas trouvé, essayer OMDb en backup avec toutes les variantes
                            if (!enrichedMetadata && omdbApiKey) {
                                for (const variant of titleVariants) {
                                    if (enrichedMetadata) break;
                                    console.log(`🎬 [ENRICHMENT] Tentative OMDb avec variante: "${variant}"`);
                                    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(variant)}&apikey=${omdbApiKey}`;
                                    const omdbResponse = await fetch(url);
                                    
                                    if (omdbResponse.ok) {
                                        const omdbData = await omdbResponse.json() as { 
                                            Response?: string;
                                            imdbID?: string;
                                            Title?: string;
                                            Year?: string;
                                            Poster?: string;
                                            Plot?: string;
                                        };
                                        
                                        if (omdbData.Response === 'True' && omdbData.imdbID) {
                                            console.log(`✅ [ENRICHMENT] Film trouvé sur OMDb: "${omdbData.Title}" (ID: ${omdbData.imdbID}, Année: ${omdbData.Year || 'N/A'}) avec variante "${variant}"`);
                                            enrichedMetadata = {
                                                source_api: 'omdb',
                                                source_id: omdbData.imdbID,
                                                title: omdbData.Title || null,
                                                year: omdbData.Year ? parseInt(omdbData.Year.substring(0, 4)) : null,
                                                thumbnail_url: omdbData.Poster && omdbData.Poster !== 'N/A' ? omdbData.Poster : null,
                                                description: omdbData.Plot || null
                                            };
                                        }
                                    } else {
                                        console.error(`❌ [ENRICHMENT] Erreur API OMDb (${omdbResponse.status}) pour variante "${variant}"`);
                                    }
                                }
                            }

                            if (!enrichedMetadata) {
                                console.warn(`❌ [ENRICHMENT] Aucune métadonnée vidéo trouvée après ${titleVariants.length} variantes pour "${cleanedTitle}"`);
                            }
                        }
                    } else if (category === 'musics') {
                        // Enrichissement pour les musiques (Spotify)
                        console.log(`🎵 [ENRICHMENT] Recherche musique sur Spotify pour: "${cleanedTitle}"`);
                        const spotifyClientId = c.env.SPOTIFY_CLIENT_ID;
                        const spotifyClientSecret = c.env.SPOTIFY_CLIENT_SECRET;
                        
                        if (!spotifyClientId || !spotifyClientSecret) {
                            console.warn(`⚠️ [ENRICHMENT] Clés API Spotify non configurées`);
                        } else {
                            // Obtenir le token d'accès Spotify
                            console.log(`🎵 [ENRICHMENT] Obtention token d'accès Spotify...`);
                            let tokenResponse: Response;
                            try {
                                tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/x-www-form-urlencoded',
                                        'Authorization': `Basic ${btoa(`${spotifyClientId}:${spotifyClientSecret}`)}`
                                    },
                                    body: 'grant_type=client_credentials'
                                });
                                console.log(`🎵 [ENRICHMENT] Réponse token Spotify reçue: ${tokenResponse.status} ${tokenResponse.statusText}`);
                            } catch (fetchError) {
                                console.error(`❌ [ENRICHMENT] Erreur réseau lors de l'obtention du token Spotify:`, fetchError instanceof Error ? fetchError.message : String(fetchError));
                                return; // Arrêter l'enrichissement si on ne peut pas obtenir le token
                            }
                            
                            console.log(`🎵 [ENRICHMENT] Réponse token Spotify: ${tokenResponse.status} ${tokenResponse.statusText}`);
                            
                            if (tokenResponse.ok) {
                                const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
                                
                                if (tokenData.error) {
                                    console.error(`❌ [ENRICHMENT] Erreur token Spotify: ${tokenData.error} - ${tokenData.error_description || 'Pas de description'}`);
                                } else {
                                    const accessToken = tokenData.access_token;
                                    
                                    if (accessToken) {
                                        console.log(`✅ [ENRICHMENT] Token Spotify obtenu (${accessToken.substring(0, 20)}...)`);
                                    
                                    // Extraire et nettoyer l'artiste depuis basicMetadata ou filename
                                    let rawArtist: string | undefined;
                                    if (basicMetadata?.artist && typeof basicMetadata.artist === 'string') {
                                        rawArtist = basicMetadata.artist.trim();
                                        console.log(`🎵 [ENRICHMENT] Artiste depuis métadonnées ID3: "${rawArtist}"`);
                                    } else {
                                        // Essayer d'extraire depuis le filename (format "Artiste - Titre")
                                        const parts = file.name.split(/\s*[-–]\s*/);
                                        if (parts.length >= 2) {
                                            rawArtist = parts[0].trim();
                                            console.log(`🎵 [ENRICHMENT] Artiste extrait du filename: "${rawArtist}"`);
                                        } else {
                                            console.log(`⚠️ [ENRICHMENT] Aucun artiste trouvé, recherche uniquement par titre`);
                                        }
                                    }
                                    
                                    // Nettoyer le titre (enlever "ft", "feat", etc.)
                                    let searchTitle = cleanTitleFromFeaturing(cleanedTitle);
                                    console.log(`🎵 [ENRICHMENT] Titre nettoyé: "${searchTitle}"`);
                                    
                                    // Générer les variantes de titre
                                    const titleVariants = generateTitleVariants(searchTitle);
                                    console.log(`🎵 [ENRICHMENT] ${titleVariants.length} variantes de titre générées`);
                                    
                                    // Nettoyer l'artiste (enlever "Official", etc.)
                                    const artistVariants = rawArtist ? cleanArtistName(rawArtist) : [];
                                    console.log(`🎵 [ENRICHMENT] ${artistVariants.length} variantes d'artiste générées`);
                                    
                                    // Essayer toutes les combinaisons de variantes
                                    let found = false;
                                    for (const titleVariant of titleVariants) {
                                        if (found) break;
                                        
                                        // Essayer d'abord avec chaque variante d'artiste
                                        if (artistVariants.length > 0) {
                                            for (const artistVariant of artistVariants) {
                                                if (found) break;
                                                
                                                const query = `track:${encodeURIComponent(titleVariant)} artist:${encodeURIComponent(artistVariant)}`;
                                                console.log(`🎵 [ENRICHMENT] Recherche Spotify: "${query}"`);
                                                
                                                const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`;
                                                const searchResponse = await fetch(searchUrl, {
                                                    headers: {
                                                        'Authorization': `Bearer ${accessToken}`,
                                                        'Content-Type': 'application/json'
                                                    }
                                                });
                                                
                                                if (searchResponse.ok) {
                                                    const searchData = await searchResponse.json() as {
                                                        tracks?: {
                                                            items?: Array<{
                                                                id: string;
                                                                name: string;
                                                                artists?: Array<{ id?: string; name: string }>;
                                                                album?: {
                                                                    name: string;
                                                                    images?: Array<{ url: string; width?: number }>;
                                                                    release_date?: string;
                                                                };
                                                            }>;
                                                        };
                                                    };
                                                    
                                                    if (searchData.tracks?.items && searchData.tracks.items.length > 0) {
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
                                                        
                                                        // Extraire les albums
                                                        const albumsArray: string[] = [];
                                                        const albumThumbnails: string[] = [];
                                                        if (track.album?.name) {
                                                            albumsArray.push(track.album.name);
                                                            // Récupérer l'image de l'album
                                                            if (track.album.images && track.album.images.length > 0) {
                                                                const images = track.album.images.sort((a, b) => (b.width || 0) - (a.width || 0));
                                                                const mediumImage = images.find(img => img.width && img.width >= 300 && img.width <= 500) || images[0];
                                                                if (mediumImage?.url) {
                                                                    albumThumbnails.push(mediumImage.url);
                                                                }
                                                            }
                                                        }
                                                        
                                                        // Récupérer l'image de l'artiste pour l'image principale
                                                        let thumbnailUrl: string | null = null;
                                                        if (track.artists && track.artists.length > 0 && track.artists[0].id) {
                                                            try {
                                                                const artistId = track.artists[0].id;
                                                                console.log(`🎵 [ENRICHMENT] Récupération image artiste Spotify (ID: ${artistId})...`);
                                                                const artistResponse = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
                                                                    headers: {
                                                                        'Authorization': `Bearer ${accessToken}`,
                                                                        'Content-Type': 'application/json'
                                                                    }
                                                                });
                                                                
                                                                if (artistResponse.ok) {
                                                                    const artistData = await artistResponse.json() as {
                                                                        images?: Array<{ url: string; width?: number; height?: number }>;
                                                                    };
                                                                    
                                                                    if (artistData.images && artistData.images.length > 0) {
                                                                        // Trier par taille (plus grand en premier)
                                                                        const images = artistData.images.sort((a, b) => (b.width || 0) - (a.width || 0));
                                                                        // Prendre une taille moyenne (300-500px) si disponible, sinon la plus grande
                                                                        const mediumImage = images.find(img => img.width && img.width >= 300 && img.width <= 500) || images[0];
                                                                        thumbnailUrl = mediumImage?.url || images[0]?.url || null;
                                                                        console.log(`✅ [ENRICHMENT] Image artiste récupérée: ${thumbnailUrl ? thumbnailUrl.substring(0, 80) + '...' : 'aucune'}`);
                                                                    } else {
                                                                        console.warn(`⚠️ [ENRICHMENT] Aucune image disponible pour l'artiste ${artistId}`);
                                                                    }
                                                                } else {
                                                                    console.warn(`⚠️ [ENRICHMENT] Erreur récupération artiste Spotify: ${artistResponse.status}`);
                                                                }
                                                            } catch (artistError) {
                                                                console.warn(`⚠️ [ENRICHMENT] Erreur récupération image artiste:`, artistError);
                                                            }
                                                        }
                                                        
                                                        console.log(`✅ [ENRICHMENT] Track trouvé sur Spotify: "${track.name}" par ${artistsArray.join(', ')} (Album: ${albumsArray.join(', ') || 'N/A'}, Année: ${track.album?.release_date ? track.album.release_date.substring(0, 4) : 'N/A'})`);
                                                        
                                                        enrichedMetadata = {
                                                            source_api: 'spotify',
                                                            source_id: track.id,
                                                            title: track.name || null,
                                                            year: track.album?.release_date ? parseInt(track.album.release_date.substring(0, 4)) : null,
                                                            thumbnail_url: thumbnailUrl, // Image de l'artiste
                                                            artists: artistsArray.length > 0 ? artistsArray : null,
                                                            albums: albumsArray.length > 0 ? albumsArray : null,
                                                            album_thumbnails: albumThumbnails.length > 0 ? albumThumbnails : null // Images des albums
                                                        };
                                                        found = true;
                                                    }
                                                } else {
                                                    console.warn(`⚠️ [ENRICHMENT] Erreur API Spotify search (${searchResponse.status}): "${query}"`);
                                                }
                                            }
                                        }
                                        
                                        // Si pas trouvé avec artiste, essayer sans artiste
                                        if (!found) {
                                            const query = `track:${encodeURIComponent(titleVariant)}`;
                                            console.log(`🎵 [ENRICHMENT] Recherche Spotify (sans artiste): "${query}"`);
                                            
                                            const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`;
                                            const searchResponse = await fetch(searchUrl, {
                                                headers: {
                                                    'Authorization': `Bearer ${accessToken}`,
                                                    'Content-Type': 'application/json'
                                                }
                                            });
                                            
                                            if (searchResponse.ok) {
                                                const searchData = await searchResponse.json() as {
                                                    tracks?: {
                                                        items?: Array<{
                                                            id: string;
                                                            name: string;
                                                            artists?: Array<{ id?: string; name: string }>;
                                                            album?: {
                                                                name: string;
                                                                images?: Array<{ url: string; width?: number }>;
                                                                release_date?: string;
                                                            };
                                                        }>;
                                                    };
                                                };
                                                
                                                if (searchData.tracks?.items && searchData.tracks.items.length > 0) {
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
                                                    
                                                    // Extraire les albums
                                                    const albumsArray: string[] = [];
                                                    const albumThumbnails: string[] = [];
                                                    if (track.album?.name) {
                                                        albumsArray.push(track.album.name);
                                                        // Récupérer l'image de l'album
                                                        if (track.album.images && track.album.images.length > 0) {
                                                            const images = track.album.images.sort((a, b) => (b.width || 0) - (a.width || 0));
                                                            const mediumImage = images.find(img => img.width && img.width >= 300 && img.width <= 500) || images[0];
                                                            if (mediumImage?.url) {
                                                                albumThumbnails.push(mediumImage.url);
                                                            }
                                                        }
                                                    }
                                                    
                                                    // Récupérer l'image de l'artiste pour l'image principale
                                                    let thumbnailUrl: string | null = null;
                                                    if (track.artists && track.artists.length > 0 && track.artists[0].id) {
                                                        try {
                                                            const artistId = track.artists[0].id;
                                                            console.log(`🎵 [ENRICHMENT] Récupération image artiste Spotify (ID: ${artistId})...`);
                                                            const artistResponse = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
                                                                headers: {
                                                                    'Authorization': `Bearer ${accessToken}`,
                                                                    'Content-Type': 'application/json'
                                                                }
                                                            });
                                                            
                                                            if (artistResponse.ok) {
                                                                const artistData = await artistResponse.json() as {
                                                                    images?: Array<{ url: string; width?: number; height?: number }>;
                                                                };
                                                                
                                                                if (artistData.images && artistData.images.length > 0) {
                                                                    // Trier par taille (plus grand en premier)
                                                                    const images = artistData.images.sort((a, b) => (b.width || 0) - (a.width || 0));
                                                                    // Prendre une taille moyenne (300-500px) si disponible, sinon la plus grande
                                                                    const mediumImage = images.find(img => img.width && img.width >= 300 && img.width <= 500) || images[0];
                                                                    thumbnailUrl = mediumImage?.url || images[0]?.url || null;
                                                                    console.log(`✅ [ENRICHMENT] Image artiste récupérée: ${thumbnailUrl ? thumbnailUrl.substring(0, 80) + '...' : 'aucune'}`);
                                                                } else {
                                                                    console.warn(`⚠️ [ENRICHMENT] Aucune image disponible pour l'artiste ${artistId}`);
                                                                }
                                                            } else {
                                                                console.warn(`⚠️ [ENRICHMENT] Erreur récupération artiste Spotify: ${artistResponse.status}`);
                                                            }
                                                        } catch (artistError) {
                                                            console.warn(`⚠️ [ENRICHMENT] Erreur récupération image artiste:`, artistError);
                                                        }
                                                    }
                                                    
                                                    console.log(`✅ [ENRICHMENT] Track trouvé sur Spotify (sans artiste): "${track.name}" par ${artistsArray.join(', ')}`);
                                                    
                                                    enrichedMetadata = {
                                                        source_api: 'spotify',
                                                        source_id: track.id,
                                                        title: track.name || null,
                                                        year: track.album?.release_date ? parseInt(track.album.release_date.substring(0, 4)) : null,
                                                        thumbnail_url: thumbnailUrl, // Image de l'artiste
                                                        artists: artistsArray.length > 0 ? artistsArray : null,
                                                        albums: albumsArray.length > 0 ? albumsArray : null,
                                                        album_thumbnails: albumThumbnails.length > 0 ? albumThumbnails : null // Images des albums
                                                    };
                                                    found = true;
                                                }
                                            }
                                        }
                                    }
                                    
                                    if (!found) {
                                        console.warn(`❌ [ENRICHMENT] Aucun track trouvé sur Spotify après ${titleVariants.length} variantes de titre`);
                                    }
                                    } else {
                                        console.error(`❌ [ENRICHMENT] Échec obtention token Spotify: pas de access_token dans la réponse`);
                                        console.error(`❌ [ENRICHMENT] Réponse complète:`, JSON.stringify(tokenData, null, 2));
                                    }
                                }
                            } else {
                                const errorText = await tokenResponse.text().catch(() => 'Impossible de lire la réponse');
                                console.error(`❌ [ENRICHMENT] Erreur authentification Spotify: ${tokenResponse.status} ${tokenResponse.statusText}`);
                                console.error(`❌ [ENRICHMENT] Réponse d'erreur:`, errorText.substring(0, 500));
                            }
                        }
                    }
                    
                    // Stocker les métadonnées enrichies si trouvées
                    if (enrichedMetadata) {
                        console.log(`💾 [ENRICHMENT] Métadonnées enrichies trouvées, stockage en cours...`);
                        console.log(`💾 [ENRICHMENT] Métadonnées:`, JSON.stringify({
                            title: enrichedMetadata.title,
                            artists: enrichedMetadata.artists,
                            albums: enrichedMetadata.albums,
                            year: enrichedMetadata.year,
                            source_api: enrichedMetadata.source_api,
                            genres: enrichedMetadata.genres,
                            has_thumbnail: !!enrichedMetadata.thumbnail_url
                        }, null, 2));
                        
                        // Télécharger et stocker la miniature si disponible (appel interne direct)
                        if (enrichedMetadata.thumbnail_url) {
                            try {
                                console.log(`📸 [ENRICHMENT] Téléchargement thumbnail: ${enrichedMetadata.thumbnail_url.substring(0, 80)}...`);
                                const thumbnailR2Path = await downloadAndStoreThumbnailInternal(
                                    enrichedMetadata.thumbnail_url,
                                    fileId,
                                    category,
                                    c.env.STORAGE
                                );
                                
                                if (thumbnailR2Path) {
                                    enrichedMetadata.thumbnail_r2_path = thumbnailR2Path;
                                    console.log(`✅ [ENRICHMENT] Thumbnail téléchargé et stocké: ${thumbnailR2Path}`);
                                } else {
                                    console.warn(`⚠️ [ENRICHMENT] Échec téléchargement thumbnail`);
                                }
                            } catch (thumbnailError) {
                                console.warn(`⚠️ [ENRICHMENT] Erreur téléchargement thumbnail:`, thumbnailError);
                            }
                        } else {
                            console.log(`ℹ️ [ENRICHMENT] Aucune thumbnail disponible`);
                        }
                        
                        // Stocker les métadonnées enrichies directement (appel interne)
                        console.log(`💾 [ENRICHMENT] Stockage métadonnées enrichies pour ${fileId}...`);
                        try {
                            // Nettoyer les métadonnées
                            const cleanedTitle = enrichedMetadata.title ? cleanString(enrichedMetadata.title) : null;
                            const cleanedDescription = enrichedMetadata.description ? cleanString(enrichedMetadata.description) : null;
                            
                            let cleanedArtists: string[] | null = null;
                            if (enrichedMetadata.artists) {
                                if (Array.isArray(enrichedMetadata.artists)) {
                                    cleanedArtists = cleanStringArray(enrichedMetadata.artists);
                                } else if (typeof enrichedMetadata.artists === 'string') {
                                    try {
                                        const parsed = JSON.parse(enrichedMetadata.artists);
                                        cleanedArtists = cleanStringArray(Array.isArray(parsed) ? parsed : [parsed]);
                                    } catch {
                                        const cleaned = cleanString(enrichedMetadata.artists);
                                        cleanedArtists = cleaned ? [cleaned] : null;
                                    }
                                }
                            }
                            
                            let cleanedAlbums: string[] | null = null;
                            if (enrichedMetadata.albums) {
                                if (Array.isArray(enrichedMetadata.albums)) {
                                    cleanedAlbums = cleanStringArray(enrichedMetadata.albums);
                                } else if (typeof enrichedMetadata.albums === 'string') {
                                    try {
                                        const parsed = JSON.parse(enrichedMetadata.albums);
                                        cleanedAlbums = cleanStringArray(Array.isArray(parsed) ? parsed : [parsed]);
                                    } catch {
                                        const cleaned = cleanString(enrichedMetadata.albums);
                                        cleanedAlbums = cleaned ? [cleaned] : null;
                                    }
                                }
                            }
                            
                            // Vérifier que le fichier existe
                            const file = await c.env.DATABASE.prepare(
                                `SELECT file_id FROM files WHERE file_id = ?`
                            ).bind(fileId).first();
                            
                            if (!file) {
                                console.warn(`⚠️ [ENRICHMENT] Fichier non trouvé: ${fileId}`);
                            } else {
                                // Stocker les métadonnées
                                let result;
                                try {
                                    result = await c.env.DATABASE.prepare(`
                                        INSERT OR REPLACE INTO file_metadata (
                                            file_id, thumbnail_url, thumbnail_r2_path, source_api, source_id,
                                            genres, subgenres, season, episode, artists, albums, album_thumbnails, title, year, description
                                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    `).bind(
                                        fileId,
                                        enrichedMetadata.thumbnail_url || null,
                                        enrichedMetadata.thumbnail_r2_path || null,
                                        enrichedMetadata.source_api || null,
                                        enrichedMetadata.source_id || null,
                                        enrichedMetadata.genres && Array.isArray(enrichedMetadata.genres) && enrichedMetadata.genres.length > 0 ? JSON.stringify(enrichedMetadata.genres) : null,
                                        enrichedMetadata.subgenres ? JSON.stringify(enrichedMetadata.subgenres) : null,
                                        enrichedMetadata.season || null,
                                        enrichedMetadata.episode || null,
                                        cleanedArtists ? JSON.stringify(cleanedArtists) : null,
                                        cleanedAlbums ? JSON.stringify(cleanedAlbums) : null,
                                        enrichedMetadata.album_thumbnails ? JSON.stringify(enrichedMetadata.album_thumbnails) : null,
                                        cleanedTitle,
                                        enrichedMetadata.year || null,
                                        cleanedDescription
                                    ).run();
                                } catch (insertError) {
                                    // Si la colonne album_thumbnails n'existe pas, essayer sans
                                    const errorMsg = insertError instanceof Error ? insertError.message : String(insertError);
                                    if (errorMsg.includes('album_thumbnails') || errorMsg.includes('no such column')) {
                                        result = await c.env.DATABASE.prepare(`
                                            INSERT OR REPLACE INTO file_metadata (
                                                file_id, thumbnail_url, thumbnail_r2_path, source_api, source_id,
                                                genres, subgenres, season, episode, artists, albums, title, year, description
                                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        `).bind(
                                            fileId,
                                            enrichedMetadata.thumbnail_url || null,
                                            enrichedMetadata.thumbnail_r2_path || null,
                                            enrichedMetadata.source_api || null,
                                            enrichedMetadata.source_id || null,
                                            enrichedMetadata.genres && Array.isArray(enrichedMetadata.genres) && enrichedMetadata.genres.length > 0 ? JSON.stringify(enrichedMetadata.genres) : null,
                                            enrichedMetadata.subgenres ? JSON.stringify(enrichedMetadata.subgenres) : null,
                                            enrichedMetadata.season || null,
                                            enrichedMetadata.episode || null,
                                            cleanedArtists ? JSON.stringify(cleanedArtists) : null,
                                            cleanedAlbums ? JSON.stringify(cleanedAlbums) : null,
                                            cleanedTitle,
                                            enrichedMetadata.year || null,
                                            cleanedDescription
                                        ).run();
                                    } else {
                                        throw insertError;
                                    }
                                }
                                
                                if (result.success) {
                                    console.log(`✅ [ENRICHMENT] Métadonnées enrichies stockées avec succès pour ${fileId}`);
                                } else {
                                    console.error(`❌ [ENRICHMENT] Échec stockage métadonnées:`, result);
                                }
                            }
                        } catch (metadataError) {
                            console.error(`❌ [ENRICHMENT] Erreur stockage métadonnées enrichies pour ${fileId}:`, metadataError instanceof Error ? metadataError.message : String(metadataError));
                        }
                    } else {
                        console.warn(`❌ [ENRICHMENT] Aucune métadonnée enrichie trouvée pour ${fileId} (${category})`);
                    }
                } catch (enrichmentError) {
                    // Ne pas bloquer l'upload si l'enrichissement échoue
                    console.error(`❌ [ENRICHMENT] Erreur enrichissement métadonnées (non-bloquant) pour ${fileId}:`, enrichmentError instanceof Error ? enrichmentError.message : String(enrichmentError));
                    if (enrichmentError instanceof Error && enrichmentError.stack) {
                        console.error(`❌ [ENRICHMENT] Stack trace:`, enrichmentError.stack);
                    }
                }
            })();
            
            // Utiliser waitUntil pour s'assurer que le worker attend la fin de l'enrichissement
            // Cela permet de voir tous les logs même si la réponse est déjà envoyée
            if (c.executionCtx) {
                c.executionCtx.waitUntil(enrichmentPromise);
            }
            
            // Ne pas attendre mais capturer les erreurs non gérées
            enrichmentPromise.catch((err) => {
                console.error(`❌ [ENRICHMENT] Erreur non gérée dans la promesse d'enrichissement pour ${fileId}:`, err);
            });
        } else {
            console.log(`ℹ️ [ENRICHMENT] Catégorie ${category} ne nécessite pas d'enrichissement automatique`);
        }

        return c.json({
            success: true,
            file: {
                id: fileId,
                name: file.name,
                size: file.size,
                type: file.type,
                url: `/api/files/${category}/${fileId}`
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

function classifyFileByMimeType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'images';
    if (mimeType.startsWith('video/')) return 'videos';
    if (mimeType.startsWith('audio/')) return 'musics';
    if (mimeType === 'application/pdf') return 'documents';
    if (mimeType.includes('word') || mimeType.includes('excel') || mimeType.includes('powerpoint')) return 'documents';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('7z')) return 'archives';
    if (mimeType.includes('exe') || mimeType.includes('dmg') || mimeType.includes('msi')) return 'executables';
    return 'others';
}

// Routes d'authentification
app.get('/api/auth/electron-init', (c) => {
    return handleGoogleAuthInit(c, OAUTH_REDIRECT_URI);
});

app.get('/api/auth/google/electron', (c) => {
    return handleGoogleAuthInit(c, OAUTH_REDIRECT_URI, 'select_account');
});

// Callback OAuth
app.get('/oauth-callback', handleOAuthCallback);

// Routes d'authentification supplémentaires
registerAuthRoutes(app);

// Routes d'upload - IMPORTANT: monter avant le catch-all React Router
app.route('/', uploadRoutes);

// Route pour la santé de l'application
app.get('/health', (c) => {
    return c.json({
        status: 'ok',
        d1_available: !!c.env.DATABASE,
        has_jwt_secret: !!c.env.JWT_SECRET,
        has_google_client_id: !!c.env.GOOGLE_CLIENT_ID
    });
});

// Handler pour React Router (catch-all) - DOIT être en dernier
const requestHandler = createRequestHandler(
    () => import('virtual:react-router/server-build'),
    import.meta.env.MODE
);

app.all('*', async (c) => {
    return requestHandler(c.req.raw, {
        cloudflare: { env: c.env, ctx: c.executionCtx },
    });
});

// Fonctions utilitaires locales
function handleGoogleAuthInit(
    c: any,
    redirectUri: string,
    prompt?: string
) {
    const clientId = c.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
        console.error('❌ GOOGLE_CLIENT_ID non configuré');
        return c.json({ error: 'GOOGLE_CLIENT_ID not configured' }, 500);
    }

    const nonce = Math.random().toString(36).substring(2);
    const authUrl = generateGoogleAuthUrl(clientId, redirectUri, nonce, { prompt });

    return c.redirect(authUrl.toString());
}

function handleOAuthCallback(c: any) {
    const html = getOAuthCallbackHtml();
    return c.html(html);
}

function getOAuthCallbackHtml(): string {
    return `<!DOCTYPE html>
<html>
  <head>
    <title>Connexion - Videomi</title>
    <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval';">
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; }
      .container { text-align: center; margin-top: 50px; }
      .success { color: green; font-size: 24px; }
      .error { color: red; font-size: 24px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div id="message">Traitement de la connexion...</div>
    </div>
    <script>
      ${getOAuthCallbackScript()}
    </script>
  </body>
</html>`;
}

function getOAuthCallbackScript(): string {
    return `
    
    function extractTokenFromUrl() {
      const hash = window.location.hash.substring(1);
      if (hash) {
        const params = new URLSearchParams(hash);
        const token = params.get('id_token');
        if (token) {
          return token;
        }
      }
      
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('id_token');
      if (token) {
        return token;
      }
      
      console.error('❌ Aucun token trouvé dans l\\'URL');
      return null;
    }
    
    function handleToken(token) {
      
      if (window.electronAPI?.sendOAuthToken) {
        window.electronAPI.sendOAuthToken(token);
        document.getElementById('message').innerHTML = 
          '<div class="success">✅ Connexion réussie!</div>' +
          '<p>Fermeture de la fenêtre...</p>';
        
        setTimeout(() => {
          window.electronAPI?.closeAuthWindow?.() || window.close();
        }, 1000);
        
      } else if (window.opener) {
        
        // Vérifier si window.opener est accessible et si postMessage est disponible
        let postMessageSucceeded = false;
        
        // Vérifier d'abord si window.opener existe et postMessage est une fonction
        if (window.opener && typeof window.opener.postMessage === 'function') {
          try {
            // Vérifier si on peut accéder à window.opener (peut être null si bloqué par COOP)
            // Cette vérification peut déjà échouer si COOP bloque l'accès
            const openerCheck = window.opener !== null && window.opener !== undefined;
            
            if (openerCheck) {
              // Essayer d'envoyer le message avec une vérification d'erreur synchrone
              // Note: postMessage ne lance pas d'exception, mais le navigateur peut afficher un avertissement
              // On essaie quand même car l'avertissement est non-bloquant
        window.opener.postMessage({
          type: 'oauth-callback',
          token: token
        }, '*');
              
              postMessageSucceeded = true;
            }
          } catch (e) {
            // Cette catch ne sera probablement jamais exécuté car postMessage ne lance pas d'exception
            // Mais on le garde pour sécurité
            console.warn('⚠️ Exception lors de l\'appel postMessage:', e.message || String(e));
            postMessageSucceeded = false;
          }
        } else {
          console.warn('⚠️ window.opener ou postMessage non disponible');
          postMessageSucceeded = false;
        }
        
        // Toujours utiliser localStorage comme backup pour garantir que le token est stocké
        try {
          localStorage.setItem('google_id_token', token);
        } catch (storageError) {
          console.error('❌ Erreur lors du stockage dans localStorage:', storageError.message || String(storageError));
        }
        
        document.getElementById('message').innerHTML = 
          '<div class="success">✅ Connexion réussie!</div>' +
          '<p>Vous pouvez fermer cette fenêtre.</p>';
          
      } else {
        localStorage.setItem('google_id_token', token);
        document.getElementById('message').innerHTML = 
          '<div class="success">✅ Connexion réussie!</div>' +
          '<p>Token stocké. Vous pouvez fermer cette fenêtre.</p>';
      }
    }
    
    function handleOAuthCallback() {
      const token = extractTokenFromUrl();
      
      if (token) {
        handleToken(token);
      } else {
        document.getElementById('message').innerHTML = 
          '<div class="error">❌ Erreur: Aucun token d\\'authentification trouvé</div>' +
          '<p>Veuillez réessayer.</p>';
      }
    }
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', handleOAuthCallback);
    } else {
      handleOAuthCallback();
    }
  `;
}

export default app;