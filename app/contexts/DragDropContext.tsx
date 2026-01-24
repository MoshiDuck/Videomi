// INFO : app/contexts/DragDropContext.tsx
// Contexte global pour le système de drag & drop

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type {
    DragState,
    DraggableFileItem,
    DropZoneAction,
    DropZoneConfig,
    DropResult,
    DropActionHandler,
} from '~/types/dragdrop';
import { DEFAULT_DROP_ZONES } from '~/types/dragdrop';

interface DragDropContextValue {
    // État
    dragState: DragState;
    dropZones: DropZoneConfig[];

    // Actions
    startDrag: (item: DraggableFileItem, event: React.DragEvent) => void;
    updateDragPosition: (x: number, y: number) => void;
    endDrag: () => void;
    setActiveDropZone: (zoneId: DropZoneAction | null) => void;
    executeDrop: (action: DropZoneAction) => Promise<DropResult | null>;

    // Configuration
    setDropZones: (zones: DropZoneConfig[]) => void;
    setDropActionHandler: (handler: DropActionHandler) => void;

    // Confirmation
    pendingAction: { action: DropZoneAction; item: DraggableFileItem } | null;
    confirmAction: () => Promise<void>;
    cancelAction: () => void;
}

const initialDragState: DragState = {
    isDragging: false,
    draggedItem: null,
    activeDropZone: null,
    dragPosition: null,
};

const DragDropContext = createContext<DragDropContextValue | null>(null);

export function DragDropProvider({ children }: { children: React.ReactNode }) {
    const [dragState, setDragState] = useState<DragState>(initialDragState);
    const [dropZones, setDropZones] = useState<DropZoneConfig[]>(DEFAULT_DROP_ZONES);
    const [pendingAction, setPendingAction] = useState<{
        action: DropZoneAction;
        item: DraggableFileItem;
    } | null>(null);

    const dropActionHandlerRef = useRef<DropActionHandler | null>(null);

    // Démarre le drag
    const startDrag = useCallback((item: DraggableFileItem, event: React.DragEvent) => {
        // Configuration du drag data
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/json', JSON.stringify(item));

        // Créer une image de drag personnalisée (optionnel)
        const dragImage = document.createElement('div');
        dragImage.style.cssText = `
            position: absolute;
            top: -9999px;
            left: -9999px;
            padding: 8px 16px;
            background: rgba(26, 26, 26, 0.95);
            border: 1px solid #4285f4;
            border-radius: 8px;
            color: white;
            font-size: 12px;
            white-space: nowrap;
            pointer-events: none;
        `;
        dragImage.textContent = item.filename || 'Fichier';
        document.body.appendChild(dragImage);
        event.dataTransfer.setDragImage(dragImage, 0, 0);

        // Nettoyer l'image de drag après un court délai
        setTimeout(() => {
            document.body.removeChild(dragImage);
        }, 0);

        setDragState({
            isDragging: true,
            draggedItem: item,
            activeDropZone: null,
            dragPosition: { x: event.clientX, y: event.clientY },
        });
    }, []);

    // Met à jour la position du drag
    const updateDragPosition = useCallback((x: number, y: number) => {
        setDragState((prev) => ({
            ...prev,
            dragPosition: { x, y },
        }));
    }, []);

    // Termine le drag
    const endDrag = useCallback(() => {
        setDragState(initialDragState);
    }, []);

    // Définit la zone de drop active
    const setActiveDropZone = useCallback((zoneId: DropZoneAction | null) => {
        setDragState((prev) => ({
            ...prev,
            activeDropZone: zoneId,
        }));
    }, []);

    // Exécute l'action de drop
    const executeDrop = useCallback(
        async (action: DropZoneAction): Promise<DropResult | null> => {
            const { draggedItem } = dragState;
            if (!draggedItem) return null;

            const zone = dropZones.find((z) => z.id === action);
            if (!zone) return null;

            // Si confirmation requise, on met en attente
            if (zone.confirmRequired) {
                setPendingAction({ action, item: draggedItem });
                endDrag();
                return null;
            }

            // Sinon on exécute directement
            if (dropActionHandlerRef.current) {
                const result = await dropActionHandlerRef.current(action, draggedItem);
                endDrag();
                return result;
            }

            endDrag();
            return null;
        },
        [dragState, dropZones, endDrag]
    );

    // Confirme l'action en attente
    const confirmAction = useCallback(async () => {
        if (!pendingAction || !dropActionHandlerRef.current) {
            setPendingAction(null);
            return;
        }

        await dropActionHandlerRef.current(pendingAction.action, pendingAction.item);
        setPendingAction(null);
    }, [pendingAction]);

    // Annule l'action en attente
    const cancelAction = useCallback(() => {
        setPendingAction(null);
    }, []);

    // Définit le handler pour les actions de drop
    const setDropActionHandler = useCallback((handler: DropActionHandler) => {
        dropActionHandlerRef.current = handler;
    }, []);

    // Écoute les événements de drag globaux pour détecter la fin du drag
    useEffect(() => {
        const handleDragEnd = () => {
            if (dragState.isDragging) {
                endDrag();
            }
        };

        window.addEventListener('dragend', handleDragEnd);
        return () => {
            window.removeEventListener('dragend', handleDragEnd);
        };
    }, [dragState.isDragging, endDrag]);

    return (
        <DragDropContext.Provider
            value={{
                dragState,
                dropZones,
                startDrag,
                updateDragPosition,
                endDrag,
                setActiveDropZone,
                executeDrop,
                setDropZones,
                setDropActionHandler,
                pendingAction,
                confirmAction,
                cancelAction,
            }}
        >
            {children}
        </DragDropContext.Provider>
    );
}

export function useDragDrop() {
    const context = useContext(DragDropContext);
    if (!context) {
        throw new Error('useDragDrop must be used within a DragDropProvider');
    }
    return context;
}
