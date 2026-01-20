// INFO : app/routes/profile.tsx
import React from 'react';
import { useAuth } from '~/hooks/useAuth';
import { Navigation } from '~/components/navigation/Navigation';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { darkTheme } from '~/utils/ui/theme';
import { useLanguage } from '~/contexts/LanguageContext';
import { LanguageSelector } from '~/components/ui/LanguageSelector';
import { replacePlaceholders } from '~/utils/i18n';

export default function ProfileRoute() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();

    if (!user) {
        return null; // AuthGuard gère la redirection
    }

    return (
        <AuthGuard>
            <div style={{ minHeight: '100vh', backgroundColor: darkTheme.background.primary }}>
                <Navigation user={user} onLogout={logout} />

                <main style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '0 20px 40px',
                    fontFamily: 'system-ui, sans-serif'
                }}>
                    <div style={{
                        backgroundColor: darkTheme.background.secondary,
                        borderRadius: '12px',
                        padding: '40px',
                        boxShadow: darkTheme.shadow.medium
                    }}>
                        <div style={{ marginBottom: '40px' }}>
                            <h1 style={{
                                fontSize: '32px',
                                fontWeight: 'bold',
                                marginBottom: '8px',
                                color: darkTheme.text.primary
                            }}>
                                {t('profile.title')}
                            </h1>
                            <p style={{
                                color: darkTheme.text.secondary,
                                fontSize: '16px'
                            }}>
                                {t('profile.subtitle')}
                            </p>
                        </div>

                        <div style={{ display: 'grid', gap: '30px' }}>
                            {/* Section Informations personnelles */}
                            <section style={{
                                backgroundColor: darkTheme.background.tertiary,
                                borderRadius: '8px',
                                padding: '30px',
                                border: `1px solid ${darkTheme.border.primary}`
                            }}>
                                <h2 style={{
                                    fontSize: '20px',
                                    fontWeight: '600',
                                    marginBottom: '20px',
                                    color: darkTheme.text.primary,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px'
                                }}>
                  <span style={{
                      display: 'inline-block',
                      width: '24px',
                      height: '24px',
                      backgroundColor: '#4285f4',
                      borderRadius: '4px',
                      color: 'white',
                      textAlign: 'center',
                      lineHeight: '24px',
                      fontSize: '14px'
                  }}>👤</span>
                                    Informations personnelles
                                </h2>

                                <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start' }}>
                                    {user.picture && (
                                        <div style={{ flexShrink: 0 }}>
                                            <img
                                                src={user.picture}
                                                alt="avatar"
                                                style={{
                                                    width: 120,
                                                    height: 120,
                                                    borderRadius: '50%',
                                                    border: '4px solid #4285f4',
                                                    objectFit: 'cover'
                                                }}
                                            />
                                        </div>
                                    )}

                                    <div style={{ flex: 1 }}>
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                                            gap: '20px'
                                        }}>
                                            <div>
                                                <label style={{
                                                    display: 'block',
                                                    fontSize: '14px',
                                                    fontWeight: '500',
                                                    color: darkTheme.text.secondary,
                                                    marginBottom: '6px'
                                                }}>
                                                    Nom complet
                                                </label>
                                                <div style={{
                                                    backgroundColor: darkTheme.background.secondary,
                                                    padding: '12px 16px',
                                                    borderRadius: '6px',
                                                    border: `1px solid ${darkTheme.border.primary}`,
                                                    fontSize: '16px',
                                                    fontWeight: '500'
                                                }}>
                                                    {user.name || 'Non spécifié'}
                                                </div>
                                            </div>

                                            <div>
                                                <label style={{
                                                    display: 'block',
                                                    fontSize: '14px',
                                                    fontWeight: '500',
                                                    color: darkTheme.text.secondary,
                                                    marginBottom: '6px'
                                                }}>
                                                    Email
                                                </label>
                                                <div style={{
                                                    backgroundColor: darkTheme.background.secondary,
                                                    padding: '12px 16px',
                                                    borderRadius: '6px',
                                                    border: `1px solid ${darkTheme.border.primary}`,
                                                    fontSize: '16px'
                                                }}>
                                                    {user.email || 'Non spécifié'}
                                                </div>
                                            </div>

                                            <div>
                                                <label style={{
                                                    display: 'block',
                                                    fontSize: '14px',
                                                    fontWeight: '500',
                                                    color: darkTheme.text.secondary,
                                                    marginBottom: '6px'
                                                }}>
                                                    Statut de vérification
                                                </label>
                                                <div style={{
                                                    backgroundColor: darkTheme.background.secondary,
                                                    padding: '12px 16px',
                                                    borderRadius: '6px',
                                                    border: `1px solid ${darkTheme.border.primary}`,
                                                    fontSize: '16px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}>
                                                    {user.email_verified ? (
                                                        <>
                              <span style={{
                                  color: '#34a853',
                                  fontSize: '18px'
                              }}>✓</span>
                                                            <span style={{ color: '#34a853' }}>Email vérifié</span>
                                                        </>
                                                    ) : (
                                                        <>
                              <span style={{
                                  color: '#f44336',
                                  fontSize: '18px'
                              }}>✗</span>
                                                            <span style={{ color: '#f44336' }}>Email non vérifié</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            <div>
                                                <label style={{
                                                    display: 'block',
                                                    fontSize: '14px',
                                                    fontWeight: '500',
                                                    color: darkTheme.text.secondary,
                                                    marginBottom: '6px'
                                                }}>
                                                    ID utilisateur
                                                </label>
                                                <div style={{
                                                    backgroundColor: darkTheme.background.secondary,
                                                    padding: '12px 16px',
                                                    borderRadius: '6px',
                                                    border: `1px solid ${darkTheme.border.primary}`,
                                                    fontSize: '14px',
                                                    fontFamily: 'monospace',
                                                    wordBreak: 'break-all',
                                                    color: '#666'
                                                }}>
                                                    {user.id}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Section Compte */}
                            <section style={{
                                backgroundColor: darkTheme.background.tertiary,
                                borderRadius: '8px',
                                padding: '30px',
                                border: `1px solid ${darkTheme.border.primary}`
                            }}>
                                <h2 style={{
                                    fontSize: '20px',
                                    fontWeight: '600',
                                    marginBottom: '20px',
                                    color: darkTheme.text.primary,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px'
                                }}>
                  <span style={{
                      display: 'inline-block',
                      width: '24px',
                      height: '24px',
                      backgroundColor: '#34a853',
                      borderRadius: '4px',
                      color: 'white',
                      textAlign: 'center',
                      lineHeight: '24px',
                      fontSize: '14px'
                  }}>🔗</span>
                                    Compte connecté
                                </h2>

                                <div style={{
                                    backgroundColor: darkTheme.background.secondary,
                                    borderRadius: '8px',
                                    padding: '20px',
                                    border: '1px solid #dee2e6'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '16px',
                                        marginBottom: '16px'
                                    }}>
                                        <img
                                            src="https://www.google.com/favicon.ico"
                                            alt="Google"
                                            style={{ width: '24px', height: '24px' }}
                                        />
                                        <div>
                                            <p style={{
                                                margin: 0,
                                                fontWeight: '500',
                                                fontSize: '16px'
                                            }}>
                                                Compte Google
                                            </p>
                                            <p style={{
                                                margin: 0,
                                                color: darkTheme.text.secondary,
                                                fontSize: '14px'
                                            }}>
                                                Connecté via Google OAuth
                                            </p>
                                        </div>
                                    </div>

                                    <div style={{
                                        fontSize: '14px',
                                        color: darkTheme.text.secondary,
                                        backgroundColor: darkTheme.background.tertiary,
                                        padding: '12px',
                                        borderRadius: '6px',
                                        marginTop: '12px'
                                    }}>
                                        <p style={{ margin: 0 }}>
                                            Votre compte est sécurisé avec l'authentification Google. Pour modifier vos informations,
                                            veuillez les mettre à jour directement sur votre compte Google.
                                        </p>
                                    </div>
                                </div>
                            </section>

                            {/* Section Préférences */}
                            <section style={{
                                backgroundColor: darkTheme.background.tertiary,
                                borderRadius: '8px',
                                padding: '30px',
                                border: `1px solid ${darkTheme.border.primary}`
                            }}>
                                <h2 style={{
                                    fontSize: '20px',
                                    fontWeight: '600',
                                    marginBottom: '20px',
                                    color: darkTheme.text.primary,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px'
                                }}>
                                    <span style={{
                                        display: 'inline-block',
                                        width: '24px',
                                        height: '24px',
                                        backgroundColor: darkTheme.accent.blue,
                                        borderRadius: '4px',
                                        color: 'white',
                                        textAlign: 'center',
                                        lineHeight: '24px',
                                        fontSize: '14px'
                                    }}>🌐</span>
                                    {t('profile.language')}
                                </h2>

                                <div style={{
                                    marginBottom: '16px'
                                }}>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        color: darkTheme.text.secondary,
                                        marginBottom: '12px'
                                    }}>
                                        {t('profile.languageDescription')}
                                    </label>
                                    <LanguageSelector compact={false} />
                                </div>
                            </section>

                            {/* Section Actions */}
                            <section style={{
                                backgroundColor: darkTheme.background.tertiary,
                                borderRadius: '8px',
                                padding: '30px',
                                border: `1px solid ${darkTheme.border.primary}`
                            }}>
                                <h2 style={{
                                    fontSize: '20px',
                                    fontWeight: '600',
                                    marginBottom: '20px',
                                    color: darkTheme.text.primary,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px'
                                }}>
                  <span style={{
                      display: 'inline-block',
                      width: '24px',
                      height: '24px',
                      backgroundColor: '#f44336',
                      borderRadius: '4px',
                      color: 'white',
                      textAlign: 'center',
                      lineHeight: '24px',
                      fontSize: '14px'
                  }}>⚠️</span>
                                    Actions
                                </h2>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                    gap: '16px'
                                }}>
                                    <button
                                        onClick={logout}
                                        style={{
                                            backgroundColor: '#f44336',
                                            color: 'white',
                                            border: 'none',
                                            padding: '12px 20px',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '16px',
                                            fontWeight: '500',
                                            transition: 'background-color 0.2s',
                                            textAlign: 'left'
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#d32f2f'}
                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f44336'}
                                    >
                                        Se déconnecter
                                    </button>

                                    <button
                                        onClick={() => {
                                            if (window.confirm('Êtes-vous sûr de vouloir supprimer toutes vos données locales ?')) {
                                                localStorage.removeItem('videomi_token');
                                                localStorage.removeItem('videomi_user');
                                                window.location.reload();
                                            }
                                        }}
                                        style={{
                                            backgroundColor: 'transparent',
                                            color: darkTheme.text.secondary,
                                            border: '1px solid #dee2e6',
                                            padding: '12px 20px',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '16px',
                                            fontWeight: '500',
                                            transition: 'all 0.2s',
                                            textAlign: 'left'
                                        }}
                                        onMouseOver={(e) => {
                                            e.currentTarget.style.backgroundColor = '#f8f9fa';
                                            e.currentTarget.style.borderColor = '#dc3545';
                                            e.currentTarget.style.color = '#dc3545';
                                        }}
                                        onMouseOut={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                            e.currentTarget.style.borderColor = '#dee2e6';
                                            e.currentTarget.style.color = '#666';
                                        }}
                                    >
                                        Effacer les données locales
                                    </button>
                                </div>

                                <div style={{
                                    marginTop: '20px',
                                    fontSize: '12px',
                                    color: '#888',
                                    lineHeight: '1.5'
                                }}>
                                    <p style={{ margin: 0 }}>
                                        <strong>Note :</strong> La déconnexion supprimera votre session actuelle mais ne supprimera pas
                                        votre compte. Pour supprimer définitivement votre compte, veuillez vous rendre sur votre compte Google.
                                    </p>
                                </div>
                            </section>
                        </div>
                    </div>
                </main>

                <footer style={{
                    backgroundColor: darkTheme.background.nav,
                    color: darkTheme.text.secondary,
                    padding: '20px 0',
                    marginTop: '40px',
                    textAlign: 'center'
                }}>
                    <div style={{
                        maxWidth: 1200,
                        margin: '0 auto',
                        padding: '0 20px'
                    }}>
                        <p style={{ margin: 0, fontSize: '14px' }}>
                            © {new Date().getFullYear()} Videomi. Tous droits réservés.
                        </p>
                    </div>
                </footer>
            </div>
        </AuthGuard>
    );
}