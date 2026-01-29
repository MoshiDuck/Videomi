// INFO : app/routes/books.tsx
// Page Livres avec sous-catégories Livre numérique, Comics et Manga

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '~/hooks/useAuth';
import { Navigation } from '~/components/navigation/Navigation';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { darkTheme } from '~/utils/ui/theme';
import type { FileCategory } from '~/utils/file/fileClassifier';
import { CategoryBar } from '~/components/ui/categoryBar';
import { BookSubCategoryBar, type BookSubCategory } from '~/components/ui/BookSubCategoryBar';
import { getCategoryRoute, getCategoryFromPathname } from '~/utils/routes';
import { formatFileSize, formatDate } from '~/utils/format';
import { useLanguage } from '~/contexts/LanguageContext';
import { DraggableItem } from '~/components/ui/DraggableItem';
import { useFileActions } from '~/hooks/useFileActions';
import { useToast } from '~/components/ui/Toast';
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

const getBookIcon = (category: string, mimeType: string): string => {
    if (category === 'comics') return '🦸';
    if (category === 'manga') return '📕';
    if (mimeType.includes('epub')) return '📖';
    if (mimeType.includes('mobi') || mimeType.includes('mobipocket')) return '📱';
    return '📚';
};

export default function BooksRoute() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const [selectedCategory, setSelectedCategory] = useState<FileCategory>('books');
    const [subCategory, setSubCategory] = useState<BookSubCategory>('ebooks');
    const { showToast, ToastContainer } = useToast();

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

    const handleSubCategoryChange = useCallback((sub: BookSubCategory) => {
        setSubCategory(sub);
    }, []);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ebooks, setEbooks] = useState<FileItem[]>([]);
    const [comics, setComics] = useState<FileItem[]>([]);
    const [manga, setManga] = useState<FileItem[]>([]);

    const handleFileDeleted = useCallback((fileId: string) => {
        setEbooks((prev) => prev.filter((f) => f.file_id !== fileId));
        setComics((prev) => prev.filter((f) => f.file_id !== fileId));
        setManga((prev) => prev.filter((f) => f.file_id !== fileId));
    }, []);

    useFileActions({
        userId: user?.id || null,
        onFileDeleted: handleFileDeleted,
        onError: (err) => showToast(err, 'error'),
        onSuccess: (msg) => showToast(msg, 'success'),
    });

    const fetchFiles = useCallback(async () => {
        if (!user?.id) return;

        setLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem('videomi_token');
            const [ebooksRes, comicsRes, mangaRes] = await Promise.all([
                fetch(`https://videomi.uk/api/upload/user/${user.id}?category=ebooks`, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: 'no-store',
                }),
                fetch(`https://videomi.uk/api/upload/user/${user.id}?category=comics`, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: 'no-store',
                }),
                fetch(`https://videomi.uk/api/upload/user/${user.id}?category=manga`, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: 'no-store',
                }),
            ]);

            if (!ebooksRes.ok) throw new Error(t('errors.fetchFailed'));
            if (!comicsRes.ok) throw new Error(t('errors.fetchFailed'));
            if (!mangaRes.ok) throw new Error(t('errors.fetchFailed'));

            const ebooksData = (await ebooksRes.json()) as { files: FileItem[] };
            const comicsData = (await comicsRes.json()) as { files: FileItem[] };
            const mangaData = (await mangaRes.json()) as { files: FileItem[] };

            setEbooks((ebooksData.files || []).sort((a, b) => b.uploaded_at - a.uploaded_at));
            setComics((comicsData.files || []).sort((a, b) => b.uploaded_at - a.uploaded_at));
            setManga((mangaData.files || []).sort((a, b) => b.uploaded_at - a.uploaded_at));
        } catch (err) {
            console.error('Erreur fetch livres:', err);
            setError(err instanceof Error ? err.message : t('errors.unknown'));
        } finally {
            setLoading(false);
        }
    }, [user?.id, t]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    const getFileUrl = (file: FileItem): string => {
        return `https://videomi.uk/api/files/${file.category}/${file.file_id}`;
    };

    const filteredFiles =
        subCategory === 'ebooks'
            ? ebooks
            : subCategory === 'comics'
              ? comics
              : manga;

    if (loading && ebooks.length === 0 && comics.length === 0 && manga.length === 0) {
        return (
            <AuthGuard>
                <div style={{ minHeight: '100vh', backgroundColor: darkTheme.background.primary }}>
                    <Navigation user={user!} onLogout={logout} />
                    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
                        <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                        <BookSubCategoryBar selectedSubCategory={subCategory} onSubCategoryChange={handleSubCategoryChange} />
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                            <LoadingSpinner size="large" message={t('common.loading')} />
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
                    <ErrorDisplay error={error} onRetry={fetchFiles} />
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
                    <BookSubCategoryBar selectedSubCategory={subCategory} onSubCategoryChange={handleSubCategoryChange} />
                    <h2 style={{
                        fontSize: '24px',
                        fontWeight: '600',
                        color: darkTheme.text.primary,
                        marginBottom: '24px',
                    }}>
                        {t('categories.books')} ({filteredFiles.length})
                    </h2>

                    {filteredFiles.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {filteredFiles.map((file) => (
                                <DraggableItem
                                    key={file.file_id}
                                    item={{
                                        file_id: file.file_id,
                                        category: file.category,
                                        filename: file.filename,
                                        size: file.size,
                                        mime_type: file.mime_type,
                                    }}
                                >
                                    <div
                                        onClick={() => window.open(getFileUrl(file), '_blank')}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                window.open(getFileUrl(file), '_blank');
                                            }
                                        }}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`Ouvrir ${file.filename || 'ce livre'}`}
                                        style={{
                                            backgroundColor: darkTheme.background.secondary,
                                            borderRadius: '12px',
                                            padding: '20px',
                                            cursor: 'grab',
                                            transition: 'all 0.2s',
                                            border: `2px solid ${darkTheme.border.primary}`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '16px',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = darkTheme.accent.blue;
                                            e.currentTarget.style.backgroundColor = darkTheme.background.tertiary;
                                            e.currentTarget.style.transform = 'translateX(4px)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = darkTheme.border.primary;
                                            e.currentTarget.style.backgroundColor = darkTheme.background.secondary;
                                            e.currentTarget.style.transform = 'translateX(0)';
                                        }}
                                    >
                                        <div style={{ fontSize: '48px', flexShrink: 0, pointerEvents: 'none' }}>
                                            {getBookIcon(file.category, file.mime_type)}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontWeight: '600',
                                                color: darkTheme.text.primary,
                                                fontSize: '16px',
                                                marginBottom: '8px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {file.filename || 'Sans nom'}
                                            </div>
                                            <div style={{
                                                display: 'flex',
                                                gap: '16px',
                                                fontSize: '14px',
                                                color: darkTheme.text.tertiary,
                                            }}>
                                                <span>{formatFileSize(file.size)}</span>
                                                <span>•</span>
                                                <span>{formatDate(file.uploaded_at)}</span>
                                                <span>•</span>
                                                <span>{file.category === 'comics' ? t('books.comics') : file.category === 'manga' ? t('books.manga') : t('books.ebooks')}</span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '20px', color: darkTheme.text.tertiary, flexShrink: 0, opacity: 0.5 }}>
                                            ⋮⋮
                                        </div>
                                    </div>
                                </DraggableItem>
                            ))}
                        </div>
                    ) : !loading ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '80px 20px',
                            color: darkTheme.text.tertiary,
                        }}>
                            <div style={{ fontSize: '64px', marginBottom: '24px' }}>📚</div>
                            <div style={{
                                fontSize: '20px',
                                fontWeight: '600',
                                marginBottom: '8px',
                                color: darkTheme.text.secondary,
                            }}>
                                {t('emptyStates.noBooks')}
                            </div>
                            <div style={{ fontSize: '14px', marginBottom: '24px', lineHeight: '1.6' }}>
                                {t('emptyStates.noBooksDescription')}
                            </div>
                            <button
                                onClick={() => navigate('/upload')}
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
                                    boxShadow: darkTheme.shadow.small,
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
                                {t('emptyStates.uploadFirstBook')}
                            </button>
                        </div>
                    ) : null}
                </div>
                <ToastContainer />
            </div>
        </AuthGuard>
    );
}
