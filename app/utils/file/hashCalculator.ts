// INFO : app/utils/hashCalculator.ts
import { createSHA256 } from 'hash-wasm';

/**
 * Calcule le hash SHA-256 d'un fichier en utilisant hash-wasm qui supporte le streaming.
 * Cette approche permet de gérer des fichiers de toute taille (>2GB) sans charger
 * tout le fichier en mémoire grâce au hachage incrémental.
 */
export async function calculateSHA256(file: File): Promise<string> {
    const chunkSize = 2 * 1024 * 1024; // 2MB par chunk pour un bon équilibre performance/mémoire
    const hasher = await createSHA256();
    const reader = file.stream().getReader();
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // hash-wasm attend un Uint8Array
            const uint8Array = value instanceof Uint8Array ? value : new Uint8Array(value);
            hasher.update(uint8Array);
        }
        
        return hasher.digest('hex');
    } finally {
        reader.releaseLock();
    }
}

/**
 * Alias pour calculateSHA256 - utilise la même méthode avec streaming
 */
export async function calculateChunkedHash(
    file: File,
    chunkSize: number = 10 * 1024 * 1024 // Paramètre ignoré, conservé pour compatibilité
): Promise<string> {
    return calculateSHA256(file);
}

export function generateFileId(file: File, hash: string): string {
    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'bin';
    return `${hash.slice(0, 16)}_${timestamp}.${extension}`;
}