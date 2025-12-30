// INFO : app/routes/upload.tsx
import React, { JSX, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import ProtectedRoute from "~/components/ProtectedRoute";

// Types
type UploadStatus = "idle" | "selecting" | "uploading" | "success" | "error";
type UploadProgress = {
    overall: number;
    currentFile: number;
    currentFileName: string;
    uploadedSegments?: number;
    totalSegments?: number;
};

// Fonction pour extraire le nom de fichier sans extension
const extractFileName = (fullName: string): string => {
    // Supprime l'extension (tout après le dernier point)
    const lastDotIndex = fullName.lastIndexOf('.');
    if (lastDotIndex === -1) {
        return fullName; // Pas d'extension
    }
    return fullName.substring(0, lastDotIndex);
};

// Fonction pour formater le nom de fichier (optionnel)
const formatFileName = (fileName: string): string => {
    // Remplacer les underscores et tirets par des espaces pour plus de lisibilité
    return fileName
        .replace(/[_-]/g, ' ')
        .replace(/\s+/g, ' ') // Supprimer les espaces multiples
        .trim();
};

export default function Upload(): JSX.Element {
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
    const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
        overall: 0,
        currentFile: 0,
        currentFileName: ""
    });
    const [statusMessage, setStatusMessage] = useState<string>("");
    const [isElectron, setIsElectron] = useState<boolean>(false);
    const [isClient, setIsClient] = useState<boolean>(false);
    const navigate = useNavigate();
    const progressListenerRef = useRef<boolean>(false);

    // Vérification de l'environnement Electron
    useEffect(() => {
        console.log("🔍 Upload component mounted");
        setIsClient(true);

        const checkElectron = () => {
            const electronDetected = !!(window.electronAPI?.isElectron);
            console.log(`⚡ Electron détecté: ${electronDetected}`);
            setIsElectron(electronDetected);

            if (!electronDetected && isClient) {
                console.log("🌐 Redirection vers /home (non-Electron)");
                navigate("/home");
            }
        };

        checkElectron();
        const timer = setTimeout(checkElectron, 100);

        return () => {
            clearTimeout(timer);
            console.log("🧹 Upload component unmounted");
        };
    }, [navigate, isClient]);

    // Configurer l'écouteur de progression
    useEffect(() => {
        if (!isElectron || progressListenerRef.current) {
            console.log("⏭️ Écouteur de progression déjà configuré ou pas Electron");
            return;
        }

        console.log('🎯 Configuration de l\'écouteur de progression');

        window.electronAPI.onUploadProgress((progress: any) => {
            console.log('📨 Progression reçue:', progress);

            if (progress.stage === 'conversion_and_upload') {
                const overall = progress.progress || 0;
                const uploadedSegments = progress.uploadedSegments || 0;
                const totalSegments = progress.totalSegments || 0;

                // Message simple sans répétition du pourcentage
                setStatusMessage(`Préparation de la vidéo...`);

                setUploadProgress(prev => ({
                    ...prev,
                    currentFile: overall,
                    uploadedSegments,
                    totalSegments
                }));
            } else if (progress.stage === 'upload_subtitles') {
                const currentSubtitle = progress.currentSubtitle || 0;
                const totalSubtitles = progress.totalSubtitles || 0;

                if (totalSubtitles > 0) {
                    setStatusMessage(`Ajout des sous-titres (${currentSubtitle}/${totalSubtitles})...`);
                } else {
                    setStatusMessage("Finalisation...");
                }
                setUploadProgress(prev => ({
                    ...prev,
                    currentFile: progress.progress || 0
                }));
            } else if (progress.stage === 'upload_playlist') {
                setStatusMessage("Création du fichier de lecture...");
                setUploadProgress(prev => ({
                    ...prev,
                    currentFile: progress.progress || 0
                }));
            } else if (progress.stage === 'upload_dash') {
                setStatusMessage("Optimisation pour différents appareils...");
                setUploadProgress(prev => ({
                    ...prev,
                    currentFile: progress.progress || 0
                }));
            } else {
                // Progression classique
                const percent = progress.progress || 0;
                setStatusMessage("Préparation de la vidéo...");
                setUploadProgress(prev => ({
                    ...prev,
                    currentFile: percent,
                    currentFileName: progress.fileName || prev.currentFileName
                }));
            }
        });

        progressListenerRef.current = true;

        return () => {
            console.log("🧹 Nettoyage écouteur progression");
            if (window.electronAPI?.removeUploadProgressListener) {
                window.electronAPI.removeUploadProgressListener();
                progressListenerRef.current = false;
            }
        };
    }, [isElectron]);

    // Gestion de l'upload Streaming (HLS + DASH) via Worker
    const handleStreamingUpload = async () => {
        if (!window.electronAPI) {
            console.error("❌ L'API Electron n'est pas disponible");
            setStatusMessage("L'API Electron n'est pas disponible");
            setUploadStatus("error");
            return;
        }

        console.log('🚀 Début de l\'upload Streaming (HLS + DASH) via Worker');

        // Réinitialiser l'état
        setUploadStatus("selecting");
        setUploadProgress({
            overall: 0,
            currentFile: 0,
            currentFileName: "",
        });
        setStatusMessage("Sélection du fichier...");

        try {
            // Sélectionner les fichiers
            console.log('📁 Sélection du fichier...');
            const filePaths = await window.electronAPI.selectFiles();

            if (filePaths.length === 0) {
                console.log("⏭️ Aucun fichier sélectionné");
                setStatusMessage("Aucun fichier sélectionné");
                setUploadStatus("idle");
                return;
            }

            // Pour l'instant, on ne prend qu'un seul fichier
            const filePath = filePaths[0];
            console.log(`📄 Fichier sélectionné: ${filePath}`);

            const fileInfo = await window.electronAPI.getFileInfo(filePath);
            // Extraire le nom sans extension et formater
            const baseName = extractFileName(fileInfo.name);
            const formattedName = formatFileName(baseName);

            setStatusMessage(`Analyse de "${formattedName}"...`);
            setUploadStatus("uploading");
            setUploadProgress(prev => ({
                ...prev,
                currentFileName: formattedName
            }));

            // Convertir et uploader en Streaming (HLS + DASH) via Worker
            console.log(`🎬 Début conversion pour ${formattedName}`);
            console.time("Conversion totale");

            const result = await window.electronAPI.convertAndUploadToStreaming(filePath);
            console.timeEnd("Conversion totale");

            if (result && result.success) {
                console.log(`✅ Upload Streaming réussi: ${formattedName}`);

                // Mettre à jour la progression
                setUploadProgress(prev => ({
                    ...prev,
                    overall: 100,
                    currentFile: 100
                }));

                setStatusMessage(`✅ "${formattedName}" a été uploadé avec succès!`);
                setUploadStatus("success");

                // Message final
                setTimeout(() => {
                    setStatusMessage(prev => prev + " La vidéo est prête pour la lecture.");
                }, 1500);
            } else {
                throw new Error(`Échec de l'upload de "${formattedName}"`);
            }
        } catch (error: any) {
            console.error(`❌ Erreur lors de l'upload Streaming:`, error);
            console.error(`❌ Stack trace:`, error.stack);
            setStatusMessage(`❌ Erreur: ${error.message}`);
            setUploadStatus("error");
        }
    };

    // Rendu conditionnel pour non-Electron
    if (!isClient || !isElectron) {
        return (
            <div style={{ padding: 20, maxWidth: 900, margin: "0 auto", fontFamily: "sans-serif" }}>
                <h2>Accès non autorisé</h2>
                <p>La fonction d'upload n'est disponible que depuis l'application desktop.</p>
                <button onClick={() => navigate("/home")} style={{
                    padding: "0.5rem 1rem",
                    background: "#0070f3",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                }}>
                    Retour à l'accueil
                </button>
            </div>
        );
    }

    // Déterminer le texte du bouton
    const getButtonText = () => {
        switch (uploadStatus) {
            case "selecting": return "Sélection en cours...";
            case "uploading": return "Upload en cours...";
            case "success": return "✅ Upload réussi";
            case "error": return "❌ Erreur - Réessayer";
            default: return "📁 Choisir une vidéo";
        }
    };

    // Déterminer la couleur de fond du bouton
    const getButtonColor = () => {
        switch (uploadStatus) {
            case "selecting":
            case "uploading":
                return "#666666";
            case "success":
                return "#4caf50";
            case "error":
                return "#f44336";
            default:
                return "#0070f3";
        }
    };

    // Formater le compteur de segments (ex: "32/936")
    const formatSegmentCounter = () => {
        if (uploadProgress.uploadedSegments !== undefined && uploadProgress.totalSegments !== undefined) {
            return `${uploadProgress.uploadedSegments}/${uploadProgress.totalSegments}`;
        }
        return null;
    };

    console.log("🎨 Rendu du composant Upload", { uploadStatus, uploadProgress, statusMessage });

    return (
        <ProtectedRoute>
        <div style={{ padding: 20, maxWidth: 600, margin: "0 auto", fontFamily: "sans-serif" }}>
            <h2 style={{ textAlign: "center", marginBottom: "2rem", color: "#333" }}>
                Uploader une vidéo
            </h2>

            {/* Bouton d'upload principal */}
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                <button
                    onClick={handleStreamingUpload}
                    disabled={uploadStatus === "selecting" || uploadStatus === "uploading"}
                    style={{
                        padding: "1rem 2rem",
                        background: getButtonColor(),
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        cursor: uploadStatus === "selecting" || uploadStatus === "uploading" ? "not-allowed" : "pointer",
                        fontSize: "1.1rem",
                        fontWeight: "bold",
                        transition: "all 0.3s",
                        minWidth: "250px",
                        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)"
                    }}
                >
                    {getButtonText()}
                </button>
            </div>

            {/* Zone de progression */}
            {(uploadStatus === "uploading" || uploadStatus === "success" || uploadStatus === "error") && (
                <div style={{
                    background: "#f8f9fa",
                    padding: "1.5rem",
                    borderRadius: "12px",
                    marginBottom: "1.5rem",
                    border: "1px solid #e9ecef",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)"
                }}>
                    {/* Nom du fichier */}
                    {uploadProgress.currentFileName && (
                        <div style={{ marginBottom: "1rem" }}>
                            <div style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "0.5rem"
                            }}>
                                <h3 style={{
                                    margin: 0,
                                    color: "#333",
                                    fontSize: "1.1rem",
                                    maxWidth: "60%",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap"
                                }}>
                                    {uploadProgress.currentFileName}
                                </h3>
                                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                                    {/* Compteur de segments (si disponible) */}
                                    {formatSegmentCounter() && (
                                        <span style={{
                                            fontSize: "0.9rem",
                                            color: "#666",
                                            background: "#e9ecef",
                                            padding: "0.25rem 0.5rem",
                                            borderRadius: "4px",
                                            whiteSpace: "nowrap"
                                        }}>
                                            {formatSegmentCounter()} segments
                                        </span>
                                    )}
                                    {/* Pourcentage */}
                                    <span style={{
                                        fontWeight: "bold",
                                        color: uploadStatus === "success" ? "#4caf50" :
                                            uploadStatus === "error" ? "#f44336" : "#0070f3",
                                        fontSize: "1.1rem",
                                        minWidth: "45px",
                                        textAlign: "right"
                                    }}>
                                        {uploadProgress.currentFile.toFixed(0)}%
                                    </span>
                                </div>
                            </div>

                            {/* Barre de progression */}
                            <div style={{
                                width: "100%",
                                height: "10px",
                                background: "#e9ecef",
                                borderRadius: "5px",
                                overflow: "hidden",
                                marginBottom: "0.5rem"
                            }}>
                                <div
                                    style={{
                                        width: `${uploadProgress.currentFile}%`,
                                        height: "100%",
                                        background: uploadStatus === "success" ? "#4caf50" :
                                            uploadStatus === "error" ? "#f44336" : "#0070f3",
                                        transition: "width 0.5s ease-out",
                                        borderRadius: "5px"
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Message d'état */}
                    <div style={{
                        padding: "0.75rem",
                        background: uploadStatus === "success" ? "#e8f5e9" :
                            uploadStatus === "error" ? "#ffebee" : "#e3f2fd",
                        borderRadius: "6px",
                        borderLeft: `4px solid ${
                            uploadStatus === "success" ? "#4caf50" :
                                uploadStatus === "error" ? "#f44336" : "#2196f3"
                        }`
                    }}>
                        <p style={{ margin: 0, color: "#333", fontSize: "0.95rem" }}>
                            {statusMessage}
                        </p>
                    </div>
                </div>
            )}

            {/* Instructions */}
            {uploadStatus === "idle" && (
                <div style={{
                    background: "#f8f9fa",
                    padding: "1.5rem",
                    borderRadius: "12px",
                    textAlign: "center",
                    border: "1px solid #e9ecef"
                }}>
                    <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🎬</div>
                    <h3 style={{ marginTop: 0, color: "#333" }}>Comment ça marche ?</h3>
                    <ol style={{
                        textAlign: "left",
                        paddingLeft: "1.5rem",
                        margin: "1rem 0",
                        color: "#555"
                    }}>
                        <li style={{ marginBottom: "0.5rem" }}>Cliquez sur "Choisir une vidéo"</li>
                        <li style={{ marginBottom: "0.5rem" }}>Sélectionnez votre fichier vidéo</li>
                        <li style={{ marginBottom: "0.5rem" }}>Laissez l'application convertir et uploader</li>
                        <li>Votre vidéo sera disponible pour lecture</li>
                    </ol>
                    <p style={{ color: "#666", fontSize: "0.9rem", marginTop: "1rem" }}>
                        Formats supportés: MP4, MKV, AVI, MOV, WebM, etc.
                    </p>
                </div>
            )}

            {/* Bouton de réinitialisation */}
            {(uploadStatus === "success" || uploadStatus === "error") && (
                <div style={{ textAlign: "center", marginTop: "2rem" }}>
                    <button
                        onClick={() => {
                            console.log("🔄 Réinitialisation de l'upload");
                            setUploadStatus("idle");
                            setUploadProgress({
                                overall: 0,
                                currentFile: 0,
                                currentFileName: ""
                            });
                            setStatusMessage("");
                        }}
                        style={{
                            padding: "0.75rem 1.5rem",
                            background: "#6c757d",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "1rem",
                            fontWeight: "bold"
                        }}
                    >
                        Uploader une autre vidéo
                    </button>
                </div>
            )}
        </div>
        </ProtectedRoute>
    );
}