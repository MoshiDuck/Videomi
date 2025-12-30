// INFO : app/routes/login.tsx
import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import { useAuth } from "~/contexts/AuthContext";
import PublicRoute from "~/components/PublicRoute";

interface LoginResponse {
    success: boolean;
    token?: string;
    refreshToken?: string; // Pour Electron
    error?: string;
    message?: string;
}
// DZfasdf

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");
    const navigate = useNavigate();
    const location = useLocation();
    const { login } = useAuth();

    // Vérifier s'il y a un message de redirection
    useEffect(() => {
        if (location.state?.message) {
            setInfo(location.state.message);
        }
        if (location.state?.email) {
            setEmail(location.state.email);
        }
    }, [location]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setInfo("");

        try {
            let response;

            if (window.electronAPI?.isElectron) {
                // Pour Electron: utiliser l'API IPC
                const result = await window.electronAPI.login(email, password);

                if (result.success && result.user) {
                    // Stocker le token dans localStorage
                    localStorage.setItem('token', result.user.token);
                    login(result.user.token, email, result.user.uid);
                    navigate("/home", { replace: true });
                    return;
                } else {
                    setError(result.error || "Email ou mot de passe incorrect");
                }
            } else {
                // Pour le web: appel API normal
                response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include', // Important pour les cookies
                    body: JSON.stringify({ email, password })
                });

                const data: LoginResponse = await response.json();

                if (data.success && data.token) {
                    // Le refresh token est dans le cookie HTTP-only
                    localStorage.setItem('token', data.token);
                    login(data.token, email);
                    navigate("/home", { replace: true });
                } else {
                    setError(data.error || "Email ou mot de passe incorrect");
                }
            }
        } catch (err) {
            setError("Erreur de connexion au serveur");
            console.error(err);
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
                        Connexion
                    </h1>

                    {info && (
                        <div style={{
                            backgroundColor: "#e3f2fd",
                            color: "#1565c0",
                            padding: "10px",
                            borderRadius: "5px",
                            marginBottom: "20px",
                            textAlign: "center"
                        }}>
                            ℹ️ {info}
                        </div>
                    )}

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
                                style={{
                                    width: "100%",
                                    padding: "12px",
                                    border: "1px solid #ddd",
                                    borderRadius: "5px",
                                    fontSize: "16px",
                                    boxSizing: "border-box"
                                }}
                                placeholder="votre@email.com"
                            />
                        </div>

                        <div style={{ marginBottom: "30px" }}>
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
                                style={{
                                    width: "100%",
                                    padding: "12px",
                                    border: "1px solid #ddd",
                                    borderRadius: "5px",
                                    fontSize: "16px",
                                    boxSizing: "border-box"
                                }}
                                placeholder="Votre mot de passe"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: "100%",
                                padding: "14px",
                                backgroundColor: loading ? "#666" : "#0070f3",
                                color: "white",
                                border: "none",
                                borderRadius: "5px",
                                fontSize: "16px",
                                fontWeight: "bold",
                                cursor: loading ? "not-allowed" : "pointer",
                                marginBottom: "20px"
                            }}
                        >
                            {loading ? "Connexion..." : "Se connecter"}
                        </button>

                        <div style={{
                            textAlign: "center",
                            color: "#666",
                            fontSize: "14px"
                        }}>
                            Pas encore de compte ?{" "}
                            <Link
                                to="/register"
                                style={{
                                    color: "#0070f3",
                                    textDecoration: "none",
                                    fontWeight: "500"
                                }}
                            >
                                S'inscrire
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        </PublicRoute>
    );
}