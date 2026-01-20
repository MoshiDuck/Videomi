// INFO : app/hooks/useUploadManager.tsx - Hook personnalisé pour l'upload
import { useState, useCallback, useRef, useEffect } from 'react';
import { calculateSHA256, generateFileId } from '~/utils/file/hashCalculator';
import { classifyFile, shouldTranscode } from '~/utils/file/fileClassifier';
import { useAuth } from '~/hooks/useAuth';

// Types
type UploadStatus = 'pending' | 'hashing' | 'checking' | 'transcoding' | 'uploading' | 'merging' | 'completed' | 'error';

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
}

export function useUploadManager() {
    const { user } = useAuth();
    const [uploads, setUploads] = useState<UploadProgress[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const uploadQueue = useRef<File[]>([]);
    const activeUploads = useRef<Set<string>>(new Set());
    const abortControllers = useRef<Map<string, AbortController>>(new Map());

    const updateProgress = useCallback((fileId: string, updates: Partial<UploadProgress>) => {
        setUploads(prev => prev.map(u =>
            u.fileId === fileId ? { ...u, ...updates } : u
        ));
    }, []);

    const uploadFile = useCallback(async (file: File) => {
        const fileId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

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
            // Simulation d'upload simplifiée
            updateProgress(fileId, { status: 'hashing', progress: 5 });

            // Calcul du hash
            const hash = await calculateSHA256(file);
            const finalFileId = generateFileId(file, hash);
            const category = classifyFile(file);

            updateProgress(fileId, { status: 'uploading', progress: 30, category });

            // Simulation de l'upload
            await new Promise(resolve => setTimeout(resolve, 2000));

            updateProgress(fileId, {
                status: 'completed',
                progress: 100,
                uploaded: file.size
            });

            return finalFileId;

        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            updateProgress(fileId, {
                status: 'error',
                error: errorMessage
            });
            setError(errorMessage);
            throw err;
        }
    }, [updateProgress]);

    const uploadFiles = useCallback(async (files: FileList | File[]) => {
        setIsUploading(true);
        setError(null);

        const fileArray = Array.from(files);
        uploadQueue.current = [...fileArray];

        const processQueue = async () => {
            for (const file of fileArray) {
                if (file) {
                    try {
                        await uploadFile(file);
                    } catch (err) {
                        console.error('Erreur lors de l\'upload:', err);
                    }
                }
            }
            setIsUploading(false);
        };

        processQueue();
    }, [uploadFile]);

    const cancelUpload = useCallback((fileId: string) => {
        // Annuler tous les chunks en cours
        Array.from(abortControllers.current.entries())
            .filter(([key]) => key.startsWith(fileId))
            .forEach(([key, controller]) => {
                controller.abort();
                abortControllers.current.delete(key);
            });

        // Retirer de la file
        setUploads(prev => prev.filter(u => u.fileId !== fileId));
        activeUploads.current.delete(fileId);
    }, []);

    const getStatusColor = useCallback((status: UploadStatus): string => {
        switch (status) {
            case 'completed': return '#4caf50';
            case 'error': return '#f44336';
            case 'uploading': return '#2196f3';
            case 'transcoding': return '#ff9800';
            case 'hashing': return '#9c27b0';
            case 'checking': return '#673ab7';
            case 'merging': return '#3f51b5';
            default: return '#9e9e9e';
        }
    }, []);

    const formatSpeed = useCallback((bytesPerSecond: number): string => {
        if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
        if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
        return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    }, []);

    const formatTime = useCallback((seconds: number): string => {
        if (seconds < 60) return `${seconds.toFixed(0)}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    }, []);

    return {
        uploads,
        isUploading,
        error,
        uploadFiles,
        cancelUpload,
        getStatusColor,
        formatSpeed,
        formatTime,
        uploadFile
    };
}