// INFO : app/hooks/useConfig.ts
import { useState, useEffect } from 'react';
import type { ConfigResponse, AuthConfig } from '~/types/auth';

// Type guard pour ConfigResponse
function isConfigResponse(obj: unknown): obj is ConfigResponse {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        ('googleClientId' in obj
            ? typeof (obj as any).googleClientId === 'string'
            || (obj as any).googleClientId === null
            : true) &&
        ('tmdbApiKey' in obj
            ? typeof (obj as any).tmdbApiKey === 'string'
            || (obj as any).tmdbApiKey === null
            : true) &&
        ('omdbApiKey' in obj
            ? typeof (obj as any).omdbApiKey === 'string'
            || (obj as any).omdbApiKey === null
            : true) &&
        ('spotifyClientId' in obj
            ? typeof (obj as any).spotifyClientId === 'string'
            || (obj as any).spotifyClientId === null
            : true) &&
        ('spotifyClientSecret' in obj
            ? typeof (obj as any).spotifyClientSecret === 'string'
            || (obj as any).spotifyClientSecret === null
            : true) &&
        ('discogsApiToken' in obj
            ? typeof (obj as any).discogsApiToken === 'string'
            || (obj as any).discogsApiToken === null
            : true)
    );
}

export function useConfig() {
    const [config, setConfig] = useState<AuthConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s max
                const res = await fetch('/api/config', { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!res.ok) throw new Error(`Échec: ${res.status}`);

                const data: unknown = await res.json();

                if (!isConfigResponse(data)) {
                    throw new Error('Format de réponse invalide');
                }

                const clientId = data.googleClientId ?? null;
                const tmdbApiKey = data.tmdbApiKey ?? null;
                const omdbApiKey = data.omdbApiKey ?? null;
                const spotifyClientId = data.spotifyClientId ?? null;
                const spotifyClientSecret = data.spotifyClientSecret ?? null;
                const discogsApiToken = data.discogsApiToken ?? null;
                const isElectron = window.electronAPI?.isElectron || false;

                setConfig({
                    googleClientId: clientId,
                    baseUrl: window.location.origin,
                    redirectUri: isElectron
                        ? 'https://videomi.uk/oauth-callback'
                        : window.location.origin,
                    tmdbApiKey: tmdbApiKey,
                    omdbApiKey: omdbApiKey,
                    spotifyClientId: spotifyClientId,
                    spotifyClientSecret: spotifyClientSecret,
                    discogsApiToken: discogsApiToken
                });

                if (!clientId) {
                    setError('GOOGLE_CLIENT_ID non configuré');
                }
            } catch (err: any) {
                setError(err?.name === 'AbortError' ? 'Délai dépassé. Vérifiez votre connexion.' : (err.message || 'Erreur lors de la récupération'));
            } finally {
                setLoading(false);
            }
        };

        fetchConfig();
    }, []);

    return { config, loading, error };
}