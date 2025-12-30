// INFO : workers/upload.ts
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from './types';
import { getContentTypeFromKey, cleanKey } from './utils';

/**
 * Enregistre les routes d'upload / asset-check sur l'instance Hono fournie.
 * Utilisation : registerUploadRoutes(app);
 */
export function registerUploadRoutes(app: Hono<{ Bindings: Bindings; Variables: Variables }>) {

    // Route pour vérifier si un asset existe déjà
    app.get('/api/asset/check/:sha256', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
        try {
            const sha256 = c.req.param('sha256');
            console.log(`🔍 Vérification de l'asset: ${sha256}`);

            if (!sha256 || !/^[a-f0-9]{64}$/i.test(sha256)) {
                return c.json({ success: false, error: 'SHA-256 invalide' }, 400);
            }

            const folderKey = `videos/${sha256}`;

            // Vérifier l'existence de metadata.json
            const metadataKey = `${folderKey}/metadata.json`;
            const metadataObject = await c.env.STORAGE.get(metadataKey);

            if (metadataObject) {
                const metadata = JSON.parse(await metadataObject.text());
                const playlistKey = `${folderKey}/master.m3u8`;
                const playlistObject = await c.env.STORAGE.get(playlistKey);

                if (playlistObject) {
                    const hlsUrl = `/api/streaming/${playlistKey}`;
                    const dashUrl = `/api/streaming/${folderKey}/manifest.mpd`;

                    return c.json({
                        success: true,
                        exists: true,
                        sha256,
                        url: hlsUrl,
                        dashUrl: dashUrl,
                        metadata,
                        folder: folderKey
                    });
                }
            }

            // Si pas de metadata.json, lister le dossier pour compatibilité
            const objects = await c.env.STORAGE.list({ prefix: folderKey });

            if (objects.objects.length > 0) {
                let playlistUrl = '';
                let dashUrl = '';

                for (const obj of objects.objects) {
                    if (obj.key.endsWith('.m3u8')) {
                        playlistUrl = `/api/streaming/${obj.key}`;
                    } else if (obj.key.endsWith('.mpd')) {
                        dashUrl = `/api/streaming/${obj.key}`;
                    }
                }

                if (playlistUrl || dashUrl) {
                    return c.json({
                        success: true,
                        exists: true,
                        sha256,
                        url: playlistUrl || dashUrl,
                        dashUrl: dashUrl || playlistUrl,
                        folder: folderKey,
                        metadata: {
                            originalName: `Video ${sha256.substring(0, 8)}`,
                            size_bytes: objects.objects.reduce((sum, obj) => sum + obj.size, 0),
                            createdAt: new Date().toISOString()
                        }
                    });
                }
            }

            return c.json({
                success: true,
                exists: false,
                sha256,
                message: 'Asset non trouvé, upload requis'
            });

        } catch (err: any) {
            console.error('[asset/check] Erreur:', err);
            return c.json({ success: false, error: err.message || String(err) }, 500);
        }
    });

    // Upload-proxy (destiné à être utilisé depuis l'app Electron)
    app.put('/api/upload-proxy/:key', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
        const startTotal = Date.now();
        try {
            console.log(`📤 PUT /api/upload-proxy/:key - path=${c.req.path}`);

            // Vérifier l'authentification
            const user = c.get('user');
            if (!user || !user.uid) {
                return c.json({ success: false, error: 'Non authentifié' }, 401);
            }

            const uid = user.uid;
            const isFromElectron = c.req.header('X-Electron-App') === 'true';
            console.log(`📱 X-Electron-App header: ${c.req.header('X-Electron-App')}`);
            if (!isFromElectron) {
                console.warn('[upload-proxy PUT] Requête non autorisée (X-Electron-App manquant)');
                return c.json({ success: false, error: 'Requête non autorisée' }, 403);
            }

            const rawKey = decodeURIComponent(c.req.param('key') || 'upload.bin');
            const folderHeader = c.req.header('X-Folder');
            const originalKey = folderHeader ? `${folderHeader}/${rawKey}` : rawKey;

            // Récupérer le SHA256 du dossier (format: videos/sha256)
            let sha256 = '';
            if (folderHeader) {
                const parts = folderHeader.split('/');
                if (parts.length >= 2 && /^[a-f0-9]{64}$/i.test(parts[1])) {
                    sha256 = parts[1];
                }
            }

            // Construire le nouveau chemin avec UID
            let finalKey;
            if (sha256) {
                // Structure: uid/videos/sha256/fichier
                finalKey = cleanKey(`${uid}/videos/${sha256}/${rawKey}`);
            } else {
                // Fallback: utiliser le chemin original
                finalKey = cleanKey(originalKey);
            }

            console.log(`🔧 finalKey: ${finalKey} (original: ${originalKey}, uid: ${uid}, sha256: ${sha256})`);

            const contentType = c.req.header('Content-Type') || getContentTypeFromKey(finalKey);
            console.log(`📦 Content-Type resolved: ${contentType}`);

            // ... reste du code inchangé pour la gestion du body ...
            let bodyStream: ReadableStream | ArrayBuffer | null = null;
            try {
                const raw = (c.req as any).raw;
                if (raw && raw.body) {
                    bodyStream = raw.body as ReadableStream;
                    console.log('ℹ️ Using c.req.raw.body (stream)');
                } else {
                    console.log('ℹ️ c.req.raw.body is empty, trying arrayBuffer fallback...');
                    const ab = await c.req.arrayBuffer().catch(() => null);
                    if (ab && ab.byteLength > 0) {
                        bodyStream = ab;
                        console.log(`ℹ️ Obtained ArrayBuffer fallback (${ab.byteLength} bytes)`);
                    } else {
                        console.log('ℹ️ arrayBuffer fallback empty, trying blob()...');
                        const blob = await c.req.blob().catch(() => null);
                        if (blob) {
                            bodyStream = blob.stream();
                            console.log('ℹ️ Using blob.stream() fallback');
                        }
                    }
                }
            } catch (e) {
                console.warn('⚠️ Erreur lors de la lecture du body (fallbacks)', e);
            }

            if (!bodyStream) {
                console.warn('❌ Corps de requête introuvable après tentatives de fallback');
                return c.json({ success: false, error: 'Corps de requête vide' }, 400);
            }

            // --- Put to R2 with proper error handling ---
            const putStart = Date.now();
            try {
                // R2.put accepte ReadableStream ou ArrayBuffer/Blob/Buffer
                await c.env.STORAGE.put(finalKey, bodyStream as any, {
                    httpMetadata: { contentType }
                });
                const putEnd = Date.now();
                console.log(`✅ Upload R2 ok: ${finalKey} (${putEnd - putStart}ms)`);
            } catch (putErr) {
                console.error('❌ Erreur lors du c.env.STORAGE.put():', putErr);
                return c.json({ success: false, error: 'Erreur stockage R2', detail: String(putErr) }, 500);
            }

            const endTotal = Date.now();
            return c.json({
                success: true,
                key: finalKey,
                originalKey: rawKey,
                uid: uid,
                sha256: sha256,
                url: `/api/streaming/${finalKey}`,
                uploadTimeMs: endTotal - startTotal
            });

        } catch (err: any) {
            console.error('[upload-proxy PUT] Erreur inattendue:', err);
            return c.json({ success: false, error: err?.message || String(err) }, 500);
        }
    });

