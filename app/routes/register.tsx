// INFO : app/routes/register.tsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "~/contexts/AuthContext";
import PublicRoute from "~/components/PublicRoute";

interface RegisterResponse {
    success: boolean;
    token?: string;
    refreshToken?: string; // Ajout pour Electron
    uid?: string; // Ajout pour Electron
    error?: string;
    message?: string;
}

export default function Register() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSuccess(false);

        // Validation basique
        if (password !== confirmPassword) {
            setError("Les mots de passe ne correspondent pas");
            setLoading(false);
            return;
        }

        if (password.length < 6) {
            setError("Le mot de passe doit contenir au moins 6 caractères");
            setLoading(false);
            return;
        }

        try {
            console.log("📤 Envoi de la requête d'inscription...", { email });

            if (window.electronAPI?.isElectron) {
                // Pour Electron: utiliser l'API IPC
                const result = await window.electronAPI.register(email, password);

                if (result.success && result.user) {
                    console.log("✅ Inscription réussie via Electron");
                    setSuccess(true);

                    // Stocker le token dans localStorage
                    localStorage.setItem('token', result.user.token);

                    // Mettre à jour le contexte d'authentification
                    login(result.user.token, email, result.user.uid);

                    // Redirection automatique vers la page d'accueil
                    setTimeout(() => {
                        navigate("/home", { replace: true });
                    }, 2000);
                } else {
                    console.error("❌ Erreur d'inscription Electron:", result.error);
                    setError(result.error || "Erreur lors de l'inscription");
                }
            } else {
                // Pour le web: appel API normal
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include', // Important pour les cookies
                    body: JSON.stringify({
                        email,
                        password,
                        device: navigator.userAgent
                    }),
                });

                console.log("📥 Réponse reçue, status:", response.status);

                const data: RegisterResponse = await response.json();
                console.log("📥 Données de réponse:", data);

                if (data.success && data.token) {
                    console.log("✅ Inscription réussie, refresh token créé");
                    setSuccess(true);

                    // Stocker le token d'accès
                    localStorage.setItem('token', data.token);

                    // Mettre à jour le contexte d'authentification avec l'UID si disponible
                    login(data.token, email, data.uid);

                    // Redirection automatique vers la page d'accueil
                    setTimeout(() => {
                        navigate("/home", { replace: true });
                    }, 2000);
                } else {
                    console.error("❌ Erreur d'inscription:", data.error);
                    setError(data.error || "Erreur lors de l'inscription");
                }
            }
        } catch (err: any) {
            console.error("❌ Erreur réseau:", err);
            setError("Erreur de connexion au serveur");
        } finally {
            setLoading(false);
        }
    };

    return (
        <PublicRoute>
            <div style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: "100vh",
                backgroundColor: "#f5f5f5",
                padding: "20px"
            }}>
                <div style={{
                    backgroundColor: "white",
                    padding: "40px",
                    borderRadius: "10px",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                    width: "100%",
                    maxWidth: "400px"
                }}>
                    <h1 style={{
                        textAlign: "center",
                        marginBottom: "30px",
                        color: "#333"
                    }}>
                        Inscription
                    </h1>

                    {error && (
                        <div style={{
                            backgroundColor: "#ffebee",
                            color: "#c62828",
                            padding: "10px",
                            borderRadius: "5px",
                            marginBottom: "20px",
                            textAlign: "center"
                        }}>
                            {error}
                        </div>
                    )}

                    {success && (
                        <div style={{
                            backgroundColor: "#e8f5e9",
                            color: "#2e7d32",
                            padding: "10px",
                            borderRadius: "5px",
                            marginBottom: "20px",
                            textAlign: "center"
                        }}>
                            ✅ Compte créé avec succès ! Redirection vers l'accueil...
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: "20px" }}>
                            <label style={{
                                display: "block",
                                marginBottom: "8px",
                                color: "#555",
                                fontWeight: "500"
                            }}>
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                disabled={loading || success}
                                style={{
                                    width: "100%",
                                    padding: "12px",
                                    border: "1px solid #ddd",
                                    borderRadius: "5px",
                                    fontSize: "16px",
                                    boxSizing: "border-box",
                                    opacity: (loading || success) ? 0.7 : 1
                                }}
                                placeholder="votre@email.com"
                            />
                        </div>

                        <div style={{ marginBottom: "20px" }}>
                            <label style={{
                                display: "block",
                                marginBottom: "8px",
                                color: "#555",
                                fontWeight: "500"
                            }}>
                                Mot de passe
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={loading || success}
                                style={{
                                    width: "100%",
                                    padding: "12px",
                                    border: "1px solid #ddd",
                                    borderRadius: "5px",
                                    fontSize: "16px",
                                    boxSizing: "border-box",
                                    opacity: (loading || success) ? 0.7 : 1
                                }}
                                placeholder="Minimum 6 caractères"
                            />
                            <small style={{ color: "#666", fontSize: "0.8rem", marginTop: "4px", display: "block" }}>
                                Le mot de passe sera hashé de manière sécurisée avant stockage
                            </small>
                        </div>

                        <div style={{ marginBottom: "30px" }}>
                            <label style={{
                                display: "block",
                                marginBottom: "8px",
                                color: "#555",
                                fontWeight: "500"
                            }}>
                                Confirmer le mot de passe
                            </label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                disabled={loading || success}
                                style={{
                                    width: "100%",
                                    padding: "12px",
                                    border: "1px solid #ddd",
                                    borderRadius: "5px",
                                    fontSize: "16px",
                                    boxSizing: "border-box",
                                    opacity: (loading || success) ? 0.7 : 1
                                }}
                                placeholder="Confirmez votre mot de passe"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading || success}
                            style={{
                                width: "100%",
                                padding: "14px",
                                backgroundColor: loading ? "#666" : success ? "#4caf50" : "#0070f3",
                                color: "white",
                                border: "none",
                                borderRadius: "5px",
                                fontSize: "16px",
                                fontWeight: "bold",
                                cursor: (loading || success) ? "not-allowed" : "pointer",
                                marginBottom: "20px"
                            }}
                        >
                            {loading ? "Inscription en cours..." :
                                success ? "✅ Inscription réussie !" :
                                    "S'inscrire"}
                        </button>

                        <div style={{
                            textAlign: "center",
                            color: "#666",
                            fontSize: "14px"
                        }}>
                            Déjà un compte ?{" "}
                            <Link
                                to="/login"
                                style={{
                                    color: "#0070f3",
                                    textDecoration: "none",
                                    fontWeight: "500"
                                }}
                            >
                                Se connecter
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        </PublicRoute>
    );
}