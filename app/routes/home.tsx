// INFO : app/routes/home.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '~/hooks/useAuth';
import { Navigation } from '~/components/navigation/Navigation';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { darkTheme } from '~/utils/ui/theme';
import { useFilesPreloader } from '~/hooks/useFilesPreloader';
import { useLanguage } from '~/contexts/LanguageContext';
import { replacePlaceholders } from '~/utils/i18n';

export default function HomeRoute() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const [stats, setStats] = useState({ fileCount: 0, totalSizeGB: 0, billableGB: 0 });
    const [loadingStats, setLoadingStats] = useState(true);
    
    // Précharger toutes les catégories de fichiers en arrière-plan
    useFilesPreloader({ 
        userId: user?.id || null, 
        enabled: !!user?.id,
        preloadOnHover: true 
    });

    useEffect(() => {
        const fetchStats = async (skipCache = false) => {
            if (!user?.id) return;
            
            // Vérifier le cache sessionStorage d'abord (sauf si skipCache = true)
            if (typeof window === 'undefined') return;
            const cacheKey = `videomi_stats_${user.id}`;
            if (!skipCache) {
                const cachedStats = sessionStorage.getItem(cacheKey);
                
                if (cachedStats) {
                    try {
                        const parsedStats = JSON.parse(cachedStats) as { fileCount: number; totalSizeGB: number; billableGB: number };
                        setStats(parsedStats);
                        setLoadingStats(false);
                        return; // Utiliser le cache, pas besoin d'appeler l'API
                    } catch (e) {
                        // Si le cache est corrompu, le supprimer et continuer
                        sessionStorage.removeItem(cacheKey);
                    }
                }
            }
            
            try {
                const token = localStorage.getItem('videomi_token');
                const response = await fetch(`/api/stats?userId=${user.id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json() as { fileCount: number; totalSizeGB: number; billableGB: number };
                    const statsData = {
                        fileCount: data.fileCount || 0,
                        totalSizeGB: data.totalSizeGB || 0,
                        billableGB: data.billableGB || 0
                    };
                    setStats(statsData);
                    
                    // Mettre en cache dans sessionStorage
                    sessionStorage.setItem(cacheKey, JSON.stringify(statsData));
                }
            } catch (error) {
                console.error('Erreur récupération stats:', error);
            } finally {
                setLoadingStats(false);
            }
        };

        fetchStats();

        // Écouter l'événement de invalidation du cache pour recharger les stats
        const handleStatsInvalidated = (event: Event) => {
            const customEvent = event as CustomEvent<{ userId: string }>;
            if (customEvent.detail?.userId === user?.id) {
                fetchStats(true); // Recharger sans utiliser le cache
            }
        };

        window.addEventListener('videomi:stats-invalidated', handleStatsInvalidated);

        return () => {
            window.removeEventListener('videomi:stats-invalidated', handleStatsInvalidated);
        };
    }, [user?.id]);

    return (
        <AuthGuard>
            <div style={{ minHeight: '100vh', backgroundColor: darkTheme.background.primary }}>
                <Navigation user={user!} onLogout={logout} />

                <main style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '0 20px 40px',
                    fontFamily: 'system-ui, sans-serif'
                }}>
                    <div style={{ marginBottom: '40px' }}>
                        <h1 style={{
                            fontSize: '32px',
                            fontWeight: 'bold',
                            marginBottom: '8px',
                            color: darkTheme.text.primary
                        }}>
                            {t('home.title')}
                        </h1>
                        <p style={{
                            color: darkTheme.text.secondary,
                            fontSize: '16px'
                        }}>
                            {replacePlaceholders(t('home.welcome'), { name: user?.name || 'Utilisateur' })}
                        </p>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                        gap: '24px',
                        marginBottom: '40px'
                    }}>
                        {/* Carte Statistiques */}
                        <div style={{
                            backgroundColor: darkTheme.background.secondary,
                            borderRadius: '12px',
                            padding: '30px',
                            boxShadow: darkTheme.shadow.medium,
                            borderLeft: `4px solid ${darkTheme.accent.blue}`
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                marginBottom: '20px'
                            }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    backgroundColor: darkTheme.surface.info,
                                    borderRadius: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '24px'
                                }}>
                                    📊
                                </div>
                                <div>
                                    <h3 style={{
                                        margin: 0,
                                        fontSize: '20px',
                                        fontWeight: '600',
                                        color: darkTheme.text.primary
                                    }}>
                                        {t('home.stats')}
                                    </h3>
                                    <p style={{
                                        margin: 0,
                                        color: darkTheme.text.secondary,
                                        fontSize: '14px'
                                    }}>
                                        {t('home.statsDescription')}
                                    </p>
                                </div>
                            </div>

                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '16px'
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{
                                        fontSize: '28px',
                                        fontWeight: 'bold',
                                        color: darkTheme.accent.blue
                                    }}>
                                        {loadingStats ? '...' : stats.fileCount}
                                    </div>
                                    <div style={{
                                        fontSize: '14px',
                                        color: darkTheme.text.secondary
                                    }}>
                                        {t('home.fileCount')}
                                    </div>
                                </div>

                                <div style={{ textAlign: 'center' }}>
                                    <div style={{
                                        fontSize: '28px',
                                        fontWeight: 'bold',
                                        color: darkTheme.accent.green
                                    }}>
                                        {loadingStats ? '...' : stats.totalSizeGB.toFixed(2)}
                                    </div>
                                    <div style={{
                                        fontSize: '14px',
                                        color: darkTheme.text.secondary
                                    }}>
                                        {t('home.totalSize')}
                                    </div>
                                </div>
                            </div>
                            <div style={{
                                marginTop: '20px',
                                padding: '12px',
                                backgroundColor: darkTheme.background.tertiary,
                                borderRadius: '8px',
                                fontSize: '13px',
                                color: darkTheme.text.secondary
                            }}>
                                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                                    <strong>{t('home.rate')}</strong>
                                </div>
                                <div style={{ 
                                    fontSize: '12px', 
                                    color: darkTheme.text.tertiary,
                                    textAlign: 'center',
                                    lineHeight: '1.5'
                                }}>
                                    {t('home.billing')}: <strong>{loadingStats ? '...' : stats.billableGB} Go</strong>
                                </div>
                            </div>
                        </div>

                        {/* Montant à payer par mois */}
                        <div style={{
                            backgroundColor: darkTheme.background.secondary,
                            borderRadius: '12px',
                            padding: '30px',
                            boxShadow: darkTheme.shadow.medium,
                            borderLeft: `4px solid ${darkTheme.accent.blue}`
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                marginBottom: '20px'
                            }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    backgroundColor: darkTheme.surface.info,
                                    borderRadius: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '24px'
                                }}>
                                    💰
                                </div>
                                <div>
                                    <h3 style={{
                                        margin: 0,
                                        fontSize: '20px',
                                        fontWeight: '600',
                                        color: darkTheme.text.primary
                                    }}>
                                        {t('home.amountToPay')}
                                    </h3>
                                    <p style={{
                                        margin: 0,
                                        color: darkTheme.text.secondary,
                                        fontSize: '14px'
                                    }}>
                                        {t('home.monthlyBilling')}
                                    </p>
                                </div>
                            </div>

                            <div style={{
                                textAlign: 'center',
                                padding: '20px 0'
                            }}>
                                <div style={{
                                    fontSize: '36px',
                                    fontWeight: 'bold',
                                    color: darkTheme.accent.blue,
                                    marginBottom: '8px'
                                }}>
                                    {loadingStats ? '...' : (stats.billableGB * 0.030).toFixed(3)} $
                                </div>
                                    <div style={{
                                        fontSize: '14px',
                                        color: darkTheme.text.secondary,
                                        marginBottom: '16px'
                                    }}>
                                    {t('home.for')} {loadingStats ? '...' : stats.billableGB} Go
                                    </div>
                                <div style={{
                                    fontSize: '12px',
                                    color: darkTheme.text.tertiary,
                                    padding: '12px',
                                    backgroundColor: darkTheme.background.tertiary,
                                    borderRadius: '8px'
                                }}>
                                    {t('home.rate')}
                                    </div>
                            </div>
                        </div>
                    </div>

                </main>

                <footer style={{
                    backgroundColor: '#1a1a1a',
                    color: '#cccccc',
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