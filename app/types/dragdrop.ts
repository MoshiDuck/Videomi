// INFO : app/types/dragdrop.ts
// Types et configuration pour le système de drag & drop

/**
 * Représente un item qui peut être draggé
 */
export interface DraggableFileItem {
    file_id: string;
    category: string;
    filename: string | null;
    size?: number;
    mime_type?: string;
}

/**
 * Types d'actions disponibles pour le drag & drop
 */
export type DropZoneAction = 'delete' | 'archive' | 'move' | 'favorite';

/**
 * Configuration d'une zone de drop
 */
export interface DropZoneConfig {
    id: DropZoneAction;
    label: string;
    icon: string;
    color: string;
    hoverColor: string;
    confirmRequired: boolean;
    confirmMessage?: string;
    position: 'bottom' | 'left' | 'right' | 'top';
}

/**
 * État du drag en cours
 */
export interface DragState {
    isDragging: boolean;
    draggedItem: DraggableFileItem | null;
    activeDropZone: DropZoneAction | null;
    dragPosition: { x: number; y: number } | null;
}

/**
 * Résultat d'une action de drop
 */
export interface DropResult {
    action: DropZoneAction;
    item: DraggableFileItem;
    success: boolean;
    error?: string;
}

/**
 * Configuration par défaut des zones de drop
 */
export const DEFAULT_DROP_ZONES: DropZoneConfig[] = [
    {
        id: 'delete',
        label: 'Supprimer',
        icon: '🗑️',
        color: '#ea4335',
        hoverColor: '#d33b2c',
        confirmRequired: true,
        confirmMessage: 'Supprimer ce fichier ?',
        position: 'bottom',
    },
    // Zones futures extensibles
    // {
    //     id: 'archive',
    //     label: 'Archiver',
    //     icon: '📦',
    //     color: '#ff9800',
    //     hoverColor: '#e68900',
    //     confirmRequired: false,
    //     position: 'left',
    // },
    // {
    //     id: 'favorite',
    //     label: 'Favoris',
    //     icon: '⭐',
    //     color: '#ffc107',
    //     hoverColor: '#e6ac00',
    //     confirmRequired: false,
    //     position: 'right',
    // },
];

/**
 * Callback pour les actions de drop
 */
export type DropActionHandler = (
    action: DropZoneAction,
    item: DraggableFileItem
) => Promise<DropResult>;
