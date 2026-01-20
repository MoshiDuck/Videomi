// INFO : workers/app.ts
import { Hono } from 'hono';
import { createRequestHandler } from 'react-router';
import type { Bindings } from './types.js';
import { registerAuthRoutes } from './auth.js';
import { generateGoogleAuthUrl, corsHeaders, noCacheHeaders } from './utils.js';
import uploadRoutes from './upload.js';

const app = new Hono<{ Bindings: Bindings }>();

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