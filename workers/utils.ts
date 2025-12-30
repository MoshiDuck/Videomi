// INFO : workers/utils.ts
import type { Context } from 'hono';
import type { Bindings, Variables } from './types';

// Fonction pour déterminer le Content-Type basé sur l'extension
export function getContentTypeFromKey(key: string): string {
    const extension = key.toLowerCase().split('.').pop();

    const mimeTypes: Record<string, string> = {
        'm3u8': 'application/x-mpegURL',
        'mpd': 'application/dash+xml',
        'm4s': 'video/iso.segment',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'avi': 'video/x-msvideo',
        'mov': 'video/quicktime',
        'mkv': 'video/x-matroska',
        'flv': 'video/x-flv',
        'wmv': 'video/x-ms-wmv',
        'mpeg': 'video/mpeg',
        'mpg': 'video/mpeg',
        'ts': 'video/mp2t',
        '3gp': 'video/3gpp',
        'm4v': 'video/x-m4v',
        'ogg': 'video/ogg',
        'ogv': 'video/ogg',
        'vtt': 'text/vtt',
        'srt': 'text/srt',
        'ass': 'text/x-ass',
        'ssa': 'text/x-ssa',
        'json': 'application/json',
        'default': 'application/octet-stream'
    };

    return mimeTypes[extension || ''] || mimeTypes.default;
}

// Nettoyage de clé pour R2
export function cleanKey(key: string): string {
    return key
        .replace(/[^\w\-\/\.]/g, '_')  // Remplace les caractères non alphanumériques par _
        .replace(/\/+/g, '/')          // Supprime les doubles slashes
        .replace(/^\/+|\/+$/g, '');    // Supprime les slashes en début/fin
}

// Middleware CORS (réutilisable)
export async function corsMiddleware(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: () => Promise<void>) {
    console.log(`🌐 ${c.req.method} ${c.req.path} - Origin: ${c.req.header('Origin')}`);
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Electron-App, X-Requested-With, X-Folder');
    c.header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    c.header('Access-Control-Allow-Credentials', 'true');

    if (c.req.method === 'OPTIONS') {
        c.header('Access-Control-Max-Age', '86400');
        return c.text('');
    }

    await next();
}

// -----------------------
// Crypto / Token helpers
// -----------------------

// base64url encode
function base64UrlEncode(bytes: Uint8Array) {
    const str = String.fromCharCode(...Array.from(bytes));
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// gen random token (base64url) length in bytes
export function generateRandomToken(bytesLength = 48): string {
    const arr = crypto.getRandomValues(new Uint8Array(bytesLength));
    return base64UrlEncode(arr);
}

// HMAC-SHA256 hash of token using secret (returns hex)
export async function hashTokenHMAC(token: string, secret: string): Promise<string> {
    // secret: string (if base64, allow direct string too)
    const enc = new TextEncoder();
    const keyData = enc.encode(secret);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(token));
    const sigBytes = new Uint8Array(sig);
    // hex
    return Array.from(sigBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Parse cookies header into object
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) return cookies;
    const parts = cookieHeader.split(';');
    for (const part of parts) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const name = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        cookies[name] = decodeURIComponent(val);
    }
    return cookies;
}

// build / clear refresh cookie (remplace les versions actuelles)
export function buildRefreshTokenCookie(token: string, options?: {
    maxAgeDays?: number;
    path?: string;
    sameSite?: 'Lax' | 'Strict' | 'None';
    secure?: boolean; // new: permet de désactiver Secure pour tests locaux
}): string {
    const maxAgeDays = options?.maxAgeDays ?? 30;
    const maxAge = Math.floor(maxAgeDays * 24 * 60 * 60);
    const path = options?.path ?? '/';
    const sameSite = options?.sameSite ?? 'Lax';

    // Par défaut on met Secure = true (production). Pour tests locaux tu peux appeler avec { secure: false }.
    const secureFlag = options?.secure === false ? '' : '; Secure';

    // HttpOnly + SameSite par défaut. Secure ajouté selon options.
    const cookie = `refresh_token=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=${path}; HttpOnly; SameSite=${sameSite}${secureFlag}`;
    return cookie;
}

export function buildClearRefreshCookie(path = '/', options?: { secure?: boolean }): string {
    const secureFlag = options?.secure === false ? '' : '; Secure';
    return `refresh_token=deleted; Path=${path}; Max-Age=0; HttpOnly; SameSite=Lax${secureFlag}`;
}

// Fonction pour hasher un mot de passe avec PBKDF2
export async function hashPassword(password: string): Promise<string> {
    // Créer un sel aléatoire
    const salt = crypto.getRandomValues(new Uint8Array(16));

    // Convertir le mot de passe en ArrayBuffer
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // Importer la clé (le mot de passe)
    const key = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );

    // Dériver la clé avec PBKDF2
    const iterations = 100000; // Nombre d'itérations recommandé
    const hashLength = 32; // 256 bits

    const derivedKey = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: iterations,
            hash: 'SHA-256'
        },
        key,
        hashLength * 8
    );

    // Convertir en base64 pour stockage
    const hashArray = new Uint8Array(derivedKey);
    const saltB64 = btoa(String.fromCharCode(...salt));
    const hashB64 = btoa(String.fromCharCode(...hashArray));

    // Format: pbkdf2-sha256$iterations$salt$hash
    return `pbkdf2-sha256$${iterations}$${saltB64}$${hashB64}`;
}

