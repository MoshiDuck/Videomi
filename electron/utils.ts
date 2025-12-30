// INFO : electron/utils.ts
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Fonction utilitaire pour extraire le message d'erreur de manière sûre
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    } else if (typeof error === 'string') {
        return error;
    } else {
        return 'Erreur inconnue';
    }
}

// Fonction fetch avec timeout
export async function fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeout = 10000
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// Fonction pour déterminer le Content-Type
export function getContentTypeFromFile(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.mp4': 'video/mp4',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.webm': 'video/webm',
        '.flv': 'video/x-flv',
        '.wmv': 'video/x-ms-wmv',
        '.mpeg': 'video/mpeg',
        '.mpg': 'video/mpeg',
        '.ts': 'video/mp2t',
        '.mts': 'video/mp2t',
        '.m2ts': 'video/mp2t',
        '.3gp': 'video/3gpp',
        '.3g2': 'video/3gpp2',
        '.ogg': 'video/ogg',
        '.ogv': 'video/ogg',
        '.m3u8': 'application/vnd.apple.mpegurl',
        '.mpd': 'application/dash+xml',
        '.m4s': 'video/iso.segment',
        '.vtt': 'text/vtt',
        '.srt': 'text/srt',
        '.ass': 'text/x-ass',
        '.ssa': 'text/x-ssa',
        '.pgs': 'application/octet-stream',
        '.sup': 'application/octet-stream',
        '.json': 'application/json'
    };

    return mimeTypes[ext] || 'application/octet-stream';
}

// Simple promise-based sleep
export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Attendre qu'un fichier soit stable (ne change plus de taille)
export async function waitForFileStable(filePath: string, checkInterval = 100, maxAttempts = 50): Promise<boolean> {
    console.log(`⏳ Attente stabilisation fichier: ${path.basename(filePath)}`);
    let previousSize = -1;
    let stableCount = 0;
    const requiredStableChecks = 3; // Nécessite 3 vérifications stables consécutives

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            if (!fs.existsSync(filePath)) {
                console.log(`📭 Fichier non existant (tentative ${attempt + 1}/${maxAttempts})`);
                await sleep(checkInterval);
                continue;
            }

            const stats = fs.statSync(filePath);
            const currentSize = stats.size;

            if (currentSize === previousSize) {
                stableCount++;
                console.log(`📊 Taille stable ${stableCount}/${requiredStableChecks}: ${currentSize} bytes`);

                if (stableCount >= requiredStableChecks) {
                    console.log(`✅ Fichier stabilisé: ${path.basename(filePath)} (${currentSize} bytes)`);
                    return true;
                }
            } else {
                stableCount = 0;
                console.log(`📈 Taille changée: ${previousSize} -> ${currentSize} bytes`);
            }

            previousSize = currentSize;
        } catch (error) {
            console.log(`⚠️ Erreur vérification fichier (tentative ${attempt + 1}): ${getErrorMessage(error)}`);
        }

        await sleep(checkInterval);
    }

    console.log(`⚠️ Timeout stabilisation fichier: ${path.basename(filePath)}`);
    return false;
}

// Obtenir la durée de la vidéo via ffprobe
export async function getVideoDuration(filePath: string): Promise<number> {
    try {
        const probeCmd = `ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
        const { stdout } = await execAsync(probeCmd);
        const duration = parseFloat(stdout.trim());
        console.log(`⏱️ Durée vidéo: ${duration} secondes`);
        return duration || 600; // Fallback à 10 minutes
    } catch (error) {
        console.warn(`⚠️ Impossible d'obtenir la durée: ${getErrorMessage(error)}`);
        return 600; // Fallback à 10 minutes
    }
}

// Fonction pour estimer le nombre total de segments basé sur la durée
export async function estimateTotalSegments(filePath: string, segmentTime: number = 6): Promise<number> {
    try {
        const duration = await getVideoDuration(filePath);
        const estimatedSegments = Math.ceil(duration / segmentTime);
        console.log(`📊 Estimation segments: ${duration}s / ${segmentTime}s = ${estimatedSegments} segments`);
        return Math.max(1, estimatedSegments); // Au moins 1 segment
    } catch (error) {
        console.warn(`⚠️ Impossible d'estimer les segments: ${getErrorMessage(error)}`);
        return 50; // Valeur par défaut
    }
}