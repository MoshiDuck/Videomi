// INFO : electron/auth.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { jwtDecode } from 'jwt-decode';
import { WORKER_CONFIG } from './config.js';

export interface UserInfo {
    token: string;
    refreshToken?: string;
    uid: string;
    email: string;
    id: string;
    expiresAt: number;
    refreshExpiresAt?: number;
}

export interface DecodedToken {
    sub: string;
    uid: string;
    email: string;
    iat: number;
    exp: number;
}

export class AuthManager {
    private configPath: string;
    private currentUser: UserInfo | null = null;

    constructor() {
        this.configPath = path.join(os.homedir(), '.videomi', 'auth.json');
        console.log(`📁 Chemin de configuration: ${this.configPath}`);
        this.loadUser();
    }

    private loadUser(): void {
        try {
            if (fs.existsSync(this.configPath)) {
                console.log(`📂 Chargement de l'utilisateur depuis: ${this.configPath}`);
                const data = fs.readFileSync(this.configPath, 'utf8');
                this.currentUser = JSON.parse(data);
                console.log(`👤 Utilisateur chargé: ${this.currentUser?.email}`);

                // Vérifier si le token d'accès est encore valide
                if (this.currentUser) {
                    const now = Date.now() / 1000;
                    const expiresIn = this.currentUser.expiresAt - now;

                    if (expiresIn < 0) {
                        console.log('⚠️ Token d\'accès expiré');
                        this.refreshTokenIfPossible();
                    } else {
                        console.log(`✅ Token valide pour encore ${Math.floor(expiresIn)} secondes`);
                    }

                    console.log(`🔄 Refresh token disponible: ${!!this.currentUser.refreshToken}`);
                }
            } else {
                console.log('📭 Aucun fichier d\'auth trouvé');
            }
        } catch (error) {
            console.error('❌ Erreur lors du chargement de l\'utilisateur:', error);
            this.clearUser();
        }
    }

