// INFO : app/components/UploadManager.tsx - VERSION CORRIGÉE AVEC forwardRef
import React, { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { calculateSHA256, calculateChunkedHash, generateFileId } from '~/utils/file/hashCalculator';
import { classifyFile } from '~/utils/file/fileClassifier';
import { useAuth } from '~/hooks/useAuth';
import { ErrorDisplay } from '~/components/ui/ErrorDisplay';
import { darkTheme } from '~/utils/ui/theme';
import { extractBaseMetadata, extractFileCreationDate, type BaseAudioMetadata, type BaseVideoMetadata } from '~/utils/file/fileMetadataExtractor';
import { invalidateFileCache, invalidateUserFileCache } from '~/hooks/useFiles';
import { handleCacheInvalidation } from '~/utils/cache/cacheInvalidation';
import { formatFileSize } from '~/utils/format';
import { useLanguage } from '~/contexts/LanguageContext';
// Imports pour WebCodecs transcoder (pas encore utilisé directement ici)

// Types stricts
interface UploadChunkResponse {
    success: boolean;
    etag: string;
    url?: string;
}

interface InitiateMultipartUploadResponse {
    uploadId: string;
    fileId: string;
    category: string;
    expiresIn: number;
    exists?: boolean;
}

type UploadStatus = 'pending' | 'hashing' | 'checking' | 'transcoding' | 'uploading' | 'merging' | 'completed' | 'error' | 'paused';

interface UploadProgress {
    fileId: string;
    fileName: string;
    status: UploadStatus;
    progress: number;
    total: number;
    uploaded: number;
    speed: number;
    estimatedTime: number;
    error?: string;
    category?: string;
    transcoded?: boolean;
    segments?: number;
    currentSegment?: number;
    // État pour la reprise
    uploadId?: string;
    uploadedParts?: Array<{ partNumber: number; etag: string }>;
    hash?: string;
}

interface UploadManagerProps {
    onUploadComplete?: (fileId: string) => void;
    onProgress?: (progress: UploadProgress[]) => void;
    maxConcurrentUploads?: number;
    chunkSize?: number;
}

// Interface pour les méthodes exposées via ref
export interface UploadManagerHandle {
    uploadFiles: (files: FileList | File[]) => Promise<void>;
    cancelUpload: (fileId: string) => void;
    pauseUpload: (fileId: string) => void;
    resumeUpload: (fileId: string) => void;
    getUploads: () => UploadProgress[];
}

// Composant avec forwardRef
export const UploadManager = forwardRef<UploadManagerHandle, UploadManagerProps>(function UploadManager(
    {
        onUploadComplete,
        onProgress,
        maxConcurrentUploads = 3,
        chunkSize = 10 * 1024 * 1024
    }: UploadManagerProps,
    ref
) {
    const { user } = useAuth();
    const { t } = useLanguage();
    const [uploads, setUploads] = useState<UploadProgress[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const uploadQueue = useRef<File[]>([]);
    const activeUploads = useRef<Set<string>>(new Set());
    const abortControllers = useRef<Map<string, AbortController>>(new Map());
    

    // Refs pour stocker les fichiers et permettre la reprise
    const fileObjectsRef = useRef<Map<string, File>>(new Map());
    const uploadPromisesRef = useRef<Map<string, { promise: Promise<void>; cancel: () => void }>>(new Map());

    // Exposer les méthodes via ref
    useImperativeHandle(ref, () => ({
        uploadFiles,
        cancelUpload,
        pauseUpload,
        resumeUpload,
        getUploads: () => uploads
    }));

    // Mettre à jour la progression via callback
    useEffect(() => {
        onProgress?.(uploads);
    }, [uploads, onProgress]);

    const updateProgress = useCallback((fileId: string, updates: Partial<UploadProgress>) => {
        setUploads(prev => prev.map(u =>
            u.fileId === fileId ? { ...u, ...updates } : u
        ));
    }, []);

    const uploadFileSimple = async (
        file: File | Uint8Array,
        fileId: string,
        uiFileId: string,
        category: string,
        hash: string,
        filename: string,
        isTranscodedFile: boolean,
        basicMetadata?: BaseAudioMetadata | BaseVideoMetadata | null,
        fileCreatedAt?: number | null
    ): Promise<{ fileId: string; exists: boolean; url?: string }> => {
        // Utiliser le nom original du fichier sans aucun filtrage
        const token = localStorage.getItem('videomi_token');
        const fileSize = file instanceof File ? file.size : file.byteLength;
        const mimeType = isTranscodedFile ? 'video/mp4' : (file instanceof File ? file.type : 'application/octet-stream');
        
        try {
            // Vérifier d'abord si le fichier existe déjà
            const checkResult = await checkFileExists(hash);
            if (checkResult.exists && checkResult.fileId) {
                return { fileId: checkResult.fileId, exists: true };
            }

            // Uploader le fichier directement via FormData avec le nom original
            const formData = new FormData();
            if (file instanceof File) {
                formData.append('file', file);
            } else {
                // Convertir Uint8Array en ArrayBuffer pour Blob
                // S'assurer que c'est un ArrayBuffer (pas SharedArrayBuffer)
                let buffer: ArrayBuffer;
                if (file.buffer instanceof ArrayBuffer) {
                    buffer = file.buffer;
                } else {
                    // Copier dans un nouveau ArrayBuffer
                    buffer = new ArrayBuffer(file.byteLength);
                    const view = new Uint8Array(buffer);
                    view.set(file);
                }
                const blob = new Blob([buffer], { type: mimeType });
                formData.append('file', blob, filename);
            }
            formData.append('userId', user?.id || '');
            formData.append('fileId', fileId);
            formData.append('hash', hash);
            formData.append('category', category);
            formData.append('filename', filename);
            // Ajouter les métadonnées de base si disponibles
            if (basicMetadata) {
                formData.append('basicMetadata', JSON.stringify(basicMetadata));
            }
            if (fileCreatedAt != null && fileCreatedAt > 0) {
                formData.append('file_created_at', String(fileCreatedAt));
            }
            
            const baseUrl = window.location.origin;
            const response = await fetch(`${baseUrl}/api/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData,
                signal: AbortSignal.timeout(300000) // 5 minutes timeout
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Échec upload simple: ${response.status} - ${errorText}`);
            }

            const result = await response.json() as { success?: boolean; file?: { id: string; url: string }; error?: string };
            
            if (result.success && result.file) {
                const finalFileId = result.file.id || fileId;
                
                // Ne plus stocker automatiquement les métadonnées
                // L'utilisateur choisira la correspondance via la page de sélection
                
                return {
                    fileId: finalFileId,
                    exists: false,
                    url: result.file.url
                };
            }
            
            throw new Error('Réponse invalide du serveur');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Échec upload simple: ${errorMessage}`);
        }
    };

    const checkFileExists = async (hash: string): Promise<{ exists: boolean; fileId: string | null }> => {
        try {
            const token = localStorage.getItem('videomi_token');
            const baseUrl = window.location.origin;
            const response = await fetch(`${baseUrl}/api/upload/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ hash }),
                signal: AbortSignal.timeout(30000)
            });

            if (!response.ok) throw new Error('Échec vérification fichier');
            const data = await response.json() as { exists: boolean; fileId: string | null };
            return { exists: data.exists, fileId: data.fileId };
        } catch (error) {
            console.warn('⚠️ Erreur vérification fichier:', error);
            return { exists: false, fileId: null };
        }
    };


    const initiateMultipartUpload = async (
        fileId: string,
        category: string,
        size: number,
        mimeType: string,
        filename?: string,
        hash?: string
    ): Promise<InitiateMultipartUploadResponse> => {
        const token = localStorage.getItem('videomi_token');
        const baseUrl = window.location.origin;
        const response = await fetch(`${baseUrl}/api/upload/init`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                fileId,
                category,
                size,
                mimeType,
                userId: user?.id,
                filename: filename, // DOIT toujours être fourni (nom original du fichier)
                hash
            }),
            // Init multipart peut être lente si la file R2 est chargée
            signal: AbortSignal.timeout(300000) // 5 minutes
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Échec initiation upload: ${response.status} - ${errorText}`);
        }

        return await response.json() as InitiateMultipartUploadResponse;
    };

    const uploadChunkWithRetry = async (
        uploadId: string,
        partNumber: number,
        chunk: ArrayBuffer,
        fileId: string,
        category: string,
        filename?: string,
        maxRetries = 3
    ): Promise<{ partNumber: number; etag: string }> => {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }

                const token = localStorage.getItem('videomi_token');
                const controller = new AbortController();
                abortControllers.current.set(`${fileId}_${partNumber}`, controller);

                // Encoder le filename en Base64 pour éviter les problèmes avec les caractères non-ASCII dans les headers HTTP
                // Les headers HTTP doivent être en ISO-8859-1, donc on encode en Base64 pour éviter les erreurs
                const encodedFilename = filename 
                    ? btoa(unescape(encodeURIComponent(filename)))
                    : 'null';

                // Utiliser une URL absolue pour éviter les problèmes de routage lors d'uploads simultanés
                const baseUrl = window.location.origin;

                // Envoyer les métadonnées dans les headers et le chunk dans le body
                const response = await fetch(`${baseUrl}/api/upload/part`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Authorization': `Bearer ${token || ''}`,
                        'X-Upload-Id': uploadId,
                        'X-Part-Number': String(partNumber),
                        'X-File-Id': fileId,
                        'X-Category': category,
                        'X-Filename': encodedFilename,
                        'X-Filename-Encoded': 'base64' // Indicateur que le filename est encodé
                    },
                    body: chunk,
                    signal: controller.signal
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Échec upload chunk ${partNumber}: ${response.status} - ${errorText}`);
                }

                const result = await response.json() as UploadChunkResponse;

                if (!result.success) {
                    throw new Error(`Échec upload chunk ${partNumber}`);
                }

                abortControllers.current.delete(`${fileId}_${partNumber}`);
                return { partNumber, etag: result.etag };

            } catch (error: unknown) {
                const errorObj = error instanceof Error ? error : new Error(String(error));
                lastError = errorObj;
                if (errorObj.name === 'AbortError') {
                    throw errorObj;
                }
                continue;
            }
        }

        throw lastError || new Error(`Échec upload chunk ${partNumber} après ${maxRetries} tentatives`);
    };

    const completeMultipartUpload = async (
        uploadId: string,
        parts: Array<{ partNumber: number; etag: string }>,
        filename?: string,
        basicMetadata?: BaseAudioMetadata | BaseVideoMetadata | null,
        fileCreatedAt?: number | null
    ): Promise<{ success: boolean; fileId: string; size: number; url: string }> => {
        const token = localStorage.getItem('videomi_token');
        const baseUrl = window.location.origin;
        
        // IMPORTANT: Inclure basicMetadata directement dans le body
        // - Si basicMetadata est undefined, il sera omis par JSON.stringify (comportement attendu)
        // - Si basicMetadata est null, il sera envoyé comme null (comportement attendu)
        // - Si basicMetadata est un objet, il sera envoyé normalement
        const bodyData: Record<string, any> = {
            uploadId,
            parts,
            filename: filename, // DOIT toujours être fourni (nom original du fichier)
        };
        
        // Toujours ajouter basicMetadata s'il existe (même si null, pour le debug)
        // Si c'est undefined, il ne sera pas ajouté (et sera omis par JSON.stringify)
        if (basicMetadata !== undefined) {
            bodyData.basicMetadata = basicMetadata;
        }
        if (fileCreatedAt != null && fileCreatedAt > 0) {
            bodyData.file_created_at = fileCreatedAt;
        }
        
        // Stringify le body
        const bodyJson = JSON.stringify(bodyData);
        
        const response = await fetch(`${baseUrl}/api/upload/complete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: bodyJson,
            // La finalisation multipart (assemblage de dizaines de chunks) peut être lente côté R2
            signal: AbortSignal.timeout(300000) // 5 minutes
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Échec finalisation upload: ${response.status} - ${errorText}`);
        }

        return await response.json() as { success: boolean; fileId: string; size: number; url: string };
    };

    const storeMetadata = async (fileId: string, metadata: any, maxRetries = 10): Promise<void> => {
        if (!metadata) {
            return;
        }

        const token = localStorage.getItem('videomi_token');
        if (!token) {
            console.warn(`⚠️ [METADATA] Token manquant pour stocker métadonnées de ${fileId}`);
            return;
        }

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // Pour les erreurs 404, attendre plus longtemps car le fichier peut prendre du temps à être créé
                    // Délai progressif : 500ms, 1000ms, 2000ms, 3000ms, etc. jusqu'à 5s max
                    const baseDelay = 500;
                    const delay = Math.min(baseDelay * attempt, 5000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                
                const baseUrl = window.location.origin;
                const response = await fetch(`${baseUrl}/api/files/${fileId}/metadata`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(metadata)
                });

                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    const is404 = response.status === 404;
                    
                    if (!is404) {
                        console.warn(`⚠️ [METADATA] Erreur stockage métadonnées (${response.status}):`, errorText.substring(0, 200));
                    }
                    
                    // Ne pas retry pour les erreurs 4xx (sauf 404, 429, 408)
                    if (response.status >= 400 && response.status < 500 && response.status !== 404 && response.status !== 429 && response.status !== 408) {
                        console.error(`❌ [METADATA] Erreur client (${response.status}), arrêt des retries`);
                        return;
                    }
                    
                    // Retry pour les erreurs 5xx, 404 (fichier pas encore créé), 429 (rate limit) ou 408 (timeout)
                    if (attempt < maxRetries - 1) {
                        if (is404 && attempt === 0) {
                            // Première tentative avec 404 : attendre un peu plus avant de retry
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        continue;
                    }
                    if (is404) {
                        console.warn(`⚠️ [METADATA] Fichier ${fileId} toujours non trouvé après ${maxRetries} tentatives (peut être créé plus tard)`);
                    } else {
                        console.error(`❌ [METADATA] Échec stockage métadonnées après ${maxRetries} tentatives`);
                    }
                    return;
                }

                const result = await response.json().catch(() => ({ success: false })) as { success?: boolean };
                if (result.success) {
                    return;
                } else {
                    console.warn(`⚠️ [METADATA] Réponse invalide du serveur:`, result);
                    if (attempt < maxRetries - 1) {
                        continue;
                    }
                }
            } catch (error) {
                console.warn(`⚠️ [METADATA] Erreur réseau stockage métadonnées (tentative ${attempt + 1}/${maxRetries}):`, error);
                
                // Retry pour les erreurs réseau
                if (attempt < maxRetries - 1) {
                    continue;
                }
                console.error(`❌ [METADATA] Échec réseau après ${maxRetries} tentatives:`, error);
            }
        }
        
        // Ne pas bloquer l'upload si le stockage des métadonnées échoue (non-bloquant)
        console.warn(`⚠️ [METADATA] Échec final stockage métadonnées après ${maxRetries} tentatives (non-bloquant)`);
    };


    // Invalider le cache des stats après un upload (D1 a été mis à jour)
    const invalidateStatsCache = () => {
        if (user?.id) {
            const cacheKey = `videomi_stats_${user.id}`;
            sessionStorage.removeItem(cacheKey);
            // Dispatcher un événement pour notifier que les stats doivent être rechargées
            window.dispatchEvent(new CustomEvent('videomi:stats-invalidated', { detail: { userId: user.id } }));
        }
    };

    /**
     * Upload un fichier via multipart upload
     * 
     * @param file - Le fichier à uploader (File ou Uint8Array)
     * @param fileId - L'ID unique du fichier (pour le serveur)
     * @param uiFileId - L'ID pour l'UI (pour updateProgress)
     * @param category - La catégorie du fichier (videos, musics, images, etc.)
     * @param hash - Le hash SHA-256 du fichier pour la déduplication
     * @param originalFileName - Le nom original du fichier
     * @param isTranscodedFile - Indique si le fichier a déjà été transcodé (sera utilisé pour WebCodecs)
     *                           Note: Actuellement non utilisé, sera implémenté avec WebCodecs pour videos/musics
     */
    const uploadFileMultipart = async (
        file: File | Uint8Array,
        fileId: string,
        uiFileId: string,
        category: string,
        hash: string,
        originalFileName?: string,
        isTranscodedFile = false,
        basicMetadata?: BaseAudioMetadata | BaseVideoMetadata | null,
        fileCreatedAt?: number | null
    ): Promise<{ fileId: string; exists: boolean; url?: string }> => {
        // Le nom de fichier est déjà nettoyé et enrichi par uploadFile avant l'appel
        // originalFileName contient déjà le titre enrichi
        const fileName = originalFileName || (file instanceof File ? file.name : 'segment.m4s');
        const fileSize = file instanceof File ? file.size : file.byteLength;

        // R2 multipart upload nécessite:
        // - Taille minimale par partie (sauf dernière): 5MB
        // - Taille minimale dernière partie: 10011 bytes (~10KB)
        // - Fichier total >= 10MB recommandé pour avoir une marge de sécurité
        // Note: On utilise 10MB comme seuil pour être plus conservateur et éviter les erreurs
        const MULTIPART_MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB minimum par partie (exigence R2)
        const MULTIPART_MIN_LAST_PART_SIZE = 10011; // ~10KB minimum pour la dernière partie (exigence R2)
        const MULTIPART_RECOMMENDED_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB recommandé pour sécurité
        
        // Vérifier d'abord si le fichier est assez grand pour multipart
        // Utiliser 10MB comme seuil pour plus de sécurité et éviter les erreurs de taille minimale
            if (fileSize < MULTIPART_RECOMMENDED_TOTAL_SIZE) {
                return await uploadFileSimple(file, fileId, uiFileId, category, hash, fileName, isTranscodedFile, basicMetadata, fileCreatedAt);
        }
        
        // Calculer les chunks AVANT d'initier l'upload multipart
        const effectiveChunkSize = Math.max(chunkSize, MULTIPART_MIN_PART_SIZE);
        const chunks = Math.ceil(fileSize / effectiveChunkSize);
        const lastChunkSize = fileSize % effectiveChunkSize || effectiveChunkSize;
        
        // Si un seul chunk, vérifier qu'il fait au moins 5MB
        if (chunks === 1) {
            if (fileSize < MULTIPART_MIN_PART_SIZE) {
                return await uploadFileSimple(file, fileId, uiFileId, category, hash, fileName, isTranscodedFile, basicMetadata, fileCreatedAt);
            }
        } else {
            // Si plusieurs chunks, vérifier que le dernier fait au moins 10011 bytes
            if (lastChunkSize > 0 && lastChunkSize < MULTIPART_MIN_LAST_PART_SIZE) {
                return await uploadFileSimple(file, fileId, uiFileId, category, hash, fileName, isTranscodedFile, basicMetadata, fileCreatedAt);
            }
        }
        

        try {
            const uploadResult = await initiateMultipartUpload(
                fileId,
                category,
                fileSize,
                isTranscodedFile ? 'video/mp4' : (file instanceof File ? file.type : 'application/octet-stream'),
                fileName,
                hash
            );

            if (uploadResult.exists) {
                return { fileId: uploadResult.fileId, exists: true };
            }

            const parts: Array<{ partNumber: number; etag: string }> = [];
            const startTime = Date.now();
            const PARALLEL_UPLOADS = 3; // Nombre de chunks uploadés en parallèle


            // Fonction pour lire un chunk
            const readChunk = async (chunkIndex: number): Promise<{ partNumber: number; data: ArrayBuffer; size: number }> => {
                const start = chunkIndex * effectiveChunkSize;
                const end = Math.min(start + effectiveChunkSize, fileSize);
                const currentChunkSize = end - start;
                const partNumber = chunkIndex + 1;

                // Vérifier la taille du chunk avant upload
                if (chunkIndex < chunks - 1 && currentChunkSize < MULTIPART_MIN_PART_SIZE) {
                    throw new Error(`Chunk ${partNumber} trop petit: ${currentChunkSize} bytes < ${MULTIPART_MIN_PART_SIZE} bytes`);
                }
                if (chunkIndex === chunks - 1 && chunks > 1 && currentChunkSize < MULTIPART_MIN_LAST_PART_SIZE) {
                    throw new Error(`Dernier chunk trop petit: ${currentChunkSize} bytes < ${MULTIPART_MIN_LAST_PART_SIZE} bytes`);
                }

                let chunkData: ArrayBuffer;
                if (file instanceof File) {
                    if (file.size === 0 || file.size < end) {
                        throw new Error(`File is invalid: size=${file.size}, requested end=${end}`);
                    }
                    
                    try {
                    const chunkBlob = file.slice(start, end);
                        if (!chunkBlob || chunkBlob.size === 0) {
                            throw new Error(`Failed to create chunk blob for chunk ${partNumber}`);
                        }
                        const tempBuffer = await chunkBlob.arrayBuffer();
                        
                        chunkData = new ArrayBuffer(tempBuffer.byteLength);
                        new Uint8Array(chunkData).set(new Uint8Array(tempBuffer));
                    } catch (sliceError) {
                        throw new Error(`File slice failed (file may be invalidated): ${sliceError instanceof Error ? sliceError.message : String(sliceError)}`);
                    }
                } else {
                    const chunkArray = file.subarray(start, end);
                    const newBuffer = new ArrayBuffer(chunkArray.byteLength);
                    new Uint8Array(newBuffer).set(chunkArray);
                    chunkData = newBuffer;
                }
                
                if (!chunkData || chunkData.byteLength !== currentChunkSize) {
                    throw new Error(`Chunk ${partNumber} size mismatch: expected ${currentChunkSize}, got ${chunkData?.byteLength || 0}`);
                }

                return { partNumber, data: chunkData, size: currentChunkSize };
            };

            // Upload parallèle avec un pool de 3 uploads simultanés (maintenir toujours 3 actifs)
            let completedChunks = 0;
            let nextChunkIndex = 0;
            const allUploadPromises: Promise<{ partNumber: number; etag: string }>[] = [];

            // Fonction pour traiter un chunk (lecture + upload)
            const processChunk = async (chunkIndex: number): Promise<{ partNumber: number; etag: string }> => {
                const { partNumber, data, size } = await readChunk(chunkIndex);
                
                const result = await uploadChunkWithRetry(
                    uploadResult.uploadId,
                    partNumber,
                    data,
                    fileId,
                    category,
                    fileName
                );

                completedChunks++;
                const elapsedTime = (Date.now() - startTime) / 1000;
                const uploadedBytes = Math.min(partNumber * effectiveChunkSize, fileSize);
                const speed = uploadedBytes / Math.max(elapsedTime, 0.1);
                const remainingBytes = fileSize - uploadedBytes;
                const estimatedTime = speed > 0 ? remainingBytes / speed : 0;

                // Mettre à jour la progression
                const uploadProgress = 10 + (completedChunks / chunks * 90);
                updateProgress(uiFileId, {
                    uploaded: uploadedBytes,
                    progress: uploadProgress,
                    speed,
                    estimatedTime,
                    currentSegment: isTranscodedFile ? completedChunks : undefined
                });

                return result;
            };

            // Pool de workers : maintenir toujours 3 uploads actifs
            const workerPool: Promise<void>[] = [];
            
            for (let workerId = 0; workerId < PARALLEL_UPLOADS; workerId++) {
                const worker = (async () => {
                    while (nextChunkIndex < chunks) {
                        const chunkIndex = nextChunkIndex++;
                        if (chunkIndex >= chunks) break;
                        
                        try {
                            const result = await processChunk(chunkIndex);
                            parts.push(result);
                        } catch (err) {
                            console.error(`❌ Erreur upload chunk ${chunkIndex + 1}:`, err);
                            throw err;
                        }
                    }
                })();
                
                workerPool.push(worker);
            }

            // Attendre que tous les workers terminent
            await Promise.all(workerPool);


            // Trier les parts par partNumber avant l'envoi (R2 exige l'ordre)
            const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);

            const completeResult = await completeMultipartUpload(uploadResult.uploadId, sortedParts, fileName, basicMetadata, fileCreatedAt);

            // Stocker les métadonnées après l'upload réussi
            // On récupère les métadonnées depuis la closure
            // Note: Les métadonnées ont déjà été enrichies et la miniature téléchargée (si disponible)
            // Il reste juste à les stocker dans D1

            return {
                fileId: completeResult.fileId,
                exists: false,
                url: completeResult.url
            };

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Échec upload multipart: ${errorMessage}`);
        }
    };

    const uploadFile = async (file: File) => {
        const fileId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Stocker le fichier pour permettre la reprise
        fileObjectsRef.current.set(fileId, file);

        setUploads(prev => [...prev, {
            fileId,
            fileName: file.name,
            status: 'hashing',
            progress: 0,
            total: file.size,
            uploaded: 0,
            speed: 0,
            estimatedTime: 0
        }]);

        try {
            updateProgress(fileId, { status: 'hashing', progress: 5 });
            
            const category = classifyFile(file);
            
            // TOUJOURS calculer le hash SHA-256 pour permettre la déduplication
            // js-sha256 supporte le streaming et peut gérer des fichiers de toute taille
            const hash = await calculateSHA256(file);

            updateProgress(fileId, { status: 'checking', progress: 10, category });

            // Vérifier si le fichier existe déjà (déduplication par hash)
            const checkResult = await checkFileExists(hash);
            
            if (checkResult.exists && checkResult.fileId) {
                // Le fichier existe déjà (même hash), juste rattacher l'utilisateur
                // Utiliser directement l'API pour créer la liaison (sans passer par linkUserToFile qui peut échouer)
                const existingFileId = checkResult.fileId;
                const token = localStorage.getItem('videomi_token');
                
                if (token && user?.id) {
                    // Créer la liaison avec retry pour éviter les race conditions
                    // Le fichier peut être en cours de création par un autre upload
                    let linked = false;
                    const maxRetries = 5;
                    const retryDelay = 500; // 500ms entre les tentatives
                    
                    for (let attempt = 0; attempt < maxRetries && !linked; attempt++) {
                        try {
                            const linkResponse = await fetch(`${window.location.origin}/api/upload/link`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({
                                    fileId: existingFileId,
                                    userId: user.id
                                })
                            });
                            
                            if (linkResponse.ok) {
                                const linkData = await linkResponse.json() as { success?: boolean; alreadyLinked?: boolean; error?: string };
                                if (linkData.success || linkData.alreadyLinked) {
                                    linked = true;
                                } else {
                                    // Le fichier n'existe pas encore, attendre avant de réessayer
                                    if (attempt < maxRetries - 1) {
                                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                                        continue;
                                    } else {
                                        console.warn(`⚠️ Échec liaison utilisateur-fichier après ${maxRetries} tentatives pour ${existingFileId}: ${linkData.error || 'File not found'}`);
                                    }
                                }
                            } else {
                                const errorText = await linkResponse.text().catch(() => 'Unknown error');
                                console.error(`❌ Erreur HTTP lors de la liaison utilisateur-fichier (${linkResponse.status}):`, errorText);
                                if (attempt < maxRetries - 1) {
                                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                                }
                            }
                        } catch (linkError) {
                            console.error(`❌ Erreur lors de la liaison utilisateur-fichier (tentative ${attempt + 1}/${maxRetries}):`, linkError);
                            if (attempt < maxRetries - 1) {
                                await new Promise(resolve => setTimeout(resolve, retryDelay));
                            }
                        }
                    }
                }
                
                // Fichier existant - l'utilisateur peut toujours choisir/recibérer une correspondance via la page de sélection
                
                updateProgress(fileId, { status: 'completed', progress: 100 });
            invalidateStatsCache(); // Invalider le cache car D1 a été mis à jour
            
            // Invalider le cache via le système d'invalidation complet
            if (user?.id) {
                await handleCacheInvalidation({
                    type: 'file:upload',
                    userId: user.id,
                    category: category,
                });
            }
            
            onUploadComplete?.(existingFileId);
            return;
            }

            // Le fichier n'existe pas, générer un nouveau fileId basé sur le hash
            const finalFileId = generateFileId(file, hash);
            updateProgress(fileId, { status: 'uploading', progress: 10 });

            // Utiliser TOUJOURS le nom original du fichier (file.name)
            // L'utilisateur choisira la correspondance manuellement après l'upload via la page /match/:category/:fileId
            const originalFilename = file.name;

            // Vérifier que le filename n'est pas vide
            if (!originalFilename || originalFilename.trim() === '') {
                throw new Error('Le nom du fichier est vide');
            }

            // Extraire les métadonnées de base (ID3 tags) pour les fichiers audio/vidéo
            let basicMetadata: BaseAudioMetadata | BaseVideoMetadata | null = null;
            if (category === 'musics' || category === 'videos') {
                try {
                    updateProgress(fileId, { status: 'hashing', progress: 7 }); // Légère progression
                    basicMetadata = await extractBaseMetadata(file, category) as BaseAudioMetadata | BaseVideoMetadata | null;
                    if (basicMetadata) {
                        // Log détaillé pour voir le titre nettoyé
                        if (basicMetadata.title) {
                        } else {
                        }
                    } else {
                    }
                } catch (metadataError) {
                    console.warn(`⚠️ [METADATA] Erreur extraction métadonnées (non-bloquant):`, metadataError);
                    // Ne pas bloquer l'upload si l'extraction échoue
                }
            }

            // Extraire la date de création réelle (EXIF images, lastModified documents) pour tri/affichage
            let fileCreatedAt: number | null = null;
            if (category === 'images' || category === 'documents') {
                try {
                    fileCreatedAt = await extractFileCreationDate(file, category);
                } catch (e) {
                    console.warn(`⚠️ [FILE_METADATA] Erreur extraction date de création (non-bloquant):`, e);
                }
            }

            // Upload du fichier avec son nom original
            try {
                const result = await uploadFileMultipart(
                    file,
                    finalFileId,
                    fileId, // uiFileId pour updateProgress
                    category,
                    hash,
                    originalFilename, // TOUJOURS le nom original (file.name)
                    false,
                    basicMetadata, // Passer les métadonnées extraites
                    fileCreatedAt ?? undefined
                );

            // Le serveur lie automatiquement l'utilisateur au fichier dans completeMultipartUpload
            // L'enrichissement automatique se fait maintenant côté serveur dans completeMultipartUpload
            // Plus besoin d'appel supplémentaire à linkUserToFile
            
            updateProgress(fileId, {
                status: 'completed',
                progress: 100,
                uploaded: file.size
            });

            invalidateStatsCache(); // Invalider le cache car D1 a été mis à jour
            
            // Invalider le cache via le système d'invalidation complet (local + Edge)
            if (user?.id) {
                await handleCacheInvalidation({
                    type: 'file:upload',
                    userId: user.id,
                    category: category,
                });
            }
            
            onUploadComplete?.(finalFileId);
            } catch (uploadError: unknown) {
                const errorMsg = uploadError instanceof Error ? uploadError.message : String(uploadError);
                throw new Error(`Échec upload: ${errorMsg}`);
            }

        } catch (err: unknown) {
            console.error('❌ Erreur upload:', err);
            const errorMessage = err instanceof Error ? err.message : String(err);

            updateProgress(fileId, {
                status: 'error',
                error: errorMessage
            });

            setError(errorMessage);
        }
    };

    const uploadFiles = async (files: FileList | File[]) => {
        setIsUploading(true);
        setError(null);

        const fileArray = Array.from(files);
        uploadQueue.current = [...fileArray];
        activeUploads.current.clear();

        const processQueue = async () => {
            while (uploadQueue.current.length > 0 || activeUploads.current.size > 0) {
                while (uploadQueue.current.length > 0 && activeUploads.current.size < maxConcurrentUploads) {
                    const file = uploadQueue.current.shift();
                    if (!file) continue;

                    const fileId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    activeUploads.current.add(fileId);

                    uploadFile(file).finally(() => {
                        activeUploads.current.delete(fileId);
                    });
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            setIsUploading(false);
        };

        processQueue();
    };

    const cancelUpload = (fileId: string) => {
        Array.from(abortControllers.current.entries())
            .filter(([key]) => key.startsWith(fileId))
            .forEach(([key, controller]) => {
                controller.abort();
                abortControllers.current.delete(key);
            });

        setUploads(prev => prev.filter(u => u.fileId !== fileId));
        activeUploads.current.delete(fileId);
        fileObjectsRef.current.delete(fileId);
        uploadPromisesRef.current.delete(fileId);
    };

    const pauseUpload = (fileId: string) => {
        // Arrêter tous les uploads en cours pour ce fichier
        Array.from(abortControllers.current.entries())
            .filter(([key]) => key.startsWith(fileId))
            .forEach(([key, controller]) => {
                controller.abort();
                abortControllers.current.delete(key);
            });

        // Mettre à jour le statut à "paused"
        setUploads(prev => prev.map(u => 
            u.fileId === fileId ? { ...u, status: 'paused' as UploadStatus } : u
        ));

        activeUploads.current.delete(fileId);
    };

    const resumeUpload = async (fileId: string) => {
        const upload = uploads.find(u => u.fileId === fileId);
        if (!upload || upload.status !== 'paused') {
            console.warn(`⚠️ Upload ${fileId} ne peut pas être repris`);
            return;
        }

        const file = fileObjectsRef.current.get(fileId);
        if (!file) {
            console.error(`❌ Fichier ${fileId} non trouvé pour reprise`);
            updateProgress(fileId, {
                status: 'error',
                error: 'Fichier non disponible pour reprise'
            });
            return;
        }

        // Mettre à jour le statut
        updateProgress(fileId, { status: 'uploading' });

        // Relancer l'upload (pour l'instant, on recommence depuis le début)
        // TODO: Implémenter la vraie reprise avec les chunks déjà uploadés
        try {
            await uploadFile(file);
        } catch (error) {
            console.error(`❌ Erreur reprise upload ${fileId}:`, error);
        }
    };

    const getStatusColor = (status: UploadStatus): string => {
        switch (status) {
            case 'completed': return '#4caf50';
            case 'error': return '#f44336';
            case 'uploading': return '#2196f3';
            case 'transcoding': return '#ff9800';
            case 'hashing': return '#9c27b0';
            case 'checking': return '#673ab7';
            case 'merging': return '#3f51b5';
            case 'paused': return '#ff9800';
            default: return '#9e9e9e';
        }
    };

    const formatSpeed = (bytesPerSecond: number): string => {
        if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
        if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
        return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    };

    const formatTime = (seconds: number): string => {
        if (seconds < 60) return `${seconds.toFixed(0)}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    };

    // Calculer la progression globale
    const activeUploadsList = uploads.filter(u => 
        u.status !== 'completed' && u.status !== 'error'
    );
    const completedUploads = uploads.filter(u => u.status === 'completed');
    const errorUploads = uploads.filter(u => u.status === 'error');
    
    const totalBytes = activeUploadsList.reduce((sum, u) => sum + u.total, 0);
    const uploadedBytes = activeUploadsList.reduce((sum, u) => sum + u.uploaded, 0);
    const globalProgress = totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0;
    const globalSpeed = activeUploadsList.reduce((sum, u) => sum + u.speed, 0);
    const maxEstimatedTime = activeUploadsList.length > 0 
        ? Math.max(...activeUploadsList.map(u => u.estimatedTime))
        : 0;

    // État pour gérer l'affichage des détails
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
    const [showAllDetails, setShowAllDetails] = useState(false);

    const toggleFileDetails = (fileId: string) => {
        setExpandedFiles(prev => {
            const next = new Set(prev);
            if (next.has(fileId)) {
                next.delete(fileId);
            } else {
                next.add(fileId);
            }
            return next;
        });
    };

    const toggleAllDetails = () => {
        if (showAllDetails) {
            setExpandedFiles(new Set());
        } else {
            setExpandedFiles(new Set(uploads.map(u => u.fileId)));
        }
        setShowAllDetails(!showAllDetails);
    };

    const hasActiveUploads = activeUploadsList.length > 0;

    return (
        <div style={{ padding: '20px' }}>
            <h3 style={{
                fontSize: '24px',
                fontWeight: '600',
                color: darkTheme.text.primary,
                marginBottom: '24px'
            }}>
                {t('upload.title')}
            </h3>

            {error && <ErrorDisplay error={error} />}

            {/* Barre de progression globale */}
            {uploads.length > 0 && (
                <div style={{
                    backgroundColor: darkTheme.background.secondary,
                    borderRadius: '12px',
                    padding: '24px',
                    marginBottom: '24px',
                    boxShadow: darkTheme.shadow.medium
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '16px'
                    }}>
                        <div>
                            <h4 style={{
                                fontSize: '18px',
                                fontWeight: '600',
                                color: darkTheme.text.primary,
                                marginBottom: '4px'
                            }}>
                                {t('upload.globalProgress')}
                            </h4>
                            <div style={{
                                fontSize: '14px',
                                color: darkTheme.text.secondary
                            }}>
                                {completedUploads.length + errorUploads.length} / {uploads.length} {t('upload.filesCompleted')}
                                {hasActiveUploads && ` • ${activeUploadsList.length} ${t('upload.inProgress')}`}
                            </div>
                        </div>
                        {hasActiveUploads && (
                            <div style={{
                                textAlign: 'right'
                            }}>
                                <div style={{
                                    fontSize: '24px',
                                    fontWeight: '600',
                                    color: darkTheme.text.primary
                                }}>
                                    {globalProgress.toFixed(1)}%
                                </div>
                                {globalSpeed > 0 && (
                                    <div style={{
                                        fontSize: '12px',
                                        color: darkTheme.text.secondary,
                                        marginTop: '4px'
                                    }}>
                                        {formatSpeed(globalSpeed)}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {/* Barre de progression globale */}
                    <div style={{
                        height: '12px',
                        backgroundColor: darkTheme.background.tertiary,
                        borderRadius: '6px',
                        overflow: 'hidden',
                        marginBottom: '12px',
                        position: 'relative'
                    }}>
                        <div style={{
                            width: `${Math.min(100, Math.max(0, globalProgress))}%`,
                            height: '100%',
                            backgroundColor: hasActiveUploads ? '#2196f3' : '#4caf50',
                            transition: 'width 0.3s ease-out',
                            borderRadius: '6px'
                        }} />
                        {/* Barres pour les fichiers terminés */}
                        {completedUploads.length > 0 && (
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: `${(completedUploads.length / uploads.length) * 100}%`,
                                height: '100%',
                                backgroundColor: '#4caf50',
                                borderRadius: '6px'
                            }} />
                        )}
                    </div>

                    {/* Statistiques globales */}
                    {hasActiveUploads && (
                        <div style={{
                            display: 'flex',
                            gap: '24px',
                            fontSize: '12px',
                            color: darkTheme.text.secondary
                        }}>
                            <div>
                                <span style={{ fontWeight: '600' }}>{t('upload.totalSpeed')}:</span> {formatSpeed(globalSpeed)}
                            </div>
                            {maxEstimatedTime > 0 && (
                                <div>
                                    <span style={{ fontWeight: '600' }}>{t('upload.timeRemaining')}:</span> {formatTime(maxEstimatedTime)}
                                </div>
                            )}
                            <div>
                                <span style={{ fontWeight: '600' }}>{t('upload.uploaded')}:</span> {formatFileSize(uploadedBytes)} / {formatFileSize(totalBytes)}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Liste des fichiers */}
            <div style={{ marginTop: '20px' }}>
                {uploads.length === 0 ? (
                    <div style={{
                        padding: '40px',
                        textAlign: 'center',
                        color: darkTheme.text.secondary,
                        backgroundColor: darkTheme.background.secondary,
                        borderRadius: '12px'
                    }}>
                        {t('upload.noUploads') || 'Aucun upload en cours'}
                    </div>
                ) : (
                    <div>
                        {/* Bouton pour afficher/masquer tous les détails */}
                        {uploads.length > 1 && (
                            <button
                                onClick={toggleAllDetails}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: darkTheme.background.secondary,
                                    color: darkTheme.text.primary,
                                    border: `1px solid ${darkTheme.background.tertiary}`,
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    marginBottom: '12px',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = darkTheme.background.tertiary;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = darkTheme.background.secondary;
                                }}
                            >
                                {showAllDetails ? `🔼 ${t('upload.hideDetails')}` : `🔽 ${t('upload.showDetails')}`}
                            </button>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {uploads.map(upload => {
                                const isExpanded = expandedFiles.has(upload.fileId);
                                const isCompleted = upload.status === 'completed';
                                const isError = upload.status === 'error';
                                
                                return (
                            <div key={upload.fileId} style={{
                                        backgroundColor: darkTheme.background.secondary,
                                        borderRadius: '12px',
                                        padding: '16px',
                                        border: `1px solid ${isError ? darkTheme.accent.red : darkTheme.background.tertiary}`,
                                        transition: 'all 0.2s'
                            }}>
                                        {/* En-tête du fichier */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            userSelect: 'none'
                                        }}
                                        onClick={() => toggleFileDetails(upload.fileId)}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '12px',
                                                    marginBottom: '8px'
                                                }}>
                                                    <span style={{
                                                        fontSize: '14px',
                                                        color: darkTheme.text.primary,
                                                        fontWeight: '500',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {upload.fileName}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '11px',
                                                        padding: '2px 8px',
                                                        backgroundColor: darkTheme.background.tertiary,
                                                        color: darkTheme.text.secondary,
                                                        borderRadius: '4px',
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {upload.category || 'unknown'}
                                    </span>
                                </div>
                                                
                                                {/* Barre de progression individuelle */}
                                <div style={{
                                                    height: '6px',
                                    backgroundColor: darkTheme.background.tertiary,
                                                    borderRadius: '3px',
                                                    overflow: 'hidden',
                                                    marginBottom: '8px'
                                }}>
                                    <div style={{
                                        width: `${Math.min(100, Math.max(0, upload.progress))}%`,
                                        height: '100%',
                                        backgroundColor: getStatusColor(upload.status),
                                        transition: 'width 0.3s ease-out'
                                    }} />
                                </div>
                                                
                                                {/* Statistiques compactes */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: '12px',
                                                    color: darkTheme.text.secondary
                                }}>
                                    <span>{upload.progress.toFixed(1)}%</span>
                                                    {upload.status === 'uploading' && (
                                                        <>
                                    <span>{formatSpeed(upload.speed)}</span>
                                    <span>{formatTime(upload.estimatedTime)}</span>
                                                        </>
                                                    )}
                                                    {isCompleted && (
                                                        <span style={{ color: '#4caf50' }}>✓ {t('upload.completed')}</span>
                                                    )}
                                                    {isError && (
                                                        <span style={{ color: darkTheme.accent.red }}>✗ {t('upload.error')}</span>
                                                    )}
                                                    <span style={{
                                                        fontSize: '10px',
                                                        opacity: 0.7
                                                    }}>
                                                        {isExpanded ? '▲' : '▼'}
                                                    </span>
                                </div>
                                            </div>
                                        </div>

                                        {/* Détails expansibles */}
                                        {isExpanded && (
                                            <div style={{
                                                marginTop: '16px',
                                                paddingTop: '16px',
                                                borderTop: `1px solid ${darkTheme.background.tertiary}`
                                            }}>
                                {upload.error && (
                                    <div style={{
                                                        padding: '12px',
                                                        backgroundColor: `${darkTheme.accent.red}20`,
                                                        borderRadius: '8px',
                                        color: darkTheme.accent.red,
                                                        fontSize: '13px',
                                                        marginBottom: '12px'
                                    }}>
                                        ❌ {upload.error}
                                    </div>
                                )}
                                                
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                                                    gap: '12px',
                                                    marginBottom: '12px',
                                                    fontSize: '12px',
                                                    color: darkTheme.text.secondary
                                                }}>
                                                    <div>
                                                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>{t('upload.status')}</div>
                                                        <div style={{ color: getStatusColor(upload.status) }}>
                                                            {upload.status}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>{t('upload.size')}</div>
                                                        <div>{formatFileSize(upload.total)}</div>
                                                    </div>
                                                    {upload.status === 'uploading' && (
                                                        <>
                                                            <div>
                                                                <div style={{ fontWeight: '600', marginBottom: '4px' }}>{t('upload.speed')}</div>
                                                                <div>{formatSpeed(upload.speed)}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: '600', marginBottom: '4px' }}>{t('upload.remainingTime')}</div>
                                                                <div>{formatTime(upload.estimatedTime)}</div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                {/* Boutons d'action */}
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {upload.status === 'uploading' && (
                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                pauseUpload(upload.fileId);
                                                            }}
                                            style={{
                                                                padding: '6px 12px',
                                                backgroundColor: '#ff9800',
                                                color: 'white',
                                                border: 'none',
                                                                borderRadius: '6px',
                                                                cursor: 'pointer',
                                                                fontSize: '13px',
                                                                transition: 'opacity 0.2s'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.opacity = '0.8';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.opacity = '1';
                                            }}
                                        >
                                                            ⏸️ {t('upload.pause')}
                                        </button>
                                    )}
                                    {upload.status === 'paused' && (
                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                resumeUpload(upload.fileId);
                                                            }}
                                            style={{
                                                                padding: '6px 12px',
                                                backgroundColor: '#4caf50',
                                                color: 'white',
                                                border: 'none',
                                                                borderRadius: '6px',
                                                                cursor: 'pointer',
                                                                fontSize: '13px',
                                                                transition: 'opacity 0.2s'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.opacity = '0.8';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.opacity = '1';
                                            }}
                                        >
                                                            ▶️ {t('upload.resume')}
                                        </button>
                                    )}
                                    {upload.status !== 'completed' && (
                                <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                cancelUpload(upload.fileId);
                                                            }}
                                    style={{
                                                                padding: '6px 12px',
                                        backgroundColor: '#f44336',
                                        color: 'white',
                                        border: 'none',
                                                                borderRadius: '6px',
                                                                cursor: 'pointer',
                                                                fontSize: '13px',
                                                                transition: 'opacity 0.2s'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.opacity = '0.8';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.opacity = '1';
                                    }}
                                >
                                                            ❌ {t('upload.cancel')}
                                </button>
                                    )}
                                </div>
                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});