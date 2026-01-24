// INFO : app/components/ui/ConfirmDialog.tsx
// Composant de dialogue de confirmation réutilisable
import React, { useState, useEffect, useRef } from 'react';
import { darkTheme } from '~/utils/ui/theme';
import { LoadingSpinner } from '~/components/ui/LoadingSpinner';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    confirmColor?: string;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}

export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmText = 'Confirmer',
    cancelText = 'Annuler',
    confirmColor = darkTheme.accent.red,
    onConfirm,
    onCancel
}: ConfirmDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);

    // Gérer la fermeture avec Escape
    useEffect(() => {
        if (!isOpen) return;
        
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isSubmitting) {
                onCancel();
            }
        };
        
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, isSubmitting, onCancel]);

    // Focus sur le bouton annuler à l'ouverture
    useEffect(() => {
        if (isOpen && cancelButtonRef.current) {
            cancelButtonRef.current.focus();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await onConfirm();
        } finally {
            setIsSubmitting(false);
        }
    };

    const dialogId = 'confirm-dialog';
    const titleId = `${dialogId}-title`;
    const descId = `${dialogId}-desc`;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                animation: 'fadeIn 0.2s ease-out'
            }}
            onClick={onCancel}
            aria-hidden="true"
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                style={{
                    backgroundColor: darkTheme.background.secondary,
                    borderRadius: '12px',
                    padding: '24px',
                    maxWidth: '400px',
                    width: '90%',
                    boxShadow: darkTheme.shadow.large,
                    animation: 'slideUp 0.3s ease-out'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h3
                    id={titleId}
                    style={{
                        fontSize: '20px',
                        fontWeight: '600',
                        color: darkTheme.text.primary,
                        marginBottom: '12px'
                    }}
                >
                    {title}
                </h3>
                <p
                    id={descId}
                    style={{
                        fontSize: '14px',
                        color: darkTheme.text.secondary,
                        marginBottom: '24px',
                        lineHeight: '1.5'
                    }}
                >
                    {message}
                </p>
                <div
                    style={{
                        display: 'flex',
                        gap: '12px',
                        justifyContent: 'flex-end'
                    }}
                >
                    <button
                        ref={cancelButtonRef}
                        onClick={onCancel}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: darkTheme.background.tertiary,
                            color: darkTheme.text.primary,
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '500',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = darkTheme.background.tertiary;
                            e.currentTarget.style.opacity = '0.8';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '1';
                        }}
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isSubmitting}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: confirmColor,
                            color: darkTheme.text.primary,
                            border: 'none',
                            borderRadius: '8px',
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500',
                            transition: 'all 0.2s',
                            opacity: isSubmitting ? 0.7 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            minWidth: '100px',
                            justifyContent: 'center'
                        }}
                        onMouseEnter={(e) => {
                            if (!isSubmitting) e.currentTarget.style.opacity = '0.8';
                        }}
                        onMouseLeave={(e) => {
                            if (!isSubmitting) e.currentTarget.style.opacity = '1';
                        }}
                    >
                        {isSubmitting ? <LoadingSpinner size="small" /> : confirmText}
                    </button>
                </div>
            </div>
            <style>
                {`
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes slideUp {
                        from { transform: translateY(20px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                `}
            </style>
        </div>
    );
}
