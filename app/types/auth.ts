// INFO : app/types/auth.ts
export interface ApiAuthResponse {
    success: boolean;
    token?: string;
    user?: User;
    error?: string;
}

export interface ConfigResponse {
    googleClientId?: string | null;
    tmdbApiKey?: string | null;
    omdbApiKey?: string | null;
    spotifyClientId?: string | null;
    spotifyClientSecret?: string | null;
    discogsApiToken?: string | null;
}

export interface User {
    id: string;
    email?: string;
    name?: string; // Nom complet seulement
    picture?: string;
    email_verified?: boolean | string;
}

export interface AuthConfig {
    googleClientId: string | null;
    baseUrl: string;
    redirectUri?: string;
    tmdbApiKey: string | null;
    omdbApiKey: string | null;
    spotifyClientId: string | null;
    spotifyClientSecret: string | null;
    discogsApiToken: string | null;
}