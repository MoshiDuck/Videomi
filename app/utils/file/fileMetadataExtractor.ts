// INFO : app/utils/fileMetadataExtractor.ts
// Extraction des métadonnées de base depuis les fichiers (sans renommage)

// Polyfill Buffer pour le navigateur (chargé uniquement côté client)
// Importation conditionnelle pour éviter les erreurs SSR
if (typeof window !== 'undefined') {
    import('./bufferPolyfill').catch((err) => {
        console.warn('⚠️ Erreur chargement polyfill Buffer:', err);
    });
}

export interface BaseAudioMetadata {
    title: string | null;
    artist: string | null;
    album: string | null;
    year: number | null;
    track: number | null;
    genre: string | null;
}

export interface BaseVideoMetadata {
    title: string | null;
    year: number | null;
    duration: number | null; // en secondes
    width: number | null;
    height: number | null;
}

/**
 * Extrait les métadonnées de base d'un fichier audio (ID3 tags)
 */
export async function extractAudioMetadata(file: File): Promise<BaseAudioMetadata> {
    try {
        // Importation dynamique de music-metadata-browser
        const mm = await import('music-metadata-browser');

        
        // Analyser les métadonnées ID3
        const metadata = await mm.parseBlob(file, { 
            duration: false, 
            skipCovers: true, // Ne pas extraire les images ici (trop lourd)
            skipPostHeaders: false,
            includeChapters: false
        });

        const common = metadata?.common || {};
        
        // Extraire les informations de base
        const title = common.title || null;
        const artist = common.artist || (common.artists && common.artists.length > 0 ? common.artists[0] : null) || null;
        const album = common.album || null;
        
        // Extraire l'année (priorité: year, sinon date si disponible)
        let year: number | null = null;
        if (common.year) {
            year = common.year;
        } else if (common.date && typeof common.date === 'string' && common.date.length >= 4) {
            const yearStr = common.date.substring(0, 4);
            const parsedYear = parseInt(yearStr, 10);
            if (!isNaN(parsedYear)) {
                year = parsedYear;
            }
        }
        
        const track = common.track ? (typeof common.track.no === 'number' ? common.track.no : null) : null;
        const genre = common.genre && common.genre.length > 0 ? common.genre[0] : null;

        // IMPORTANT: Nettoyer le titre pour ne garder que le vrai titre de la chanson
        // 1. Retirer le nom de l'artiste si présent au début (séparé par "-" ou "–")
        // 2. Retirer les suffixes comme "(Official Music Video)", "[HD UPGRADE]", etc.
        // 3. Si le titre ressemble trop au filename, retourner null
        let finalTitle: string | null = null;
        if (title && title.trim() !== '') {
            let cleanedTitle = title.trim();
            
            // Retirer le nom de l'artiste au début si présent
            if (artist && artist.trim() !== '') {
                const artistName = artist.trim();
                
                // Pattern: "Artiste - Titre" ou "Artiste – Titre" (tiret normal ou em dash)
                // Escaper les caractères spéciaux pour la regex
                const artistEscaped = artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Créer un pattern flexible qui correspond à l'artiste suivi d'un tiret
                const artistPattern = new RegExp(`^${artistEscaped}\\s*[-–—]\\s*`, 'i');
                
                
                // Appliquer le pattern plusieurs fois si nécessaire
                let previousTitle = '';
                let iterations = 0;
                while (previousTitle !== cleanedTitle && iterations < 5) {
                    previousTitle = cleanedTitle;
                    cleanedTitle = cleanedTitle.replace(artistPattern, '').trim();
                    iterations++;
                    if (previousTitle !== cleanedTitle) {
                    }
                }
                
                // Aussi essayer avec des variations de l'artiste (espaces multiples, etc.)
                const artistFlexible = artistName.replace(/\s+/g, '\\s+');
                const artistPatternFlexible = new RegExp(`^${artistFlexible}\\s*[-–—]\\s*`, 'i');
                const beforeFlexible = cleanedTitle;
                cleanedTitle = cleanedTitle.replace(artistPatternFlexible, '').trim();
                if (beforeFlexible !== cleanedTitle) {
                }
                
            }
            
            // Retirer les suffixes communs
            const beforeSuffixes = cleanedTitle;
            cleanedTitle = cleanedTitle
                .replace(/\s*\([^)]*Official[^)]*\)/gi, '') // (Official Music Video), (Official), etc.
                .replace(/\s*\[[^\]]*HD[^\]]*\]/gi, '') // [HD UPGRADE], [HD], etc.
                .replace(/\s*\[[^\]]*UPGRADE[^\]]*\]/gi, '') // [UPGRADE]
                .replace(/\s*\([^)]*Music Video[^)]*\)/gi, '') // (Music Video)
                .replace(/\s*\([^)]*MV[^)]*\)/gi, '') // (MV)
                .replace(/\s*\[[^\]]*\]/g, '') // Tous les autres crochets
                .replace(/\s*\([^)]*\)/g, '') // Tous les autres parenthèses
                .trim();
            if (beforeSuffixes !== cleanedTitle) {
            }
            
            // Si le titre ressemble trop au filename (contient des numéros de track, extensions, etc.), retourner null
            // Pattern pour détecter les numéros de track au début: "001 -", "002-", etc.
            if (/^\d+\s*[-–—]\s*/.test(cleanedTitle)) {
                cleanedTitle = cleanedTitle.replace(/^\d+\s*[-–—]\s*/, '').trim();
            }
            
            // Si le titre nettoyé est vide ou trop court, retourner null
            if (cleanedTitle.length === 0 || cleanedTitle.length < 2) {
                finalTitle = null;
            } else {
                finalTitle = cleanedTitle;
            }
        }

        return {
            title: finalTitle, // NULL si pas de titre dans les métadonnées ID3 (ne pas utiliser filename)
            artist,
            album,
            year: year && !isNaN(year) ? year : null,
            track: track && !isNaN(track) ? track : null,
            genre
        };
    } catch (error) {
        console.warn(`🎵 [AUDIO METADATA] Erreur extraction métadonnées:`, error);
        return {
            title: null,
            artist: null,
            album: null,
            year: null,
            track: null,
            genre: null
        };
    }
}

