// INFO : app/components/ui/DropZoneOverlay.tsx
// Overlay avec les zones de drop qui apparaissent pendant le drag

import React, { useCallback, useEffect, useState } from 'react';
import { useDragDrop } from '~/contexts/DragDropContext';
import { darkTheme } from '~/utils/ui/theme';
import type { DropZoneConfig, DropZoneAction } from '~/types/dragdrop';

interface DropZoneProps {
    config: DropZoneConfig;
    isActive: boolean;
    onDragEnter: () => void;
    onDragLeave: () => void;
    onDrop: () => void;
}

function DropZone({ config, isActive, onDragEnter, onDragLeave, onDrop }: DropZoneProps) {
    const [isHovered, setIsHovered] = useState(false);

    const handleDragEnter = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsHovered(true);
            onDragEnter();
        },
        [onDragEnter]
    );

    const handleDragLeave = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            // Vérifier si on quitte vraiment la zone (pas juste un enfant)
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;

            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                setIsHovered(false);
                onDragLeave();
            }
        },
        [onDragLeave]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsHovered(false);
            onDrop();
        },
        [onDrop]
    );

    // Position basée sur la config
    const getPositionStyles = (): React.CSSProperties => {
        const base: React.CSSProperties = {
            position: 'fixed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
        };

        switch (config.position) {
            case 'bottom':
                return {
                    ...base,
                    bottom: '40px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    minWidth: '200px',
                    height: '80px',
                };
            case 'left':
                return {
                    ...base,
                    left: '40px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '80px',
                    minHeight: '200px',
                };
            case 'right':
                return {
                    ...base,
                    right: '40px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '80px',
                    minHeight: '200px',
                };
            case 'top':
                return {
                    ...base,
                    top: '100px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    minWidth: '200px',
                    height: '80px',
                };
            default:
                return base;
        }
    };

    const backgroundColor = isHovered ? config.hoverColor : config.color;

    return (
        <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{
                ...getPositionStyles(),
                backgroundColor: `${backgroundColor}${isHovered ? 'ff' : 'cc'}`,
                borderRadius: '16px',
                padding: '16px 32px',
                gap: '12px',
                flexDirection: config.position === 'left' || config.position === 'right' ? 'column' : 'row',
                boxShadow: isHovered
                    ? `0 0 30px ${config.color}80, 0 8px 32px rgba(0,0,0,0.4)`
                    : '0 8px 32px rgba(0,0,0,0.3)',
                border: `2px solid ${isHovered ? '#fff' : 'transparent'}`,
                transform: isHovered
                    ? config.position === 'bottom'
                        ? 'translateX(-50%) scale(1.05)'
                        : config.position === 'left' || config.position === 'right'
                        ? 'translateY(-50%) scale(1.05)'
                        : 'translateX(-50%) scale(1.05)'
                    : getPositionStyles().transform,
                transition: 'all 0.2s ease-out',
            }}
        >
            <span
                style={{
                    fontSize: '32px',
                    filter: isHovered ? 'drop-shadow(0 0 8px white)' : 'none',
                    transition: 'filter 0.2s ease',
                }}
            >
                {config.icon}
            </span>
            <span
                style={{
                    color: '#fff',
                    fontWeight: '600',
                    fontSize: '16px',
                    textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                }}
            >
                {config.label}
            </span>
        </div>
    );
}

interface ConfirmToastProps {
    message: string;
    itemName: string;
    onConfirm: () => void;
    onCancel: () => void;
}

function ConfirmToast({ message, itemName, onConfirm, onCancel }: ConfirmToastProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [countdown, setCountdown] = useState(5);

    useEffect(() => {
        // Animation d'entrée
        setTimeout(() => setIsVisible(true), 10);

        // Countdown pour auto-annulation
        const interval = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    onCancel();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [onCancel]);

    return (
        <div
            style={{
                position: 'fixed',
                bottom: '40px',
                left: '50%',
                transform: `translateX(-50%) translateY(${isVisible ? '0' : '20px'})`,
                backgroundColor: darkTheme.background.secondary,
                borderLeft: `4px solid ${darkTheme.accent.red}`,
                borderRadius: '12px',
                padding: '16px 20px',
                boxShadow: darkTheme.shadow.large,
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                zIndex: 10001,
                opacity: isVisible ? 1 : 0,
                transition: 'all 0.3s ease-out',
                minWidth: '400px',
            }}
        >
            <div
                style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: `${darkTheme.accent.red}20`,
                    color: darkTheme.accent.red,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    flexShrink: 0,
                }}
            >
                🗑️
            </div>
            <div style={{ flex: 1 }}>
                <div
                    style={{
                        color: darkTheme.text.primary,
                        fontSize: '14px',
                        fontWeight: '500',
                        marginBottom: '4px',
                    }}
                >
                    {message}
                </div>
                <div
                    style={{
                        color: darkTheme.text.secondary,
                        fontSize: '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '200px',
                    }}
                >
                    {itemName}
                </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                    onClick={onCancel}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: 'transparent',
                        border: `1px solid ${darkTheme.border.secondary}`,
                        borderRadius: '6px',
                        color: darkTheme.text.secondary,
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = darkTheme.background.tertiary;
                        e.currentTarget.style.color = darkTheme.text.primary;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = darkTheme.text.secondary;
                    }}
                >
                    Annuler ({countdown}s)
                </button>
                <button
                    onClick={onConfirm}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: darkTheme.accent.red,
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = darkTheme.accent.redHover;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = darkTheme.accent.red;
                    }}
                >
                    Supprimer
                </button>
            </div>
        </div>
    );
}

export function DropZoneOverlay() {
    const { dragState, dropZones, setActiveDropZone, executeDrop, pendingAction, confirmAction, cancelAction } =
        useDragDrop();

    const handleDragEnter = useCallback(
        (zoneId: DropZoneAction) => {
            setActiveDropZone(zoneId);
        },
        [setActiveDropZone]
    );

    const handleDragLeave = useCallback(() => {
        setActiveDropZone(null);
    }, [setActiveDropZone]);

    const handleDrop = useCallback(
        (zoneId: DropZoneAction) => {
            executeDrop(zoneId);
        },
        [executeDrop]
    );

    // Trouver la config de la zone pour l'action en attente
    const pendingZone = pendingAction ? dropZones.find((z) => z.id === pendingAction.action) : null;

    return (
        <>
            {/* Overlay sombre pendant le drag */}
            {dragState.isDragging && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        zIndex: 9998,
                        pointerEvents: 'none',
                        opacity: dragState.isDragging ? 1 : 0,
                        transition: 'opacity 0.2s ease',
                    }}
                />
            )}

            {/* Zones de drop */}
            {dragState.isDragging &&
                dropZones.map((zone) => (
                    <DropZone
                        key={zone.id}
                        config={zone}
                        isActive={dragState.activeDropZone === zone.id}
                        onDragEnter={() => handleDragEnter(zone.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={() => handleDrop(zone.id)}
                    />
                ))}

            {/* Toast de confirmation */}
            {pendingAction && pendingZone && (
                <ConfirmToast
                    message={pendingZone.confirmMessage || `${pendingZone.label} ?`}
                    itemName={pendingAction.item.filename || 'Fichier sans nom'}
                    onConfirm={confirmAction}
                    onCancel={cancelAction}
                />
            )}
        </>
    );
}
