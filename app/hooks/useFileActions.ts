// INFO : app/hooks/useFileActions.ts
// Hook pour gérer les actions sur les fichiers via drag & drop

import { useCallback, useEffect } from 'react';
import { useDragDrop } from '~/contexts/DragDropContext';
import { handleCacheInvalidation } from '~/utils/cache/cacheInvalidation';
import type { DraggableFileItem, DropZoneAction, DropResult } from '~/types/dragdrop';

interface UseFileActionsOptions {
    userId: string | null;
    onFileDeleted?: (fileId: string, category: string) => void;
    onError?: (error: string) => void;
    onSuccess?: (message: string) => void;
}

export function useFileActions({
    userId,
    onFileDeleted,
    onError,
    onSuccess,
}: UseFileActionsOptions) {
    const { setDropActionHandler } = useDragDrop();

    // Suppression d'un fichier via l'API
    const deleteFile = useCallback(
        async (item: DraggableFileItem): Promise<DropResult> => {
            if (!userId) {
                return {
                    action: 'delete',
                    item,
                    success: false,
                    error: 'Utilisateur non connecté',
                };
            }

            try {
                const token = localStorage.getItem('videomi_token');
                const response = await fetch(
                    `https://videomi.uk/api/files/${item.category}/${item.file_id}?userId=${userId}`,
                    {
                        method: 'DELETE',
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({})) as { error?: string };
                    throw new Error(errorData.error || 'Erreur lors de la suppression');
                }

                // Invalidation du cache
                await handleCacheInvalidation({
                    type: 'file:delete',
                    userId,
                    fileId: item.file_id,
                    category: item.category,
                });

                // Callback de succès
                onFileDeleted?.(item.file_id, item.category);
                onSuccess?.(`"${item.filename || 'Fichier'}" supprimé`);

                return {
                    action: 'delete',
                    item,
                    success: true,
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
                onError?.(errorMessage);

                return {
                    action: 'delete',
                    item,
                    success: false,
                    error: errorMessage,
                };
            }
        },
        [userId, onFileDeleted, onError, onSuccess]
    );

    // Handler générique pour toutes les actions de drop
    const handleDropAction = useCallback(
        async (action: DropZoneAction, item: DraggableFileItem): Promise<DropResult> => {
            switch (action) {
                case 'delete':
                    return deleteFile(item);

                // Actions futures
                case 'archive':
                case 'move':
                case 'favorite':
                default:
                    onError?.('Action non implémentée');
                    return {
                        action,
                        item,
                        success: false,
                        error: 'Action non implémentée',
                    };
            }
        },
        [deleteFile, onError]
    );

    // Enregistrer le handler au montage
    useEffect(() => {
        setDropActionHandler(handleDropAction);
    }, [setDropActionHandler, handleDropAction]);

    return {
        deleteFile,
    };
}
