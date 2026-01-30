// INFO : workers/upload.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './types';
import { 
    generateCacheKey, 
    getFromCache, 
    putInCache, 
    generateETag, 
    CACHE_TTL,
    canCache,
    invalidateCache
} from './cache.js';

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

// Middleware CORS et logging pour toutes les routes /api/upload/*
// Dans Hono, '/api/upload' capture automatiquement toutes les sous-routes
app.use('/api/upload', async (c, next) => {
    // Log seulement les erreurs, pas toutes les requêtes pour éviter le bruit
    if (c.req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400',
                // Retirer COOP/COEP pour éviter de bloquer postMessage pendant l'upload
            }
        });
    }
    await next();
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // Retirer COOP/COEP pour éviter de bloquer postMessage pendant l'upload
});

// Vérifier si un fichier existe déjà et retourner son fileId
app.post('/api/upload/check', async (c) => {
    try {
        const { hash } = await c.req.json();

        if (!hash) {
            return c.json({ error: 'Missing hash' }, 400);
        }

        // Vérifier dans D1 par hash uniquement
        const existingFile = await c.env.DATABASE.prepare(
            `SELECT file_id FROM files WHERE hash = ? LIMIT 1`
        ).bind(hash).first() as { file_id: string } | null;

        return c.json({ 
            exists: !!existingFile,
            fileId: existingFile?.file_id || null
        });
    } catch (error) {
        console.error('Check error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

app.get('/api/stream/:fileId/master.m3u8', async (c) => {
    try {
        const fileId = c.req.param('fileId');

        // Récupérer la playlist depuis R2
        const playlist = await c.env.STORAGE.get(`videos/${fileId}/index.m3u8`);

        if (!playlist) {
            return c.json({ error: 'Playlist non trouvée' }, 404);
        }

        const headers = new Headers();
        headers.set('Content-Type', 'application/vnd.apple.mpegurl');
        headers.set('Cache-Control', 'public, max-age=3600');
        headers.set('Access-Control-Allow-Origin', '*');

        return new Response(playlist.body, { headers });
    } catch (error) {
        console.error('Stream error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

app.get('/api/stream/:fileId/:segment', async (c) => {
    try {
        const fileId = c.req.param('fileId');
        const segment = c.req.param('segment');

        const object = await c.env.STORAGE.get(`videos/${fileId}/${segment}`);

        if (!object) {
            return c.json({ error: 'Segment non trouvé' }, 404);
        }

        const headers = new Headers();
        headers.set('Content-Type', 'video/mp4');
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Expose-Headers', 'Content-Length');

        return new Response(object.body, { headers });
    } catch (error) {
        console.error('Segment error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

app.get('/api/upload/status/:fileId', async (c) => {
    try {
        const fileId = c.req.param('fileId');

        // Vérifier les fichiers HLS
        const files = await c.env.STORAGE.list({
            prefix: `videos/${fileId}/`
        });

        const hlsFiles = files.objects.map(obj => obj.key.split('/').pop());

        const hasPlaylist = hlsFiles.includes('index.m3u8');
        const hasInit = hlsFiles.includes('init.mp4');
        const segmentCount = hlsFiles.filter(f => f?.endsWith('.m4s')).length;

        return c.json({
            ready: hasPlaylist && hasInit && segmentCount > 0,
            playlist: hasPlaylist,
            init: hasInit,
            segments: segmentCount,
            files: hlsFiles
        });
    } catch (error) {
        console.error('Status error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// Initier un upload multipart
app.post('/api/upload/init', async (c) => {
    try {
        let body;
        try {
            body = await c.req.json();
        } catch (parseError) {
            console.error('❌ Erreur parsing JSON:', parseError);
            return c.json({ error: 'Invalid JSON body' }, 400);
        }
        
        const { fileId, category, size, mimeType, userId, filename, hash } = body;

        if (!fileId || !category || !size || !userId || !hash) {
            return c.json({ error: 'Missing required fields' }, 400);
        }
        
        // Vérifier que le filename est fourni (OBLIGATOIRE)
        if (!filename || filename.trim() === '') {
            console.error('❌ Init upload - ERREUR: filename manquant !');
            return c.json({ error: 'Filename is required' }, 400);
        }

        // Utiliser un mimeType par défaut si non fourni
        const contentType = mimeType || 'application/octet-stream';

        // Vérifier l'authentification
        const authHeader = c.req.header('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        // Vérifier que DATABASE est disponible
        if (!c.env.DATABASE) {
            throw new Error('DATABASE D1 not available');
        }

        // Vérifier que l'utilisateur existe
        let user;
        try {
            user = await c.env.DATABASE.prepare(
            `SELECT id FROM profil WHERE id = ? LIMIT 1`
        ).bind(userId).first();
        } catch (dbError) {
            console.error('❌ Erreur requête utilisateur:', dbError);
            throw new Error(`Database query failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
        }

        if (!user) {
            return c.json({ error: 'User not found' }, 404);
        }

        // Créer la table files si elle n'existe pas (utiliser run() au lieu de exec())
        try {
            await c.env.DATABASE.prepare(`
                CREATE TABLE IF NOT EXISTS files (
                    file_id TEXT PRIMARY KEY,
                    user_id TEXT,
                    category TEXT,
                    size INTEGER,
                    mime_type TEXT,
                    hash TEXT UNIQUE,
                    filename TEXT,
                    r2_path TEXT,
                    url TEXT,
                    created_at INTEGER,
                    FOREIGN KEY (user_id) REFERENCES profil(id)
                )
            `).run();
        } catch (tableError) {
            console.error('❌ Erreur création table files:', tableError);
            // Continuer même si la table existe déjà
        }

        // Créer la table user_files si elle n'existe pas
        try {
            await c.env.DATABASE.prepare(`
                CREATE TABLE IF NOT EXISTS user_files (
                    user_id TEXT,
                    file_id TEXT,
                    uploaded_at INTEGER,
                    PRIMARY KEY (user_id, file_id),
                    FOREIGN KEY (user_id) REFERENCES profil(id),
                    FOREIGN KEY (file_id) REFERENCES files(file_id)
                )
            `).run();
        } catch (tableError) {
            console.error('❌ Erreur création table user_files:', tableError);
            // Continuer même si la table existe déjà
        }

        // Vérifier si un fichier avec ce hash existe déjà
        const existingFile = await c.env.DATABASE.prepare(
            `SELECT file_id FROM files WHERE hash = ? LIMIT 1`
        ).bind(hash).first();

        if (existingFile) {
            // Le fichier existe déjà, lier l'utilisateur
            await c.env.DATABASE.prepare(
                `INSERT OR IGNORE INTO user_files (user_id, file_id, uploaded_at) 
         VALUES (?, ?, ?)`
            ).bind(
                userId,
                existingFile.file_id as string,
                Math.floor(Date.now() / 1000)
            ).run();

            return c.json({
                exists: true,
                fileId: existingFile.file_id,
                category,
                uploadId: null,
                expiresIn: 0
            });
        }

        // Déterminer le chemin R2 - NE JAMAIS utiliser le nom de fichier, seulement le fileId
            const fileExtension = fileId.split('.').pop() || 'bin';
        const r2Path = `${category}/${fileId}/content.${fileExtension}`;

        // Vérifier que STORAGE est disponible
        if (!c.env.STORAGE) {
            throw new Error('STORAGE R2 bucket not available');
        }

        // Créer un upload multipart sur R2
        const multipartUpload = await c.env.STORAGE.createMultipartUpload(
            r2Path,
            {
                httpMetadata: {
                    contentType: contentType,
                    cacheControl: 'public, max-age=31536000, immutable'
                }
            }
        );

        if (!multipartUpload || !multipartUpload.uploadId) {
            throw new Error('Failed to create multipart upload: invalid response from R2');
        }

        const uploadId = multipartUpload.uploadId;

        // Créer la table uploads si elle n'existe pas
        try {
            await c.env.DATABASE.prepare(`
      CREATE TABLE IF NOT EXISTS uploads (
        upload_id TEXT PRIMARY KEY,
        file_id TEXT,
        user_id TEXT,
        category TEXT,
        status TEXT DEFAULT 'initiated',
        filename TEXT,
        hash TEXT,
        created_at INTEGER,
        completed_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES profil(id)
      )
            `).run();
            
            // Migrations : ajouter les colonnes manquantes si elles n'existent pas
            // SQLite/D1 ne supporte pas IF NOT EXISTS pour ALTER TABLE, donc on essaie et on ignore les erreurs
            // Note: SQLite ne supporte pas DEFAULT dans ALTER TABLE ADD COLUMN, donc on ajoute sans DEFAULT
            const columnsToAdd = [
                { name: 'category', type: 'TEXT' },
                { name: 'filename', type: 'TEXT' },
                { name: 'hash', type: 'TEXT' },
                { name: 'completed_at', type: 'INTEGER' },
                { name: 'status', type: 'TEXT' }
            ];
            
            for (const column of columnsToAdd) {
                try {
                    await c.env.DATABASE.prepare(`
                        ALTER TABLE uploads ADD COLUMN ${column.name} ${column.type}
                    `).run();
                } catch (alterError: any) {
                    const errorMsg = alterError?.message || String(alterError);
                    // Ignorer l'erreur si la colonne existe déjà (différents formats selon le driver SQLite)
                    if (
                        errorMsg.includes('duplicate column name') ||
                        errorMsg.includes('duplicate column') ||
                        errorMsg.includes('already exists')
                    ) {
                    } else {
                        console.warn(`⚠️ Erreur ajout colonne ${column.name}:`, errorMsg);
                    }
                }
            }
        } catch (tableError) {
            console.error('❌ Erreur création table uploads:', tableError);
            // Continuer même si la table existe déjà
        }

        // Enregistrer l'upload en cours dans D1
        try {
            const insertResult = await c.env.DATABASE.prepare(
            `INSERT INTO uploads (upload_id, file_id, user_id, category, filename, hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            uploadId,
            fileId,
            userId,
            category,
            filename.trim(), // TOUJOURS sauvegarder le filename (nom original, vérifié ci-dessus)
            hash,
            Math.floor(Date.now() / 1000)
        ).run();
            
            if (!insertResult.success) {
                console.error('❌ Échec insertion upload:', insertResult);
                throw new Error('Failed to insert upload record');
            }
        } catch (insertError) {
            console.error('❌ Erreur insertion upload:', insertError);
            throw new Error(`Failed to insert upload: ${insertError instanceof Error ? insertError.message : String(insertError)}`);
        }

        return c.json({
            uploadId,
            fileId,
            category,
            expiresIn: 3600
        });
    } catch (error) {
        console.error('❌ Init upload error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        const errorName = error instanceof Error ? error.name : typeof error;
        console.error('❌ Error details:', { 
            name: errorName,
            message: errorMessage, 
            stack: errorStack,
            errorType: typeof error,
            errorString: String(error)
        });
        return c.json({ 
            error: 'Internal server error',
            message: errorMessage,
            details: errorStack ? errorStack.substring(0, 500) : undefined
        }, 500);
    }
});

// Route pour uploader une partie (modifié pour ne pas générer d'URL signée)
app.post('/api/upload/part', async (c) => {
    try {
        // Les métadonnées sont dans les headers, le chunk est dans le body
        const uploadId = c.req.header('X-Upload-Id');
        const partNumberHeader = c.req.header('X-Part-Number');
        const fileId = c.req.header('X-File-Id');
        const category = c.req.header('X-Category');
        const filename = c.req.header('X-Filename');

        if (!uploadId || !partNumberHeader || !fileId || !category) {
            return c.json({ error: 'Missing required fields in headers' }, 400);
        }

        const partNumber = parseInt(partNumberHeader, 10);
        if (isNaN(partNumber) || partNumber < 1) {
            return c.json({ error: 'Invalid part number' }, 400);
        }

        // Déterminer le chemin R2 - NE JAMAIS utiliser le nom de fichier, seulement le fileId
            const fileExtension = fileId.split('.').pop() || 'bin';
        const r2Path = `${category}/${fileId}/content.${fileExtension}`;

        // Reprendre l'upload multipart
        const multipartUpload = c.env.STORAGE.resumeMultipartUpload(
            r2Path,
            uploadId
        );

        // Uploader la partie avec le corps de la requête (le chunk)
        const body = await c.req.arrayBuffer();
        
        if (!body || body.byteLength === 0) {
            return c.json({ error: 'Empty chunk body' }, 400);
        }
        
        
        const part = await multipartUpload.uploadPart(partNumber, body);

        return c.json({
            success: true,
            partNumber,
            etag: part.etag
        });
    } catch (error) {
        console.error('Upload part error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// Compléter un upload multipart
app.post('/api/upload/complete', async (c) => {
    try {
        console.log(`\n📤 [UPLOAD] ==========================================`);
        console.log(`📤 [UPLOAD] Requête completeMultipartUpload reçue`);
        console.log(`📤 [UPLOAD] ==========================================\n`);
        
        const body = await c.req.json();
        const { uploadId, parts, filename, basicMetadata, file_created_at: fileCreatedAt } = body;
        
        console.log(`📤 [UPLOAD] uploadId: ${uploadId}`);
        console.log(`📤 [UPLOAD] filename: ${filename}`);
        console.log(`📤 [UPLOAD] basicMetadata présent: ${basicMetadata ? 'OUI' : 'NON'}`);
        if (basicMetadata) {
            console.log(`📤 [UPLOAD] basicMetadata:`, JSON.stringify(basicMetadata, null, 2));
        }

        if (!uploadId || !parts || !Array.isArray(parts)) {
            return c.json({ error: 'Missing uploadId or parts' }, 400);
        }

        // Récupérer les infos de l'upload
        let uploadInfo;
        try {
            uploadInfo = await c.env.DATABASE.prepare(
            `SELECT upload_id, file_id, user_id, category, filename, hash
             FROM uploads
             WHERE upload_id = ? AND status = 'initiated'
                 LIMIT 1`
        ).bind(uploadId).first() as {
            upload_id: string;
            file_id: string;
            user_id: string;
            category: string;
            filename: string;
            hash: string;
        } | null;
        } catch (dbError) {
            console.error('❌ Erreur requête upload:', dbError);
            throw new Error(`Database query failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
        }

        if (!uploadInfo) {
            console.error('❌ Upload non trouvé:', uploadId);
            return c.json({ error: 'Upload not found or already completed' }, 404);
        }


        // Déterminer le chemin R2 - NE JAMAIS utiliser le nom de fichier, seulement le fileId
            const fileExtension = uploadInfo.file_id.split('.').pop() || 'bin';
        const r2Path = `${uploadInfo.category}/${uploadInfo.file_id}/content.${fileExtension}`;

        // Reprendre l'upload multipart
        const multipartUpload = c.env.STORAGE.resumeMultipartUpload(r2Path, uploadId);

        // Compléter l'upload avec les parties
        // IMPORTANT: R2 exige que les parts soient triées par partNumber et que les etags soient des strings
        const sortedParts = parts
            .map(p => {
                // S'assurer que partNumber est un nombre et etag est une string
                const partNumber = typeof p.partNumber === 'number' ? p.partNumber : parseInt(String(p.partNumber), 10);
                let etag = String(p.etag || '');
                // Enlever les guillemets si présents (certains systèmes les ajoutent)
                if (etag.startsWith('"') && etag.endsWith('"')) {
                    etag = etag.slice(1, -1);
                }
                return {
                    partNumber,
                    etag
                };
            })
            .sort((a, b) => a.partNumber - b.partNumber);
        
        // Valider que toutes les parts ont des valeurs valides
        for (let i = 0; i < sortedParts.length; i++) {
            const part = sortedParts[i];
            if (!part.etag || part.etag.trim() === '') {
                throw new Error(`Part ${part.partNumber} a un etag vide ou invalide`);
            }
            if (part.partNumber !== i + 1) {
                console.warn(`⚠️ Part number inattendu: attendu ${i + 1}, reçu ${part.partNumber}`);
            }
        }
        
        // Valider la structure des parts avant d'appeler complete
        const invalidParts = sortedParts.filter(p => !p.etag || p.partNumber < 1);
        if (invalidParts.length > 0) {
            console.error('❌ Parts invalides trouvées:', invalidParts);
            throw new Error(`Invalid parts found: ${invalidParts.length} parts with missing etag or invalid partNumber`);
        }
        
        let completeResult;
        try {
            completeResult = await multipartUpload.complete(sortedParts);
        } catch (completeError) {
            console.error('❌ Erreur complétion multipart:', completeError);
            const errorDetails = {
                message: completeError instanceof Error ? completeError.message : String(completeError),
                partsCount: sortedParts.length,
                firstPart: sortedParts[0],
                lastPart: sortedParts[sortedParts.length - 1],
                uploadId,
                r2Path
            };
            console.error('❌ Détails erreur complétion:', errorDetails);
            throw new Error(`Failed to complete multipart upload: ${completeError instanceof Error ? completeError.message : String(completeError)}`);
        }

        // Récupérer l'objet uploadé
        const object = await c.env.STORAGE.get(r2Path);

        if (!object) {
            console.error('❌ Objet non trouvé après upload:', r2Path);
            throw new Error('Failed to get uploaded object');
        }
        

        // Créer la table files si elle n'existe pas
        try {
            await c.env.DATABASE.prepare(`
      CREATE TABLE IF NOT EXISTS files (
        file_id TEXT PRIMARY KEY,
        user_id TEXT,
        category TEXT,
        size INTEGER,
        mime_type TEXT,
        hash TEXT UNIQUE,
        filename TEXT,
        r2_path TEXT,
        url TEXT,
        created_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES profil(id)
      )
            `).run();
            
            // Migrations : ajouter les colonnes manquantes pour files
            const filesColumnsToAdd = [
                { name: 'user_id', type: 'TEXT' },
                { name: 'category', type: 'TEXT' },
                { name: 'filename', type: 'TEXT' },
                { name: 'r2_path', type: 'TEXT' },
                { name: 'url', type: 'TEXT' },
                { name: 'mime_type', type: 'TEXT' },
                { name: 'file_created_at', type: 'INTEGER' }
            ];
            
            // Créer la table file_metadata pour les métadonnées enrichies
            try {
                await c.env.DATABASE.prepare(`
                    CREATE TABLE IF NOT EXISTS file_metadata (
                        file_id TEXT PRIMARY KEY,
                        thumbnail_url TEXT,
                        backdrop_url TEXT,
                        thumbnail_r2_path TEXT,
                        source_api TEXT,
                        source_id TEXT,
                        genres TEXT, -- JSON array
                        subgenres TEXT, -- JSON array
                        season INTEGER,
                        episode INTEGER,
                        artists TEXT, -- JSON array
                        albums TEXT, -- JSON array (TOUS les albums)
                        album_thumbnails TEXT, -- JSON array de thumbnails d'albums (pour grille)
                        title TEXT,
                        year INTEGER,
                        description TEXT,
                        episode_description TEXT,
                        created_at INTEGER,
                        updated_at INTEGER,
                        FOREIGN KEY (file_id) REFERENCES files(file_id)
                    )
                `).run();
                
                // Migrations : ajouter les colonnes manquantes pour file_metadata
                const fileMetadataColumnsToAdd = [
                    { name: 'created_at', type: 'INTEGER' },
                    { name: 'updated_at', type: 'INTEGER' },
                    { name: 'album_thumbnails', type: 'TEXT' },
                    { name: 'backdrop_url', type: 'TEXT' },
                    { name: 'episode_description', type: 'TEXT' }
                ];
                
                for (const column of fileMetadataColumnsToAdd) {
                    try {
                        await c.env.DATABASE.prepare(`
                            ALTER TABLE file_metadata ADD COLUMN ${column.name} ${column.type}
                        `).run();
                    } catch (alterError: any) {
                        const errorMsg = alterError?.message || String(alterError);
                        if (
                            errorMsg.includes('duplicate column name') ||
                            errorMsg.includes('duplicate column') ||
                            errorMsg.includes('already exists')
                        ) {
                        } else {
                            console.warn(`⚠️ Erreur ajout colonne file_metadata.${column.name}:`, errorMsg);
                        }
                    }
                }
            } catch (tableError) {
                console.error('❌ Erreur création table file_metadata:', tableError);
            }
            
            for (const column of filesColumnsToAdd) {
                try {
                    await c.env.DATABASE.prepare(`
                        ALTER TABLE files ADD COLUMN ${column.name} ${column.type}
                    `).run();
                } catch (alterError: any) {
                    const errorMsg = alterError?.message || String(alterError);
                    if (
                        errorMsg.includes('duplicate column name') ||
                        errorMsg.includes('duplicate column') ||
                        errorMsg.includes('already exists')
                    ) {
                    } else {
                        console.warn(`⚠️ Erreur ajout colonne files.${column.name}:`, errorMsg);
                    }
                }
            }
        } catch (tableError) {
            console.error('❌ Erreur création table files:', tableError);
            // Continuer même si la table existe déjà
        }

        // Créer la table user_files si elle n'existe pas
        try {
            await c.env.DATABASE.prepare(`
      CREATE TABLE IF NOT EXISTS user_files (
        user_id TEXT,
        file_id TEXT,
        uploaded_at INTEGER,
        PRIMARY KEY (user_id, file_id),
        FOREIGN KEY (user_id) REFERENCES profil(id),
        FOREIGN KEY (file_id) REFERENCES files(file_id)
      )
            `).run();
            
            // Migration : ajouter uploaded_at si manquant
            try {
                await c.env.DATABASE.prepare(`
                    ALTER TABLE user_files ADD COLUMN uploaded_at INTEGER
                `).run();
            } catch (alterError: any) {
                const errorMsg = alterError?.message || String(alterError);
                if (
                    !errorMsg.includes('duplicate column name') &&
                    !errorMsg.includes('duplicate column') &&
                    !errorMsg.includes('already exists')
                ) {
                    console.warn('⚠️ Erreur ajout colonne user_files.uploaded_at:', errorMsg);
                }
            }
        } catch (tableError) {
            console.error('❌ Erreur création table user_files:', tableError);
            // Continuer même si la table existe déjà
        }

        // Enregistrer le fichier dans D1
        try {
            // UTILISER TOUJOURS LE NOM ORIGINAL DU FICHIER - Ne jamais utiliser file_id
            // Priorité 1: filename du body JSON (nom original)
            // Priorité 2: filename de uploadInfo (nom original stocké lors de l'initiation)
            let finalFilename: string | null = null;
            
            if (filename && filename.trim() !== '') {
                // Utiliser le filename du body JSON (nom original)
                finalFilename = filename.trim();
            } else if (uploadInfo.filename && uploadInfo.filename.trim() !== '') {
                // Utiliser le filename de uploadInfo (nom original stocké lors de l'initiation)
                finalFilename = uploadInfo.filename.trim();
            } else {
                // AUCUN filename disponible - C'est une erreur, ne pas utiliser file_id
                console.error('❌ Complete upload - ERREUR: Aucun filename disponible !');
                console.error('   - filename du body:', filename);
                console.error('   - filename de uploadInfo:', uploadInfo.filename);
                throw new Error('Filename is required but not provided');
            }
            
            
            // Vérifier si le fichier existe déjà (par hash)
            const existingFileByHash = await c.env.DATABASE.prepare(
                `SELECT file_id FROM files WHERE hash = ? LIMIT 1`
            ).bind(uploadInfo.hash).first();
            
            if (existingFileByHash && existingFileByHash.file_id !== uploadInfo.file_id) {
                // Le fichier existe déjà avec un autre file_id (déduplication), mettre à jour le filename seulement
                const updateResult = await c.env.DATABASE.prepare(
                    `UPDATE files SET filename = ? WHERE file_id = ?`
                ).bind(finalFilename, existingFileByHash.file_id as string).run();
                
                if (!updateResult.success) {
                    console.error('❌ Échec mise à jour filename:', updateResult);
                } else {
                }
            } else {
                // Nouveau fichier ou même file_id, utiliser INSERT OR REPLACE
                const fileCreatedAtValue = (typeof fileCreatedAt === 'number' && fileCreatedAt > 0) ? fileCreatedAt : null;
                const insertResult = await c.env.DATABASE.prepare(
            `INSERT OR REPLACE INTO files 
       (file_id, user_id, category, size, mime_type, hash, filename, r2_path, url, created_at, file_created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            uploadInfo.file_id,
            uploadInfo.user_id,
            uploadInfo.category,
            object.size,
            object.httpMetadata?.contentType || 'application/octet-stream',
            uploadInfo.hash,
                finalFilename, // Garanti non-null grâce au fallback ci-dessus
            r2Path,
                `/api/files/${uploadInfo.category}/${uploadInfo.file_id}`,
            Math.floor(Date.now() / 1000),
            fileCreatedAtValue
        ).run();
                
                if (!insertResult.success) {
                    console.error('❌ Échec insertion fichier:', insertResult);
                    throw new Error('Failed to insert file record');
                }
            }
        } catch (insertError) {
            console.error('❌ Erreur insertion fichier:', insertError);
            throw new Error(`Failed to insert file: ${insertError instanceof Error ? insertError.message : String(insertError)}`);
        }

        // Lier l'utilisateur au fichier
        try {
            const linkResult = await c.env.DATABASE.prepare(
            `INSERT OR REPLACE INTO user_files (user_id, file_id, uploaded_at)
       VALUES (?, ?, ?)`
        ).bind(
            uploadInfo.user_id,
            uploadInfo.file_id,
            Math.floor(Date.now() / 1000)
        ).run();

            if (!linkResult.success) {
                console.error('❌ Échec liaison utilisateur:', linkResult);
            } else {
            }
        } catch (linkError) {
            console.error('❌ Erreur liaison utilisateur:', linkError);
            // Ne pas bloquer si la liaison échoue
        }

        // Stocker les métadonnées de base (ID3 tags) si disponibles
        if (basicMetadata && (uploadInfo.category === 'musics' || uploadInfo.category === 'videos')) {
            try {
                
                if (uploadInfo.category === 'musics') {
                    const audioMeta = basicMetadata as any; // BaseAudioMetadata
                    
                    // Préparer les données pour file_metadata
                    const artists = audioMeta.artist ? JSON.stringify([audioMeta.artist]) : null;
                    const albums = audioMeta.album ? JSON.stringify([audioMeta.album]) : null;
                    // IMPORTANT: Utiliser le title des métadonnées SEULEMENT s'il existe et n'est pas vide
                    // Ne pas utiliser le filename comme fallback ici (le filename est déjà dans files.filename)
                    const title = (audioMeta.title && typeof audioMeta.title === 'string' && audioMeta.title.trim() !== '') ? audioMeta.title.trim() : null;
                    const year = audioMeta.year || null;
                    
                    const insertResult = await c.env.DATABASE.prepare(
                        `INSERT OR REPLACE INTO file_metadata 
                        (file_id, title, artists, albums, year, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`
                    ).bind(
                        uploadInfo.file_id,
                        title, // NULL si pas de titre dans les métadonnées (ne pas utiliser filename)
                        artists,
                        albums,
                        year,
                        Math.floor(Date.now() / 1000),
                        Math.floor(Date.now() / 1000)
                    ).run();
                } else if (uploadInfo.category === 'videos') {
                    const videoMeta = basicMetadata as any; // BaseVideoMetadata
                    // IMPORTANT: Utiliser le title des métadonnées SEULEMENT s'il existe et n'est pas vide
                    const title = (videoMeta.title && videoMeta.title.trim() !== '') ? videoMeta.title.trim() : null;
                    const year = videoMeta.year || null;
                    
        await c.env.DATABASE.prepare(
                        `INSERT OR REPLACE INTO file_metadata 
                        (file_id, title, year, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?)`
                    ).bind(
                        uploadInfo.file_id,
                        title, // NULL si pas de titre dans les métadonnées (ne pas utiliser filename)
                        year,
                        Math.floor(Date.now() / 1000),
                        Math.floor(Date.now() / 1000)
                    ).run();
                    
                }
            } catch (metadataError) {
                console.error('❌ Erreur stockage métadonnées de base (non-bloquant):', JSON.stringify({
                    error: metadataError instanceof Error ? metadataError.message : String(metadataError),
                    stack: metadataError instanceof Error ? metadataError.stack : undefined,
                    fileId: uploadInfo.file_id,
                    category: uploadInfo.category
                }, null, 2));
                // Ne pas bloquer l'upload si le stockage des métadonnées échoue
            }
        }

        // Mettre à jour le statut de l'upload
        try {
            const updateResult = await c.env.DATABASE.prepare(
            `UPDATE uploads 
       SET status = 'completed', completed_at = ? 
       WHERE upload_id = ?`
        ).bind(Math.floor(Date.now() / 1000), uploadId).run();

            if (!updateResult.success) {
                console.error('❌ Échec mise à jour statut:', updateResult);
            } else {
            }
        } catch (updateError) {
            console.error('❌ Erreur mise à jour statut:', updateError);
            // Ne pas bloquer si la mise à jour échoue
        }

        // Identification automatique APRÈS que le fichier soit créé dans la base de données
        // Faire cela en arrière-plan pour ne pas bloquer la réponse
        console.log(`\n🔍 [ENRICHMENT] ==========================================`);
        console.log(`🔍 [ENRICHMENT] Vérification enrichissement pour ${uploadInfo.file_id}`);
        console.log(`🔍 [ENRICHMENT] Catégorie: ${uploadInfo.category}`);
        console.log(`🔍 [ENRICHMENT] basicMetadata présent: ${basicMetadata ? 'OUI' : 'NON'}`);
        if (basicMetadata) {
            console.log(`🔍 [ENRICHMENT] basicMetadata:`, JSON.stringify(basicMetadata, null, 2));
        }
        console.log(`🔍 [ENRICHMENT] ==========================================\n`);
        
        if (uploadInfo.category === 'musics' || uploadInfo.category === 'videos') {
            console.log(`✅ [ENRICHMENT] Catégorie ${uploadInfo.category} nécessite enrichissement, lancement...`);
            // Lancer l'enrichissement de manière asynchrone (ne pas attendre)
            // IMPORTANT: Ne pas utiliser await ici pour ne pas bloquer la réponse
            const enrichmentPromise = (async () => {
                try {
                    console.log(`🚀 [ENRICHMENT] Début identification automatique pour ${uploadInfo.file_id} (${uploadInfo.category})`);
                    
                    // Préparer le titre pour l'enrichissement
                    let cleanedTitle: string;
                    if (basicMetadata?.title && typeof basicMetadata.title === 'string' && basicMetadata.title.trim().length >= 2) {
                        cleanedTitle = basicMetadata.title.trim();
                        console.log(`🔍 [ENRICHMENT] Titre depuis métadonnées ID3: "${cleanedTitle}"`);
                    } else {
                        // Extraire le nom sans extension
                        const filenameWithoutExt = uploadInfo.filename.substring(0, uploadInfo.filename.lastIndexOf('.'));
                        cleanedTitle = filenameWithoutExt.trim();
                        console.log(`🔍 [ENRICHMENT] Titre depuis filename: "${cleanedTitle}"`);
                    }
                    
                    if (!cleanedTitle || cleanedTitle.length < 2) {
                        console.warn(`⚠️ [ENRICHMENT] Titre trop court ou vide, abandon de l'enrichissement pour ${uploadInfo.file_id}`);
                        return; // Pas de titre valide, abandonner l'enrichissement
                    }
                    
                    let enrichedMetadata: any = null;
                    
                    if (uploadInfo.category === 'videos') {
                        // Enrichissement pour les vidéos (TMDb / OMDb) avec variantes de titre
                        console.log(`🎬 [ENRICHMENT] Recherche vidéo pour: "${cleanedTitle}"`);
                        const tmdbApiKey = c.env.TMDB_API_KEY;
                        const omdbApiKey = c.env.OMDB_API_KEY;

                        // Détecter si c'est une série (pattern SxxExx dans le filename)
                        const filenameForPattern = uploadInfo.filename.replace(/\.[^/.]+$/, '');
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

                        // Exception spéciale pour Doctor Who : détecter si c'est la série de 2005
                        const isDoctorWho = /doctor\s*who/i.test(baseTitle) || /doctor\s*who/i.test(cleanedTitle);
                        let requiresDoctorWho2005 = false;
                        if (isDoctorWho) {
                            // Chercher une année >= 2005 dans le titre ou le filename ou dans basicMetadata.year
                            const yearMatch = (cleanedTitle + ' ' + filenameForPattern).match(/\b(200[5-9]|20[1-9]\d)\b/);
                            const detectedYear = yearMatch ? parseInt(yearMatch[1]) : (basicMetadata?.year && basicMetadata.year >= 2005 ? basicMetadata.year : null);
                            if (detectedYear && detectedYear >= 2005) {
                                requiresDoctorWho2005 = true;
                                console.log(`🩺 [ENRICHMENT] Doctor Who détecté avec année ${detectedYear} >= 2005 - Sélection de la série reprise (2005)`);
                            }
                        }

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

                            // Fonction helper pour récupérer le still_path d'un épisode
                            const fetchEpisodeDetails = async (
                                tvId: number,
                                seasonNumber: number,
                                episodeNumber: number
                            ): Promise<{ still_path: string | null; overview: string | null }> => {
                                try {
                                    console.log(`[ENRICHMENT] Récupération détails pour épisode S${seasonNumber}E${episodeNumber} de série ID ${tvId}...`);
                                    const seasonUrl = `https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNumber}?api_key=${tmdbApiKey}&language=fr-FR`;
                                    const seasonResp = await fetch(seasonUrl);
                                    if (!seasonResp.ok) {
                                        console.warn(`⚠️ [ENRICHMENT] Impossible de récupérer la saison ${seasonNumber} pour série ID ${tvId}: ${seasonResp.status}`);
                                        return { still_path: null, overview: null };
                                    }
                                    const seasonData = await seasonResp.json() as { 
                                        episodes?: Array<{ 
                                            episode_number: number; 
                                            still_path?: string | null;
                                            overview?: string | null;
                                        }> 
                                    };
                                    if (seasonData.episodes && Array.isArray(seasonData.episodes)) {
                                        const episode = seasonData.episodes.find(e => e.episode_number === episodeNumber);
                                        if (episode) {
                                            const stillPath = episode.still_path || null;
                                            const overview = episode.overview || null;
                                            console.log(`✅ [ENRICHMENT] Détails trouvés pour épisode S${seasonNumber}E${episodeNumber} - still_path: ${stillPath ? 'oui' : 'non'}, overview: ${overview ? 'oui' : 'non'}`);
                                            return { still_path: stillPath, overview };
                                        }
                                    }
                                    console.warn(`⚠️ [ENRICHMENT] Aucun épisode trouvé pour S${seasonNumber}E${episodeNumber}`);
                                } catch (stillError) {
                                    console.warn(`⚠️ [ENRICHMENT] Erreur récupération détails pour épisode S${seasonNumber}E${episodeNumber}:`, stillError);
                                }
                                return { still_path: null, overview: null };
                            };

                            // Si pattern série détecté, chercher d'abord sur TMDb TV
                            if (isLikelySeries && tmdbApiKey) {
                                for (const variant of titleVariants) {
                                    if (enrichedMetadata) break;
                                    console.log(`📺 [ENRICHMENT] Tentative TMDb TV (prioritaire - pattern série détecté) avec variante: "${variant}"`);
                                    const tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(variant)}&language=fr-FR`;
                                    const tvResponse = await fetch(tvUrl);
                                    
                                    if (tvResponse.ok) {
                                        const tvData = await tvResponse.json() as { results?: Array<{ id: number; name?: string; poster_path?: string | null; backdrop_path?: string | null; first_air_date?: string; overview?: string | null }> };
                                        if (tvData.results && tvData.results.length > 0) {
                                            let tv = tvData.results[0];
                                            
                                            // Exception Doctor Who : si on cherche la série de 2005, filtrer les résultats
                                            if (requiresDoctorWho2005) {
                                                // Chercher d'abord une série avec first_air_date >= 2005
                                                let doctorWho2005: { id: number; name?: string; poster_path?: string | null; backdrop_path?: string | null; first_air_date?: string; overview?: string | null } | null = tvData.results.find(serie => {
                                                    const firstAirYear = serie.first_air_date ? parseInt(serie.first_air_date.substring(0, 4)) : 0;
                                                    return firstAirYear >= 2005;
                                                }) || null;
                                                
                                                // Si toujours pas trouvé, essayer une recherche spécifique pour "Doctor Who" 2005
                                                if (!doctorWho2005) {
                                                    console.log(`🩺 [ENRICHMENT] Tentative recherche spécifique Doctor Who 2005...`);
                                                    try {
                                                        // Faire une recherche spécifique pour "Doctor Who" et filtrer par année >= 2005
                                                        const doctorWho2005Url = `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent('Doctor Who')}&language=fr-FR`;
                                                        const doctorWho2005Response = await fetch(doctorWho2005Url);
                                                        if (doctorWho2005Response.ok) {
                                                            const doctorWho2005Data = await doctorWho2005Response.json() as { results?: Array<{ id: number; name?: string; poster_path?: string | null; backdrop_path?: string | null; first_air_date?: string; overview?: string | null }> };
                                                            if (doctorWho2005Data.results && doctorWho2005Data.results.length > 0) {
                                                                // Chercher une série qui s'appelle "Doctor Who" (ou similaire) avec first_air_date >= 2005
                                                                doctorWho2005 = doctorWho2005Data.results.find(serie => {
                                                                    const serieName = (serie.name || '').toLowerCase();
                                                                    const isDoctorWho = serieName.includes('doctor who') || serieName === 'doctor who';
                                                                    const firstAirYear = serie.first_air_date ? parseInt(serie.first_air_date.substring(0, 4)) : 0;
                                                                    return isDoctorWho && firstAirYear >= 2005;
                                                                }) || null;
                                                                
                                                                if (!doctorWho2005) {
                                                                    // Fallback : prendre la première série avec année >= 2005
                                                                    doctorWho2005 = doctorWho2005Data.results.find(serie => {
                                                                        const firstAirYear = serie.first_air_date ? parseInt(serie.first_air_date.substring(0, 4)) : 0;
                                                                        return firstAirYear >= 2005;
                                                                    }) || null;
                                                                }
                                                            }
                                                        }
                                                    } catch (error) {
                                                        console.warn(`⚠️ [ENRICHMENT] Erreur recherche spécifique Doctor Who 2005:`, error);
                                                    }
                                                }
                                                
                                                // Vérifier que la série trouvée est bien "Doctor Who" avant de l'utiliser
                                                if (doctorWho2005) {
                                                    const serieName = (doctorWho2005.name || '').toLowerCase();
                                                    const isDoctorWho = serieName.includes('doctor who');
                                                    if (!isDoctorWho) {
                                                        console.warn(`⚠️ [ENRICHMENT] Série trouvée "${doctorWho2005.name}" ne correspond pas à "Doctor Who", recherche alternative...`);
                                                        doctorWho2005 = null;
                                                    }
                                                }
                                                
                                                if (doctorWho2005) {
                                                    tv = doctorWho2005;
                                                    console.log(`🩺 [ENRICHMENT] Doctor Who 2005 sélectionné: "${tv.name}" (ID: ${tv.id}, Année: ${tv.first_air_date ? tv.first_air_date.substring(0, 4) : 'N/A'})`);
                                                } else {
                                                    console.warn(`⚠️ [ENRICHMENT] Doctor Who 2005 demandé mais non trouvé dans les résultats, utilisation du premier résultat`);
                                                }
                                            }
                                            
                                            console.log(`✅ [ENRICHMENT] Série trouvée sur TMDb: "${tv.name}" (ID: ${tv.id}, Année: ${tv.first_air_date ? tv.first_air_date.substring(0, 4) : 'N/A'}) avec variante "${variant}"`);
                                            const genres = await fetchTmdbGenres('tv', tv.id);
                                            console.log(`[GENRES] [ENRICHMENT] Genres récupérés pour série "${tv.name}":`, genres);
                                            
                                            // Séparer backdrop_url (poster original pour bannière) et thumbnail_url (pour miniatures en 16:9)
                                            const backdropUrl = tv.poster_path ? `https://image.tmdb.org/t/p/w1280${tv.poster_path}` : null;
                                            let thumbnailUrl: string | null = null;
                                            
                                            let episodeDescription: string | null = null;
                                            if (detectedSeason !== null && detectedEpisode !== null) {
                                                // C'est un épisode, récupérer still_path et overview
                                                const episodeDetails = await fetchEpisodeDetails(tv.id, detectedSeason, detectedEpisode);
                                                thumbnailUrl = episodeDetails.still_path ? `https://image.tmdb.org/t/p/w1280${episodeDetails.still_path}` : null;
                                                episodeDescription = episodeDetails.overview; // Synopsis de l'épisode
                                            } else {
                                                // C'est une série, utiliser backdrop_path pour la miniature (16:9)
                                                thumbnailUrl = tv.backdrop_path ? `https://image.tmdb.org/t/p/w1280${tv.backdrop_path}` : null;
                                            }
                                            
                                            enrichedMetadata = {
                                                source_api: 'tmdb_tv',
                                                source_id: String(tv.id),
                                                title: tv.name || null,
                                                year: tv.first_air_date ? parseInt(tv.first_air_date.substring(0, 4)) : null,
                                                thumbnail_url: thumbnailUrl,
                                                backdrop_url: backdropUrl,
                                                description: tv.overview || null, // Synopsis de la série
                                                episode_description: episodeDescription, // Synopsis de l'épisode (si c'est un épisode)
                                                genres: genres || undefined,
                                                season: detectedSeason,
                                                episode: detectedEpisode
                                            };
                                            console.log(`[GENRES] [ENRICHMENT] Métadonnées avec genres:`, JSON.stringify({ genres: enrichedMetadata.genres }, null, 2));
                                            // Vérifier que les deux images sont différentes
                                            if (thumbnailUrl && backdropUrl && thumbnailUrl === backdropUrl) {
                                                console.warn(`⚠️ [ENRICHMENT] thumbnail_url et backdrop_url sont identiques pour ${tv.name}:`, thumbnailUrl);
                                            } else {
                                                console.log(`✅ [ENRICHMENT] Images séparées - thumbnail_url: ${thumbnailUrl ? thumbnailUrl.substring(0, 60) + '...' : 'null'}, backdrop_url: ${backdropUrl ? backdropUrl.substring(0, 60) + '...' : 'null'}`);
                                            }
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
                                        const movieData = await movieResponse.json() as { results?: Array<{ id: number; title?: string; poster_path?: string | null; backdrop_path?: string | null; release_date?: string; overview?: string | null }> };
                                        if (movieData.results && movieData.results.length > 0) {
                                            const movie = movieData.results[0];
                                            console.log(`✅ [ENRICHMENT] Film trouvé sur TMDb: "${movie.title}" (ID: ${movie.id}, Année: ${movie.release_date ? movie.release_date.substring(0, 4) : 'N/A'}) avec variante "${variant}"`);
                                            const genres = await fetchTmdbGenres('movie', movie.id);
                                            console.log(`[GENRES] [ENRICHMENT] Genres récupérés pour film "${movie.title}":`, genres);
                                            // Séparer backdrop_url (poster original pour bannière) et thumbnail_url (pour miniatures en 16:9)
                                            const backdropUrl = movie.poster_path ? `https://image.tmdb.org/t/p/w1280${movie.poster_path}` : null;
                                            const thumbnailUrl = movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null;
                                            enrichedMetadata = {
                                                source_api: 'tmdb',
                                                source_id: String(movie.id),
                                                title: movie.title || null,
                                                year: movie.release_date ? parseInt(movie.release_date.substring(0, 4)) : null,
                                                thumbnail_url: thumbnailUrl, // Backdrop pour miniatures (16:9)
                                                backdrop_url: backdropUrl, // Poster original pour bannière/page info
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
                                        const tvData = await tvResponse.json() as { results?: Array<{ id: number; name?: string; poster_path?: string | null; backdrop_path?: string | null; first_air_date?: string; overview?: string | null }> };
                                        if (tvData.results && tvData.results.length > 0) {
                                            const tv = tvData.results[0];
                                            console.log(`✅ [ENRICHMENT] Série trouvée sur TMDb: "${tv.name}" (ID: ${tv.id}, Année: ${tv.first_air_date ? tv.first_air_date.substring(0, 4) : 'N/A'}) avec variante "${variant}"`);
                                            const genres = await fetchTmdbGenres('tv', tv.id);
                                            console.log(`[GENRES] [ENRICHMENT] Genres récupérés pour série "${tv.name}":`, genres);
                                            // Séparer backdrop_url (poster original pour bannière) et thumbnail_url (pour miniatures en 16:9)
                                            const backdropUrl = tv.poster_path ? `https://image.tmdb.org/t/p/w1280${tv.poster_path}` : null;
                                            const thumbnailUrl = tv.backdrop_path ? `https://image.tmdb.org/t/p/w1280${tv.backdrop_path}` : null;
                                            enrichedMetadata = {
                                                source_api: 'tmdb_tv',
                                                source_id: String(tv.id),
                                                title: tv.name || null,
                                                year: tv.first_air_date ? parseInt(tv.first_air_date.substring(0, 4)) : null,
                                                thumbnail_url: thumbnailUrl, // Backdrop pour miniatures (16:9)
                                                backdrop_url: backdropUrl, // Poster original pour bannière/page info
                                                description: tv.overview || null,
                                                genres: genres || undefined
                                            };
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
                    } else if (uploadInfo.category === 'musics') {
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
                                            const parts = uploadInfo.filename.split(/\s*[-–]\s*/);
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
                            has_thumbnail: !!enrichedMetadata.thumbnail_url,
                            thumbnail_url: enrichedMetadata.thumbnail_url,
                            backdrop_url: enrichedMetadata.backdrop_url
                        }, null, 2));
                        
                        // Télécharger et stocker la miniature si disponible (appel interne direct)
                        if (enrichedMetadata.thumbnail_url) {
                            try {
                                console.log(`📸 [ENRICHMENT] Téléchargement thumbnail: ${enrichedMetadata.thumbnail_url.substring(0, 80)}...`);
                                const thumbnailR2Path = await downloadAndStoreThumbnailInternal(
                                    enrichedMetadata.thumbnail_url,
                                    uploadInfo.file_id,
                                    uploadInfo.category,
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
                        console.log(`💾 [ENRICHMENT] Stockage métadonnées enrichies pour ${uploadInfo.file_id}...`);
                        try {
                            // Nettoyer les métadonnées
                            const cleanedTitle = enrichedMetadata.title ? cleanString(enrichedMetadata.title) : null;
                            const cleanedDescription = enrichedMetadata.description ? cleanString(enrichedMetadata.description) : null;
                            const cleanedEpisodeDescription = enrichedMetadata.episode_description ? cleanString(enrichedMetadata.episode_description) : null;
                            
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
                            ).bind(uploadInfo.file_id).first();
                            
                            if (!file) {
                                console.warn(`⚠️ [ENRICHMENT] Fichier non trouvé: ${uploadInfo.file_id}`);
                            } else {
                                // Stocker les métadonnées
                                let result;
                                try {
                                    result = await c.env.DATABASE.prepare(`
                                        INSERT OR REPLACE INTO file_metadata (
                                            file_id, thumbnail_url, backdrop_url, thumbnail_r2_path, source_api, source_id,
                                            genres, subgenres, season, episode, artists, albums, album_thumbnails, title, year, description, episode_description
                                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    `).bind(
                                        uploadInfo.file_id,
                                        enrichedMetadata.thumbnail_url || null,
                                        enrichedMetadata.backdrop_url || null,
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
                                        cleanedDescription,
                                        cleanedEpisodeDescription
                                    ).run();
                                } catch (insertError) {
                                    // Si la colonne album_thumbnails n'existe pas, essayer sans
                                    const errorMsg = insertError instanceof Error ? insertError.message : String(insertError);
                                    if (errorMsg.includes('album_thumbnails') || errorMsg.includes('no such column')) {
                                        result = await c.env.DATABASE.prepare(`
                                            INSERT OR REPLACE INTO file_metadata (
                                                file_id, thumbnail_url, backdrop_url, thumbnail_r2_path, source_api, source_id,
                                                genres, subgenres, season, episode, artists, albums, title, year, description, episode_description
                                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        `).bind(
                                            uploadInfo.file_id,
                                            enrichedMetadata.thumbnail_url || null,
                                            enrichedMetadata.backdrop_url || null,
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
                                            cleanedDescription,
                                            cleanedEpisodeDescription
                                        ).run();
                                    } else {
                                        throw insertError;
                                    }
                                }
                                
                                if (result.success) {
                                    console.log(`✅ [ENRICHMENT] Métadonnées enrichies stockées avec succès pour ${uploadInfo.file_id}`);
                                } else {
                                    console.error(`❌ [ENRICHMENT] Échec stockage métadonnées:`, result);
                                }
                            }
                        } catch (metadataError) {
                            console.error(`❌ [ENRICHMENT] Erreur stockage métadonnées enrichies pour ${uploadInfo.file_id}:`, metadataError instanceof Error ? metadataError.message : String(metadataError));
                        }
                    } else {
                        console.warn(`❌ [ENRICHMENT] Aucune métadonnée enrichie trouvée pour ${uploadInfo.file_id} (${uploadInfo.category})`);
                    }
                } catch (enrichmentError) {
                    // Ne pas bloquer l'upload si l'enrichissement échoue
                    console.error(`❌ [ENRICHMENT] Erreur enrichissement métadonnées (non-bloquant) pour ${uploadInfo.file_id}:`, enrichmentError instanceof Error ? enrichmentError.message : String(enrichmentError));
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
                console.error(`❌ [ENRICHMENT] Erreur non gérée dans la promesse d'enrichissement pour ${uploadInfo.file_id}:`, err);
            });
        } else {
            console.log(`ℹ️ [ENRICHMENT] Catégorie ${uploadInfo.category} ne nécessite pas d'enrichissement automatique`);
        }

        // Invalider le cache Edge après upload réussi
        const cache = caches.default;
        const patternsToInvalidate = [
            generateCacheKey(uploadInfo.user_id, 'files', { category: uploadInfo.category }),
            generateCacheKey(uploadInfo.user_id, 'stats'),
        ];
        
        for (const pattern of patternsToInvalidate) {
            try {
                await invalidateCache(cache, pattern);
            } catch (error) {
                console.warn(`⚠️ Erreur invalidation cache Edge pour ${pattern}:`, error);
            }
        }

        return c.json({
            success: true,
            fileId: uploadInfo.file_id,
            size: object.size,
            url: `/api/files/${uploadInfo.category}/${uploadInfo.file_id}`
        });
    } catch (error) {
        console.error('❌ Complete upload error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error('❌ Error details:', { message: errorMessage, stack: errorStack });
        return c.json({ 
            error: 'Internal server error',
            message: errorMessage 
        }, 500);
    }
});

// Lier un utilisateur à un fichier existant (UNIQUEMENT pour la déduplication)
// Les nouveaux uploads sont automatiquement liés par le serveur dans completeMultipartUpload
app.post('/api/upload/link', async (c) => {
    try {
        const body = await c.req.json().catch(() => null);
        
        if (!body) {
            return c.json({ error: 'Invalid JSON body' }, 400);
        }
        
        const { fileId, userId } = body;

        if (!fileId || !userId) {
            return c.json({ error: 'Missing fileId or userId' }, 400);
        }

        // Vérifier que le fichier existe dans la table files
        const file = await c.env.DATABASE.prepare(
            `SELECT file_id FROM files WHERE file_id = ?`
        ).bind(fileId).first() as { file_id: string } | null;

        if (!file) {
            // Fichier non trouvé - retourner 200 avec success: false
            // (le fichier peut être en cours de création par completeMultipartUpload)
            // Le client retry automatiquement dans ce cas
            return c.json({ success: false, error: 'File not found', fileId }, 200);
        }
        
        // Vérifier si la liaison existe déjà
        const existingLink = await c.env.DATABASE.prepare(
            `SELECT user_id, file_id FROM user_files WHERE user_id = ? AND file_id = ?`
        ).bind(userId, fileId).first();
        
        if (existingLink) {
            // Liaison déjà existante - retourner succès
            return c.json({ success: true, alreadyLinked: true });
        }

        // Lier l'utilisateur au fichier
        const linkResult = await c.env.DATABASE.prepare(
            `INSERT OR IGNORE INTO user_files (user_id, file_id, uploaded_at) VALUES (?, ?, ?)`
        ).bind(userId, fileId, Math.floor(Date.now() / 1000)).run();

        if (!linkResult.success) {
            return c.json({ success: false, error: 'Failed to create link' }, 200);
        }

        return c.json({ success: true });
    } catch (error) {
        return c.json({ success: false, error: 'Internal server error' }, 200);
    }
});

// Récupérer les fichiers d'un utilisateur (avec filtrage optionnel par catégorie)
app.get('/api/upload/user/:userId', async (c) => {
    try {
        const userId = c.req.param('userId');
        const category = c.req.query('category') || null;
        
        // Vérifier si on peut utiliser le cache
        const cache = caches.default;
        const cacheKey = generateCacheKey(userId, 'files', { category });
        
        // Vérifier l'ETag de la requête
        const ifNoneMatch = c.req.header('If-None-Match');
        
        // Essayer de récupérer depuis le cache Edge
        if (canCache(c.req.raw, userId)) {
            const cachedResponse = await getFromCache(cache, cacheKey);
            
            if (cachedResponse) {
                const etag = cachedResponse.headers.get('ETag');
                
                // Si l'ETag correspond, retourner 304 Not Modified
                if (ifNoneMatch && etag && ifNoneMatch === etag) {
                    return c.body(null, 304);
                }
                
                // Servir depuis le cache
                console.log(`[CACHE] Hit: ${cacheKey}`);
                const cachedData = await cachedResponse.json();
                return c.json(cachedData, 200, {
                    'ETag': etag || '',
                    'Cache-Control': cachedResponse.headers.get('Cache-Control') || '',
                    'Vary': 'Authorization',
                });
            }
        }

        // Essayer d'abord avec album_thumbnails (nouvelle colonne)
        // Si la colonne n'existe pas, fallback sur une requête sans cette colonne
        let             query = `SELECT f.*, uf.uploaded_at,
                    fm.thumbnail_r2_path, fm.thumbnail_url, fm.backdrop_url,
                    fm.source_id, fm.source_api,
                    fm.title, fm.artists, fm.albums, fm.album_thumbnails,
                    fm.year, fm.genres, fm.subgenres, fm.season, fm.episode, fm.description, fm.episode_description
             FROM files f
                      JOIN user_files uf ON f.file_id = uf.file_id
                      LEFT JOIN file_metadata fm ON f.file_id = fm.file_id
             WHERE uf.user_id = ?`;
        
        let bindParams: any[] = [userId];
        
        if (category && category !== 'all') {
            query += ` AND f.category = ?`;
            bindParams.push(category);
        }
        
        query += ` ORDER BY COALESCE(f.file_created_at, uf.uploaded_at) DESC`;

        let files;
        try {
            files = await c.env.DATABASE.prepare(query).bind(...bindParams).all();
        } catch (queryError) {
            // Si file_created_at ou album_thumbnails n'existe pas, essayer sans
            const errorMsg = queryError instanceof Error ? queryError.message : String(queryError);
            if (errorMsg.includes('album_thumbnails') || errorMsg.includes('file_created_at') || errorMsg.includes('no such column')) {
                query = `SELECT f.*, uf.uploaded_at,
                        fm.thumbnail_r2_path, fm.thumbnail_url, fm.backdrop_url,
                        fm.source_id, fm.source_api,
                        fm.title, fm.artists, fm.albums, NULL as album_thumbnails,
                        fm.year, fm.genres, fm.subgenres, fm.season, fm.episode, fm.description, fm.episode_description
                 FROM files f
                          JOIN user_files uf ON f.file_id = uf.file_id
                          LEFT JOIN file_metadata fm ON f.file_id = fm.file_id
                 WHERE uf.user_id = ?`;
                
                if (category && category !== 'all') {
                    query += ` AND f.category = ?`;
                }
                
                query += ` ORDER BY uf.uploaded_at DESC`;
                files = await c.env.DATABASE.prepare(query).bind(...bindParams).all();
            } else {
                throw queryError;
            }
        }

        const responseData = { files: files.results };
        const response = c.json(responseData);
        
        // Mettre en cache la réponse
        if (canCache(c.req.raw, userId)) {
            const responseText = JSON.stringify(responseData);
            const etag = generateETag(responseText);
            
            // Ajouter l'ETag à la réponse
            response.headers.set('ETag', etag);
            response.headers.set('Vary', 'Authorization');
            
            // Mettre en cache avec TTL approprié
            await putInCache(
                cache,
                cacheKey,
                response.clone(),
                CACHE_TTL.USER_FILES,
                {
                    etag,
                    cacheTags: [`user:${userId}`, category ? `category:${category}` : 'category:all'].filter(Boolean),
                    vary: ['Authorization'],
                }
            );
        }
        
        return response;
    } catch (error) {
        console.error('❌ Get user files error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error('❌ Error details:', {
            message: errorMessage,
            stack: errorStack,
            userId: c.req.param('userId'),
            category: c.req.query('category')
        });
        return c.json({ 
            error: 'Internal server error',
            message: errorMessage,
            details: errorStack ? errorStack.substring(0, 500) : undefined
        }, 500);
    }
});

// Récupérer les statistiques d'un utilisateur (nombre de fichiers et taille totale)
app.get('/api/stats', async (c) => {
    try {
        // Vérifier l'authentification
        const authHeader = c.req.header('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        // Récupérer l'userId depuis les query params (le client le passera)
        const userId = c.req.query('userId');
        if (!userId) {
            return c.json({ error: 'Missing userId' }, 400);
        }

        // Vérifier le cache Edge
        const cache = caches.default;
        const cacheKey = generateCacheKey(userId, 'stats');
        const ifNoneMatch = c.req.header('If-None-Match');
        
        if (canCache(c.req.raw, userId)) {
            const cachedResponse = await getFromCache(cache, cacheKey);
            
            if (cachedResponse) {
                const etag = cachedResponse.headers.get('ETag');
                
                if (ifNoneMatch && etag && ifNoneMatch === etag) {
                    return c.body(null, 304);
                }
                
                console.log(`[CACHE] Hit: ${cacheKey}`);
                const cachedData = await cachedResponse.json();
                return c.json(cachedData, 200, {
                    'ETag': etag || '',
                    'Cache-Control': cachedResponse.headers.get('Cache-Control') || '',
                    'Vary': 'Authorization',
                });
            }
        }

        // Compter le nombre de fichiers
        const countResult = await c.env.DATABASE.prepare(
            `SELECT COUNT(*) as count
             FROM user_files
             WHERE user_id = ?`
        ).bind(userId).first() as { count: number } | null;

        const fileCount = countResult?.count || 0;

        // Calculer la taille totale
        const sizeResult = await c.env.DATABASE.prepare(
            `SELECT COALESCE(SUM(f.size), 0) as total_size
             FROM files f
             JOIN user_files uf ON f.file_id = uf.file_id
             WHERE uf.user_id = ?`
        ).bind(userId).first() as { total_size: number } | null;

        const totalSize = sizeResult?.total_size || 0;
        const totalSizeGB = totalSize / (1024 * 1024 * 1024);
        // Arrondir à la hausse au Go supérieur (facturation)
        const billableGB = Math.ceil(totalSizeGB);

        const responseData = {
            fileCount,
            totalSizeBytes: totalSize,
            totalSizeGB: totalSizeGB,
            billableGB: billableGB
        };
        
        // /api/stats contient billableGB (facturation) - jamais en cache selon doc
        // Headers no-cache explicites pour empêcher cache navigateur
        const response = c.json(responseData, 200, {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
        });
        
        // Ce bloc ne sera jamais exécuté car canCache() retourne false pour /api/stats
        if (canCache(c.req.raw, userId)) {
            const responseText = JSON.stringify(responseData);
            const etag = generateETag(responseText);
            
            response.headers.set('ETag', etag);
            response.headers.set('Vary', 'Authorization');
            
            await putInCache(
                cache,
                cacheKey,
                response.clone(),
                CACHE_TTL.USER_STATS,
                {
                    etag,
                    cacheTags: [`user:${userId}`],
                    vary: ['Authorization'],
                }
            );
        }
        
        return response;
    } catch (error) {
        console.error('Stats error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// Récupérer les détails d'un fichier (pour la page de sélection)
app.get('/api/files/:category/:fileId/info', async (c) => {
    try {
        const category = c.req.param('category');
        const fileId = c.req.param('fileId');
        
        // Vérifier le cache Edge
        const cache = caches.default;
        const cacheKey = generateCacheKey(null, 'file:info', { fileId, category });
        const ifNoneMatch = c.req.header('If-None-Match');
        
        if (canCache(c.req.raw, null)) {
            const cachedResponse = await getFromCache(cache, cacheKey);
            
            if (cachedResponse) {
                const etag = cachedResponse.headers.get('ETag');
                
                if (ifNoneMatch && etag && ifNoneMatch === etag) {
                    return c.body(null, 304);
                }
                
                console.log(`[CACHE] Hit: ${cacheKey}`);
                const cachedData = await cachedResponse.json();
                return c.json(cachedData, 200, {
                    'ETag': etag || '',
                    'Cache-Control': cachedResponse.headers.get('Cache-Control') || '',
                });
            }
        }

        // Récupérer les informations du fichier depuis D1
        const file = await c.env.DATABASE.prepare(
            `SELECT f.*, fm.* 
             FROM files f
             LEFT JOIN file_metadata fm ON f.file_id = fm.file_id
             WHERE f.file_id = ? AND f.category = ?`
        ).bind(fileId, category).first();

        if (!file) {
            return c.json({ error: 'File not found' }, 404);
        }

        const responseData = { file };
        const response = c.json(responseData);
        
        // Mettre en cache
        if (canCache(c.req.raw, null)) {
            const responseText = JSON.stringify(responseData);
            const etag = generateETag(responseText);
            
            response.headers.set('ETag', etag);
            
            await putInCache(
                cache,
                cacheKey,
                response.clone(),
                CACHE_TTL.FILE_INFO,
                {
                    etag,
                    cacheTags: [`file:${fileId}`, `category:${category}`],
                }
            );
        }
        
        return response;
    } catch (error) {
        console.error('Get file details error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

app.get('/api/files/:category/:fileId/:filename', async (c) => {
    try {
        const category = c.req.param('category');
        const fileId = c.req.param('fileId');
        const filename = c.req.param('filename');

        const object = await c.env.STORAGE.get(`${category}/${fileId}/${filename}`);

        if (!object) {
            return c.json({ error: 'File not found' }, 404);
        }

        const headers = new Headers();
        headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        headers.set('Access-Control-Allow-Origin', '*');

        if (object.httpMetadata?.contentDisposition) {
            headers.set('Content-Disposition', object.httpMetadata.contentDisposition);
        }

        return new Response(object.body, { headers });
    } catch (error) {
        console.error('Get file error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// Route pour les fichiers principaux
// Servir les miniatures stockées dans R2
app.get('/api/files/:category/:fileId/thumbnail', async (c) => {
    try {
        const category = c.req.param('category');
        const fileId = c.req.param('fileId');
        
        // Vérifier le cache Edge
        const cache = caches.default;
        const cacheKey = generateCacheKey(null, 'thumbnail', { fileId, category });
        const ifNoneMatch = c.req.header('If-None-Match');
        
        if (canCache(c.req.raw, null)) {
            const cachedResponse = await getFromCache(cache, cacheKey);
            
            if (cachedResponse) {
                const etag = cachedResponse.headers.get('ETag');
                
                if (ifNoneMatch && etag && ifNoneMatch === etag) {
                    return c.body(null, 304);
                }
                
                console.log(`[CACHE] Hit: ${cacheKey}`);
                return new Response(cachedResponse.body, {
                    status: cachedResponse.status,
                    headers: Object.fromEntries(cachedResponse.headers.entries()),
                });
            }
        }
        
        // Récupérer les métadonnées de la miniature depuis la base de données
        const metadata = await c.env.DATABASE.prepare(
            `SELECT thumbnail_r2_path, thumbnail_url FROM file_metadata WHERE file_id = ?`
        ).bind(fileId).first() as { thumbnail_r2_path: string | null; thumbnail_url: string | null } | null;
        
        let imageResponse: Response | null = null;
        let contentType = 'image/jpeg';
        
        // 1. Essayer d'abord de récupérer depuis R2 si le chemin est stocké
        if (metadata?.thumbnail_r2_path) {
            const object = await c.env.STORAGE.get(metadata.thumbnail_r2_path);
            if (object) {
                contentType = object.httpMetadata?.contentType || 'image/jpeg';
                const imageBuffer = await object.arrayBuffer();
                imageResponse = new Response(imageBuffer, {
                    headers: {
                        'Content-Type': contentType,
                        'Access-Control-Allow-Origin': '*',
                    }
                });
            }
        }
        
        // 2. Fallback : essayer différentes extensions de miniatures dans R2
        if (!imageResponse) {
            const extensions = ['jpeg', 'jpg', 'png', 'webp'];
            for (const ext of extensions) {
                const testPath = `${category}/${fileId}/thumbnail.${ext}`;
                const testObject = await c.env.STORAGE.get(testPath);
                if (testObject) {
                    contentType = testObject.httpMetadata?.contentType || 'image/jpeg';
                    const imageBuffer = await testObject.arrayBuffer();
                    imageResponse = new Response(imageBuffer, {
                        headers: {
                            'Content-Type': contentType,
                            'Access-Control-Allow-Origin': '*',
                        }
                    });
                    break;
                }
            }
        }
        
        // 3. Fallback final : utiliser thumbnail_url directement (proxy via le serveur pour éviter CORS)
        if (!imageResponse && metadata?.thumbnail_url) {
            try {
                const externalResponse = await fetch(metadata.thumbnail_url);
                if (externalResponse.ok) {
                    const imageBuffer = await externalResponse.arrayBuffer();
                    contentType = externalResponse.headers.get('content-type') || 'image/jpeg';
                    imageResponse = new Response(imageBuffer, {
                        headers: {
                            'Content-Type': contentType,
                            'Access-Control-Allow-Origin': '*',
                        }
                    });
                }
            } catch (fetchError) {
                console.warn('❌ Erreur lors du proxy de thumbnail_url:', fetchError);
            }
        }
        
        if (!imageResponse) {
            return c.json({ 
                error: 'Thumbnail not found',
                debug: {
                    fileId,
                    category,
                    hasMetadata: !!metadata,
                    thumbnail_r2_path: metadata?.thumbnail_r2_path || null,
                    thumbnail_url: metadata?.thumbnail_url || null
                }
            }, 404);
        }
        
        // Générer ETag basé sur le contenu
        const imageBuffer = await imageResponse.clone().arrayBuffer();
        const etag = generateETag(new Uint8Array(imageBuffer));
        
        // Créer la réponse finale avec headers de cache
        const headers = new Headers(imageResponse.headers);
        headers.set('Cache-Control', 'public, max-age=604800, s-maxage=2592000, immutable');
        headers.set('ETag', etag);
        headers.set('Access-Control-Allow-Origin', '*');
        
        const finalResponse = new Response(imageBuffer, {
            status: 200,
            headers: headers,
        });
        
        // Mettre en cache
        if (canCache(c.req.raw, null)) {
            await putInCache(
                cache,
                cacheKey,
                finalResponse.clone(),
                CACHE_TTL.THUMBNAIL,
                {
                    etag,
                    cacheTags: [`file:${fileId}`, `category:${category}`],
                }
            );
        }
        
        return finalResponse;
    } catch (error) {
        console.error('[THUMBNAIL] ❌ Get thumbnail error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

app.get('/api/files/:category/:fileId', async (c) => {
    try {
        const category = c.req.param('category');
        const fileId = c.req.param('fileId');

        // Récupérer l'extension du fichier à partir du fileId
        const fileExtension = fileId.split('.').pop() || 'bin';

        // Récupérer l'en-tête Range pour le streaming
        const rangeHeader = c.req.header('Range');
        const r2Path = `${category}/${fileId}/content.${fileExtension}`;

        let object;

        if (rangeHeader) {
            // Parser l'en-tête Range (format: bytes=start-end)
            const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            if (!matches) {
                // Format Range invalide, retourner tout le fichier
                object = await c.env.STORAGE.get(r2Path);
                if (!object) {
                    return c.json({ error: 'File not found' }, 404);
                }
                const headers = new Headers();
                headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
                headers.set('Cache-Control', 'public, max-age=31536000, immutable');
                headers.set('Access-Control-Allow-Origin', '*');
                headers.set('Accept-Ranges', 'bytes');
                if (object.size) {
                    headers.set('Content-Length', String(object.size));
                }
                return new Response(object.body, { headers });
            }

            const start = parseInt(matches[1], 10);
            let end = matches[2] ? parseInt(matches[2], 10) : undefined;

            // Récupérer les métadonnées du fichier pour connaître la taille
            const headObject = await c.env.STORAGE.head(r2Path);
            if (!headObject) {
                return c.json({ error: 'File not found' }, 404);
            }

            const fileSize = headObject.size;
            end = end !== undefined ? end : fileSize - 1;

            // Récupérer seulement la partie demandée
            object = await c.env.STORAGE.get(r2Path, {
                range: {
                    offset: start,
                    length: end - start + 1
                }
            });

            if (!object) {
                return c.json({ error: 'File not found' }, 404);
            }

            const headers = new Headers();
            headers.set('Content-Type', object.httpMetadata?.contentType || headObject.httpMetadata?.contentType || 'application/octet-stream');
            headers.set('Cache-Control', 'public, max-age=31536000, immutable');
            headers.set('Access-Control-Allow-Origin', '*');
            headers.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
            headers.set('Accept-Ranges', 'bytes');
            headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            headers.set('Content-Length', String(end - start + 1));

            return new Response(object.body, {
                status: 206,
                headers
            });
        } else {
            // Pas de requête Range, retourner tout le fichier
            object = await c.env.STORAGE.get(r2Path);

        if (!object) {
            return c.json({ error: 'File not found' }, 404);
        }

        const headers = new Headers();
        headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
            headers.set('Access-Control-Allow-Origin', '*');
            headers.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
            headers.set('Accept-Ranges', 'bytes');
            if (object.size) {
                headers.set('Content-Length', String(object.size));
            }

        return new Response(object.body, { headers });
        }
    } catch (error) {
        console.error('Get file error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// Supprimer un fichier (retirer le lien user_files, et supprimer le fichier si plus personne ne l'utilise)
app.delete('/api/files/:category/:fileId', async (c) => {
    try {
        // Vérifier l'authentification
        const authHeader = c.req.header('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const category = c.req.param('category');
        const fileId = c.req.param('fileId');
        const userId = c.req.query('userId');

        if (!userId) {
            return c.json({ error: 'Missing userId' }, 400);
        }

        // Vérifier que le fichier existe et appartient à l'utilisateur
        const userFile = await c.env.DATABASE.prepare(
            `SELECT uf.file_id, f.category, f.hash
             FROM user_files uf
             JOIN files f ON uf.file_id = f.file_id
             WHERE uf.user_id = ? AND uf.file_id = ?`
        ).bind(userId, fileId).first() as { file_id: string; category: string; hash: string } | null;

        if (!userFile) {
            return c.json({ error: 'File not found or not owned by user' }, 404);
        }

        // Supprimer le lien user_files
        await c.env.DATABASE.prepare(
            `DELETE FROM user_files WHERE user_id = ? AND file_id = ?`
        ).bind(userId, fileId).run();

        // Vérifier si d'autres utilisateurs utilisent encore ce fichier
        const otherUsers = await c.env.DATABASE.prepare(
            `SELECT COUNT(*) as count FROM user_files WHERE file_id = ?`
        ).bind(fileId).first() as { count: number } | null;

        const hasOtherUsers = (otherUsers?.count || 0) > 0;

        // Si personne d'autre n'utilise le fichier, le supprimer complètement
        if (!hasOtherUsers) {
            // Récupérer l'extension du fichier
            const fileExtension = fileId.split('.').pop() || 'bin';
            const r2Path = `${category}/${fileId}/content.${fileExtension}`;

            // Supprimer de R2
            try {
                await c.env.STORAGE.delete(r2Path);
            } catch (r2Error) {
                console.warn('Erreur lors de la suppression R2 (peut être déjà supprimé):', r2Error);
            }

            // Supprimer de la table files
            await c.env.DATABASE.prepare(
                `DELETE FROM files WHERE file_id = ?`
            ).bind(fileId).run();
        }

        // Invalider le cache Edge après suppression
        const cache = caches.default;
        const patternsToInvalidate = [
            generateCacheKey(userId, 'files', { category }),
            generateCacheKey(userId, 'stats'),
            generateCacheKey(null, 'file:info', { fileId, category }),
            generateCacheKey(null, 'thumbnail', { fileId, category }),
        ];
        
        for (const pattern of patternsToInvalidate) {
            try {
                await invalidateCache(cache, pattern);
            } catch (error) {
                console.warn(`⚠️ Erreur invalidation cache Edge pour ${pattern}:`, error);
            }
        }

        return c.json({ success: true, deleted: !hasOtherUsers });
    } catch (error) {
        console.error('Delete file error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

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

// Endpoint pour télécharger et stocker les miniatures
app.post('/api/media/thumbnail', async (c) => {
    try {
        const { imageUrl, fileId, category } = await c.req.json();

        if (!imageUrl || !fileId || !category) {
            return c.json({ error: 'Missing parameters' }, 400);
        }

        const thumbnailR2Path = await downloadAndStoreThumbnailInternal(imageUrl, fileId, category, c.env.STORAGE);
        
        if (!thumbnailR2Path) {
            return c.json({ error: 'Failed to download or store thumbnail' }, 500);
        }

        return c.json({ 
            thumbnail_r2_path: thumbnailR2Path,
            url: `/api/files/${category}/${fileId}/thumbnail`
        });
    } catch (error) {
        console.error('📸 [THUMBNAIL] ❌ Erreur:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// Endpoint pour stocker les métadonnées enrichies
// Fonction pour nettoyer les chaînes de caractères (retirer crochets, guillemets, accolades)
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
            // Si le parsing échoue, essayer de nettoyer manuellement
            cleaned = cleaned.replace(/^\["?|"?\]$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, '');
        }
    }
    
    // Si c'est un JSON object, essayer d'extraire une valeur utile
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
        try {
            const parsed = JSON.parse(cleaned);
            if (typeof parsed === 'object' && parsed !== null) {
                // Essayer de trouver une valeur string dans l'objet
                const firstStringValue = Object.values(parsed).find(v => typeof v === 'string');
                if (firstStringValue) {
                    cleaned = String(firstStringValue);
                }
            }
        } catch {
            // Si le parsing échoue, essayer de nettoyer manuellement
            cleaned = cleaned.replace(/^\{|^\}|"|'/g, '');
        }
    }
    
    // Retirer les guillemets, crochets et accolades au début/fin
    cleaned = cleaned.replace(/^["'\[\{]+|["'\]\}]+$/g, '');
    
    // Retirer les virgules en trop au début/fin
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
                // Si c'est un objet, essayer d'extraire une valeur string
                const firstStringValue = Object.values(item).find(v => typeof v === 'string');
                return firstStringValue ? cleanString(String(firstStringValue)) : null;
            }
            return null;
        })
        .filter((item): item is string => item !== null && item.length > 0);
    return cleaned.length > 0 ? cleaned : null;
}

app.post('/api/files/:fileId/metadata', async (c) => {
    try {
        const fileId = c.req.param('fileId');
        
        const metadata = await c.req.json();

        // Vérifier que le fichier existe
        const file = await c.env.DATABASE.prepare(
            `SELECT file_id FROM files WHERE file_id = ?`
        ).bind(fileId).first();

        if (!file) {
            console.warn(`⚠️ [METADATA] Fichier non trouvé: ${fileId}`);
            return c.json({ error: 'File not found', fileId }, 404);
        }

        // Nettoyer toutes les valeurs textuelles avant sauvegarde
        const cleanedTitle = metadata.title ? cleanString(metadata.title) : null;
        const cleanedDescription = metadata.description ? cleanString(metadata.description) : null;
        const cleanedEpisodeDescription = metadata.episode_description ? cleanString(metadata.episode_description) : null;
        
        // Nettoyer les tableaux d'artistes et d'albums
        let cleanedArtists: string[] | null = null;
        if (metadata.artists) {
            if (typeof metadata.artists === 'string') {
                try {
                    const parsed = JSON.parse(metadata.artists);
                    cleanedArtists = cleanStringArray(Array.isArray(parsed) ? parsed : [parsed]);
                } catch {
                    // Si ce n'est pas du JSON, traiter comme une chaîne simple
                    const cleaned = cleanString(metadata.artists);
                    cleanedArtists = cleaned ? [cleaned] : null;
                }
            } else if (Array.isArray(metadata.artists)) {
                cleanedArtists = cleanStringArray(metadata.artists);
            }
        }
        
        let cleanedAlbums: string[] | null = null;
        if (metadata.albums) {
            if (typeof metadata.albums === 'string') {
                try {
                    const parsed = JSON.parse(metadata.albums);
                    cleanedAlbums = cleanStringArray(Array.isArray(parsed) ? parsed : [parsed]);
                } catch {
                    // Si ce n'est pas du JSON, traiter comme une chaîne simple
                    const cleaned = cleanString(metadata.albums);
                    cleanedAlbums = cleaned ? [cleaned] : null;
                }
            } else if (Array.isArray(metadata.albums)) {
                cleanedAlbums = cleanStringArray(metadata.albums);
            }
        }

        // Essayer d'abord avec album_thumbnails (nouvelle colonne)
        // Si la colonne n'existe pas, fallback sur une requête sans cette colonne
        let result;
        try {
            result = await c.env.DATABASE.prepare(`
                INSERT OR REPLACE INTO file_metadata (
                    file_id, thumbnail_url, backdrop_url, thumbnail_r2_path, source_api, source_id,
                    genres, subgenres, season, episode, artists, albums, album_thumbnails, title, year, description, episode_description
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                fileId,
                metadata.thumbnail_url || null,
                metadata.backdrop_url || null,
                metadata.thumbnail_r2_path || null,
                metadata.source_api || null,
                metadata.source_id || null,
                metadata.genres ? JSON.stringify(metadata.genres) : null,
                metadata.subgenres ? JSON.stringify(metadata.subgenres) : null,
                metadata.season || null,
                metadata.episode || null,
                cleanedArtists ? JSON.stringify(cleanedArtists) : null,
                cleanedAlbums ? JSON.stringify(cleanedAlbums) : null,
                metadata.album_thumbnails ? JSON.stringify(metadata.album_thumbnails) : null,
                cleanedTitle,
                metadata.year || null,
                cleanedDescription,
                cleanedEpisodeDescription
            ).run();
        } catch (insertError) {
            // Si la colonne album_thumbnails n'existe pas, essayer sans
            const errorMsg = insertError instanceof Error ? insertError.message : String(insertError);
            console.warn(`⚠️ [METADATA] Erreur avec album_thumbnails, essai sans cette colonne:`, errorMsg);
            if (errorMsg.includes('album_thumbnails') || errorMsg.includes('no such column')) {
                result = await c.env.DATABASE.prepare(`
                    INSERT OR REPLACE INTO file_metadata (
                        file_id, thumbnail_url, backdrop_url, thumbnail_r2_path, source_api, source_id,
                        genres, subgenres, season, episode, artists, albums, title, year, description, episode_description
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    fileId,
                    metadata.thumbnail_url || null,
                    metadata.backdrop_url || null,
                    metadata.thumbnail_r2_path || null,
                    metadata.source_api || null,
                    metadata.source_id || null,
                    metadata.genres ? JSON.stringify(metadata.genres) : null,
                    metadata.subgenres ? JSON.stringify(metadata.subgenres) : null,
                    metadata.season || null,
                    metadata.episode || null,
                    cleanedArtists ? JSON.stringify(cleanedArtists) : null,
                    cleanedAlbums ? JSON.stringify(cleanedAlbums) : null,
                    cleanedTitle,
                    metadata.year || null,
                    cleanedDescription,
                    cleanedEpisodeDescription
                ).run();
            } else {
                throw insertError;
            }
        }

        if (result.success) {
        } else {
            console.error(`❌ [METADATA] Échec insertion métadonnées pour ${fileId}:`, result);
            return c.json({ error: 'Failed to save metadata', details: result }, 500);
        }

        // Invalider le cache Edge après mise à jour métadonnées
        const cache = caches.default;
        // Récupérer la catégorie du fichier pour invalidation
        const fileInfo = await c.env.DATABASE.prepare(
            `SELECT category FROM files WHERE file_id = ?`
        ).bind(fileId).first() as { category: string } | null;
        
        const category = fileInfo?.category || null;
        const patternsToInvalidate = [
            generateCacheKey(null, 'file:info', { fileId, category }),
        ];
        
        for (const pattern of patternsToInvalidate) {
            try {
                await invalidateCache(cache, pattern);
            } catch (error) {
                console.warn(`⚠️ Erreur invalidation cache Edge pour ${pattern}:`, error);
            }
        }

        return c.json({ success: true });
    } catch (error) {
        console.error(`❌ [METADATA] Erreur stockage métadonnées:`, error);
        return c.json({ 
            error: 'Internal server error', 
            details: error instanceof Error ? error.message : String(error) 
        }, 500);
    }
});

export default app;