// Fonction pour vérifier un mot de passe
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
    try {
        console.log('🔐 [verifyPassword] Début de la vérification');
        console.log('📦 [verifyPassword] Hash stocké reçu:', (storedHash ?? '').substring(0, 100) + '...');
        console.log('📦 [verifyPassword] Longueur du hash:', (storedHash ?? '').length);

        // Extraire les composants du hash stocké
        const parts = storedHash.split('$');
        console.log('📦 [verifyPassword] Hash parts:', parts.length, 'parts');

        if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') {
            console.error('❌ [verifyPassword] Format de hash invalide');
            console.error('❌ [verifyPassword] Première partie:', parts[0]);
            console.error('❌ [verifyPassword] Nombre de parties:', parts.length);
            throw new Error('Format de hash invalide');
        }

        const iterations = parseInt(parts[1]);
        console.log('🔢 [verifyPassword] Itérations:', iterations);

        if (isNaN(iterations) || iterations <= 0) {
            console.error('❌ [verifyPassword] Nombre d\'itérations invalide');
            throw new Error('Nombre d\'itérations invalide');
        }

        // Décoder le sel (base64)
        const saltB64 = parts[2];
        console.log('🧂 [verifyPassword] Salt (base64):', (saltB64 ?? '').substring(0, 30) + '...');

        let salt: string;
        try {
            salt = atob(saltB64);
            console.log('✅ [verifyPassword] Salt décodé, longueur:', (salt ?? '').length);
        } catch (decodeError: unknown) {
            // sécuriser l'accès au message d'erreur
            const msg = decodeError instanceof Error ? decodeError.message : String(decodeError);
            console.error('❌ [verifyPassword] Erreur de décodage base64 du sel:', msg);
            throw new Error('Erreur de décodage du sel');
        }

        const storedHashB64 = parts[3];
        console.log('🔑 [verifyPassword] Hash stocké (base64):', (storedHashB64 ?? '').substring(0, 30) + '...');

        // Convertir le sel en ArrayBuffer
        const saltBuffer = new Uint8Array(salt.length);
        for (let i = 0; i < salt.length; i++) {
            saltBuffer[i] = salt.charCodeAt(i);
        }

        console.log('🔢 [verifyPassword] Salt buffer créé, taille:', saltBuffer.length);

        // Convertir le mot de passe en ArrayBuffer
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        console.log('🔢 [verifyPassword] Password buffer créé, taille:', passwordBuffer.length);

        // Importer la clé
        console.log('🔑 [verifyPassword] Importation de la clé...');
        const key = await crypto.subtle.importKey(
            'raw',
            passwordBuffer,
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );

        // Recréer le hash avec les mêmes paramètres
        console.log('🔑 [verifyPassword] Dérivation du hash...');
        const derivedKey = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: saltBuffer,
                iterations: iterations,
                hash: 'SHA-256'
            },
            key,
            256 // 256 bits
        );

        // Comparer les hashs
        const derivedHash = new Uint8Array(derivedKey);
        const derivedHashB64 = btoa(String.fromCharCode(...derivedHash));

        console.log('🔍 [verifyPassword] Comparaison des hashs:');
        console.log('🔍 [verifyPassword] Stored hash (preview):', (storedHashB64 ?? '').substring(0, 30));
        console.log('🔍 [verifyPassword] Derived hash (preview):', derivedHashB64.substring(0, 30));

        const isValid = derivedHashB64 === storedHashB64;
        console.log('✅ [verifyPassword] Mot de passe valide?:', isValid);

        if (!isValid) {
            console.warn('⚠️ [verifyPassword] Hashs différents!');
            console.warn('⚠️ [verifyPassword] Stored hash length:', (storedHashB64 ?? '').length);
            console.warn('⚠️ [verifyPassword] Derived hash length:', derivedHashB64.length);
        }

        return isValid;
    } catch (error: unknown) {
        // Normaliser l'erreur pour TypeScript strict
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('❌ [verifyPassword] Erreur lors de la vérification du mot de passe:');
        console.error('❌ [verifyPassword] Message:', err.message);
        console.error('❌ [verifyPassword] Stack:', err.stack);
        return false;
    }
}

// Validation d'email simple
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

export async function authMiddleware(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: () => Promise<void>) {
    // Routes publiques
    const publicRoutes = [
        '/api/login',
        '/api/register',
        '/api/check-email',
        '/api/session',
        '/api/verify-token',
        '/api/debug/'  // Les routes de debug sont publiques
    ];

    const currentPath = c.req.path;

    // Vérifier si c'est une route publique
    const isPublicRoute = publicRoutes.some(route => currentPath.startsWith(route));

    if (isPublicRoute) {
        return await next();
    }

    // Routes protégées pour le streaming
    const protectedStreamingRoutes = [
        '/api/streaming/',
        '/api/videos',
        '/api/video/',
        '/api/asset/check/',
        '/api/upload-proxy/'
    ];

    const isProtectedRoute = protectedStreamingRoutes.some(route => currentPath.startsWith(route));

    if (isProtectedRoute) {
        // Extraire le token
        const authHeader = c.req.header('Authorization');
        const { verifyToken, extractTokenFromHeader } = await import('./jwt');

        const token = extractTokenFromHeader(authHeader || null);

        if (!token) {
            return c.json({
                success: false,
                error: 'Token d\'authentification manquant'
            }, 401);
        }

        if (!c.env.JWT_SECRET) {
            console.error('❌ JWT_SECRET non défini');
            return c.json({
                success: false,
                error: 'Erreur de configuration serveur'
            }, 500);
        }

        // Vérifier le token
        const payload = await verifyToken(token, c.env.JWT_SECRET);

        if (!payload) {
            return c.json({
                success: false,
                error: 'Token invalide ou expiré'
            }, 401);
        }

        // Ajouter les informations de l'utilisateur au contexte avec le UID
        c.set('user', {
            id: payload.sub,
            uid: payload.uid || '',  // Ajout du UID
            email: payload.email
        });
    }

    await next();
}
