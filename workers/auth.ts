// INFO : workers/auth.ts
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, AuthResponse, Variables } from './types';
import { hashPassword, verifyPassword, isValidEmail } from './utils';
import { createToken } from './jwt';
import { generateRandomToken, hashTokenHMAC, parseCookies, buildRefreshTokenCookie, buildClearRefreshCookie } from './utils';

// Fonction pour générer un UID unique
function generateUid(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `user_${timestamp}_${random}`;
}

// Durées des tokens
const ACCESS_TOKEN_EXPIRATION = 15 * 60;
const REFRESH_TOKEN_EXPIRATION_DAYS = 30;

async function cleanupExpiredTokens(env: Bindings) {
    try {
        const now = Math.floor(Date.now() / 1000);
        const result = await env.DATABASE
            .prepare('DELETE FROM refresh_tokens WHERE expires_at < ?')
            .bind(now)
            .run();

        console.log(`🧹 ${result.meta?.changes || 0} tokens expirés nettoyés`);
    } catch (error) {
        console.error('Erreur lors du nettoyage des tokens:', error);
    }
}

export function registerAuthRoutes(app: Hono<{ Bindings: Bindings; Variables: Variables }>) {
    const REFRESH_TOKEN_BYTES = 48;

    // -------------------------
    // Route d'inscription - CORRIGÉE (avec gestion d'erreurs améliorée)
    // -------------------------
    app.post('/api/register', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
        let userId: number | null = null;

        try {
            console.log('='.repeat(80));
            console.log('📝 NOUVELLE INSCRIPTION DÉBUT');
            console.log('='.repeat(80));

            // Vérifier les variables d'environnement
            if (!c.env.JWT_SECRET || c.env.JWT_SECRET.trim() === '') {
                console.error('❌ ERREUR: JWT_SECRET non défini ou vide!');
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Configuration serveur invalide'
                }, 500);
            }

            if (!c.env.DATABASE) {
                console.error('❌ ERREUR: DATABASE non défini!');
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Configuration serveur invalide'
                }, 500);
            }

            // Récupérer les données
            let body;
            try {
                body = await c.req.json();
                console.log('📦 Body reçu:', JSON.stringify(body, null, 2));
            } catch (jsonError) {
                console.error('❌ Erreur de parsing JSON:', jsonError);
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Format de données invalide'
                }, 400);
            }

            const { email, password, device } = body;

            // Validation
            if (!email || !password) {
                console.log('❌ Validation échouée: email ou mot de passe manquant');
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Email et mot de passe requis'
                }, 400);
            }

            if (!isValidEmail(email)) {
                console.log('❌ Validation échouée: email invalide');
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Format d\'email invalide'
                }, 400);
            }

            if (password.length < 6) {
                console.log('❌ Validation échouée: mot de passe trop court');
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Le mot de passe doit contenir au moins 6 caractères'
                }, 400);
            }

            // Vérifier si l'utilisateur existe
            console.log(`🔍 Recherche de l'utilisateur: ${email}`);
            let existingUser;
            try {
                existingUser = await c.env.DATABASE
                    .prepare('SELECT id, uid FROM users WHERE email = ?')
                    .bind(email)
                    .first<any>();

            } catch (dbError) {
                console.error('❌ Erreur de base de données lors de la recherche:', dbError);
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Erreur de base de données'
                }, 500);
            }

            if (existingUser) {
                console.log(`❌ Email déjà utilisé: ${email}`);
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Cet email est déjà utilisé'
                }, 409);
            }

            // Hasher le mot de passe
            console.log('🔐 Hachage du mot de passe...');
            let passwordHash;
            try {
                passwordHash = await hashPassword(password);
                console.log('✅ Mot de passe hashé avec succès');
            } catch (hashError) {
                console.error('❌ Erreur de hachage du mot de passe:', hashError);
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Erreur lors du traitement du mot de passe'
                }, 500);
            }

            // Générer un UID unique
            const uid = generateUid();
            console.log(`🎫 UID généré: ${uid}`);

            // Insérer l'utilisateur avec UID
            console.log(`💾 Insertion de l'utilisateur: ${email} (UID: ${uid})`);
            let result;
            try {
                const now = new Date().toISOString();
                result = await c.env.DATABASE
                    .prepare('INSERT INTO users (uid, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
                    .bind(uid, email, passwordHash, now, now)
                    .run();
            } catch (dbError) {
                console.error('❌ Erreur d\'insertion en base de données:', dbError);
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Erreur lors de la création du compte'
                }, 500);
            }

            if (!result.success) {
                console.error('❌ Échec de l\'insertion:', result.error);
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Erreur lors de la création du compte'
                }, 500);
            }

            userId = Number(result.meta?.last_row_id || 0);
            console.log(`✅ Utilisateur créé avec ID: ${userId}, UID: ${uid}`);

            // CRÉER UN TOKEN D'ACCÈS NORMAL (15 minutes)
            console.log('🎫 Génération du token d\'accès (15min)...');
            let accessToken;
            try {
                accessToken = await createToken(
                    {
                        sub: userId.toString(),
                        uid: uid,
                        email
                    },
                    c.env.JWT_SECRET!,
                    ACCESS_TOKEN_EXPIRATION // 15 minutes
                );
                console.log('✅ Token d\'accès généré avec succès');
            } catch (jwtError: any) {
                console.error('❌ ERREUR lors de la génération du token d\'accès:');
                console.error('❌ Message:', jwtError.message);
                console.error('❌ Stack:', jwtError.stack);

                // Nettoyer l'utilisateur créé
                if (userId) {
                    try {
                        await c.env.DATABASE
                            .prepare('DELETE FROM users WHERE id = ?')
                            .bind(userId)
                            .run();
                        console.log(`🧹 Utilisateur ${userId} nettoyé suite à l'erreur JWT`);
                    } catch (cleanupError) {
                        console.error('❌ Erreur lors du nettoyage:', cleanupError);
                    }
                }

                return c.json<AuthResponse>({
                    success: false,
                    error: `Erreur d'authentification: ${jwtError.message}`
                }, 500);
            }

            // GÉNÉRER UN REFRESH TOKEN DIRECTEMENT À L'INSCRIPTION (30 jours)
            console.log('🔄 Génération du refresh token (30 jours) DIRECTEMENT à l\'inscription...');
            const refreshToken = generateRandomToken(REFRESH_TOKEN_BYTES);
            const refreshSecret = c.env.REFRESH_SECRET || c.env.JWT_SECRET;

            if (!refreshSecret) {
                console.error('❌ Aucun secret défini pour les refresh tokens');
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Erreur de configuration serveur'
                }, 500);
            }

            const hashed = await hashTokenHMAC(refreshToken, refreshSecret);
            const expiresAt = Math.floor(Date.now() / 1000) + (REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60);

            // Stocker le refresh token dans la base de données
            try {
                const createdAt = new Date().toISOString();
                const insertResult = await c.env.DATABASE
                    .prepare('INSERT INTO refresh_tokens (user_id, token_hash, device, expires_at, revoked, created_at) VALUES (?, ?, ?, ?, 0, ?)')
                    .bind(userId, hashed, device || 'Inscription', expiresAt, createdAt)
                    .run();

                console.log('✅ Refresh token stocké en base de données, ID:', insertResult.meta?.last_row_id);
            } catch (refreshError: any) {
                console.error('❌ Erreur lors du stockage du refresh token:');
                console.error('❌ Message:', refreshError.message);
                console.error('❌ Stack:', refreshError.stack);

                // Nettoyer l'utilisateur créé
                if (userId) {
                    try {
                        await c.env.DATABASE
                            .prepare('DELETE FROM users WHERE id = ?')
                            .bind(userId)
                            .run();
                        console.log(`🧹 Utilisateur ${userId} nettoyé suite à l'erreur de stockage du refresh token`);
                    } catch (cleanupError) {
                        console.error('❌ Erreur lors du nettoyage:', cleanupError);
                    }
                }

                return c.json<AuthResponse>({
                    success: false,
                    error: `Erreur lors de la création de la session: ${refreshError.message}`
                }, 500);
            }

            // Définir le cookie HTTP-only pour le navigateur web
            const isElectron = c.req.header('X-Electron-App') === 'true';

            if (!isElectron) {
                // Pour le web: cookie HTTP-only
                const cookie = buildRefreshTokenCookie(refreshToken, {
                    maxAgeDays: REFRESH_TOKEN_EXPIRATION_DAYS,
                    sameSite: 'Lax',
                    secure: true
                });
                c.header('Set-Cookie', cookie);
                console.log('✅ Cookie refresh token défini (HTTP-only)');
            } else {
                // Pour Electron: retourner le refresh token dans la réponse
                console.log('✅ Refresh token retourné dans la réponse (pour Electron)');
            }

            console.log('='.repeat(80));
            console.log('✅ INSCRIPTION RÉUSSIE - TOKENS CRÉÉS DIRECTEMENT');
            console.log(`📧 Email: ${email}`);
            console.log(`🆔 User ID: ${userId}`);
            console.log(`🎫 UID: ${uid}`);
            console.log(`🔐 Token d'accès (15min): ${accessToken.substring(0, 20)}...`);
            console.log(`🔄 Refresh token (30 jours): ${refreshToken.substring(0, 20)}...`);
            console.log('='.repeat(80));

            // Préparer la réponse
            const response: AuthResponse = {
                success: true,
                token: accessToken,
                expiresIn: ACCESS_TOKEN_EXPIRATION,
                uid: uid
            };

            // Pour Electron, inclure le refresh token dans la réponse
            if (isElectron) {
                (response as any).refreshToken = refreshToken;
            }

            return c.json(response, 201);

        } catch (error: any) {
            console.error('='.repeat(80));
            console.error('❌ ERREUR FATALE DANS /api/register:');
            console.error('❌ Type:', typeof error);
            console.error('❌ Message:', error.message);
            console.error('❌ Stack:', error.stack);

            // Nettoyer si nécessaire
            if (userId) {
                try {
                    await c.env.DATABASE
                        .prepare('DELETE FROM users WHERE id = ?')
                        .bind(userId)
                        .run();
                    console.log(`🧹 Utilisateur ${userId} nettoyé suite à l'erreur fatale`);
                } catch (cleanupError) {
                    console.error('❌ Erreur lors du nettoyage final:', cleanupError);
                }
            }

            return c.json<AuthResponse>({
                success: false,
                error: 'Erreur serveur interne lors de l\'inscription'
            }, 500);
        }
    });

    // -------------------------
    // Route de login - CORRIGÉ (sans is_temp) - SECTION CORRIGÉE
    // -------------------------
    app.post('/api/login', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
        try {
            console.log('='.repeat(80));
            console.log('🔐 DÉBUT DE LA CONNEXION');
            console.log('='.repeat(80));

            // Récupérer les données du formulaire
            const body = await c.req.json();
            const { email, password, device } = body;

            console.log('📧 Email reçu:', email);

            // Validation des données
            if (!email || !password) {
                console.log('❌ Email ou mot de passe manquant');
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Email et mot de passe requis'
                }, 400);
            }

            if (!isValidEmail(email)) {
                console.log('❌ Email invalide:', email);
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Format d\'email invalide'
                }, 400);
            }

            console.log(`🔍 Recherche de l'utilisateur: ${email}`);

            // Vérifier l'utilisateur en base de données
            let user;
            try {
                user = await c.env.DATABASE
                    .prepare('SELECT * FROM users WHERE email = ?')
                    .bind(email)
                    .first<any>();

                console.log('✅ Requête DB exécutée');
                console.log('👤 Utilisateur trouvé:', !!user);

                if (user) {
                    console.log('📋 Détails utilisateur:');
                    console.log('- ID:', user.id);
                    console.log('- UID:', user.uid);
                    console.log('- Email:', user.email);
                }
            } catch (dbError: any) {
                console.error('❌ Erreur de base de données:', dbError);
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Erreur de base de données'
                }, 500);
            }

            if (!user) {
                console.log(`❌ Utilisateur non trouvé: ${email}`);
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Email ou mot de passe incorrect'
                }, 401);
            }

            // Vérifier le mot de passe
            console.log('🔐 Vérification du mot de passe...');
            let isValid;
            try {
                isValid = await verifyPassword(password, user.password_hash);
                console.log('✅ Vérification du mot de passe terminée');
                console.log('✓ Mot de passe valide?:', isValid);
            } catch (verifyError: any) {
                console.error('❌ Erreur lors de la vérification du mot de passe:', verifyError);
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Erreur lors de la vérification du mot de passe'
                }, 500);
            }

            if (!isValid) {
                console.log(`❌ Mot de passe incorrect pour: ${email}`);
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Email ou mot de passe incorrect'
                }, 401);
            }

            if (!c.env.JWT_SECRET) {
                console.error('❌ JWT_SECRET non défini');
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Erreur de configuration serveur'
                }, 500);
            }

            console.log('✅ Password verified, generating tokens...');

            // Générer un token JWT avec UID (15 minutes)
            let token;
            try {
                token = await createToken(
                    {
                        sub: user.id.toString(),
                        uid: user.uid,
                        email: user.email
                    },
                    c.env.JWT_SECRET,
                    ACCESS_TOKEN_EXPIRATION // 15 minutes
                );
                console.log('✅ Token JWT généré (15min)');
            } catch (jwtError: any) {
                console.error('❌ Erreur lors de la génération du JWT:', jwtError);
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Erreur lors de la génération du token'
                }, 500);
            }

            if (!token) {
                console.error('❌ Échec de la génération du token JWT');
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Erreur lors de la génération du token'
                }, 500);
            }

            // GÉNÉRER LE REFRESH TOKEN (30 jours)
            console.log('🔄 Génération du refresh token (30 jours)...');
            const refreshToken = generateRandomToken(REFRESH_TOKEN_BYTES);
            const refreshSecret = c.env.REFRESH_SECRET || c.env.JWT_SECRET;

            if (!refreshSecret) {
                console.error('❌ Aucun secret défini pour les refresh tokens');
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Erreur de configuration serveur'
                }, 500);
            }

            const hashed = await hashTokenHMAC(refreshToken, refreshSecret);
            const expiresAt = Math.floor(Date.now() / 1000) + (REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60);

            // Stocker le refresh token dans la base de données
            try {
                const createdAt = new Date().toISOString();
                await c.env.DATABASE
                    .prepare('INSERT INTO refresh_tokens (user_id, token_hash, device, expires_at, revoked, created_at) VALUES (?, ?, ?, ?, 0, ?)')
                    .bind(user.id, hashed, device || null, expiresAt, createdAt)
                    .run();
                console.log('✅ Refresh token stocké en base de données');
            } catch (refreshError: any) {
                console.error('❌ Erreur lors du stockage du refresh token:', refreshError);
                return c.json<AuthResponse>({
                    success: false,
                    error: 'Erreur lors de la création de la session'
                }, 500);
            }

            // Définir le cookie HTTP-only pour le navigateur web
            const isElectron = c.req.header('X-Electron-App') === 'true';

            if (!isElectron) {
                // Pour le web: cookie HTTP-only
                const cookie = buildRefreshTokenCookie(refreshToken, {
                    maxAgeDays: REFRESH_TOKEN_EXPIRATION_DAYS,
                    sameSite: 'Lax',
                    secure: true
                });
                c.header('Set-Cookie', cookie);
                console.log('✅ Cookie refresh token défini (HTTP-only)');
            } else {
                // Pour Electron: retourner le refresh token dans la réponse
                console.log('✅ Refresh token retourné dans la réponse (pour Electron)');
            }

            console.log('='.repeat(80));
            console.log('✅ CONNEXION RÉUSSIE - REFRESH TOKEN CRÉÉ');
            console.log(`📧 Email: ${email}`);
            console.log(`🆔 User ID: ${user.id}`);
            console.log(`🎫 UID: ${user.uid}`);
            console.log(`🔐 Token d'accès (15min): ${token.substring(0, 20)}...`);
            console.log(`🔄 Refresh token (30 jours): ${refreshToken.substring(0, 20)}...`);
            console.log('='.repeat(80));

            // CORRECTION ICI : Utiliser les bonnes variables
            // Préparer la réponse
            const response: AuthResponse = {
                success: true,
                token: token,  // <-- Utiliser la variable 'token' qui a été générée
                expiresIn: ACCESS_TOKEN_EXPIRATION,
                uid: user.uid  // <-- Utiliser l'UID de l'utilisateur depuis la base de données
            };

            // Pour Electron, inclure le refresh token dans la réponse
            if (isElectron) {
                (response as any).refreshToken = refreshToken;
            }

            return c.json(response);

        } catch (error: any) {
            console.error('❌ ERREUR FATALE DANS /api/login:', error);
            return c.json<AuthResponse>({
                success: false,
                error: 'Erreur serveur lors de l\'authentification'
            }, 500);
        }
    });

    // -------------------------
    // Route de refresh token - CORRIGÉ (sans is_temp)
    // -------------------------
    app.post('/api/refresh', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
        try {
            console.log('🔁 /api/refresh called');

            // Vérifier si c'est Electron ou Web
            const isElectron = c.req.header('X-Electron-App') === 'true';
            let incomingRefreshToken: string | null = null;

            if (isElectron) {
                // Pour Electron: le refresh token est dans le body
                const body = await c.req.json().catch(() => ({}));
                incomingRefreshToken = body.refreshToken;
            } else {
                // Pour le web: le refresh token est dans le cookie
                const cookieHeader = c.req.header('Cookie') || c.req.header('cookie') || '';
                const cookies = parseCookies(cookieHeader);
                incomingRefreshToken = cookies['refresh_token'];
            }

            if (!incomingRefreshToken) {
                console.log('❌ Aucun refresh token fourni');
                return c.json({ success: false, error: 'Refresh token manquant' }, 401);
            }

            // Compute hash and look up
            const refreshSecret = c.env.REFRESH_SECRET || c.env.JWT_SECRET || 'fallback-secret';
            const hashed = await hashTokenHMAC(incomingRefreshToken, refreshSecret);

            // Chercher le token dans la base de données
            const row = await c.env.DATABASE
                .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0 LIMIT 1')
                .bind(hashed)
                .first<any>();

            const nowUnix = Math.floor(Date.now() / 1000);

            if (!row) {
                console.warn('❌ Refresh token non trouvé ou révoqué');
                if (!isElectron) {
                    c.header('Set-Cookie', buildClearRefreshCookie('/'));
                }
                return c.json({ success: false, error: 'Refresh token invalide' }, 401);
            }

            if (row.expires_at <= nowUnix) {
                console.warn('⚠️ Refresh token expiré');
                await c.env.DATABASE
                    .prepare('UPDATE refresh_tokens SET revoked = 1, last_used_at = ? WHERE id = ?')
                    .bind(new Date().toISOString(), row.id)
                    .run();

                if (!isElectron) {
                    c.header('Set-Cookie', buildClearRefreshCookie('/'));
                }
                return c.json({ success: false, error: 'Refresh token expiré' }, 401);
            }

            // Récupérer les infos de l'utilisateur
            const user = await c.env.DATABASE
                .prepare('SELECT uid, email FROM users WHERE id = ?')
                .bind(row.user_id)
                .first<any>();

            if (!user) {
                console.error('❌ Utilisateur non trouvé lors du refresh');
                if (!isElectron) {
                    c.header('Set-Cookie', buildClearRefreshCookie('/'));
                }
                return c.json({ success: false, error: 'Utilisateur introuvable' }, 401);
            }

            // Mettre à jour la date d'utilisation
            await c.env.DATABASE
                .prepare('UPDATE refresh_tokens SET last_used_at = ? WHERE id = ?')
                .bind(new Date().toISOString(), row.id)
                .run();

            // Générer un nouveau token d'accès (15 minutes)
            const accessToken = await createToken({
                sub: String(row.user_id),
                uid: user.uid,
                email: user.email || ''
            }, c.env.JWT_SECRET!, ACCESS_TOKEN_EXPIRATION);

            console.log('✅ Nouveau token d\'accès généré via refresh token');

            return c.json({
                success: true,
                token: accessToken,
                expiresIn: ACCESS_TOKEN_EXPIRATION,
                message: 'Token renouvelé avec succès'
            });

        } catch (err: any) {
            console.error('/api/refresh error:', err);
            return c.json({ success: false, error: 'Erreur serveur' }, 500);
        }
    });

    // -------------------------
    // Route logout (inchangée)
    // -------------------------
    app.post('/api/logout', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
        try {
            console.log('🔐 /api/logout called');

            const isElectron = c.req.header('X-Electron-App') === 'true';
            let incomingRefreshToken: string | null = null;

            if (isElectron) {
                // Pour Electron: le refresh token est dans le body
                const body = await c.req.json().catch(() => ({}));
                incomingRefreshToken = body.refreshToken;
            } else {
                // Pour le web: le refresh token est dans le cookie
                const cookieHeader = c.req.header('Cookie') || c.req.header('cookie') || '';
                const cookies = parseCookies(cookieHeader);
                incomingRefreshToken = cookies['refresh_token'];
            }

            if (incomingRefreshToken) {
                const refreshSecret = c.env.REFRESH_SECRET || c.env.JWT_SECRET || 'fallback-secret';
                const hashed = await hashTokenHMAC(incomingRefreshToken, refreshSecret);

                // Révoquer le refresh token
                await c.env.DATABASE
                    .prepare('UPDATE refresh_tokens SET revoked = 1, last_used_at = ? WHERE token_hash = ?')
                    .bind(new Date().toISOString(), hashed)
                    .run();

                console.log('✅ Refresh token révoqué');
            }

            // Clear cookie pour le web
            if (!isElectron) {
                c.header('Set-Cookie', buildClearRefreshCookie('/'));
            }

            return c.json({ success: true, message: 'Déconnecté avec succès' });
        } catch (err: any) {
            console.error('/api/logout error:', err);
            return c.json({ success: false, error: 'Erreur serveur' }, 500);
        }
    });

    // -------------------------
    // Route de vérification de token - CORRIGÉ (sans is_temp)
    // -------------------------
    app.get('/api/verify-token', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
        try {
            const authHeader = c.req.header('Authorization');
            const { verifyToken, extractTokenFromHeader } = await import('./jwt');

            const token = extractTokenFromHeader(authHeader || null);

            if (!token) {
                return c.json({
                    success: false,
                    valid: false,
                    error: 'Token manquant'
                });
            }

            if (!c.env.JWT_SECRET) {
                console.error('❌ JWT_SECRET non défini');
                return c.json({
                    success: false,
                    valid: false,
                    error: 'Erreur de configuration serveur'
                }, 500);
            }

            const payload = await verifyToken(token, c.env.JWT_SECRET);

            if (!payload) {
                return c.json({
                    success: false,
                    valid: false,
                    error: 'Token invalide ou expiré'
                });
            }

            return c.json({
                success: true,
                valid: true,
                user: {
                    id: payload.sub,
                    uid: payload.uid,
                    email: payload.email
                },
                expiresIn: payload.exp - Math.floor(Date.now() / 1000)
            });

        } catch (error) {
            console.error('Erreur lors de la vérification du token:', error);
            return c.json({
                success: false,
                valid: false,
                error: 'Erreur serveur'
            }, 500);
        }
    });

    // -------------------------
    // Route pour vérifier les refresh tokens d'un utilisateur
    // -------------------------
    app.get('/api/user/refresh-tokens', async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
        try {
            // Vérifier l'authentification
            const user = c.get('user');
            if (!user || !user.uid) {
                return c.json({ success: false, error: 'Non authentifié' }, 401);
            }

            // Récupérer l'ID utilisateur via l'UID
            const userRecord = await c.env.DATABASE
                .prepare('SELECT id FROM users WHERE uid = ?')
                .bind(user.uid)
                .first<any>();

            if (!userRecord) {
                return c.json({ success: false, error: 'Utilisateur non trouvé' }, 404);
            }

            // Récupérer tous les refresh tokens actifs de l'utilisateur
            const tokens = await c.env.DATABASE
                .prepare(`
                    SELECT id, device, expires_at, created_at, last_used_at
                    FROM refresh_tokens
                    WHERE user_id = ? AND revoked = 0 AND expires_at > ?
                    ORDER BY created_at DESC
                `)
                .bind(userRecord.id, Math.floor(Date.now() / 1000))
                .all<any>();

            return c.json({
                success: true,
                tokens: tokens.results || [],
                count: tokens.results?.length || 0
            });

        } catch (error) {
            console.error('Erreur lors de la récupération des refresh tokens:', error);
            return c.json({ success: false, error: 'Erreur serveur' }, 500);
        }
    });
}