// INFO : app/routes/documents.tsx — grille masonry virtualisée, tri/regroupement par date de création.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '~/hooks/useAuth';
import { darkTheme } from '~/utils/ui/theme';
import type { FileCategory } from '~/utils/file/fileClassifier';
import { CategoryBar } from '~/components/ui/categoryBar';
import { getCategoryRoute, getCategoryFromPathname } from '~/utils/routes';
import { formatFileSize } from '~/utils/format';
import { useLanguage } from '~/contexts/LanguageContext';
import { DraggableItem } from '~/components/ui/DraggableItem';
import { useFileActions } from '~/hooks/useFileActions';
import { useToast } from '~/components/ui/Toast';
import { LoadingSpinner } from '~/components/ui/LoadingSpinner';
import { ErrorDisplay } from '~/components/ui/ErrorDisplay';
import { VirtualizedMasonryGrid } from '~/components/ui/VirtualizedMasonryGrid';
import { groupByMonthForMasonry } from '~/utils/file/fileGridUtils';
import type { FileWithDate } from '~/utils/file/fileGridUtils';
import { useRefetchOnCacheInvalidation } from '~/utils/cache/cacheInvalidation';

interface FileItem extends FileWithDate {
    file_id: string;
    category: string;
    size: number;
    mime_type: string;
    filename: string | null;
    created_at?: number;
    uploaded_at: number;
    file_created_at?: number | null;
}

const getDocumentIcon = (mimeType: string): string => {
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📊';
    if (mimeType.includes('text')) return '📄';
    return '📎';
};

/** Ratio type A4 pour l’aperçu document */
const DOC_PREVIEW_ASPECT = 1 / 1.414;

/** Aperçu PDF chargé uniquement côté client (évite pdf.worker dans le bundle SSR / Wrangler) */
function PdfPreviewClient(props: {
    url: string;
    token: string | null;
    width: number;
    height: number;
}) {
    const [Component, setComponent] = useState<React.ComponentType<{
        url: string;
        token: string | null;
        width: number;
        height?: number;
        aspectRatio?: number;
    }> | null>(null);

    useEffect(() => {
        import('~/components/ui/PdfFirstPagePreview').then((m) => setComponent(() => m.PdfFirstPagePreview));
    }, []);

    if (!Component) {
        return (
            <div
                style={{
                    width: props.width,
                    height: props.height,
                    backgroundColor: darkTheme.background.tertiary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: darkTheme.text.tertiary,
                }}
            >
                …
            </div>
        );
    }
    return (
        <Component
            url={props.url}
            token={props.token}
            width={props.width}
            height={props.height}
            aspectRatio={DOC_PREVIEW_ASPECT}
        />
    );
}

