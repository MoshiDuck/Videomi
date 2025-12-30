// INFO : workers/app.ts
import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import type { Bindings, Variables } from './types';
import { corsMiddleware, authMiddleware, getContentTypeFromKey } from './utils';
import { registerUploadRoutes } from './upload';
import { registerAuthRoutes } from './auth.js';


// Créer l'app avec les types étendus
const app = new Hono<{
    Bindings: Bindings;
    Variables: Variables;
}>();

// Appliquer le middleware CORS (global)
app.use('*', corsMiddleware);

// Appliquer le middleware d'authentification sur les routes API
app.use('/api/*', authMiddleware);

// Enregistrer les routes d'upload / asset-check
registerUploadRoutes(app);

// Enregistrer les routes d'authentification
registerAuthRoutes(app);

// Route pour lister les vidéos (basées sur SHA-256)
app.get('/api/videos', async (c) => {
    try {
        // Récupérer l'utilisateur depuis le contexte (ajouté par authMiddleware)
        const user = c.get('user');
        console.log(`📋 GET /api/videos - Utilisateur: ${user?.email || 'Non authentifié'}, UID: ${user?.uid}`);

        // Vérifier que l'utilisateur est connecté
        if (!user || !user.uid) {
            return c.json({ success: false, error: 'Non authentifié' }, 401);
        }

        const uid = user.uid;
        const prefix = `${uid}/videos/`;

        const objects = await c.env.STORAGE.list({ prefix });
        console.log(`📊 ${objects.objects.length} objets dans R2 pour l'utilisateur ${uid}`);

        const videoMap = new Map<string, {
            sha256: string;
            name: string;
            url?: string;
            dashUrl?: string;
            size: number;
            uploaded: Date;
            type: 'hls' | 'dash' | 'direct';
            files: Array<{ key: string; size: number }>;
            metadata?: any;
        }>();

        for (const obj of objects.objects) {
            const key = obj.key;

            if (!key.includes('/') || key === `${uid}/videos/`) {
                continue;
            }

            const parts = key.split('/');
            // Structure attendue: uid/videos/sha256/fichier
            if (parts.length < 4) {
                continue;
            }

            const userId = parts[0];
            const sha256 = parts[2]; // Index 2 car: [uid, videos, sha256, fichier]

            // Vérifier que le fichier appartient bien à l'utilisateur
            if (userId !== uid) {
                continue;
            }

            if (!/^[a-f0-9]{64}$/i.test(sha256)) {
                continue;
            }

            if (!videoMap.has(sha256)) {
                videoMap.set(sha256, {
                    sha256,
                    name: sha256.substring(0, 8),
                    size: 0,
                    uploaded: obj.uploaded,
                    type: 'hls',
                    files: []
                });
            }

            const video = videoMap.get(sha256)!;
            video.files.push({ key, size: obj.size });
            video.size += obj.size;

            if (obj.uploaded > video.uploaded) {
                video.uploaded = obj.uploaded;
            }

            const fileName = parts[parts.length - 1];

            if (fileName.toLowerCase().endsWith('.m3u8')) {
                video.type = 'hls';
                video.url = `/api/streaming/${key}`;
            } else if (fileName.toLowerCase().endsWith('.mpd')) {
                video.type = 'dash';
                video.dashUrl = `/api/streaming/${key}`;
            } else if (fileName.toLowerCase().endsWith('.mp4')) {
                video.type = 'direct';
                video.url = `/api/streaming/${key}`;
            } else if (fileName.toLowerCase() === 'metadata.json') {
                try {
                    const metadataObj = await c.env.STORAGE.get(key);
                    if (metadataObj) {
                        const metadataText = await metadataObj.text();
                        video.metadata = JSON.parse(metadataText);
                        video.name = video.metadata.originalName || video.name;
                    }
                } catch (err) {
                    console.warn(`⚠️ Impossible de lire metadata.json pour ${sha256}:`, err);
                }
            }
        }

        const videos = Array.from(videoMap.values()).map(video => ({
            sha256: video.sha256,
            name: video.name,
            url: video.url || video.dashUrl || '',
            dashUrl: video.dashUrl,
            size: video.size,
            uploaded: video.uploaded.toISOString(),
            type: video.type,
            metadata: video.metadata
        }));

        console.log(`🎬 ${videos.length} vidéos trouvées pour l'utilisateur ${uid}`);
        return c.json({
            success: true,
            videos
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des vidéos:', error);
        return c.json({ success: false, error: 'Erreur serveur' }, 500);
    }
});

// Route pour obtenir les métadonnées d'une vidéo spécifique
app.get('/api/video/:sha256/metadata', async (c) => {
    try {
        const user = c.get('user');
        if (!user || !user.uid) {
            return c.json({ success: false, error: 'Non authentifié' }, 401);
        }

        const sha256 = c.req.param('sha256');
        const uid = user.uid;
        console.log(`📋 GET /api/video/${sha256}/metadata pour l'utilisateur ${uid}`);

        if (!sha256 || !/^[a-f0-9]{64}$/i.test(sha256)) {
            return c.json({ success: false, error: 'SHA-256 invalide' }, 400);
        }

        const metadataKey = `${uid}/videos/${sha256}/metadata.json`;
        const metadataObject = await c.env.STORAGE.get(metadataKey);

        if (!metadataObject) {
            return c.json({ success: false, error: 'Vidéo non trouvée' }, 404);
        }

        const metadata = JSON.parse(await metadataObject.text());
        return c.json({
            success: true,
            metadata
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des métadonnées:', error);
        return c.json({ success: false, error: 'Erreur serveur' }, 500);
    }
});

// Route pour servir les fichiers Streaming (HLS + DASH)
app.get('/api/streaming/*', async (c) => {
    try {
        const key = c.req.path.replace('/api/streaming/', '');
        console.log(`📥 GET /api/streaming/${key}`);

        const object = await c.env.STORAGE.get(key);

        if (!object) {
            console.warn(`❌ Fichier non trouvé: ${key}`);
            return c.text('Fichier non trouvé', 404);
        }

        const headers = new Headers();
        const contentType = getContentTypeFromKey(key);
        headers.set('Content-Type', contentType);

        if (key.endsWith('.m3u8')) {
            headers.set('Cache-Control', 'no-cache');
            headers.set('Access-Control-Allow-Origin', '*');
            console.log(`📄 Servi playlist HLS: ${key}`);
        } else if (key.endsWith('.mpd')) {
            headers.set('Cache-Control', 'no-cache');
            headers.set('Access-Control-Allow-Origin', '*');
            console.log(`📄 Servi manifest DASH: ${key}`);
        } else if (key.endsWith('.m4s')) {
            headers.set('Cache-Control', 'public, max-age=31536000');
            console.log(`📄 Servi segment: ${key} (${object.size} bytes)`);
        } else if (key.endsWith('.vtt')) {
            headers.set('Content-Type', 'text/vtt');
            headers.set('Access-Control-Allow-Origin', '*');
            console.log(`📄 Servi sous-titre: ${key}`);
        } else if (key.endsWith('.json')) {
            headers.set('Content-Type', 'application/json');
            headers.set('Cache-Control', 'no-cache');
            console.log(`📄 Servi fichier JSON: ${key}`);
        } else {
            console.log(`📄 Servi fichier: ${key} (${contentType}, ${object.size} bytes)`);
        }

        return new Response(object.body, { headers });
    } catch (error) {
        console.error('Erreur lors de la récupération du fichier:', error);
        return c.text('Erreur serveur', 500);
    }
});

// Route pour générer un token de session (pour compatibilité)
app.get('/api/session', async (c) => {
    try {
        const token = `electron-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.log(`🔐 Token de session généré: ${token}`);

        return c.json({
            success: true,
            token: token,
            expiresIn: 3600
        });
    } catch (error) {
        console.error('Erreur génération session:', error);
        return c.json({ success: false, error: 'Erreur génération session' }, 500);
    }
});

// React Router catch-all
app.all('*', (c) => {
    console.log(`🌐 Route React Router: ${c.req.path}`);
    const handler = createRequestHandler(
        () => import('virtual:react-router/server-build'),
        import.meta.env.MODE
    );
    return handler(c.req.raw, {
        cloudflare: { env: c.env, ctx: c.executionCtx },
    });
});

export default app;