// Route pour vérifier si un asset existe déjà - MODIFIÉE
    app.get('/api/asset/check/:sha256', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
        try {
            // Vérifier l'authentification
            const user = c.get('user');
            if (!user || !user.uid) {
                return c.json({ success: false, error: 'Non authentifié' }, 401);
            }

            const uid = user.uid;
            const sha256 = c.req.param('sha256');
            console.log(`🔍 Vérification de l'asset: ${sha256} pour l'utilisateur ${uid}`);

            if (!sha256 || !/^[a-f0-9]{64}$/i.test(sha256)) {
                return c.json({ success: false, error: 'SHA-256 invalide' }, 400);
            }

            const folderKey = `${uid}/videos/${sha256}`;

            // Vérifier l'existence de metadata.json
            const metadataKey = `${folderKey}/metadata.json`;
            const metadataObject = await c.env.STORAGE.get(metadataKey);

            if (metadataObject) {
                const metadata = JSON.parse(await metadataObject.text());
                const playlistKey = `${folderKey}/master.m3u8`;
                const playlistObject = await c.env.STORAGE.get(playlistKey);

                if (playlistObject) {
                    const hlsUrl = `/api/streaming/${playlistKey}`;
                    const dashUrl = `/api/streaming/${folderKey}/manifest.mpd`;

                    return c.json({
                        success: true,
                        exists: true,
                        sha256,
                        uid: uid,
                        url: hlsUrl,
                        dashUrl: dashUrl,
                        metadata,
                        folder: folderKey
                    });
                }
            }

            // Si pas de metadata.json, lister le dossier pour compatibilité
            const objects = await c.env.STORAGE.list({ prefix: folderKey });

            if (objects.objects.length > 0) {
                let playlistUrl = '';
                let dashUrl = '';

                for (const obj of objects.objects) {
                    if (obj.key.endsWith('.m3u8')) {
                        playlistUrl = `/api/streaming/${obj.key}`;
                    } else if (obj.key.endsWith('.mpd')) {
                        dashUrl = `/api/streaming/${obj.key}`;
                    }
                }

                if (playlistUrl || dashUrl) {
                    return c.json({
                        success: true,
                        exists: true,
                        sha256,
                        uid: uid,
                        url: playlistUrl || dashUrl,
                        dashUrl: dashUrl || playlistUrl,
                        folder: folderKey,
                        metadata: {
                            originalName: `Video ${sha256.substring(0, 8)}`,
                            size_bytes: objects.objects.reduce((sum, obj) => sum + obj.size, 0),
                            createdAt: new Date().toISOString()
                        }
                    });
                }
            }

            return c.json({
                success: true,
                exists: false,
                sha256,
                uid: uid,
                message: 'Asset non trouvé, upload requis'
            });

        } catch (err: any) {
            console.error('[asset/check] Erreur:', err);
            return c.json({ success: false, error: err.message || String(err) }, 500);
        }
    });
}