export default function DocumentsRoute() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const [selectedCategory, setSelectedCategory] = useState<FileCategory>('documents');
    const { showToast, ToastContainer } = useToast();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [documents, setDocuments] = useState<FileItem[]>([]);

    useEffect(() => {
        const category = getCategoryFromPathname(location.pathname);
        if (category) setSelectedCategory(category);
    }, [location.pathname]);

    const handleCategoryChange = (category: FileCategory) => {
        setSelectedCategory(category);
        navigate(getCategoryRoute(category));
    };

    const handleFileDeleted = useCallback((fileId: string) => {
        setDocuments((prev) => prev.filter((doc) => doc.file_id !== fileId));
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
            const response = await fetch(
                `https://videomi.uk/api/upload/user/${user.id}?category=documents`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!response.ok) throw new Error(t('errors.fetchFailed'));
            const data = (await response.json()) as { files: FileItem[] };
            setDocuments(data.files || []);
        } catch (err) {
            console.error('Erreur fetch fichiers:', err);
            setError(err instanceof Error ? err.message : t('errors.unknown'));
        } finally {
            setLoading(false);
        }
    }, [user?.id, t]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    useRefetchOnCacheInvalidation(user?.id ?? null, 'documents', fetchFiles);

    const getFileUrl = (file: FileItem): string =>
        `https://videomi.uk/api/files/${file.category}/${file.file_id}`;

    const masonryItems = useMemo(() => groupByMonthForMasonry(documents), [documents]);

    const renderDocumentCard = useCallback(
        ({ data, width }: { data: FileItem; width: number }) => {
            const doc = data;
            const isPdf = doc.mime_type.includes('pdf');
            const previewHeight = width / DOC_PREVIEW_ASPECT;
            return (
                <DraggableItem
                    item={{
                        file_id: doc.file_id,
                        category: doc.category,
                        filename: doc.filename,
                        size: doc.size,
                        mime_type: doc.mime_type,
                    }}
                >
                    <div
                        onClick={() => window.open(getFileUrl(doc), '_blank')}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                window.open(getFileUrl(doc), '_blank');
                            }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Ouvrir ${doc.filename || 'ce document'}`}
                        style={{
                            position: 'relative',
                            width,
                            minHeight: 80,
                            backgroundColor: darkTheme.background.secondary,
                            borderRadius: '12px',
                            overflow: 'hidden',
                            cursor: 'grab',
                            transition: 'all 0.2s',
                            border: `2px solid ${darkTheme.border.primary}`,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = darkTheme.accent.blue;
                            e.currentTarget.style.transform = 'scale(1.02)';
                            e.currentTarget.style.boxShadow = darkTheme.shadow.large;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = darkTheme.border.primary;
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                    >
                        {isPdf ? (
                            <div style={{ width: '100%', pointerEvents: 'none' }}>
                                <PdfPreviewClient
                                    url={getFileUrl(doc)}
                                    token={typeof window !== 'undefined' ? localStorage.getItem('videomi_token') : null}
                                    width={width}
                                    height={previewHeight}
                                />
                            </div>
                        ) : (
                            <div
                                style={{
                                    width: '100%',
                                    height: previewHeight,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: `linear-gradient(135deg, ${darkTheme.background.tertiary} 0%, ${darkTheme.background.secondary} 100%)`,
                                    pointerEvents: 'none',
                                }}
                            >
                                <span style={{ fontSize: 'clamp(48px, 30%, 96px)', opacity: 0.9 }}>
                                    {getDocumentIcon(doc.mime_type)}
                                </span>
                            </div>
                        )}
                        <div
                            style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
                                padding: '12px',
                                color: '#fff',
                                fontSize: '12px',
                                opacity: 0,
                                transition: 'opacity 0.2s',
                                pointerEvents: 'none',
                            }}
                            className="doc-card-overlay"
                        >
                            <div
                                style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    marginBottom: '4px',
                                }}
                            >
                                {doc.filename || 'Sans nom'}
                            </div>
                            <div>{formatFileSize(doc.size)}</div>
                        </div>
                        <div
                            style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(0,0,0,0.6)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: 0,
                                transition: 'opacity 0.2s',
                                fontSize: '14px',
                                pointerEvents: 'none',
                            }}
                            className="drag-indicator"
                        >
                            ⋮⋮
                        </div>
                    </div>
                </DraggableItem>
            );
        },
        []
    );

    if (loading && documents.length === 0) {
        return (
            <>
                <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
                    <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                        <LoadingSpinner size="large" message={t('common.loading')} />
                    </div>
                </div>
            </>
        );
    }

    if (error) {
        return (
            <>
                <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                <ErrorDisplay error={error} onRetry={fetchFiles} />
            </>
        );
    }

    return (
        <>
            <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
                <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                <h2
                    style={{
                        fontSize: '24px',
                        fontWeight: '600',
                        color: darkTheme.text.primary,
                        marginBottom: '24px',
                    }}
                >
                    Mes documents ({documents.length})
                </h2>

                {documents.length > 0 ? (
                    <>
                        <VirtualizedMasonryGrid<FileItem>
                            items={masonryItems}
                            renderCard={renderDocumentCard}
                            columnWidth={280}
                            gutter={16}
                            itemHeightEstimate={400}
                        />
                        <style>{`
                            div:hover > .drag-indicator,
                            div:hover > .doc-card-overlay { opacity: 1 !important; }
                        `}</style>
                    </>
                ) : !loading ? (
                    <div
                        style={{
                            textAlign: 'center',
                            padding: '80px 20px',
                            color: darkTheme.text.tertiary,
                        }}
                    >
                        <div style={{ fontSize: '64px', marginBottom: '24px' }}>📄</div>
                        <div
                            style={{
                                fontSize: '20px',
                                fontWeight: '600',
                                marginBottom: '8px',
                                color: darkTheme.text.secondary,
                            }}
                        >
                            {t('emptyStates.noDocuments')}
                        </div>
                        <div style={{ fontSize: '14px', marginBottom: '24px', lineHeight: '1.6' }}>
                            {t('emptyStates.noDocumentsDescription')}
                        </div>
                        <button
                            onClick={() => (window.location.href = '/upload')}
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
                            {t('emptyStates.uploadFirstDocument')}
                        </button>
                    </div>
                ) : null}
            </div>
            <ToastContainer />
        </>
    );
}
