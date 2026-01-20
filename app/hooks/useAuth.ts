// INFO : app/hooks/useAuth.ts
import { useState, useEffect, useCallback } from 'react';
import type { CredentialResponse } from '@react-oauth/google';
import type { ApiAuthResponse, AuthConfig } from '~/types/auth';
import { useNavigate } from 'react-router';

// Type guard pour ApiAuthResponse
function isApiAuthResponse(obj: unknown): obj is ApiAuthResponse {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'success' in obj &&
        typeof (obj as any).success === 'boolean'
    );
}

export function useAuth() {
    const [user, setUser] = useState<ApiAuthResponse['user'] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    // Charger l'utilisateur depuis localStorage au démarrage
    useEffect(() => {
        const storedUser = localStorage.getItem('videomi_user');
        const storedToken = localStorage.getItem('videomi_token');

        if (storedUser && storedToken) {
            try {
                const parsedUser = JSON.parse(storedUser);
                setUser(parsedUser);
            } catch (e) {
                // Nettoyer les données corrompues
                localStorage.removeItem('videomi_token');
                localStorage.removeItem('videomi_user');
                setUser(null);
            }
        }
        setLoading(false);
    }, []);

    const handleAuthWithToken = useCallback(async (idToken: string, config: AuthConfig) => {
        setError(null);
        setLoading(true);

        try {
            const res = await fetch(`${config.baseUrl}/api/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken }),
            });

            const data: unknown = await res.json();

            if (!isApiAuthResponse(data)) {
                throw new Error('Réponse d\'authentification invalide');
            }

            if (!data.success || !data.token) {
                throw new Error(data.error || 'Échec de l\'authentification');
            }

            // Stocker les données minimales
            const completeUser = {
                id: data.user?.id || '',
                email: data.user?.email,
                name: data.user?.name,
                picture: data.user?.picture,
                email_verified: data.user?.email_verified
            };

            localStorage.setItem('videomi_user', JSON.stringify(completeUser));
            localStorage.setItem('videomi_token', data.token);
            setUser(completeUser);

            navigate('/home');
        } catch (err: any) {
            setError(err.message || 'Erreur d\'authentification');
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    const logout = useCallback(() => {
        localStorage.removeItem('videomi_token');
        localStorage.removeItem('videomi_user');
        setUser(null);
        setError(null);
        navigate('/login');
    }, [navigate]);

    const isAuthenticated = !!user;

    return {
        user,
        loading,
        error,
        setError,
        handleAuthWithToken,
        logout,
        isAuthenticated
    };
}