/**
 * Extrait les métadonnées de base d'un fichier vidéo
 */
export async function extractVideoMetadata(file: File): Promise<BaseVideoMetadata> {
    return new Promise((resolve) => {
        let resolved = false;
        let url: string | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        
        const cleanup = () => {
            if (url) {
                try {
                    URL.revokeObjectURL(url);
                } catch (e) {
                    // Ignorer les erreurs de révocation
                }
                url = null;
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        };
        
        const safeResolve = (metadata: BaseVideoMetadata) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(metadata);
        };
        
        try {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.muted = true; // Muter pour éviter les problèmes de lecture automatique
            
            url = URL.createObjectURL(file);
            
            video.addEventListener('loadedmetadata', () => {
                if (resolved) return;
                
                try {
                    const duration = video.duration && isFinite(video.duration) ? Math.floor(video.duration) : null;
                    const width = video.videoWidth || null;
                    const height = video.videoHeight || null;
                    
                    // IMPORTANT: Pour les vidéos, ne pas extraire le titre depuis le filename
                    // Les métadonnées vidéo (MP4, MKV) peuvent avoir un titre dans les tags, mais
                    // l'extraction depuis le navigateur est limitée. On laisse le titre null
                    // et l'utilisateur choisira la correspondance via la page de matching.
                    // Le titre sera stocké seulement après le matching manuel avec TMDb/OMDb.
                    
                    // Essayer d'extraire l'année depuis le nom du fichier (seulement pour l'année, pas le titre)
                    const filenameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
                    let year: number | null = null;
                    const yearMatch = filenameWithoutExt.match(/\b(19|20)\d{2}\b/);
                    if (yearMatch) {
                        const extractedYear = parseInt(yearMatch[0]);
                        if (extractedYear >= 1900 && extractedYear <= new Date().getFullYear() + 1) {
                            year = extractedYear;
                        }
                    }
                    
                    safeResolve({
                        title: null, // NULL - le titre sera défini via le matching manuel avec TMDb/OMDb
                        year,
                        duration,
                        width,
                        height
                    });
                } catch (error) {
                    console.warn(`🎬 [VIDEO METADATA] Erreur traitement métadonnées:`, error);
                    safeResolve({
                        title: null,
                        year: null,
                        duration: null,
                        width: null,
                        height: null
                    });
                }
            });
            
            video.addEventListener('error', (e) => {
                if (resolved) return;
                console.warn(`🎬 [VIDEO METADATA] Erreur chargement vidéo:`, e);
                safeResolve({
                    title: null,
                    year: null,
                    duration: null,
                    width: null,
                    height: null
                });
            });
            
            // Timeout après 15 secondes (augmenté de 10 à 15 secondes)
            timeoutId = setTimeout(() => {
                if (resolved) return;
                console.warn(`🎬 [VIDEO METADATA] Timeout extraction métadonnées pour ${file.name}`);
                safeResolve({
                    title: null,
                    year: null,
                    duration: null,
                    width: null,
                    height: null
                });
            }, 15000);
            
            video.src = url;
        } catch (error) {
            console.warn(`🎬 [VIDEO METADATA] Erreur extraction métadonnées:`, error);
            safeResolve({
                title: null,
                year: null,
                duration: null,
                width: null,
                height: null
            });
        }
    });
}

