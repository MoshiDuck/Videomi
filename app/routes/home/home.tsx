// INFO : app/routes/home/home.tsx
import React, { useEffect, useState, type CSSProperties } from "react";
import {cleanFilename} from "~/utils/filenameCleaner";
import {useAuth} from "~/contexts/AuthContext";
import ProtectedRoute from "~/components/ProtectedRoute";

interface Video {
    name: string;
    url: string;
    size: number;
    uploaded: string;
    type?: 'hls' | 'direct'; // Ajouter cette ligne
}

interface ApiResponse {
    success: boolean;
    videos?: Video[];
    error?: string;
}

const Home: React.FC = () => {
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [isElectron, setIsElectron] = useState<boolean>(false);
    const [isClient, setIsClient] = useState(false);
    const { verifyToken } = useAuth();

    useEffect(() => {
        setIsClient(true);
        const checkElectron = () => {
            try {
                setIsElectron(!!window.electronAPI?.isElectron);
            } catch {
                setIsElectron(false);
            }
        };

        checkElectron();
        const timer = setTimeout(checkElectron, 100);

        // Vérifier l'authentification AVANT de charger les vidéos
        const init = async () => {
            const isValid = await verifyToken();
            if (isValid) {
                fetchVideos();
            }
        };
        init();

        return () => clearTimeout(timer);
    }, []);

    const canPlayVideo = (videoUrl: string, videoType: string): boolean => {
        // Créer un élément video pour tester
        try {
            const video = document.createElement('video');
            const widelySupported = ['video/mp4', 'video/webm', 'video/ogg'];

            if (widelySupported.includes(videoType)) return true;

            // fallback: tester canPlayType si nécessaire
            if (video.canPlayType) {
                const res = video.canPlayType(videoType);
                return !!res;
            }
        } catch {
            // si erreur (ex: appelé côté serveur) -> retourner true par défaut
        }
        return true;
    };

    const fetchVideos = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');

            if (!token) {
                throw new Error("Non authentifié");
            }

            const response = await fetch('/api/videos', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 401) {
                // Token invalide ou expiré
                localStorage.removeItem('token');
                window.location.href = '/login';
                return;
            }

            const data: ApiResponse = await response.json();

            if (data.success && data.videos) {
                const cleanedVideos = data.videos.map(video => ({
                    ...video,
                    name: cleanFilename(video.name)
                }));
                setVideos(cleanedVideos);
            } else {
                setError(data.error || "Erreur lors du chargement des vidéos");
            }
        } catch (err: any) {
            if (err.message === "Non authentifié") {
                window.location.href = '/login';
            } else {
                setError("Impossible de se connecter au serveur");
                console.error(err);
            }
        } finally {
            setLoading(false);
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (!bytes && bytes !== 0) return '';
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // SSR-friendly: renvoie une représentation stable (ISO) pendant le rendu initial,
    // puis, après hydratation, affiche la version localisée FR.
    const formatDate = (dateString: string): string => {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (!isClient) {
            // Valeur déterministe pour SSR -> évite le mismatch
            return date.toISOString();
        }
        // Après hydratation : formatage convivial
        return date.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }) + ' ' + date.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Styles
    const containerStyle: CSSProperties = {
        padding: "2rem",
        fontFamily: "sans-serif",
        maxWidth: "1200px",
        margin: "0 auto"
    };

    const titleStyle: CSSProperties = {
        color: "#333",
        marginBottom: "1rem"
    };

    const subtitleStyle: CSSProperties = {
        color: "#666",
        marginBottom: "2rem"
    };

    const headerStyle: CSSProperties = {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "1.5rem"
    };

    const buttonStyle: CSSProperties = {
        padding: "0.5rem 1rem",
        background: "#0070f3",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "14px"
    };

    const errorStyle: CSSProperties = {
        background: "#ffebee",
        padding: "1rem",
        borderRadius: "4px",
        color: "#c62828",
        marginBottom: "1rem"
    };

    const emptyStyle: CSSProperties = {
        background: "#f5f5f5",
        padding: "2rem",
        borderRadius: "4px",
        textAlign: "center"
    };

    const gridStyle: CSSProperties = {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: "1.5rem"
    };

    const getVideoCardStyle = (index: number): CSSProperties => ({
        border: "1px solid #e0e0e0",
        borderRadius: "8px",
        overflow: "hidden",
        transition: "transform 0.2s, box-shadow 0.2s",
        backgroundColor: "white",
        transform: hoveredIndex === index ? "translateY(-4px)" : "none",
        boxShadow: hoveredIndex === index ? "0 4px 12px rgba(0,0,0,0.1)" : "none"
    });

    const videoTitleStyle: CSSProperties = {
        marginTop: 0,
        marginBottom: "0.5rem",
        fontSize: "1.1rem",
        color: "#333",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
    };

    const videoMetaStyle: CSSProperties = {
        display: "flex",
        justifyContent: "space-between",
        fontSize: "0.9rem",
        color: "#666",
        marginBottom: "1rem"
    };

    const watchButtonStyle: CSSProperties = {
        flex: 1,
        padding: "0.5rem",
        background: "#0070f3",
        color: "white",
        textDecoration: "none",
        textAlign: "center",
        borderRadius: "4px",
        fontSize: "0.9rem"
    };

    const downloadButtonStyle: CSSProperties = {
        padding: "0.5rem 1rem",
        background: "#f5f5f5",
        color: "#333",
        textDecoration: "none",
        borderRadius: "4px",
        fontSize: "0.9rem",
        border: "1px solid #ddd"
    };

    const footerStyle: CSSProperties = {
        marginTop: "2rem",
        paddingTop: "1rem",
        borderTop: "1px solid #e0e0e0",
        color: "#666",
        fontSize: "0.9rem"
    };

    const electronOnlyStyle: CSSProperties = {
        background: "#e8f5e9",
        padding: "1rem",
        borderRadius: "4px",
        marginBottom: "1rem",
        color: "#2e7d32",
        border: "1px solid #c8e6c9"
    };

    return (
        <ProtectedRoute>
        <div style={containerStyle}>
            <h1 style={titleStyle}>Bienvenue sur Videomi</h1>
            <p style={subtitleStyle}>
                Votre plateforme de streaming vidéo personnel
            </p>

            <section style={{ marginTop: "2rem" }}>
                <div style={headerStyle}>
                    <h2 style={{ color: "#333", margin: 0 }}>Vidéos disponibles :</h2>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={fetchVideos} style={buttonStyle}>Actualiser</button>
                        {isElectron && (
                            <a href="/upload" style={{ ...buttonStyle, display: "inline-block", textDecoration: "none", lineHeight: "1.6" }}>
                                Uploader
                            </a>
                        )}
                    </div>
                </div>

                {isElectron && (
                    <div style={electronOnlyStyle}>
                        <p>
                            <strong>✓ Mode application desktop détecté</strong><br />
                            Vous pouvez uploader des vidéos directement depuis votre ordinateur.
                        </p>
                    </div>
                )}

                {loading ? (
                    <div style={{ textAlign: "center", padding: "3rem" }}>
                        <p>Chargement des vidéos...</p>
                    </div>
                ) : error ? (
                    <div style={errorStyle}>
                        <p>{error}</p>
                    </div>
                ) : videos.length === 0 ? (
                    <div style={emptyStyle}>
                        <p>Aucune vidéo trouvée dans votre bibliothèque.</p>
                        <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                            Utilisez le bouton "Uploader" pour ajouter des vidéos.
                        </p>
                    </div>
                ) : (
                    <div style={gridStyle}>
                        {videos.map((video, index) => (
                            <div
                                key={index}
                                style={getVideoCardStyle(index)}
                                onMouseEnter={() => setHoveredIndex(index)}
                                onMouseLeave={() => setHoveredIndex(null)}
                            >
                                <div style={{ padding: "1.5rem" }}>
                                    <h3 style={videoTitleStyle}>
                                        {video.name}
                                    </h3>

                                    <div style={videoMetaStyle}>
                                        <span>{formatFileSize(video.size)}</span>
                                        <span>{formatDate(video.uploaded)}</span>
                                    </div>
                                    <div style={{ display: "flex", gap: "0.5rem" }}>
                                        <a
                                            href={`/watch?video=${encodeURIComponent(video.name)}`}
                                            style={watchButtonStyle}
                                            onClick={(e) => {
                                                // Si c'est une vidéo HLS, précharger les informations
                                                if (video.type === 'hls') {
                                                    console.log('Préchargement de la vidéo HLS:', video.name);
                                                }
                                            }}
                                        >
                                            Regarder
                                        </a>

                                        <a
                                            href={video.url}
                                            download={video.name}
                                            style={downloadButtonStyle}
                                            onClick={(e) => {
                                                // Si on est dans Electron, on utilise l'API de téléchargement
                                                if (window.electronAPI) {
                                                    e.preventDefault();
                                                    window.electronAPI.download({ url: video.url, filename: video.name })
                                                        .then(result => {
                                                            if (result.ok) {
                                                                console.log('Téléchargement terminé:', result.filePath);
                                                            } else {
                                                                console.error('Erreur de téléchargement:', result.error);
                                                                // Fallback au téléchargement normal
                                                                window.open(video.url, '_blank');
                                                            }
                                                        })
                                                        .catch(err => {
                                                            console.error('Erreur:', err);
                                                            // Fallback au téléchargement normal
                                                            window.open(video.url, '_blank');
                                                        });
                                                }
                                            }}
                                        >
                                            Télécharger
                                        </a>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {videos.length > 0 && (
                    <div style={footerStyle}>
                        <p>{videos.length} vidéo{videos.length > 1 ? 's' : ''} disponible{videos.length > 1 ? 's' : ''}</p>
                    </div>
                )}
            </section>
        </div>
        </ProtectedRoute>
    );
};

export default Home;