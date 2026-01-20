// INFO : workers/utils.ts
type GoogleTokenPayload = {
    azp?: string;
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    picture?: string;
    given_name?: string;
    family_name?: string;
    iat?: string;
    exp?: string;
};

// Fonctions d'authentification Google
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload | null> {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const res = await fetch(url);
    return res.ok ? (await res.json() as GoogleTokenPayload) : null;
}

export function generateGoogleAuthUrl(
    clientId: string,
    redirectUri: string,
    nonce: string,
    options?: { prompt?: string }
): URL {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'id_token');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('nonce', nonce);

    if (options?.prompt) {
        authUrl.searchParams.set('prompt', options.prompt);
    }

    return authUrl;
}

// Fonctions pour les en-têtes HTTP
export function corsHeaders(methods: string = 'GET, OPTIONS'): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': methods,
        'Access-Control-Allow-Headers': 'Content-Type'
    };
}

export function noCacheHeaders(): Record<string, string> {
    return {
        'Cache-Control': 'no-store',
        ...corsHeaders('GET, OPTIONS')
    };
}

// Fonctions JWT
function base64UrlEncode(input: string): string {
    return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromArrayBuffer(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createJWTAsync(
    payloadData: Record<string, any>,
    secret: string,
    opts?: { expiresInSeconds?: number }
): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };
    const iat = Math.floor(Date.now() / 1000);
    const payload: Record<string, any> = { iat, ...payloadData };

    if (opts?.expiresInSeconds) {
        payload.exp = iat + opts.expiresInSeconds;
    }

    const headerB64 = base64UrlEncode(JSON.stringify(header));
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const toSign = `${headerB64}.${payloadB64}`;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(toSign));
    const sigB64 = base64UrlFromArrayBuffer(sig);

    return `${toSign}.${sigB64}`;
}