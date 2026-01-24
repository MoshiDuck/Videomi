// INFO : app/routes/archives.tsx
// Page dédiée pour l'affichage des archives

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '~/hooks/useAuth';
import { Navigation } from '~/components/navigation/Navigation';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { darkTheme } from '~/utils/ui/theme';
import type { FileCategory } from '~/utils/file/fileClassifier';
import { CategoryBar } from '~/components/ui/categoryBar';
import { getCategoryRoute, getCategoryFromPathname } from '~/utils/routes';
import { formatFileSize, formatDate } from '~/utils/format';
import { useLanguage } from '~/contexts/LanguageContext';
import { LoadingSpinner } from '~/components/ui/LoadingSpinner';
import { ErrorDisplay } from '~/components/ui/ErrorDisplay';

interface FileItem {
    file_id: string;
    category: string;
    size: number;
    mime_type: string;
    filename: string | null;
    created_at: number;
    uploaded_at: number;
}

export default function ArchivesRoute() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const [selectedCategory, setSelectedCategory] = useState<FileCategory>('archives');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [archives, setArchives] = useState<FileItem[]>([]);

    // Synchroniser selectedCategory avec la route actuelle
    useEffect(() => {
        const category = getCategoryFromPathname(location.pathname);
        if (category) {
            setSelectedCategory(category);
        }
    }, [location.pathname]);

    const handleCategoryChange = (category: FileCategory) => {
        setSelectedCategory(category);
        navigate(getCategoryRoute(category));
    };

    const fetchFiles = useCallback(async () => {
        if (!user?.id) return;

        setLoading(true);
        setError(null);

        try {
            if (typeof window === 'undefined') return;
            const token = localStorage.getItem('videomi_token');
            const response = await fetch(
                `https://videomi.uk/api/upload/user/${user.id}?category=archives`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(t('errors.fetchFailed'));
            }

            const data = await response.json() as { files: FileItem[] };
            setArchives(data.files || []);
        } catch (err) {
            console.error('Erreur fetch fichiers:', err);
            setError(err instanceof Error ? err.message : t('errors.unknown'));
        } finally {
            setLoading(false);
        }
    }, [user?.id, t]);

    useEffect(() => {
        if (user?.id) {
            fetchFiles();
        }
    }, [fetchFiles, user?.id]);


    const getFileUrl = (file: FileItem): string => {
        return `https://videomi.uk/api/files/${file.category}/${file.file_id}`;
    };

    // Afficher le spinner uniquement au chargement initial (pas de données)
    if (loading && archives.length === 0) {
        return (
            <AuthGuard>
                <div style={{ minHeight: '100vh', backgroundColor: darkTheme.background.primary }}>
                    <Navigation user={user!} onLogout={logout} />
                    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
                        <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                            <LoadingSpinner size="large" message={t('categories.archives')} />
                        </div>
                    </div>
                </div>
            </AuthGuard>
        );
    }

    if (error) {
        return (
            <AuthGuard>
                <div style={{ minHeight: '100vh', backgroundColor: darkTheme.background.primary }}>
                    <Navigation user={user!} onLogout={logout} />
                    <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                    <ErrorDisplay 
                        error={error} 
                        onRetry={fetchFiles}
                    />
                </div>
            </AuthGuard>
        );
    }

    return (
        <AuthGuard>
            <div style={{ minHeight: '100vh', backgroundColor: darkTheme.background.primary }}>
                <Navigation user={user!} onLogout={logout} />
                <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
                    <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />

                    <h1 style={{
                        fontSize: '28px',
                        fontWeight: '600',
                        color: darkTheme.text.primary,
                        marginBottom: '24px'
                    }}>
                        {t('categories.archives')}
                    </h1>

                    {archives.length === 0 && !loading ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '80px 20px',
                            color: darkTheme.text.tertiary
                        }}>
                            <div style={{ fontSize: '64px', marginBottom: '24px' }}>📦</div>
                            <div style={{ 
                                fontSize: '20px', 
                                fontWeight: '600', 
                                marginBottom: '8px',
                                color: darkTheme.text.secondary
                            }}>
                                {t('emptyStates.noArchives')}
                            </div>
                            <div style={{ 
                                fontSize: '14px',
                                marginBottom: '24px',
                                lineHeight: '1.6'
                            }}>
                                {t('emptyStates.noArchivesDescription')}
                            </div>
                            <button
                                onClick={() => window.location.href = '/upload'}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: darkTheme.accent.blue,
                                    color: darkTheme.text.primary,
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    transition: 'all 0.2s',
                                    boxShadow: darkTheme.shadow.small
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.opacity = '0.9';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.opacity = '1';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                {t('emptyStates.uploadFirstArchive')}
                            </button>
                        </div>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                            gap: '16px'
                        }}>
                            {archives.map((archive) => (
                                <div
                                    key={archive.file_id}
                                    onClick={() => window.open(getFileUrl(archive), '_blank')}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            window.open(getFileUrl(archive), '_blank');
                                        }
                                    }}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`Ouvrir ${archive.filename || 'cette archive'}`}
                                    style={{
                                        backgroundColor: darkTheme.background.secondary,
                                        borderRadius: '8px',
                                        padding: '16px',
                                        cursor: 'pointer',
                                        transition: 'transform 0.2s, box-shadow 0.2s',
                                        border: `1px solid ${darkTheme.border.primary}`
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                        e.currentTarget.style.boxShadow = darkTheme.shadow.medium;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                >
                                    <div style={{
                                        fontSize: '48px',
                                        textAlign: 'center',
                                        marginBottom: '12px'
                                    }}>
                                        📦
                                    </div>
                                    <div style={{
                                        fontWeight: '600',
                                        color: darkTheme.text.primary,
                                        fontSize: '14px',
                                        marginBottom: '8px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {archive.filename || 'Sans nom'}
                                    </div>
                                    <div style={{
                                        color: darkTheme.text.tertiary,
                                        fontSize: '12px',
                                        marginBottom: '4px'
                                    }}>
                                        {formatFileSize(archive.size)}
                                    </div>
                                    <div style={{
                                        color: darkTheme.text.tertiary,
                                        fontSize: '12px'
                                    }}>
                                        {formatDate(archive.uploaded_at)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </AuthGuard>
    );
}
