// INFO : app/components/ui/PdfFirstPagePreview.tsx
// Aperçu de la première page d’un PDF via PDF.js (canvas), avec auth.

import React, { useEffect, useRef, useState } from 'react';
import { darkTheme } from '~/utils/ui/theme';

// Worker PDF.js pour Vite (résolution au build)
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

export interface PdfFirstPagePreviewProps {
    /** URL du PDF (doit être accessible avec le token si fourni) */
    url: string;
    /** Token Bearer pour l’API (optionnel) */
    token?: string | null;
    /** Largeur du conteneur (px). La hauteur est déduite du ratio de la page. */
    width: number;
    /** Hauteur max ou fixe (px). Si non fourni, déduit du viewport. */
    height?: number;
    /** Ratio d’aspect forcé (ex. 1/1.414 pour A4). Si non fourni, utilise le ratio de la page. */
    aspectRatio?: number;
    className?: string;
    style?: React.CSSProperties;
}

export function PdfFirstPagePreview({
    url,
    token,
    width,
    height: heightProp,
    aspectRatio,
    className,
    style,
}: PdfFirstPagePreviewProps) {
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setError(false);
        setLoading(true);

        const run = async () => {
            try {
                const headers: HeadersInit = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;
                const res = await fetch(url, { headers });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const arrayBuffer = await res.arrayBuffer();

                if (cancelled) return;

                const pdfjsLib = await import('pdfjs-dist');
                if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker as string;
                }

                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                if (cancelled) return;

                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 1 });
                const scale = width / viewport.width;
                const scaledViewport = page.getViewport({ scale });

                if (cancelled) return;

                const canvas = document.createElement('canvas');
                canvas.width = scaledViewport.width;
                canvas.height = scaledViewport.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Canvas 2D not available');

                await page.render({
                    canvasContext: ctx,
                    viewport: scaledViewport,
                    intent: 'display',
                }).promise;

                if (cancelled) return;

                const container = canvasContainerRef.current;
                if (!container) return;
                container.innerHTML = '';
                container.appendChild(canvas);
                setError(false);
            } catch (e) {
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [url, token, width]);

    const displayHeight = heightProp ?? (aspectRatio != null ? width / aspectRatio : width / (1 / 1.414));

    return (
        <div
            className={className}
            style={{
                position: 'relative',
                width,
                minHeight: displayHeight,
                backgroundColor: darkTheme.background.tertiary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                ...style,
            }}
        >
            {loading && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: darkTheme.text.tertiary,
                        fontSize: '14px',
                        zIndex: 1,
                    }}
                >
                    …
                </div>
            )}
            {error && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: darkTheme.text.tertiary,
                        fontSize: '14px',
                        zIndex: 1,
                    }}
                >
                    <span style={{ fontSize: '32px', marginBottom: '8px' }}>📄</span>
                    <span>Aperçu indisponible</span>
                </div>
            )}
            <div ref={canvasContainerRef} style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }} />
        </div>
    );
}
