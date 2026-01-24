// INFO : app/components/ui/MiniPlayer.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { usePlayer } from '~/contexts/PlayerContext';

// Fonction utilitaire pour formater le temps
function formatTimeUtil(seconds: number): string {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MiniPlayer() {
    const { state, pause, resume, stop, playNext, playPrevious, toggleMiniPlayer, audioRef, videoRef, canRestore, restoredState, restorePlayback, dismissRestore } = usePlayer();
    const navigate = useNavigate();
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 24, y: 24 }); // Position from bottom-right
    const [isClient, setIsClient] = useState(false);
    const [mediaError, setMediaError] = useState<string | null>(null);
    const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

    // Protection SSR - TOUS LES HOOKS DOIVENT ÊTRE AVANT LES RETURNS CONDITIONNELS
    useEffect(() => {
        setIsClient(true);
    }, []);
    
    // Effet pour le drag - doit être AVANT les returns conditionnels
    useEffect(() => {
        if (!isDragging) return;
        
        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = dragStartRef.current.x - e.clientX;
            const deltaY = dragStartRef.current.y - e.clientY;
            setPosition({
                x: Math.max(0, dragStartRef.current.posX + deltaX),
                y: Math.max(0, dragStartRef.current.posY + deltaY)
            });
        };
        
        const handleMouseUp = () => setIsDragging(false);
        
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // Ne pas afficher côté serveur
    if (!isClient) {
        return null;
    }

    // Afficher la notification de restauration si disponible et pas de lecture en cours
    if (canRestore && restoredState && !state.fileUrl) {
        return (
            <div style={{
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                width: '360px',
                background: 'rgba(20, 20, 25, 0.95)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
                overflow: 'hidden',
                zIndex: 9999,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                animation: 'slideUp 0.3s ease-out'
            }}>
                <div style={{
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    {/* Thumbnail */}
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        background: restoredState.thumbnail 
                            ? `url(${restoredState.thumbnail}) center/cover` 
                            : restoredState.type === 'video' 
                                ? 'linear-gradient(135deg, #e50914, #b20710)'
                                : 'linear-gradient(135deg, #1db954, #169c46)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        {!restoredState.thumbnail && (
                            <span style={{ fontSize: '20px' }}>
                                {restoredState.type === 'video' ? '🎬' : '🎵'}
                            </span>
                        )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: '11px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            marginBottom: '4px'
                        }}>
                            Reprendre la lecture
                        </div>
                        <div style={{
                            color: '#fff',
                            fontSize: '14px',
                            fontWeight: '600',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {restoredState.title || 'Sans titre'}
                        </div>
                        <div style={{
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: '12px',
                            marginTop: '2px'
                        }}>
                            {formatTimeUtil(restoredState.currentTime)} • {restoredState.artist || (restoredState.type === 'video' ? 'Vidéo' : 'Audio')}
                        </div>
                    </div>

                    {/* Boutons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={dismissRestore}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'rgba(255,255,255,0.7)',
                                fontSize: '18px',
                                cursor: 'pointer',
                                padding: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'color 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                            aria-label="Ignorer la restauration"
                        >
                            ✕
                        </button>
                        <button
                            onClick={restorePlayback}
                            aria-label="Reprendre la lecture"
                            style={{
                                background: restoredState.type === 'video' ? '#e50914' : '#1db954',
                                border: 'none',
                                color: '#fff',
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '16px',
                                transition: 'transform 0.2s',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            ▶
                        </button>
                    </div>
                </div>
                
                {/* Barre de progression */}
                <div style={{
                    height: '3px',
                    background: 'rgba(255,255,255,0.1)'
                }}>
                    <div style={{
                        height: '100%',
                        width: '100%',
                        background: restoredState.type === 'video' 
                            ? 'linear-gradient(90deg, #e50914, #ff4040)' 
                            : 'linear-gradient(90deg, #1db954, #1ed760)',
                        opacity: 0.5
                    }} />
                </div>
                
                <style>{`
                    @keyframes slideUp {
                        from { transform: translateY(20px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                `}</style>
            </div>
        );
    }

    // Ne pas afficher si pas de lecture en cours
    if (!state.fileUrl || !state.isMiniPlayer) {
        return null;
    }

    const formatTime = (seconds: number): string => {
        if (!isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const progress = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

    const handleExpand = () => {
        // Stocker le temps actuel avant d'arrêter
        const currentTime = state.currentTime;
        toggleMiniPlayer(false);
        if (state.category && state.fileId) {
            navigate(`/reader/${state.category}/${state.fileId}`, {
                state: {
                    playlist: state.playlist,
                    playlistContext: state.playlistContext,
                    startIndex: state.currentTrackIndex,
                    continuePlayback: true,
                    currentTime: currentTime
                }
            });
        }
    };

    const isVideo = state.type === 'video';
    
    // Drag handlers pour déplacer le mini player
    const handleDragStart = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'VIDEO') return;
        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            posX: position.x,
            posY: position.y
        };
    };

    return (
        <>
            {/* Élément audio caché pour la lecture en arrière-plan */}
            {state.type === 'audio' && (
                <audio
                    ref={audioRef}
                    src={state.fileUrl}
                    autoPlay={state.isPlaying}
                    style={{ display: 'none' }}
                    onError={() => setMediaError('Impossible de charger le fichier audio')}
                    onLoadStart={() => setMediaError(null)}
                />
            )}

            {/* Mini Player UI */}
            <div 
                onMouseDown={handleDragStart}
                style={{
                    position: 'fixed',
                    bottom: `${position.y}px`,
                    right: `${position.x}px`,
                    width: isVideo ? '400px' : '360px',
                    background: 'rgba(20, 20, 25, 0.95)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: '16px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
                    overflow: 'hidden',
                    zIndex: 9999,
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    userSelect: 'none'
                }}
            >
                {/* Vidéo visible pour les vidéos */}
                {isVideo && (
                    <div style={{ position: 'relative' }}>
                        <video
                            ref={videoRef}
                            src={state.fileUrl}
                            autoPlay={state.isPlaying}
                            onClick={handleExpand}
                            onError={() => setMediaError('Impossible de charger la vidéo')}
                            onLoadStart={() => setMediaError(null)}
                            style={{
                                width: '100%',
                                height: '225px', // 16:9 ratio pour 400px de large
                                objectFit: 'cover',
                                cursor: 'pointer',
                                background: '#000'
                            }}
                        />
                        {/* Overlay avec contrôles au survol */}
                        <div 
                            onClick={handleExpand}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))',
                                display: 'flex',
                                alignItems: 'flex-end',
                                padding: '12px',
                                cursor: 'pointer'
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    color: '#fff',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    textShadow: '0 1px 3px rgba(0,0,0,0.5)'
                                }}>
                                    {state.title || 'Sans titre'}
                                </div>
                            </div>
                            <span style={{ 
                                color: '#fff', 
                                fontSize: '20px',
                                textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                            }}>⤢</span>
                        </div>
                    </div>
                )}
                
                {/* Message d'erreur si le média ne charge pas */}
                {mediaError && (
                    <div style={{
                        padding: '8px 12px',
                        backgroundColor: 'rgba(229, 9, 20, 0.9)',
                        color: '#fff',
                        fontSize: '12px',
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}>
                        <span>⚠️</span>
                        <span>{mediaError}</span>
                        <button
                            onClick={() => { setMediaError(null); resume(); }}
                            style={{
                                background: 'rgba(255,255,255,0.2)',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#fff',
                                padding: '2px 8px',
                                cursor: 'pointer',
                                fontSize: '11px'
                            }}
                        >
                            Réessayer
                        </button>
                    </div>
                )}
                
                {/* Barre de progression */}
                <div style={{
                    height: '3px',
                    background: 'rgba(255,255,255,0.1)',
                    cursor: 'pointer'
                }}>
                    <div style={{
                        height: '100%',
                        width: `${progress}%`,
                        background: isVideo ? 'linear-gradient(90deg, #e50914, #ff4040)' : 'linear-gradient(90deg, #1db954, #1ed760)',
                        transition: 'width 0.1s linear'
                    }} />
                </div>

                {/* Contenu pour audio ou contrôles pour vidéo */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: isVideo ? '8px 12px' : '12px 16px',
                    gap: '12px'
                }}>
                    {/* Thumbnail pour audio uniquement */}
                    {!isVideo && (
                        <div 
                            onClick={handleExpand}
                            style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '8px',
                                background: state.thumbnail 
                                    ? `url(${state.thumbnail}) center/cover` 
                                    : 'linear-gradient(135deg, #2a2a3e, #1a1a2e)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                flexShrink: 0,
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                        >
                            {!state.thumbnail && (
                                <span style={{ fontSize: '20px', opacity: 0.6 }}>🎵</span>
                            )}
                            {/* Overlay expand */}
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(0,0,0,0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: 0,
                                transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                            >
                                <span style={{ fontSize: '16px' }}>⤢</span>
                            </div>
                        </div>
                    )}

                    {/* Info - seulement pour audio */}
                    {!isVideo && (
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                color: '#fff',
                                fontSize: '14px',
                                fontWeight: '600',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                marginBottom: '2px'
                            }}>
                                {state.title || 'Sans titre'}
                            </div>
                            <div style={{
                                color: 'rgba(255,255,255,0.7)',
                                fontSize: '12px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}>
                                {state.artist || (state.playlist.length > 1 ? `${state.currentTrackIndex + 1}/${state.playlist.length}` : '')}
                            </div>
                        </div>
                    )}
                    
                    {/* Temps pour vidéo */}
                    {isVideo && (
                        <div style={{
                            flex: 1,
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: '12px',
                            fontFamily: 'monospace'
                        }}>
                            {formatTime(state.currentTime)} / {formatTime(state.duration)}
                        </div>
                    )}

                    {/* Contrôles */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        {/* Précédent */}
                        {state.playlist.length > 1 && (
                            <button
                                onClick={playPrevious}
                                disabled={state.currentTrackIndex === 0}
                                aria-label="Piste précédente"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: state.currentTrackIndex === 0 ? 'rgba(255,255,255,0.5)' : '#fff',
                                    fontSize: '16px',
                                    cursor: state.currentTrackIndex === 0 ? 'not-allowed' : 'pointer',
                                    padding: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'transform 0.2s'
                                }}
                                onMouseEnter={(e) => state.currentTrackIndex !== 0 && (e.currentTarget.style.transform = 'scale(1.1)')}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                ⏮
                            </button>
                        )}

                        {/* Play/Pause */}
                        <button
                            onClick={() => state.isPlaying ? pause() : resume()}
                            aria-label={state.isPlaying ? 'Mettre en pause' : 'Lire'}
                            style={{
                                background: '#fff',
                                border: 'none',
                                color: '#000',
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '14px',
                                transition: 'transform 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            {state.isPlaying ? '⏸' : '▶'}
                        </button>

                        {/* Suivant */}
                        {state.playlist.length > 1 && (
                            <button
                                onClick={playNext}
                                disabled={state.currentTrackIndex === state.playlist.length - 1}
                                aria-label="Piste suivante"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: state.currentTrackIndex === state.playlist.length - 1 ? 'rgba(255,255,255,0.5)' : '#fff',
                                    fontSize: '16px',
                                    cursor: state.currentTrackIndex === state.playlist.length - 1 ? 'not-allowed' : 'pointer',
                                    padding: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'transform 0.2s'
                                }}
                                onMouseEnter={(e) => state.currentTrackIndex !== state.playlist.length - 1 && (e.currentTarget.style.transform = 'scale(1.1)')}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                ⏭
                            </button>
                        )}

                        {/* Fermer */}
                        <button
                            onClick={stop}
                            aria-label="Fermer le lecteur"
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'rgba(255,255,255,0.7)',
                                fontSize: '18px',
                                cursor: 'pointer',
                                padding: '8px',
                                marginLeft: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'color 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Temps */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0 16px 10px',
                    fontSize: '11px',
                    color: 'rgba(255,255,255,0.7)'
                }}>
                    <span>{formatTime(state.currentTime)}</span>
                    <span>{formatTime(state.duration)}</span>
                </div>
            </div>
        </>
    );
}