/**
 * Extrait les métadonnées de base selon le type de fichier
 */
export async function extractBaseMetadata(
    file: File,
    category: 'videos' | 'musics' | 'images' | 'raw_images' | 'documents' | 'archives' | 'executables' | 'others'
): Promise<BaseAudioMetadata | BaseVideoMetadata | null> {
    if (category === 'musics') {
        return await extractAudioMetadata(file);
    } else if (category === 'videos') {
        return await extractVideoMetadata(file);
    }
    
    // Pour les autres types, retourner null
    return null;
}

/** Catégories pour lesquelles on peut extraire une date de création fichier */
export type FileCreationDateCategory = 'images' | 'raw_images' | 'documents';

/**
 * Extrait la date de création réelle du fichier (métadonnées EXIF pour images,
 * lastModified pour documents). Retourne un timestamp Unix en secondes, ou null.
 */
export async function extractFileCreationDate(
    file: File,
    category: FileCreationDateCategory
): Promise<number | null> {
    try {
        if (category === 'images' || category === 'raw_images') {
            const exifr = await import('exifr');
            const full = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] }).catch(() => null);
            if (full && typeof full === 'object') {
                const dateStr =
                    (full as Record<string, unknown>).DateTimeOriginal ??
                    (full as Record<string, unknown>).CreateDate ??
                    (full as Record<string, unknown>).ModifyDate ??
                    (full as Record<string, unknown>).dateTimeOriginal ??
                    (full as Record<string, unknown>).createDate ??
                    (full as Record<string, unknown>).modifyDate;
                if (dateStr) {
                    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
                    if (!isNaN(date.getTime())) {
                        return Math.floor(date.getTime() / 1000);
                    }
                }
            }
        }
        // Fallback : lastModified (date de modification du fichier sur le disque)
        if (file.lastModified && file.lastModified > 0) {
            return Math.floor(file.lastModified / 1000);
        }
        return null;
    } catch (err) {
        console.warn('[FILE_METADATA] Erreur extraction date de création:', err);
        if (file.lastModified && file.lastModified > 0) {
            return Math.floor(file.lastModified / 1000);
        }
        return null;
    }
}
