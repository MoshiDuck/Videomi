// INFO : app/components/GoogleAuthButton.tsx
import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import type { CredentialResponse } from '@react-oauth/google';

interface GoogleAuthButtonProps {
    isElectron: boolean;
    googleClientId: string;
    loading: boolean;
    onElectronAuth: () => void;
    onWebAuth: (credential: CredentialResponse) => void;
    onError: () => void;
}

export function GoogleAuthButton({
                                     isElectron,
                                     googleClientId,
                                     loading,
                                     onElectronAuth,
                                     onWebAuth,
                                     onError
                                 }: GoogleAuthButtonProps) {
    if (loading) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <p>Connexion en cours…</p>
            </div>
        );
    }

    if (isElectron) {
        return (
            <button
                onClick={onElectronAuth}
                style={{
                    backgroundColor: '#4285f4',
                    color: 'white',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    margin: '10px 0'
                }}
                disabled={loading}
            >
                <img
                    src="https://www.google.com/favicon.ico"
                    alt="Google"
                    style={{ width: '20px', height: '20px' }}
                />
                Se connecter avec Google (Electron)
            </button>
        );
    }

    return (
        <GoogleLogin
            onSuccess={onWebAuth}
            onError={onError}
            useOneTap={false}
        />
    );
}