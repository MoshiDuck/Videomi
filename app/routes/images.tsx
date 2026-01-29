// INFO : app/routes/images.tsx
// Page dédiée pour l'affichage des images

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '~/hooks/useAuth';
import { Navigation } from '~/components/navigation/Navigation';
import { AuthGuard } from '~/components/auth/AuthGuard';
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

interface FileItem {
    file_id: string;
    category: string;
    size: number;
    mime_type: string;
    filename: string | null;
    created_at: number;
    uploaded_at: number;
}

export default function ImagesRoute() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [images, setImages] = useState<FileItem[]>([]);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<FileCategory>('images');
    const { showToast, ToastContainer } = useToast();

    // Callback pour mise à jour optimiste après suppression
    const handleFileDeleted = useCallback((fileId: string) => {
        setImages((prev) => prev.filter((img) => img.file_id !== fileId));
    }, []);

    // Hook pour les actions de fichiers (drag & drop)
    useFileActions({
        userId: user?.id || null,
        onFileDeleted: handleFileDeleted,
        onError: (error) => showToast(error, 'error'),
        onSuccess: (message) => showToast(message, 'success'),
    });
    
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
            const token = localStorage.getItem('videomi_token');
            // Récupérer à la fois images et raw_images
            const [imagesResponse, rawImagesResponse] = await Promise.all([
                fetch(
                    `https://videomi.uk/api/upload/user/${user.id}?category=images`,
                    { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' }
                ),
                fetch(
                    `https://videomi.uk/api/upload/user/${user.id}?category=raw_images`,
                    { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' }
                ),
            ]);

            if (!imagesResponse.ok || !rawImagesResponse.ok) {
                throw new Error(t('errors.fetchFailed'));
            }

            const imagesData = await imagesResponse.json() as { files: FileItem[] };
            const rawImagesData = await rawImagesResponse.json() as { files: FileItem[] };
            const files = [...(imagesData.files || []), ...(rawImagesData.files || [])];

            // Trier par date d'upload (plus récent en premier)
            setImages(files.sort((a, b) => b.uploaded_at - a.uploaded_at));
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

    // Gérer la fermeture du modal avec Escape
    useEffect(() => {
        if (!selectedImage) return;
        
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedImage(null);
            }
        };
        
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [selectedImage]);


    const getFileUrl = (file: FileItem): string => {
        return `https://videomi.uk/api/files/${file.category}/${file.file_id}`;
    };

    // Afficher le spinner uniquement au chargement initial (pas de données)
    if (loading && images.length === 0) {
        return (
            <AuthGuard>
                <div style={{ minHeight: '100vh', backgroundColor: darkTheme.background.primary }}>
                    <Navigation user={user!} onLogout={logout} />
                    <div style={{ padding: '24px', maxWidth: 1600, margin: '0 auto' }}>
                        <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
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
                <div style={{ padding: '24px', maxWidth: 1600, margin: '0 auto' }}>
                    <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                    <h2 style={{
                        fontSize: '24px',
                        fontWeight: '600',
                        color: darkTheme.text.primary,
                        marginBottom: '24px'
                    }}>
                        Mes images ({images.length})
                    </h2>

                    {images.length > 0 ? (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                            gap: '16px'
                        }}>
                            {images.map((image) => (
                                <DraggableItem
                                    key={image.file_id}
                                    item={{
                                        file_id: image.file_id,
                                        category: image.category,
                                        filename: image.filename,
                                        size: image.size,
                                        mime_type: image.mime_type,
                                    }}
                                >
                                    <div
                                        onClick={() => setSelectedImage(image.file_id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                setSelectedImage(image.file_id);
                                            }
                                        }}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`Voir ${image.filename || 'cette image'} en grand`}
                                        style={{
                                            position: 'relative',
                                            aspectRatio: '1/1',
                                            backgroundColor: darkTheme.background.secondary,
                                            borderRadius: '12px',
                                            overflow: 'hidden',
                                            cursor: 'grab',
                                            transition: 'all 0.2s',
                                            border: `2px solid ${darkTheme.border.primary}`
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
                                        <img
                                            src={getFileUrl(image)}
                                            alt={image.filename || 'Image'}
                                            draggable={false}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover',
                                                pointerEvents: 'none',
                                            }}
                                            onError={(e) => {
                                                const img = e.target as HTMLImageElement;
                                                const container = img.parentElement;
                                                if (container) {
                                                    container.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; color: ${darkTheme.text.tertiary};">
                                                        <div style="font-size: 48px; margin-bottom: 8px;">🖼️</div>
                                                        <div style="font-size: 12px;">Erreur de chargement</div>
                                                    </div>`;
                                                }
                                            }}
                                        />
                                        <div style={{
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
                                        >
                                            <div style={{
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                marginBottom: '4px'
                                            }}>
                                                {image.filename || 'Sans nom'}
                                            </div>
                                            <div>{formatFileSize(image.size)}</div>
                                        </div>
                                        {/* Indicateur de drag au hover */}
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
                            ))}
                        </div>
                    ) : !loading ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '80px 20px',
                            color: darkTheme.text.tertiary
                        }}>
                            <div style={{ fontSize: '64px', marginBottom: '24px' }}>🖼️</div>
                            <div style={{ 
                                fontSize: '20px', 
                                fontWeight: '600', 
                                marginBottom: '8px',
                                color: darkTheme.text.secondary
                            }}>
                                {t('emptyStates.noImages')}
                            </div>
                            <div style={{ 
                                fontSize: '14px',
                                marginBottom: '24px',
                                lineHeight: '1.6'
                            }}>
                                {t('emptyStates.noImagesDescription')}
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
                                {t('emptyStates.uploadFirstImage')}
                            </button>
                        </div>
                    ) : null}

                    {/* Modal pour afficher l'image en grand */}
                    {selectedImage && (
                        <div
                            style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 1000,
                                padding: '40px'
                            }}
                            onClick={() => setSelectedImage(null)}
                            aria-hidden="true"
                        >
                            <div 
                                role="dialog"
                                aria-modal="true"
                                aria-label="Prévisualisation de l'image"
                                style={{
                                    position: 'relative',
                                    maxWidth: '90vw',
                                    maxHeight: '90vh'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    onClick={() => setSelectedImage(null)}
                                    aria-label="Fermer la prévisualisation"
                                    style={{
                                        position: 'absolute',
                                        top: '-40px',
                                        right: 0,
                                        backgroundColor: darkTheme.background.secondary,
                                        border: 'none',
                                        borderRadius: '8px',
                                        color: darkTheme.text.primary,
                                        fontSize: '24px',
                                        width: '32px',
                                        height: '32px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'background-color 0.2s, transform 0.2s'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = darkTheme.background.tertiary; e.currentTarget.style.transform = 'scale(1.1)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = darkTheme.background.secondary; e.currentTarget.style.transform = 'scale(1)'; }}
                                >
                                    ✕
                                </button>
                                <img
                                    src={getFileUrl(images.find(img => img.file_id === selectedImage)!)}
                                    alt="Preview"
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '90vh',
                                        objectFit: 'contain',
                                        borderRadius: '8px'
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Style pour l'indicateur de drag au hover */}
                    <style>{`
                        div:hover > .drag-indicator {
                            opacity: 1 !important;
                        }
                    `}</style>
                </div>
                <ToastContainer />
            </div>
        </AuthGuard>
    );
}
