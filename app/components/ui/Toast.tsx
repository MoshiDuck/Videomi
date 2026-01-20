// INFO : app/components/ui/Toast.tsx
// Système de notifications toast pour feedback utilisateur
import React, { useEffect, useState } from 'react';
import { darkTheme } from '~/utils/ui/theme';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastProps {
    toast: Toast;
    onClose: (id: string) => void;
}

function ToastComponent({ toast, onClose }: ToastProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        // Animation d'entrée
        setTimeout(() => setIsVisible(true), 10);

        // Auto-fermeture
        const duration = toast.duration || 4000;
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => onClose(toast.id), 300);
        }, duration);

        return () => clearTimeout(timer);
    }, [toast.id, toast.duration, onClose]);

    const getIcon = () => {
        switch (toast.type) {
            case 'success':
                return '✓';
            case 'error':
                return '✗';
            case 'warning':
                return '⚠';
            case 'info':
                return 'ℹ';
            default:
                return '•';
        }
    };

    const getColor = () => {
        switch (toast.type) {
            case 'success':
                return darkTheme.accent.green;
            case 'error':
                return darkTheme.accent.red;
            case 'warning':
                return '#ff9800';
            case 'info':
                return darkTheme.accent.blue;
            default:
                return darkTheme.text.secondary;
        }
    };

    const getBackgroundColor = () => {
        switch (toast.type) {
            case 'success':
                return `${darkTheme.accent.green}20`;
            case 'error':
                return `${darkTheme.accent.red}20`;
            case 'warning':
                return '#ff980020';
            case 'info':
                return `${darkTheme.accent.blue}20`;
            default:
                return darkTheme.background.secondary;
        }
    };

    return (
        <div
            style={{
                backgroundColor: darkTheme.background.secondary,
                borderLeft: `4px solid ${getColor()}`,
                borderRadius: '8px',
                padding: '16px 20px',
                marginBottom: '12px',
                boxShadow: darkTheme.shadow.medium,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                minWidth: '300px',
                maxWidth: '500px',
                opacity: isVisible && !isExiting ? 1 : 0,
                transform: isVisible && !isExiting ? 'translateX(0)' : 'translateX(100%)',
                transition: 'all 0.3s ease-out',
                cursor: 'pointer',
                position: 'relative'
            }}
            onClick={() => {
                setIsExiting(true);
                setTimeout(() => onClose(toast.id), 300);
            }}
        >
            <div
                style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: getBackgroundColor(),
                    color: getColor(),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    flexShrink: 0
                }}
            >
                {getIcon()}
            </div>
            <div
                style={{
                    flex: 1,
                    color: darkTheme.text.primary,
                    fontSize: '14px',
                    lineHeight: '1.4'
                }}
            >
                {toast.message}
            </div>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsExiting(true);
                    setTimeout(() => onClose(toast.id), 300);
                }}
                style={{
                    background: 'none',
                    border: 'none',
                    color: darkTheme.text.secondary,
                    cursor: 'pointer',
                    fontSize: '18px',
                    padding: '0',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    transition: 'all 0.2s',
                    flexShrink: 0
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
                ×
            </button>
        </div>
    );
}

// Hook pour utiliser les toasts
export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = (message: string, type: ToastType = 'info', duration?: number) => {
        const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const newToast: Toast = { id, message, type, duration };
        setToasts(prev => [...prev, newToast]);
    };

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const ToastContainer = () => (
        <div
            style={{
                position: 'fixed',
                top: '20px',
                right: '20px',
                zIndex: 10000,
                pointerEvents: 'none'
            }}
        >
            {toasts.map(toast => (
                <div key={toast.id} style={{ pointerEvents: 'auto' }}>
                    <ToastComponent toast={toast} onClose={removeToast} />
                </div>
            ))}
        </div>
    );

    return {
        showToast,
        ToastContainer
    };
}
