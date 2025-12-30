// INFO : electron/upload.ts
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import fetch from 'node-fetch';
import { WORKER_CONFIG } from './config.js';
import { getErrorMessage, getContentTypeFromFile } from './utils.js';
import { FetchResponse, UploadOptions, UploadResult, AssetCheckResult } from './types.js';
import { getAuthHeaders, getUID } from './auth.js';

// Vérifier si l'asset existe déjà sur le serveur
export async function checkAssetExists(sha256: string): Promise<AssetCheckResult> {
    try {
        console.log(`🔍 Vérification de l'existence de l'asset: ${sha256}`);
        const checkUrl = `${WORKER_CONFIG.url}/api/asset/check/${sha256}`;

        // Utiliser les headers d'authentification
        const headers = getAuthHeaders();
        headers['Accept'] = 'application/json';

        const response = await fetch(checkUrl, {
            method: 'GET',
            headers
        });

        if (response.status === 200) {
            const data = await response.json();
            console.log(`✅ Asset déjà existant: ${sha256}`);
            return {
                exists: true,
                url: data.url,
                uid: data.uid,
                metadata: data.metadata
            };
        } else if (response.status === 401 || response.status === 403) {
            console.log(`🔒 Authentification requise pour vérifier l'asset`);
            throw new Error('Authentification requise');
        } else if (response.status === 404) {
            console.log(`🆕 Asset non trouvé, upload nécessaire: ${sha256}`);
            return { exists: false };
        } else {
            console.warn(`⚠️ Statut inattendu lors de la vérification: ${response.status}`);
            return { exists: false };
        }
    } catch (error) {
        console.error(`❌ Erreur lors de la vérification de l'asset:`, getErrorMessage(error));
        throw error;
    }
}

// fetchWithRetry
export async function fetchWithRetry(url: string, opts: any, retries = 3, baseDelay = 500): Promise<FetchResponse> {
    console.log(`🔁 fetchWithRetry: ${url}, retries=${retries}`);
    let lastError: unknown = new Error('fetchWithRetry: unknown error');

    for (let i = 0; i <= retries; i++) {
        try {
            console.log(`📡 Tentative ${i + 1}/${retries + 1} pour ${url}`);
            const raw = await fetch(url, opts);
            const res = raw as unknown as FetchResponse;

            if (res.ok) {
                console.log(`✅ fetchWithRetry réussi pour ${url}`);
                return res;
            }

            const text = await res.text().catch(() => '');
            lastError = new Error(`HTTP ${res.status}: ${text}`);
            console.warn(`❌ fetchWithRetry échec HTTP ${res.status} pour ${url}: ${text.substring(0, 200)}`);
            if (i === retries) throw lastError;
        } catch (e) {
            lastError = e;
            console.error(`❌ fetchWithRetry erreur pour ${url} (tentative ${i + 1}):`, getErrorMessage(e));
            if (i === retries) throw e;
        }

        const delay = baseDelay * Math.pow(2, i);
        console.log(`⏳ Attente de ${delay}ms avant nouvelle tentative...`);
        await new Promise((r) => setTimeout(r, delay));
    }

    throw lastError;
}

// Fonction d'upload avec support SHA-256
export async function uploadToWorker(filePath: string, options?: UploadOptions): Promise<UploadResult> {
    console.log(`🚀 uploadToWorker: ${filePath}`, options);
    try {
        const stats = fs.statSync(filePath);
        console.log(`📊 Taille du fichier: ${stats.size} bytes`);

        const originalName = path.basename(filePath);
        let key = options?.key || originalName;

        // Pour les segments, assurer l'extension .m4s
        if (options?.isSegment && !key.endsWith('.m4s')) {
            key = `${key}.m4s`;
        }

        const urlKey = encodeURIComponent(key);
        const url = `${WORKER_CONFIG.url}/api/upload-proxy/${urlKey}`;

        console.log(`📤 Envoi vers: ${url}`);
        console.log(`🔑 Clé finale: ${key}`);

        // Récupérer le UID
        const uid = getUID();
        if (!uid) {
            throw new Error('UID utilisateur non disponible. Veuillez vous reconnecter.');
        }

        // Construire le chemin avec UID
        let folder = options?.folder || '';
        if (folder) {
            // Si le dossier est fourni (format: videos/sha256), le transformer en uid/videos/sha256
            const parts = folder.split('/');
            if (parts[0] === 'videos' && parts.length >= 2) {
                const sha256 = parts[1];
                folder = `${uid}/videos/${sha256}`;
            } else {
                // Sinon, préfixer par le UID
                folder = `${uid}/${folder}`;
            }
        }

        // Utiliser les headers d'authentification
        const headers = getAuthHeaders();
        headers['Content-Type'] = getContentTypeFromFile(filePath);
        headers['Content-Length'] = String(stats.size);

        // Si un dossier est spécifié, l'utiliser
        if (folder) {
            headers['X-Folder'] = folder;
            console.log(`📁 Dossier R2 avec UID: ${folder}`);
        }

        // Ajouter les headers pour les segments
        if (options?.isSegment) headers['X-Is-Segment'] = 'true';
        if (options?.segmentNumber) headers['X-Segment-Number'] = String(options.segmentNumber);
        if (options?.totalSegments) headers['X-Total-Segments'] = String(options.totalSegments);
        if (options?.cacheControl) headers['X-Cache-Control'] = options.cacheControl;

        Object.entries(WORKER_CONFIG.defaultUploadHeaders || {}).forEach(([k, v]) => {
            headers[`X-Worker-Header-${k}`] = String(v);
        });

        console.log(`📤 Headers:`, headers);

        const stream = fs.createReadStream(filePath);
        console.log(`📦 Flux de lecture créé pour ${filePath}`);

        const res = await fetchWithRetry(url, {
            method: 'PUT',
            headers,
            body: stream,
        });

        const text = await res.text().catch(() => '');
        console.log(`📥 Réponse du Worker (${res.status}): ${text.substring(0, 200)}...`);

        let result: any;
        try {
            result = JSON.parse(text);
            console.log(`✅ Réponse JSON parsée:`, result);
        } catch {
            result = { success: res.ok, message: text };
            console.log(`⚠️ Réponse non-JSON, succès: ${res.ok}`);
        }

        if (!res.ok || !result.success) {
            throw new Error(result.error || `Upload failed (${res.status}): ${text}`);
        }

        console.log(`✅ Upload réussi pour ${key}`);
        return {
            success: true,
            key: result.key || (folder ? `${folder}/${key}` : key),
            uid: result.uid || uid,
            url: result.url,
            message: 'Upload réussi via Worker (PUT)'
        };
    } catch (error: any) {
        console.error('❌ Erreur upload Worker (PUT):', error);
        throw error;
    }
}

// Calculer le SHA-256 d'un fichier (streaming)
export async function computeFileSHA256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on('data', (data) => {
            hash.update(data);
        });

        stream.on('end', () => {
            const sha256 = hash.digest('hex');
            console.log(`🔐 SHA-256 calculé: ${sha256} pour ${path.basename(filePath)}`);
            resolve(sha256);
        });

        stream.on('error', (err) => {
            reject(err);
        });
    });
}