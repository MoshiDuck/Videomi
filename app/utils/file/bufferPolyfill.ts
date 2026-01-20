// INFO : app/utils/bufferPolyfill.ts
// Polyfill Buffer pour le navigateur (nécessaire pour music-metadata-browser)
// Ce fichier ne doit être chargé QUE côté client

// Ne charger que côté client (pas en SSR)
if (typeof window !== 'undefined') {
    import('buffer').then(({ Buffer }) => {
        (window as any).Buffer = Buffer;
        (window as any).global = window;
        (window as any).process = (window as any).process || { env: {} };
        
        if (typeof globalThis !== 'undefined') {
            (globalThis as any).Buffer = Buffer;
            (globalThis as any).global = globalThis;
        }
    }).catch((err) => {
        console.warn('⚠️ Erreur chargement polyfill Buffer:', err);
    });
}

// Export vide pour que TypeScript reconnaisse ce fichier comme un module
export {};
