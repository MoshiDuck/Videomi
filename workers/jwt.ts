// INFO : workers/jwt.ts
import { SignJWT, jwtVerify, errors as JoseErrors } from 'jose';
import type { JWTPayload } from './types';

// Fonction pour créer un token JWT avec durée personnalisée
export async function createToken(
    payload: Omit<JWTPayload, 'iat' | 'exp'>,
    secret: string,
    expirationSeconds: number = 30 * 60 // Par défaut 30 minutes
): Promise<string> {
    try {
        console.log('🎫 Début de la création du token JWT');
        console.log('📝 Payload:', payload);
        console.log('⏱️ Durée:', expirationSeconds, 'secondes');

        if (!secret || secret.trim() === '') {
            console.error('❌ JWT_SECRET est vide ou undefined');
            throw new Error('JWT_SECRET is not defined or empty in environment variables');
        }

        const encoder = new TextEncoder();
        let secretBytes: Uint8Array;

        try {
            if (secret.length % 4 === 0 && /^[A-Za-z0-9+/]+=*$/.test(secret)) {
                console.log('🔧 Secret semble être en base64');
                const binaryString = atob(secret);
                const len = binaryString.length;
                secretBytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    secretBytes[i] = binaryString.charCodeAt(i);
                }
            } else {
                console.log('🔧 Secret traité comme chaîne de caractères brute');
                secretBytes = encoder.encode(secret);
            }
        } catch (decodeError) {
            console.log('⚠️ Erreur de décodage base64, utilisation comme chaîne brute');
            secretBytes = encoder.encode(secret);
        }

        // Créer le token avec jose
        const token = await new SignJWT({
            ...payload,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + expirationSeconds
        })
            .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
            .setIssuedAt()
            .setExpirationTime(`${expirationSeconds}s`)
            .sign(secretBytes);

        console.log('✅ JWT token généré avec succès');
        console.log('📏 Longueur du token:', token.length);

        return token;
    } catch (error: any) {
        console.error('❌ ERREUR CRITIQUE lors de la création du token:', error);
        throw new Error(`Failed to create JWT token: ${error.message}`);
    }
}

// Fonction pour vérifier et décoder un token JWT
export async function verifyToken(
    token: string,
    secret: string
): Promise<JWTPayload | null> {
    try {
        console.log('🔍 Vérification du token...');

        if (!secret) {
            console.error('❌ JWT_SECRET est vide');
            return null;
        }

        const encoder = new TextEncoder();
        let secretBytes: Uint8Array;

        try {
            if (secret.length % 4 === 0 && /^[A-Za-z0-9+/]+=*$/.test(secret)) {
                const binaryString = atob(secret);
                const len = binaryString.length;
                secretBytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    secretBytes[i] = binaryString.charCodeAt(i);
                }
            } else {
                secretBytes = encoder.encode(secret);
            }
        } catch {
            secretBytes = encoder.encode(secret);
        }

        const { payload } = await jwtVerify(token, secretBytes, {
            algorithms: ['HS256']
        });

        // Retourner le payload avec UID
        const jwtPayload: JWTPayload = {
            sub: String(payload.sub),
            uid: payload.uid ? String(payload.uid) : undefined,
            email: String(payload.email),
            iat: Number(payload.iat),
            exp: Number(payload.exp)
        };

        // SUPPRIMER LA RÉFÉRENCE À is_temp
        // if (payload.is_temp !== undefined) {
        //     jwtPayload.is_temp = Boolean(payload.is_temp);
        // }

        if (jwtPayload.exp * 1000 < Date.now()) {
            console.error('❌ Token expiré');
            return null;
        }

        return jwtPayload;
    } catch (error) {
        if (error instanceof JoseErrors.JWTExpired) {
            console.error('❌ Token JWT expiré');
        } else if (error instanceof JoseErrors.JWTInvalid) {
            console.error('❌ Token JWT invalide');
        } else if (error instanceof Error) {
            console.error('❌ Erreur de vérification JWT:', error.message);
        }
        return null;
    }
}

// Fonction pour extraire le token du header Authorization
export function extractTokenFromHeader(authorizationHeader: string | null): string | null {
    if (!authorizationHeader) {
        return null;
    }

    const parts = authorizationHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return null;
    }

    return parts[1];
}