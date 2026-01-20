// INFO : workers/auth.ts
import { Hono } from 'hono';
import type { Bindings } from './types.js';
import { verifyGoogleIdToken, createJWTAsync } from './utils.js';

export function registerAuthRoutes(app: Hono<{ Bindings: Bindings }>) {
    app.post('/api/auth/google', async (c) => {
        try {
            const body = await c.req.json();
            const idToken = String(body?.idToken || '');
            if (!idToken) return c.json({ success: false, error: 'Missing idToken' }, 400);

            const payload = await verifyGoogleIdToken(idToken);

            if (!payload || !payload.sub) {
                return c.json({ success: false, error: 'Invalid Google token' }, 401);
            }

            const googleId = payload.sub;
            const email = payload.email || null;
            const name = payload.name || null;
            const picture = payload.picture || null;
            const emailVerified = payload.email_verified ? 1 : 0;


            // Créer la table profil si elle n'existe pas
            try {
                // D'abord, vérifions si la table existe déjà
                const tables = await c.env.DATABASE.prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='profil'"
                ).first();

                if (!tables) {
                    await c.env.DATABASE.exec(`
                        CREATE TABLE IF NOT EXISTS profil (
                            id TEXT PRIMARY KEY,
                            email TEXT,
                            name TEXT,
                            picture TEXT,
                            email_verified INTEGER,
                            created_at INTEGER DEFAULT (strftime('%s', 'now')),
                            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
                        )
                    `);
                }

                // Vérifier si l'utilisateur existe déjà
                const existingUser = await c.env.DATABASE.prepare(
                    `SELECT id FROM profil WHERE id = ?`
                ).bind(googleId).first();

                if (!existingUser) {
                    // Insérer uniquement si l'utilisateur n'existe pas
                    const result = await c.env.DATABASE.prepare(`
                        INSERT INTO profil (id, email, name, picture, email_verified)
                        VALUES (?, ?, ?, ?, ?)
                    `).bind(
                        googleId,
                        email,
                        name,
                        picture,
                        emailVerified
                    ).run();

                    if (result.success) {
                    } else {
                        console.error('❌ Échec de l\'insertion dans D1');
                    }
                } else {
                }

            } catch (dbErr) {
                console.error('❌ Erreur base de données:', dbErr);
                // On continue même si l'insertion échoue, ce n'est pas bloquant
            }

            const jwtSecret = c.env.JWT_SECRET;
            if (!jwtSecret) {
                return c.json({ success: false, error: 'Server misconfigured (JWT_SECRET missing)' }, 500);
            }

            // Générer le JWT
            const token = await createJWTAsync({
                sub: googleId,
                email,
                name,
                picture,
                email_verified: payload.email_verified
            }, String(jwtSecret), { expiresInSeconds: 60 * 60 * 24 * 7 });

            return c.json({
                success: true,
                token,
                user: {
                    id: googleId,
                    email,
                    name,
                    picture,
                    email_verified: payload.email_verified
                }
            }, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        } catch (err: any) {
            console.error('❌ Erreur auth/google:', err);
            return c.json({ success: false, error: String(err?.message || err) }, 500);
        }
    });
}