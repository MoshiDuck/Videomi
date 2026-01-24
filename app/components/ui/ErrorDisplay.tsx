// INFO : app/components/ui/ErrorDisplay.tsx
import React from 'react';
import { darkTheme } from '~/utils/ui/theme';

interface ErrorDisplayProps {
    error: string;
    onRetry?: () => void;
    retryText?: string;
}

export function ErrorDisplay({ error, onRetry, retryText = 'Réessayer' }: ErrorDisplayProps) {
    return (
        <div 
            role="alert"
            aria-live="assertive"
            style={{
                backgroundColor: `${darkTheme.accent.red}15`,
                color: darkTheme.accent.red,
                padding: '16px',
                borderRadius: '8px',
                marginTop: '16px',
                border: `1px solid ${darkTheme.accent.red}40`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
            }}
        >
            <div 
                aria-hidden="true"
                style={{
                    fontSize: '20px',
                    flexShrink: 0,
                    marginTop: '2px'
                }}
            >
                ⚠️
            </div>
            <div style={{ flex: 1 }}>
                <div style={{
                    fontWeight: '600',
                    marginBottom: '4px',
                    fontSize: '15px'
                }}>
                    Erreur
                </div>
                <div style={{
                    fontSize: '14px',
                    lineHeight: '1.5',
                    opacity: 0.9
                }}>
                    {error}
                </div>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        style={{
                            marginTop: '12px',
                            padding: '8px 16px',
                            backgroundColor: darkTheme.accent.red,
                            color: darkTheme.text.primary,
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500',
                            transition: 'opacity 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '0.8';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '1';
                        }}
                    >
                        {retryText}
                    </button>
                )}
            </div>
        </div>
    );
}