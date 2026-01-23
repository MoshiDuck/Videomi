// INFO : app/routes/login.tsx
import React from 'react';
import { Navigate } from 'react-router';
import { GoogleOAuthProvider } from '@react-oauth/google';
import type { CredentialResponse } from '@react-oauth/google';

import { useConfig } from '~/hooks/useConfig';
import { useElectronAuth } from '~/hooks/useElectronAuth';
import { useAuth } from '~/hooks/useAuth';
import { ErrorDisplay } from '~/components/ui/ErrorDisplay';
import { LoadingSpinner } from '~/components/ui/LoadingSpinner';
import { GoogleAuthButton } from '~/components/auth/GoogleAuthButton';
import { darkTheme } from '~/utils/ui/theme';
import { useLanguage } from '~/contexts/LanguageContext';

export default function LoginRoute() {
    const { config, loading: configLoading, error: configError } = useConfig();
    const { credential, error: electronError, openAuthInBrowser } = useElectronAuth();
    const { user, handleAuthWithToken, setError, loading: authInitialLoading, error: authError } = useAuth();
    const { t } = useLanguage();
    const isElectron = typeof window !== 'undefined' && (window.electronAPI?.isElectron || false);

    // Gérer le token reçu via Electron
    React.useEffect(() => {
        if (credential && config) {
            handleAuthWithToken(credential, config);
        }
    }, [credential, config, handleAuthWithToken]);

    // Gérer les erreurs d'Electron
    React.useEffect(() => {
        if (electronError) {
            setError(electronError);
        }
    }, [electronError, setError]);

    const handleWebAuth = async (cred: CredentialResponse) => {
        if (cred.credential && config) {
            await handleAuthWithToken(cred.credential, config);
        }
    };

    const handleElectronAuth = () => {
        if (config?.googleClientId) {
            const authUrl = `${config.baseUrl}/api/auth/google/electron?client_id=${config.googleClientId}`;
            openAuthInBrowser(authUrl);
        }
    };

    // Si l'utilisateur est déjà connecté, rediriger vers la page d'accueil
    if (user && !authInitialLoading) {
        return <Navigate to="/home" replace />;
    }

    if (configLoading || authInitialLoading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                backgroundColor: darkTheme.background.primary
            }}>
                <LoadingSpinner message={t('common.loading')} size="large" />
            </div>
        );
    }

    if (configError || !config) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: 40,
                backgroundColor: darkTheme.background.primary
            }}>
                <div style={{
                    maxWidth: 500,
                    width: '100%',
                    backgroundColor: darkTheme.background.secondary,
                    borderRadius: 12,
                    padding: 40,
                    boxShadow: darkTheme.shadow.medium
                }}>
                    <ErrorDisplay 
                        error={configError || t('login.configUnavailable')} 
                    />
                </div>
            </div>
        );
    }

    if (!config.googleClientId) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: 40,
                backgroundColor: darkTheme.background.primary
            }}>
                <div style={{
                    maxWidth: 500,
                    width: '100%',
                    backgroundColor: darkTheme.background.secondary,
                    borderRadius: 12,
                    padding: 40,
                    boxShadow: darkTheme.shadow.medium
                }}>
                    <ErrorDisplay 
                        error={t('login.configError') + ': GOOGLE_CLIENT_ID non configuré côté Cloudflare. Veuillez configurer votre application.'} 
                    />
                </div>
            </div>
        );
    }

    return (
        <GoogleOAuthProvider clientId={config.googleClientId}>
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: 20,
                backgroundColor: '#121212'
            }}>
                <div style={{
                    maxWidth: 400,
                    width: '100%',
                    backgroundColor: darkTheme.background.secondary,
                    borderRadius: 12,
                    padding: 40,
                    boxShadow: darkTheme.shadow.medium
                }}>
                    <div style={{ textAlign: 'center', marginBottom: 30 }}>
                        <h1 style={{
                            fontSize: 28,
                            fontWeight: 'bold',
                            marginBottom: 10,
                            color: darkTheme.text.primary
                        }}>
                            {t('login.title')}
                        </h1>
                        <p style={{
                            color: darkTheme.text.secondary,
                            fontSize: 16,
                            marginBottom: 30
                        }}>
                            {t('login.subtitle')}
                        </p>
                    </div>

                    {isElectron && (
                        <div style={{
                            backgroundColor: darkTheme.surface.info,
                            padding: '12px 16px',
                            borderRadius: '8px',
                            marginBottom: '24px',
                            border: `1px solid ${darkTheme.accent.blue}`
                        }}>
                            <p style={{
                                margin: 0,
                                fontSize: '14px',
                                color: darkTheme.accent.blue
                            }}>
                                <strong>{t('login.electronMode')}</strong>
                            </p>
                        </div>
                    )}

                    <div style={{ textAlign: 'center' }}>
                        <p style={{
                            marginBottom: 20,
                            color: darkTheme.text.secondary,
                            fontSize: 15
                        }}>
                            {t('login.connectWithGoogle')}
                        </p>

                        <div style={{ marginBottom: 20 }}>
                            <GoogleAuthButton
                                isElectron={isElectron}
                                googleClientId={config.googleClientId}
                                loading={authInitialLoading}
                                onElectronAuth={handleElectronAuth}
                                onWebAuth={handleWebAuth}
                                onError={() => setError('Erreur lors de l\'authentification Google')}
                            />
                        </div>

                        {(authError || electronError) && (
                            <ErrorDisplay error={authError || electronError || ''} />
                        )}
                    </div>

                    <div style={{
                        marginTop: 30,
                        paddingTop: 20,
                        borderTop: `1px solid ${darkTheme.border.primary}`,
                        textAlign: 'center'
                    }}>
                        <p style={{
                            fontSize: 12,
                            color: darkTheme.text.tertiary,
                            margin: 0
                        }}>
                            {t('login.terms')}
                        </p>
                    </div>
                </div>
            </div>
        </GoogleOAuthProvider>
    );
}
