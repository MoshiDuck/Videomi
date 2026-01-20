// INFO : app/components/ui/LoadingSpinner.tsx
import React from 'react';
import { darkTheme } from '~/utils/ui/theme';

interface LoadingSpinnerProps {
    message?: string;
    size?: 'small' | 'medium' | 'large';
}

export function LoadingSpinner({ message = 'Chargement en cours...', size = 'medium' }: LoadingSpinnerProps) {
    const spinnerSize = size === 'small' ? 24 : size === 'large' ? 48 : 32;
    
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '16px',
            padding: '40px'
        }}>
            <div
                style={{
                    width: `${spinnerSize}px`,
                    height: `${spinnerSize}px`,
                    border: `3px solid ${darkTheme.background.tertiary}`,
                    borderTop: `3px solid ${darkTheme.accent.blue}`,
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                }}
            />
            {message && (
                <p style={{
                    color: darkTheme.text.secondary,
                    fontSize: '14px',
                    margin: 0
                }}>
                    {message}
                </p>
            )}
            <style>
                {`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}
            </style>
        </div>
    );
}