    private saveUser(): void {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(this.currentUser, null, 2));
            console.log(`💾 Utilisateur sauvegardé dans: ${this.configPath}`);
        } catch (error) {
            console.error('❌ Erreur lors de la sauvegarde de l\'utilisateur:', error);
        }
    }

    setUser(token: string, refreshToken?: string): boolean {
        try {
            console.log(`🎫 Définition de l'utilisateur avec token...`);
            const decoded = jwtDecode<DecodedToken>(token);

            this.currentUser = {
                token,
                refreshToken,
                uid: decoded.uid,
                email: decoded.email,
                id: decoded.sub,
                expiresAt: decoded.exp,
                refreshExpiresAt: refreshToken ? Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) : undefined
            };

            this.saveUser();
            console.log(`✅ Utilisateur connecté: ${decoded.email} (UID: ${decoded.uid})`);

            if (refreshToken) {
                console.log('✅ Refresh token stocké pour les sessions longues');
            }

            return true;
        } catch (error) {
            console.error('❌ Erreur lors du décodage du token:', error);
            return false;
        }
    }

    clearUser(): void {
        console.log('🧹 Nettoyage des données utilisateur...');
        this.currentUser = null;
        try {
            if (fs.existsSync(this.configPath)) {
                fs.unlinkSync(this.configPath);
                console.log('🗑️ Fichier d\'auth supprimé');
            }
        } catch (error) {
            console.error('❌ Erreur lors de la suppression du fichier d\'auth:', error);
        }
    }

    getUser(): UserInfo | null {
        return this.currentUser;
    }

    getToken(): string | null {
        return this.currentUser?.token || null;
    }

    getRefreshToken(): string | null {
        return this.currentUser?.refreshToken || null;
    }

    getUID(): string | null {
        return this.currentUser?.uid || null;
    }

    isAuthenticated(): boolean {
        if (!this.currentUser) {
            console.log('🔍 Pas d\'utilisateur courant');
            return false;
        }

        // Vérifier si le token est encore valide (avec une marge de 5 minutes)
        const now = Date.now() / 1000;
        const isValid = this.currentUser.expiresAt > now - 300;

        console.log(`🔍 Authentification: ${isValid ? '✅ Valide' : '❌ Expirée'}`);
        console.log(`⏱️ Expiration dans: ${Math.floor(this.currentUser.expiresAt - now)} secondes`);

        return isValid;
    }

    hasRefreshToken(): boolean {
        const hasToken = !!this.currentUser?.refreshToken;
        console.log(`🔍 Refresh token disponible: ${hasToken}`);
        return hasToken;
    }

    async refreshTokenIfPossible(): Promise<string | null> {
        const refreshToken = this.getRefreshToken();
        console.log(`🔄 Tentative de rafraîchissement avec token: ${refreshToken ? 'Oui' : 'Non'}`);

        if (!refreshToken || !this.currentUser) {
            console.log('❌ Pas de refresh token disponible pour le rafraîchissement');
            return null;
        }

        try {
            const fetch = (await import('node-fetch')).default;
            console.log(`🌐 Envoi de la requête de rafraîchissement à: ${WORKER_CONFIG.url}/api/refresh`);

            const response = await fetch(`${WORKER_CONFIG.url}/api/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Electron-App': 'true'
                },
                body: JSON.stringify({ refreshToken })
            });

            console.log(`📥 Réponse reçue, status: ${response.status}`);

            if (!response.ok) {
                const error = await response.json();
                console.error('❌ Échec du rafraîchissement:', error);
                this.clearUser();
                return null;
            }

            const data = await response.json();
            console.log('📦 Données de rafraîchissement:', data);

            if (data.success && data.token) {
                // Mettre à jour le token d'accès
                this.currentUser.token = data.token;
                this.currentUser.expiresAt = jwtDecode<DecodedToken>(data.token).exp;
                this.saveUser();

                console.log('✅ Token rafraîchi avec succès');
                console.log(`⏱️ Nouvelle expiration: ${new Date(this.currentUser.expiresAt * 1000).toLocaleString()}`);

                return data.token;
            }

            console.log('❌ Données de rafraîchissement incomplètes');
            this.clearUser();
            return null;
        } catch (error) {
            console.error('❌ Erreur de rafraîchissement du token:', error);
            this.clearUser();
            return null;
        }
    }

    async login(email: string, password: string): Promise<{success: boolean, user?: UserInfo, error?: string}> {
        try {
            console.log(`🔐 Tentative de connexion pour: ${email}`);
            console.log(`🌐 Envoi de la requête à: ${WORKER_CONFIG.url}/api/login`);

            const fetch = (await import('node-fetch')).default;

            const response = await fetch(`${WORKER_CONFIG.url}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Electron-App': 'true'
                },
                body: JSON.stringify({
                    email,
                    password,
                    device: 'Electron App'
                })
            });

            console.log(`📥 Réponse de connexion reçue, status: ${response.status}`);

            // Lire le corps de la réponse pour le débogage
            const responseText = await response.text();
            console.log(`📝 Corps de la réponse:`, responseText);

            if (!response.ok) {
                let errorData;
                try {
                    errorData = JSON.parse(responseText);
                } catch {
                    errorData = { error: 'Erreur inconnue' };
                }
                console.error('❌ Erreur de connexion:', errorData);
                throw new Error(errorData.error || 'Échec de connexion');
            }

            const data = JSON.parse(responseText);
            console.log('📦 Données de connexion complètes:', JSON.stringify(data, null, 2));

            if (data.success && data.token && data.refreshToken) {
                console.log(`✅ Données de connexion valides`);
                const success = this.setUser(data.token, data.refreshToken);

                if (success) {
                    console.log(`✅ Connexion réussie pour: ${email}`);
                    return {
                        success: true,
                        user: this.currentUser!
                    };
                } else {
                    console.log(`❌ Échec de setUser`);
                }
            }

            console.log('❌ Données de connexion incomplètes:', data);
            return {
                success: false,
                error: data.error || 'Données de connexion incomplètes'
            };
        } catch (error: any) {
            console.error('❌ Erreur de connexion détaillée:');
            console.error('❌ Message:', error.message);
            console.error('❌ Stack:', error.stack);
            return {
                success: false,
                error: error.message || 'Erreur de connexion'
            };
        }
    }

    async logout(): Promise<void> {
        try {
            console.log('🔐 Déconnexion en cours...');
            const refreshToken = this.getRefreshToken();

            if (refreshToken) {
                const fetch = (await import('node-fetch')).default;

                await fetch(`${WORKER_CONFIG.url}/api/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Electron-App': 'true'
                    },
                    body: JSON.stringify({ refreshToken })
                });

                console.log('✅ Déconnexion API effectuée');
            } else {
                console.log('ℹ️ Pas de refresh token à déconnecter');
            }
        } catch (error) {
            console.error('⚠️ Erreur lors de la déconnexion API (ignorée):', error);
        } finally {
            this.clearUser();
            console.log('✅ Déconnexion locale effectuée');
        }
    }

    // Fonction pour générer les headers d'authentification
    getAuthHeaders(): Record<string, string> {
        const token = this.getToken();
        const headers: Record<string, string> = {
            'X-Electron-App': 'true'
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
            console.log(`📤 Headers auth avec token: ${token.substring(0, 20)}...`);
        } else {
            console.log('⚠️ Pas de token pour les headers d\'auth');
        }

        return headers;
    }
}

// Singleton
export const authManager = new AuthManager();

// Fonctions globales
export function getAuthToken(): string | null {
    return authManager.getToken();
}

export function getRefreshToken(): string | null {
    return authManager.getRefreshToken();
}

export function getUID(): string | null {
    return authManager.getUID();
}

export function isAuthenticated(): boolean {
    return authManager.isAuthenticated();
}

export function hasRefreshToken(): boolean {
    return authManager.hasRefreshToken();
}

export function getAuthHeaders(): Record<string, string> {
    return authManager.getAuthHeaders();
}