// INFO : workers/upload.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './types';

const app = new Hono<{ Bindings: Bindings }>();

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
        const body = await c.req.json();
        const { uploadId, parts, filename, basicMetadata } = body;

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
                { name: 'mime_type', type: 'TEXT' }
            ];
            
            // Créer la table file_metadata pour les métadonnées enrichies
            try {
                await c.env.DATABASE.prepare(`
                    CREATE TABLE IF NOT EXISTS file_metadata (
                        file_id TEXT PRIMARY KEY,
                        thumbnail_url TEXT,
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
                        created_at INTEGER,
                        updated_at INTEGER,
                        FOREIGN KEY (file_id) REFERENCES files(file_id)
                    )
                `).run();
                
                // Migrations : ajouter les colonnes manquantes pour file_metadata
                const fileMetadataColumnsToAdd = [
                    { name: 'created_at', type: 'INTEGER' },
                    { name: 'updated_at', type: 'INTEGER' },
                    { name: 'album_thumbnails', type: 'TEXT' }
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
                const insertResult = await c.env.DATABASE.prepare(
            `INSERT OR REPLACE INTO files 
       (file_id, user_id, category, size, mime_type, hash, filename, r2_path, url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            Math.floor(Date.now() / 1000)
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
        const category = c.req.query('category');

        // Essayer d'abord avec album_thumbnails (nouvelle colonne)
        // Si la colonne n'existe pas, fallback sur une requête sans cette colonne
        let query = `SELECT f.*, uf.uploaded_at,
                    fm.thumbnail_r2_path, fm.thumbnail_url,
                    fm.source_id, fm.source_api,
                    fm.title, fm.artists, fm.albums, fm.album_thumbnails,
                    fm.year
             FROM files f
                      JOIN user_files uf ON f.file_id = uf.file_id
                      LEFT JOIN file_metadata fm ON f.file_id = fm.file_id
             WHERE uf.user_id = ?`;
        
        let bindParams: any[] = [userId];
        
        if (category && category !== 'all') {
            query += ` AND f.category = ?`;
            bindParams.push(category);
        }
        
        query += ` ORDER BY uf.uploaded_at DESC`;

        let files;
        try {
            files = await c.env.DATABASE.prepare(query).bind(...bindParams).all();
        } catch (queryError) {
            // Si la colonne album_thumbnails n'existe pas, essayer sans
            const errorMsg = queryError instanceof Error ? queryError.message : String(queryError);
            if (errorMsg.includes('album_thumbnails') || errorMsg.includes('no such column')) {
                query = `SELECT f.*, uf.uploaded_at,
                        fm.thumbnail_r2_path, fm.thumbnail_url,
                        fm.source_id, fm.source_api,
                        fm.title, fm.artists, fm.albums, NULL as album_thumbnails,
                        fm.year
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

        // Log pour debug : vérifier si album_thumbnails est présent dans les résultats
        if (files.results && files.results.length > 0) {
            // Les fichiers musicaux sont filtrés et retournés dans la réponse
        }

        return c.json({ files: files.results });
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

        return c.json({
            fileCount,
            totalSizeBytes: totalSize,
            totalSizeGB: totalSizeGB,
            billableGB: billableGB
        });
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

        return c.json({ file });
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
    // Log immédiat pour vérifier que l'endpoint est appelé
    
    try {
        const category = c.req.param('category');
        const fileId = c.req.param('fileId');
        
        
        // Récupérer les métadonnées de la miniature depuis la base de données
        const metadata = await c.env.DATABASE.prepare(
            `SELECT thumbnail_r2_path, thumbnail_url FROM file_metadata WHERE file_id = ?`
        ).bind(fileId).first() as { thumbnail_r2_path: string | null; thumbnail_url: string | null } | null;
        
        // 1. Essayer d'abord de récupérer depuis R2 si le chemin est stocké
        if (metadata?.thumbnail_r2_path) {
            const object = await c.env.STORAGE.get(metadata.thumbnail_r2_path);
            if (object) {
                const headers = new Headers();
                headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
                headers.set('Cache-Control', 'public, max-age=31536000, immutable');
                headers.set('Access-Control-Allow-Origin', '*');
                return new Response(object.body, { headers });
            } else {
            }
        }
        
        // 2. Fallback : essayer différentes extensions de miniatures dans R2
        const extensions = ['jpeg', 'jpg', 'png', 'webp']; // jpeg en premier car c'est ce qui est stocké parfois
        for (const ext of extensions) {
            const testPath = `${category}/${fileId}/thumbnail.${ext}`;
            const testObject = await c.env.STORAGE.get(testPath);
            if (testObject) {
                const headers = new Headers();
                headers.set('Content-Type', testObject.httpMetadata?.contentType || 'image/jpeg');
                headers.set('Cache-Control', 'public, max-age=31536000, immutable');
                headers.set('Access-Control-Allow-Origin', '*');
                return new Response(testObject.body, { headers });
            }
        }
        
        // 3. Fallback final : utiliser thumbnail_url directement (proxy via le serveur pour éviter CORS)
        if (metadata?.thumbnail_url) {
            try {
                const imageResponse = await fetch(metadata.thumbnail_url);
                if (imageResponse.ok) {
                    const imageBuffer = await imageResponse.arrayBuffer();
                    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
                    
                    const headers = new Headers();
                    headers.set('Content-Type', contentType);
                    headers.set('Cache-Control', 'public, max-age=86400'); // 1 jour pour les URLs externes
                    headers.set('Access-Control-Allow-Origin', '*');
                    
                    return new Response(imageBuffer, { headers });
                } else {
                }
            } catch (fetchError) {
                console.warn('❌ Erreur lors du proxy de thumbnail_url:', fetchError);
            }
        }
        
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

        return c.json({ success: true, deleted: !hasOtherUsers });
    } catch (error) {
        console.error('Delete file error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

// Endpoint pour télécharger et stocker les miniatures
app.post('/api/media/thumbnail', async (c) => {
    try {
        const { imageUrl, fileId, category } = await c.req.json();

        if (!imageUrl || !fileId || !category) {
            return c.json({ error: 'Missing parameters' }, 400);
        }

        let imageBuffer: ArrayBuffer;
        let contentType: string;

        // Vérifier si c'est une data URL (extraction depuis métadonnées audio ID3)
        if (imageUrl.startsWith('data:')) {
            // Extraire le MIME type et les données base64
            const dataUrlMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!dataUrlMatch) {
                return c.json({ error: 'Invalid data URL format' }, 400);
            }
            
            contentType = dataUrlMatch[1];
            const base64Data = dataUrlMatch[2];
            
            // Décoder la base64 en ArrayBuffer
            // Dans Cloudflare Workers, on peut utiliser atob() puis convertir en Uint8Array
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
                return c.json({ error: 'Failed to download image' }, 400);
            }

            imageBuffer = await imageResponse.arrayBuffer();
            contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        }

        // Stocker dans R2
        // Normaliser l'extension : jpeg -> jpg
        let ext = contentType.split('/')[1] || 'jpg';
        if (ext === 'jpeg') ext = 'jpg';
        const thumbnailR2Path = `${category}/${fileId}/thumbnail.${ext}`;
        await c.env.STORAGE.put(thumbnailR2Path, imageBuffer, {
            httpMetadata: {
                contentType: contentType,
                cacheControl: 'public, max-age=31536000, immutable'
            }
        });


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
                    file_id, thumbnail_url, thumbnail_r2_path, source_api, source_id,
                    genres, subgenres, season, episode, artists, albums, album_thumbnails, title, year, description
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                fileId,
                metadata.thumbnail_url || null,
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
                cleanedDescription
            ).run();
        } catch (insertError) {
            // Si la colonne album_thumbnails n'existe pas, essayer sans
            const errorMsg = insertError instanceof Error ? insertError.message : String(insertError);
            console.warn(`⚠️ [METADATA] Erreur avec album_thumbnails, essai sans cette colonne:`, errorMsg);
            if (errorMsg.includes('album_thumbnails') || errorMsg.includes('no such column')) {
                result = await c.env.DATABASE.prepare(`
                    INSERT OR REPLACE INTO file_metadata (
                        file_id, thumbnail_url, thumbnail_r2_path, source_api, source_id,
                        genres, subgenres, season, episode, artists, albums, title, year, description
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    fileId,
                    metadata.thumbnail_url || null,
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
                    cleanedDescription
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