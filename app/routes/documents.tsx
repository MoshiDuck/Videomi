// INFO : app/routes/documents.tsx
// Page dédiée pour l'affichage des documents

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
import { DraggableItem } from '~/components/ui/DraggableItem';
import { useFileActions } from '~/hooks/useFileActions';
import { useToast } from '~/components/ui/Toast';

interface FileItem {
    file_id: string;
    category: string;
    size: number;
    mime_type: string;
    filename: string | null;
    created_at: number;
    uploaded_at: number;
}

const getDocumentIcon = (mimeType: string): string => {
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📊';
    if (mimeType.includes('text')) return '📄';
    return '📎';
};

export default function DocumentsRoute() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const [selectedCategory, setSelectedCategory] = useState<FileCategory>('documents');
    const { showToast, ToastContainer } = useToast();
    
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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [documents, setDocuments] = useState<FileItem[]>([]);

    // Callback pour mise à jour optimiste après suppression
    const handleFileDeleted = useCallback((fileId: string) => {
        setDocuments((prev) => prev.filter((doc) => doc.file_id !== fileId));
    }, []);

    // Hook pour les actions de fichiers (drag & drop)
    useFileActions({
        userId: user?.id || null,
        onFileDeleted: handleFileDeleted,
        onError: (error) => showToast(error, 'error'),
        onSuccess: (message) => showToast(message, 'success'),
    });

    useEffect(() => {
        const fetchFiles = async () => {
            if (!user?.id) return;

            setLoading(true);
            setError(null);

            try {
                const token = localStorage.getItem('videomi_token');
                const response = await fetch(
                    `https://videomi.uk/api/upload/user/${user.id}?category=documents`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    }
                );

                if (!response.ok) {
                    throw new Error('Erreur lors de la récupération des fichiers');
                }

                const data = await response.json() as { files: FileItem[] };
                const files = data.files || [];

                // Trier par date d'upload (plus récent en premier)
                setDocuments(files.sort((a, b) => b.uploaded_at - a.uploaded_at));
            } catch (err) {
                console.error('Erreur fetch fichiers:', err);
                setError(err instanceof Error ? err.message : 'Erreur inconnue');
            } finally {
                setLoading(false);
            }
        };

        fetchFiles();
    }, [user?.id]);


    const getFileUrl = (file: FileItem): string => {
        return `https://videomi.uk/api/files/${file.category}/${file.file_id}`;
    };

    // Plus de bloc de chargement - affichage fluide avec données du cache

    if (error) {
        return (
            <AuthGuard>
                <div style={{ minHeight: '100vh', backgroundColor: darkTheme.background.primary }}>
                    <Navigation user={user!} onLogout={logout} />
                    <div style={{ padding: '40px', textAlign: 'center', color: darkTheme.accent.red }}>
                        Erreur : {error}
                    </div>
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
                    <h2 style={{
                        fontSize: '24px',
                        fontWeight: '600',
                        color: darkTheme.text.primary,
                        marginBottom: '24px'
                    }}>
                        Mes documents ({documents.length})
                    </h2>

                    {documents.length > 0 ? (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                        }}>
                            {documents.map((document) => (
                                <DraggableItem
                                    key={document.file_id}
                                    item={{
                                        file_id: document.file_id,
                                        category: document.category,
                                        filename: document.filename,
                                        size: document.size,
                                        mime_type: document.mime_type,
                                    }}
                                >
                                    <div
                                        onClick={() => window.open(getFileUrl(document), '_blank')}
                                        style={{
                                            backgroundColor: darkTheme.background.secondary,
                                            borderRadius: '12px',
                                            padding: '20px',
                                            cursor: 'grab',
                                            transition: 'all 0.2s',
                                            border: `2px solid ${darkTheme.border.primary}`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '16px'
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
                                        {/* Icône */}
                                        <div style={{
                                            fontSize: '48px',
                                            flexShrink: 0,
                                            pointerEvents: 'none',
                                        }}>
                                            {getDocumentIcon(document.mime_type)}
                                        </div>

                                        {/* Aperçu PDF si disponible */}
                                        {document.mime_type.includes('pdf') && (
                                            <div style={{
                                                width: '120px',
                                                height: '160px',
                                                backgroundColor: darkTheme.background.tertiary,
                                                borderRadius: '8px',
                                                overflow: 'hidden',
                                                flexShrink: 0,
                                                border: `1px solid ${darkTheme.border.primary}`,
                                                pointerEvents: 'none',
                                            }}>
                                                <iframe
                                                    src={getFileUrl(document) + '#page=1&zoom=50'}
                                                    style={{
                                                        width: '200%',
                                                        height: '200%',
                                                        border: 'none',
                                                        transform: 'scale(0.5)',
                                                        transformOrigin: 'top left',
                                                        pointerEvents: 'none',
                                                    }}
                                                    title="Preview"
                                                />
                                            </div>
                                        )}

                                        {/* Infos */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontWeight: '600',
                                                color: darkTheme.text.primary,
                                                fontSize: '16px',
                                                marginBottom: '8px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {document.filename || 'Sans nom'}
                                            </div>
                                            <div style={{
                                                display: 'flex',
                                                gap: '16px',
                                                fontSize: '14px',
                                                color: darkTheme.text.tertiary
                                            }}>
                                                <span>{formatFileSize(document.size)}</span>
                                                <span>•</span>
                                                <span>{formatDate(document.uploaded_at)}</span>
                                                <span>•</span>
                                                <span>{document.mime_type}</span>
                                            </div>
                                        </div>

                                        {/* Indicateur de drag */}
                                        <div style={{
                                            fontSize: '20px',
                                            color: darkTheme.text.tertiary,
                                            flexShrink: 0,
                                            opacity: 0.5,
                                        }}>
                                            ⋮⋮
                                        </div>
                                    </div>
                                </DraggableItem>
                            ))}
                        </div>
                    ) : (
                        <div style={{
                            textAlign: 'center',
                            padding: '80px 20px',
                            color: darkTheme.text.tertiary
                        }}>
                            <div style={{ fontSize: '64px', marginBottom: '24px' }}>📄</div>
                            <div style={{ 
                                fontSize: '20px', 
                                fontWeight: '600', 
                                marginBottom: '8px',
                                color: darkTheme.text.secondary
                            }}>
                                {t('emptyStates.noDocuments')}
                            </div>
                            <div style={{ 
                                fontSize: '14px',
                                marginBottom: '24px',
                                lineHeight: '1.6'
                            }}>
                                {t('emptyStates.noDocumentsDescription')}
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
                                {t('emptyStates.uploadFirstDocument')}
                            </button>
                        </div>
                    )}
                </div>
                <ToastContainer />
            </div>
        </AuthGuard>
    );
}
