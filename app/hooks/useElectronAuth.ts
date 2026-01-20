// INFO : app/hooks/useElectronAuth.ts
import { useState, useEffect, useCallback } from 'react';

export function useElectronAuth() {
    const [credential, setCredential] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const electronAPI = window.electronAPI;

        if (electronAPI?.isElectron) {

            const removeTokenListener = electronAPI.onOAuthToken?.((token: string) => {
                setCredential(token);
                setError(null);
            });

            const removeCancelledListener = electronAPI.onOAuthCancelled?.(() => {
                setError('Authentification annulée');
            });

            return () => {
                removeTokenListener?.();
                removeCancelledListener?.();
            };
        }
    }, []);

    const openAuthInBrowser = useCallback(async (authUrl: string) => {
        const electronAPI = window.electronAPI;

        if (electronAPI?.isElectron && electronAPI.openAuthWindow) {
            try {
                await electronAPI.openAuthWindow(authUrl);
            } catch (err) {
                console.error('Erreur lors de l\'ouverture:', err);
                setError('Impossible d\'ouvrir la fenêtre d\'authentification');
            }
        } else {
            window.open(authUrl, '_blank');
        }
    }, []);

    return { credential, error, openAuthInBrowser };
}