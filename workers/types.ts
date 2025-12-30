// INFO: workers/types.ts

export type Bindings = {
    STORAGE: R2Bucket;
    DATABASE: D1Database;
    JWT_SECRET?: string;
    REFRESH_SECRET?: string;
};

// Interface pour le payload JWT - SUPPRIMER is_temp
export interface JWTPayload {
    sub: string;    // User ID
    uid?: string;   // UID public
    email: string;
    iat: number;
    exp: number;
    // Supprimer: is_temp?: boolean; (plus de tokens temporaires)
}

// Interface pour la réponse d'authentification
export interface AuthResponse {
    success: boolean;
    token?: string;
    refreshToken?: string; // Ajout pour Electron
    expiresIn?: number;
    error?: string;
    message?: string;
    uid?: string; // Ajout pour retourner l'UID
}

// Interface pour l'utilisateur en base de données
export interface User {
    id: number;
    uid: string;    // UID public unique
    email: string;
    password_hash: string;
    created_at: string;
    updated_at: string;
}

// Refresh token record (DB)
export interface RefreshTokenRecord {
    id: number;
    user_id: number;
    token_hash: string;
    device?: string | null;
    expires_at: number;
    revoked: number;
    created_at: string;
    last_used_at?: string | null;
}

// Type pour étendre le contexte Hono avec les variables
export type Variables = {
    user: {
        id: string;
        uid: string;    // UID public
        email: string;
    } | null;
};