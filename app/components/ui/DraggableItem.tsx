// INFO : app/components/ui/DraggableItem.tsx
// Wrapper pour rendre un élément draggable

import React, { useCallback, useState, useRef } from 'react';
import { useDragDrop } from '~/contexts/DragDropContext';
import type { DraggableFileItem } from '~/types/dragdrop';

interface DraggableItemProps {
    item: DraggableFileItem;
    children: React.ReactNode;
    disabled?: boolean;
    className?: string;
    style?: React.CSSProperties;
    onDragStart?: () => void;
    onDragEnd?: () => void;
}

export function DraggableItem({
    item,
    children,
    disabled = false,
    className,
    style,
    onDragStart,
    onDragEnd,
}: DraggableItemProps) {
    const { startDrag, endDrag, dragState } = useDragDrop();
    const [isDraggingThis, setIsDraggingThis] = useState(false);
    const dragStarted = useRef(false);

    const handleDragStart = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            if (disabled) {
                event.preventDefault();
                return;
            }

            dragStarted.current = true;
            setIsDraggingThis(true);
            startDrag(item, event);
            onDragStart?.();
        },
        [disabled, item, startDrag, onDragStart]
    );

    const handleDragEnd = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            if (!dragStarted.current) return;

            dragStarted.current = false;
            setIsDraggingThis(false);
            endDrag();
            onDragEnd?.();
        },
        [endDrag, onDragEnd]
    );

    const handleDrag = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            // Mise à jour de position si nécessaire pour des effets visuels
            // (pas toujours fiable car clientX/Y peuvent être 0 pendant le drag)
        },
        []
    );

    // Styles de base pour l'état de drag
    const draggingStyles: React.CSSProperties = isDraggingThis
        ? {
              opacity: 0.5,
              transform: 'scale(0.98)',
              cursor: 'grabbing',
          }
        : {
              cursor: disabled ? 'default' : 'grab',
          };

    return (
        <div
            draggable={!disabled}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrag={handleDrag}
            className={className}
            style={{
                ...style,
                ...draggingStyles,
                transition: 'opacity 0.2s ease, transform 0.2s ease',
                userSelect: 'none',
            }}
        >
            {children}
        </div>
    );
}
