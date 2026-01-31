// INFO : app/components/ui/SplashScreen.tsx
// Affiche uniquement "Videomi" sans charger de données utilisateur.
// Si connecté → /home après 2s. Si non connecté → /login immédiatement (évite le layout _app et les timeouts).
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { darkTheme } from '~/utils/ui/theme';
import { useAuth } from '~/hooks/useAuth';

export function SplashScreen() {
    const navigate = useNavigate();
    const { user, loading } = useAuth();

    useEffect(() => {
        // Attendre que l'auth soit résolue (lecture localStorage, pas d'API)
        if (loading) return;

        if (user) {
            // Utilisateur connecté : courte pause branding puis /home
            const timer = setTimeout(() => {
                navigate('/home', { replace: true });
            }, 1500);
            return () => clearTimeout(timer);
        } else {
            // Non connecté : courte pause pour afficher "Videomi" puis /login (évite layout _app, home loader)
            const timer = setTimeout(() => {
                navigate('/login', { replace: true });
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [loading, user, navigate]);

    return (
        <div 
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: darkTheme.background.primary,
                overflow: 'hidden',
                zIndex: 9999
            }}
            role="banner"
            aria-label="Écran de démarrage Videomi"
        >
            {/* Effet de gradient animé en arrière-plan */}
            <div 
                className="splash-gradient-bg"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: `radial-gradient(circle at 30% 50%, rgba(66, 133, 244, 0.08) 0%, transparent 50%),
                                radial-gradient(circle at 70% 50%, rgba(251, 191, 36, 0.06) 0%, transparent 50%)`,
                    opacity: 0
                }}
            />

            {/* Particules subtiles animées */}
            <div className="splash-particles" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {[...Array(20)].map((_, i) => (
                    <div
                        key={i}
                        className="splash-particle"
                        style={{
                            position: 'absolute',
                            width: '2px',
                            height: '2px',
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '50%',
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            opacity: 0
                        }}
                    />
                ))}
            </div>

            {/* Contenu principal */}
            <div style={{
                position: 'relative',
                zIndex: 10,
                textAlign: 'center',
                padding: '0 20px'
            }}>
                <h1 
                    style={{
                        fontSize: 'clamp(4rem, 18vw, 14rem)',
                        fontWeight: 800,
                        letterSpacing: '-0.04em',
                        userSelect: 'none',
                        margin: 0,
                        lineHeight: 1,
                        fontFamily: 'system-ui, -apple-system, sans-serif'
                    }}
                    aria-label="Videomi"
                >
                    {/* Partie "Video" en blanc avec ombre subtile */}
                    <span 
                        className="splash-video"
                        style={{
                            display: 'inline-block',
                            color: darkTheme.text.primary,
                            marginRight: '0.08em',
                            textShadow: '0 0 40px rgba(255, 255, 255, 0.1)',
                            fontWeight: 700
                        }}
                    >
                        Video
                    </span>
                    
                    {/* Partie "Mi" en doré scintillant avec effet premium */}
                    <span 
                        className="splash-mi"
                        style={{
                            display: 'inline-block',
                            background: 'linear-gradient(135deg, #fbbf24 0%, #fde047 25%, #fbbf24 50%, #f59e0b 75%, #fbbf24 100%)',
                            backgroundSize: '300% 100%',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            color: 'transparent',
                            filter: 'drop-shadow(0 0 30px rgba(251, 191, 36, 0.4))',
                            fontWeight: 800
                        }}
                    >
                        Mi
                    </span>
                </h1>
            </div>

            {/* Styles d'animation */}
            <style>{`
                @keyframes fadeInScale {
                    0% {
                        opacity: 0;
                        transform: scale(0.85) translateY(20px);
                    }
                    100% {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }

                @keyframes shimmer {
                    0%, 100% {
                        background-position: 0% 50%;
                    }
                    50% {
                        background-position: 100% 50%;
                    }
                }

                @keyframes sparkle {
                    0%, 100% {
                        filter: drop-shadow(0 0 30px rgba(251, 191, 36, 0.4)) brightness(1);
                    }
                    50% {
                        filter: drop-shadow(0 0 50px rgba(251, 191, 36, 0.7)) brightness(1.2);
                    }
                }

                @keyframes gradientFade {
                    0% {
                        opacity: 0;
                    }
                    100% {
                        opacity: 1;
                    }
                }

                @keyframes particleFloat {
                    0%, 100% {
                        opacity: 0;
                        transform: translateY(0) translateX(0);
                    }
                    50% {
                        opacity: 0.3;
                        transform: translateY(-20px) translateX(10px);
                    }
                }

                .splash-gradient-bg {
                    animation: gradientFade 1.5s ease-out forwards;
                }

                .splash-video {
                    animation: fadeInScale 1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                    opacity: 0;
                    transform: scale(0.85);
                }

                .splash-mi {
                    animation: fadeInScale 1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s forwards, 
                               shimmer 4s ease-in-out infinite 1s,
                               sparkle 3s ease-in-out infinite 1s;
                    opacity: 0;
                    transform: scale(0.85);
                }

                .splash-particle {
                    animation: particleFloat 8s ease-in-out infinite;
                }

                .splash-particle:nth-child(odd) {
                    animation-delay: 0s;
                    animation-duration: 10s;
                }

                .splash-particle:nth-child(even) {
                    animation-delay: 2s;
                    animation-duration: 12s;
                }

                @media (prefers-reduced-motion: reduce) {
                    .splash-video,
                    .splash-mi,
                    .splash-gradient-bg,
                    .splash-particle {
                        animation: fadeInScale 0.3s ease-out forwards !important;
                        opacity: 1 !important;
                        transform: scale(1) !important;
                    }
                    
                    .splash-mi {
                        animation: fadeInScale 0.3s ease-out 0.1s forwards !important;
                    }
                }
            `}</style>
        </div>
    );
}
