// INFO : app/routes/upload.tsx - VERSION CORRIGÉE
import React, { useState, useCallback, useRef } from 'react';
import { useAuth } from '~/hooks/useAuth';
import { Navigation } from '~/components/navigation/Navigation';
import { AuthGuard } from '~/components/auth/AuthGuard';
import { ErrorDisplay } from '~/components/ui/ErrorDisplay';
import { UploadManager, UploadManagerHandle } from '~/components/upload/UploadManager';
import { darkTheme } from '~/utils/ui/theme';
import { formatFileSize, formatDate } from '~/utils/format';
import { useLanguage } from '~/contexts/LanguageContext';

interface UploadProgress {
    loaded: number;
    total: number;
    percentage: number;
}

interface UploadedFile {
    id: string;
    name: string;
    size: number;
    type: string;
    url: string;
    uploadedAt: string;
}

export default function UploadRoute() {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Référence à l'UploadManager
    const uploadManagerRef = useRef<UploadManagerHandle>(null);

    // Gérer la sélection de fichier
    const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setSelectedFile(file);
        setUploadError(null);
        setUploadSuccess(false);

        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        } else {
            setPreviewUrl(null);
        }
    }, []);

    // Gérer l'upload via l'UploadManager
    const handleUpload = useCallback(async () => {
        if (!selectedFile) {
            setUploadError('Veuillez sélectionner un fichier');
            return;
        }

        // Utiliser l'UploadManager pour uploader
        if (uploadManagerRef.current) {
            uploadManagerRef.current.uploadFiles([selectedFile]);
            setUploadSuccess(true);
            setSelectedFile(null);
            setPreviewUrl(null);

            // Réinitialiser formulaire
            if (typeof document !== 'undefined') {
                const fileInput = document.getElementById('file-input') as HTMLInputElement;
                if (fileInput) fileInput.value = '';
            }
        } else {
            setUploadError('UploadManager non disponible');
        }
    }, [selectedFile]);


    // Annuler l'upload en cours
    const handleCancel = useCallback(() => {
        setSelectedFile(null);
        setPreviewUrl(null);
        setUploadError(null);
        setUploadSuccess(false);
        setUploadProgress(null);
    }, []);

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
                            Upload de fichiers
                        </h1>
                        <p style={{
                            color: darkTheme.text.secondary,
                            fontSize: '16px'
                        }}>
                            Téléchargez vos fichiers vers le cloud
                        </p>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '30px',
                        marginBottom: '40px'
                    }}>
                        {/* Zone d'upload */}
                        <div style={{
                            backgroundColor: darkTheme.background.secondary,
                            borderRadius: '12px',
                            padding: '30px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                            border: '2px dashed #e0e0e0'
                        }}>
                            <h2 style={{
                                fontSize: '20px',
                                fontWeight: '600',
                                marginBottom: '20px',
                                color: '#333'
                            }}>
                                Sélectionnez un fichier
                            </h2>

                            <input
                                id="upload-dropzone-input"
                                type="file"
                                multiple
                                accept="*/*"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    const files = e.target.files;
                                    if (files && files.length > 0 && uploadManagerRef.current) {
                                        uploadManagerRef.current.uploadFiles(Array.from(files));
                                    }
                                    e.target.value = '';
                                }}
                                aria-label={t('upload.dragDrop')}
                            />
                            <label
                                htmlFor="upload-dropzone-input"
                                style={{
                                    display: 'block',
                                    border: '2px dashed #4285f4',
                                    borderRadius: '8px',
                                    padding: '40px 20px',
                                    textAlign: 'center',
                                    backgroundColor: darkTheme.background.tertiary,
                                    transition: 'all 0.3s',
                                    cursor: 'pointer',
                                    marginBottom: '20px'
                                }}
                            >
                                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📤</div>
                                <p style={{ marginBottom: '8px', color: '#4285f4', fontWeight: '500' }}>
                                    {t('upload.dragDrop')}
                                </p>
                                <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
                                    {t('upload.dragDropOr')}
                                </p>
                                <p style={{ color: '#888', fontSize: '12px' }}>
                                    {t('upload.supportedFormats')}
                                </p>
                            </label>

                            <input
                                id="file-input"
                                type="file"
                                onChange={handleFileSelect}
                                style={{ display: 'none' }}
                            />

                            {selectedFile && (
                                <div style={{
                                    backgroundColor: '#e8f5e9',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    marginBottom: '20px',
                                    border: '1px solid #c8e6c9'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            backgroundColor: '#4caf50',
                                            borderRadius: '6px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'white',
                                            fontSize: '20px'
                                        }}>
                                            📄
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <p style={{ margin: 0, fontWeight: '500', fontSize: '14px' }}>
                                                {selectedFile.name}
                                            </p>
                                            <p style={{ margin: '4px 0 0', color: '#666', fontSize: '12px' }}>
                                                {formatFileSize(selectedFile.size)} • {selectedFile.type}
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleCancel}
                                            aria-label="Annuler l'upload"
                                            style={{
                                                backgroundColor: 'transparent',
                                                border: 'none',
                                                color: '#f44336',
                                                cursor: 'pointer',
                                                fontSize: '20px',
                                                padding: '4px'
                                            }}
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            )}

                            {previewUrl && (
                                <div style={{
                                    marginBottom: '20px',
                                    textAlign: 'center'
                                }}>
                                    <img
                                        src={previewUrl}
                                        alt="Aperçu"
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: '200px',
                                            borderRadius: '8px',
                                            border: '1px solid #e0e0e0'
                                        }}
                                    />
                                    <p style={{
                                        marginTop: '8px',
                                        color: darkTheme.text.secondary,
                                        fontSize: '12px'
                                    }}>
                                        Aperçu de l'image
                                    </p>
                                </div>
                            )}

                            {uploadProgress && (
                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        marginBottom: '8px'
                                    }}>
                                        <span style={{ fontSize: '14px', color: '#666' }}>Progression</span>
                                        <span style={{ fontSize: '14px', fontWeight: '500' }}>
                                            {uploadProgress.percentage.toFixed(1)}%
                                        </span>
                                    </div>
                                    <div style={{
                                        height: '8px',
                                        backgroundColor: '#e0e0e0',
                                        borderRadius: '4px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${uploadProgress.percentage}%`,
                                            backgroundColor: '#4285f4',
                                            borderRadius: '4px',
                                            transition: 'width 0.3s'
                                        }} />
                                    </div>
                                    <p style={{
                                        marginTop: '4px',
                                        fontSize: '12px',
                                        color: '#888',
                                        textAlign: 'center'
                                    }}>
                                        {formatFileSize(uploadProgress.loaded)} / {formatFileSize(uploadProgress.total)}
                                    </p>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    onClick={handleUpload}
                                    disabled={!selectedFile || uploading}
                                    style={{
                                        flex: 1,
                                        backgroundColor: selectedFile && !uploading ? '#4285f4' : '#cccccc',
                                        color: 'white',
                                        border: 'none',
                                        padding: '14px 24px',
                                        borderRadius: '6px',
                                        cursor: selectedFile && !uploading ? 'pointer' : 'not-allowed',
                                        fontSize: '16px',
                                        fontWeight: '500',
                                        transition: 'background-color 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    {uploading ? (
                                        <>
                                            <span style={{
                                                width: '16px',
                                                height: '16px',
                                                border: '2px solid white',
                                                borderTopColor: 'transparent',
                                                borderRadius: '50%',
                                                animation: 'spin 1s linear infinite'
                                            }} />
                                            Upload en cours...
                                        </>
                                    ) : (
                                        '📤 Uploader'
                                    )}
                                </button>

                                {selectedFile && !uploading && (
                                    <button
                                        onClick={handleCancel}
                                        style={{
                                            backgroundColor: 'transparent',
                                            color: darkTheme.text.secondary,
                                            border: '1px solid #ddd',
                                            padding: '14px 20px',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '16px',
                                            fontWeight: '500'
                                        }}
                                    >
                                        Annuler
                                    </button>
                                )}
                            </div>

                            <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>

                            {uploadError && <ErrorDisplay error={uploadError} />}

                            {uploadSuccess && (
                                <div style={{
                                    backgroundColor: '#e8f5e9',
                                    color: '#2e7d32',
                                    padding: '12px 16px',
                                    borderRadius: '6px',
                                    marginTop: '16px',
                                    border: '1px solid #c8e6c9'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '18px' }}>✅</span>
                                        <p style={{ margin: 0, fontWeight: '500' }}>
                                            Fichier uploadé avec succès !
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Fichiers récents */}
                        <div style={{
                            backgroundColor: darkTheme.background.secondary,
                            borderRadius: '12px',
                            padding: '30px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
                        }}>
                            <h2 style={{
                                fontSize: '20px',
                                fontWeight: '600',
                                marginBottom: '20px',
                                color: '#333'
                            }}>
                                Fichiers récents
                            </h2>

                            {uploadedFiles.length === 0 ? (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '40px 20px',
                                    color: '#888'
                                }}>
                                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
                                    <p style={{ marginBottom: '8px', fontSize: '16px' }}>
                                        Aucun fichier uploadé
                                    </p>
                                    <p style={{ fontSize: '14px' }}>
                                        Les fichiers que vous uploaderez apparaîtront ici
                                    </p>
                                </div>
                            ) : (
                                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                    {uploadedFiles.map((file) => (
                                        <div
                                            key={file.id}
                                            style={{
                                                padding: '16px',
                                                borderBottom: '1px solid #eee',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                transition: 'background-color 0.2s'
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <div style={{
                                                width: '40px',
                                                height: '40px',
                                                backgroundColor: darkTheme.surface.info,
                                                borderRadius: '6px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#4285f4',
                                                fontSize: '20px'
                                            }}>
                                                {file.type.startsWith('image/') ? '🖼️' :
                                                    file.type.startsWith('video/') ? '🎬' :
                                                        file.type.includes('pdf') ? '📕' :
                                                            file.type.includes('word') ? '📝' : '📄'}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <p style={{ margin: 0, fontWeight: '500', fontSize: '14px' }}>
                                                    {file.name}
                                                </p>
                                                <p style={{ margin: '4px 0 0', color: '#666', fontSize: '12px' }}>
                                                    {formatFileSize(file.size)} • {formatDateTime(file.uploadedAt)}
                                                </p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    onClick={() => window.open(file.url, '_blank')}
                                                    style={{
                                                        backgroundColor: darkTheme.surface.info,
                                                        color: '#4285f4',
                                                        border: 'none',
                                                        padding: '6px 12px',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '12px',
                                                        fontWeight: '500'
                                                    }}
                                                >
                                                    Ouvrir
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{
                                marginTop: '20px',
                                paddingTop: '20px',
                                borderTop: '1px solid #eee'
                            }}>
                                <p style={{
                                    fontSize: '12px',
                                    color: '#888',
                                    margin: 0,
                                    textAlign: 'center'
                                }}>
                                    {uploadedFiles.length} fichier{uploadedFiles.length !== 1 ? 's' : ''} uploadé{uploadedFiles.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Section UploadManager */}
                    <UploadManager
                        ref={uploadManagerRef}
                        onUploadComplete={(fileId) => {
                            // Actualiser la liste des fichiers
                        }}
                        onProgress={(progress) => {
                        }}
                    />

                    {/* Informations */}
                    <div style={{
                        backgroundColor: darkTheme.background.secondary,
                        borderRadius: '12px',
                        padding: '30px',
                        boxShadow: darkTheme.shadow.medium
                    }}>
                        <h2 style={{
                            fontSize: '20px',
                            fontWeight: '600',
                            marginBottom: '20px',
                            color: darkTheme.text.primary
                        }}>
                            Informations sur l'upload
                        </h2>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                            gap: '20px'
                        }}>
                            <div style={{
                                backgroundColor: darkTheme.background.tertiary,
                                borderRadius: '8px',
                                padding: '20px'
                            }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    backgroundColor: darkTheme.surface.info,
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: '16px',
                                    color: '#4285f4',
                                    fontSize: '24px'
                                }}>
                                    ⚡
                                </div>
                                <h3 style={{
                                    margin: '0 0 8px',
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    color: darkTheme.text.primary
                                }}>
                                    Rapide
                                </h3>
                                <p style={{
                                    margin: 0,
                                    color: darkTheme.text.secondary,
                                    fontSize: '14px',
                                    lineHeight: '1.5'
                                }}>
                                    Upload optimisé avec progression en temps réel
                                </p>
                            </div>

                            <div style={{
                                backgroundColor: darkTheme.background.tertiary,
                                borderRadius: '8px',
                                padding: '20px'
                            }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    backgroundColor: darkTheme.surface.success,
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: '16px',
                                    color: '#34a853',
                                    fontSize: '24px'
                                }}>
                                    🔒
                                </div>
                                <h3 style={{
                                    margin: '0 0 8px',
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    color: darkTheme.text.primary
                                }}>
                                    Sécurisé
                                </h3>
                                <p style={{
                                    margin: 0,
                                    color: darkTheme.text.secondary,
                                    fontSize: '14px',
                                    lineHeight: '1.5'
                                }}>
                                    Tous les uploads sont authentifiés et protégés
                                </p>
                            </div>

                            <div style={{
                                backgroundColor: darkTheme.background.tertiary,
                                borderRadius: '8px',
                                padding: '20px'
                            }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    backgroundColor: darkTheme.surface.error,
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: '16px',
                                    color: '#ea4335',
                                    fontSize: '24px'
                                }}>
                                    💾
                                </div>
                                <h3 style={{
                                    margin: '0 0 8px',
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    color: darkTheme.text.primary
                                }}>
                                    Stockage Cloudflare
                                </h3>
                                <p style={{
                                    margin: 0,
                                    color: darkTheme.text.secondary,
                                    fontSize: '14px',
                                    lineHeight: '1.5'
                                }}>
                                    Vos fichiers sont stockés sur R2 de Cloudflare
                                </p>
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
                            <span style={{ marginLeft: '20px', color: '#888' }}>
                                Espace utilisé : {formatFileSize(0)} / Illimité
                            </span>
                        </p>
                    </div>
                </footer>
            </div>
        </AuthGuard>
    );
}