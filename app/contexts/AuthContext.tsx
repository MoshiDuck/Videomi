// INFO : app/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router';

interface AuthContextType {
    isAuthenticated: boolean;
    user: { email: string; uid?: string } | null;
    login: (token: string, email: string, uid?: string) => void;
    logout: () => void;
    loading: boolean;
    verifyToken: () => Promise<boolean>;
    refreshAuth: () => Promise<boolean>;
    hasRefreshToken: boolean;
}

interface VerifyTokenResponse {
    success: boolean;
    valid: boolean;
    user?: {
        id: string;
        uid: string;
        email: string;
    };
    error?: string;
    expiresIn?: number;
}

interface RefreshTokenResponse {
    success: boolean;
    token?: string;
    error?: string;
    message?: string;
}

interface UserRefreshTokensResponse {
    success: boolean;
    tokens: Array<any>;
    count: number;
    error?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<{ email: string; uid?: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasRefreshToken, setHasRefreshToken] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        checkAuth();
    }, []);

    // Vérifier si un refresh token existe
    const checkRefreshToken = async (): Promise<boolean> => {
        try {
            if (window.electronAPI?.isElectron) {
                // Pour Electron
                const result = await window.electronAPI.hasRefreshToken();
                return result.hasRefreshToken;
            } else {
                // Pour le web: vérifier via un endpoint API
                const response = await fetch('/api/user/refresh-tokens', {
                    credentials: 'include'
                });

                if (response.ok) {
                    const data = await response.json() as UserRefreshTokensResponse;
                    return data.count > 0;
                }
            }
            return false;
        } catch (error) {
            console.error('Erreur vérification refresh token:', error);
            return false;
        }
    };

    const checkAuth = async () => {
        const token = localStorage.getItem('token');

        if (!token) {
            // Pour Electron, tenter directement le rafraîchissement UNIQUEMENT si un refresh token existe
            if (window.electronAPI?.isElectron) {
                console.log('🔄 Electron - vérification des refresh tokens...');

                // D'abord vérifier si un refresh token existe
                const hasRT = await checkRefreshToken();
                setHasRefreshToken(hasRT);

                if (hasRT) {
                    console.log('🔄 Refresh token détecté, tentative de rafraîchissement...');
                    const refreshed = await refreshAuth();
                    if (refreshed) {
                        console.log('✅ Authentifié via refresh token');
                    } else {
                        console.log('❌ Échec du rafraîchissement, utilisateur non authentifié');
                        setLoading(false);
                    }
                } else {
                    console.log('ℹ️ Pas de refresh token disponible, utilisateur non authentifié');
                    setLoading(false);
                }
                return;
            }

            // Pour le web, vérifier les refresh tokens
            const hasRT = await checkRefreshToken();
            setHasRefreshToken(hasRT);

            if (hasRT) {
                console.log('🔄 Refresh token détecté (web), tentative de rafraîchissement...');
                await refreshAuth();
            } else {
                console.log('ℹ️ Pas de refresh token disponible (web)');
                setLoading(false);
            }
            return;
        }

        // Vérifier le token existant
        try {
            console.log('🔍 Vérification du token existant...');
            const response = await fetch('/api/verify-token', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json() as VerifyTokenResponse;
                if (data.valid && data.user) {
                    console.log('✅ Token valide, utilisateur authentifié');
                    setIsAuthenticated(true);
                    setUser({ email: data.user.email, uid: data.user.uid });
                    setLoading(false);
                } else {
                    // Token invalide, tenter le rafraîchissement
                    console.log('🔄 Token invalide, tentative de rafraîchissement...');
                    localStorage.removeItem('token');
                    await refreshAuth();
                }
            } else if (response.status === 401) {
                // Token expiré, tenter le rafraîchissement
                console.log('🔄 Token expiré (401), tentative de rafraîchissement...');
                localStorage.removeItem('token');
                await refreshAuth();
            } else {
                console.log('⚠️ Erreur inattendue lors de la vérification du token');
                setLoading(false);
            }
        } catch (error) {
            console.error('❌ Erreur de vérification du token:', error);
            setLoading(false);
        }
    };

// Dans app/contexts/AuthContext.tsx - AJOUTER dans la fonction refreshAuth
    const refreshAuth = async (): Promise<boolean> => {
        try {
            console.log('🔄 Tentative de rafraîchissement du token...');

            if (window.electronAPI?.isElectron) {
                console.log('💻 Mode Electron détecté');
                // Pour Electron: utiliser l'API IPC corrigée
                const result = await window.electronAPI.refreshAuth();
                console.log('📥 Résultat du rafraîchissement Electron:', result);

                if (result.success && result.token) {
                    console.log('✅ Token rafraîchi avec succès');
                    localStorage.setItem('token', result.token);
                    setIsAuthenticated(true);

                    // Recharger les informations utilisateur
                    await verifyToken();
                    return true;
                } else {
                    console.error('❌ Échec du rafraîchissement Electron:', result.error);
                }
                return false;
            } else {
                // Code web inchangé
                console.log('🌐 Mode web détecté');
                const response = await fetch('/api/refresh', {
                    method: 'POST',
                    credentials: 'include'
                });

                console.log(`📥 Réponse rafraîchissement web, status: ${response.status}`);

                if (response.ok) {
                    const data = await response.json() as RefreshTokenResponse;
                    console.log('📦 Données de rafraîchissement web:', data);

                    if (data.success && data.token) {
                        console.log('✅ Token web rafraîchi avec succès');
                        localStorage.setItem('token', data.token);
                        setIsAuthenticated(true);
                        await verifyToken();
                        return true;
                    }
                }
                return false;
            }
        } catch (error) {
            console.error('❌ Erreur lors du rafraîchissement:', error);
            return false;
        }
    };

    const verifyToken = async (): Promise<boolean> => {
        const token = localStorage.getItem('token');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        if (!token) return false;

        try {
            console.log('🔐 Vérification du token...');
            const response = await fetch('/api/verify-token', {
                headers: { 'Authorization': `Bearer ${token}` },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json() as VerifyTokenResponse;
                if (data.valid && data.user) {
                    setIsAuthenticated(true);
                    setUser({ email: data.user.email, uid: data.user.uid });
                    return true;
                }
            }

            // Si 401, essayer de rafraîchir
            if (response.status === 401) {
                console.log('🔄 Token expiré, tentative de rafraîchissement...');
                const refreshed = await refreshAuth();
                if (refreshed) {
                    return true;
                }
            }

            // Déconnexion si échec
            logout();
            return false;

        } catch (error) {
            console.warn('Erreur réseau lors de la vérification du token:', error);
            clearTimeout(timeoutId);
            return isAuthenticated;
        }
    };

    const login = (token: string, email: string, uid?: string) => {
        localStorage.setItem('token', token);
        setIsAuthenticated(true);
        setUser({ email, uid });
        setHasRefreshToken(true);
    };

    const logout = () => {
        localStorage.removeItem('token');
        setIsAuthenticated(false);
        setUser(null);
        setHasRefreshToken(false);

        // Appeler l'API logout
        fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        }).catch(console.error);

        navigate('/login');
    };

    return (
        <AuthContext.Provider value={{
            isAuthenticated,
            user,
            login,
            logout,
            loading,
            verifyToken,
            refreshAuth,
            hasRefreshToken
        }}>
            {children}
        </AuthContext.Provider>
    );
};