// INFO : electron/preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Déterminer si on est dans Electron
const isElectron = typeof process !== 'undefined' && !!(process as any).versions?.electron;

// API Electron
const electronAPI = {
    isElectron,

    // Authentification
    openAuthWindow: (url: string) => ipcRenderer.invoke('open-auth-window', url),
    closeAuthWindow: () => ipcRenderer.invoke('close-auth-window'),
    sendOAuthToken: (token: string) => ipcRenderer.send('oauth-complete', token),

    // Écouteurs d'événements avec cleanup
    onOAuthToken: (callback: (token: string) => void) => {
        const listener = (_event: IpcRendererEvent, token: string) => callback(token);
        ipcRenderer.on('oauth-token-received', listener);
        return () => ipcRenderer.removeListener('oauth-token-received', listener);
    },

    onOAuthCancelled: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on('oauth-cancelled', listener);
        return () => ipcRenderer.removeListener('oauth-cancelled', listener);
    },

    // Navigation externe
    openExternal: (url: string) => ipcRenderer.invoke('open-external', url)
};

// API mock pour le web
const mockAPI = {
    isElectron: false,
    openAuthWindow: () => Promise.reject(new Error('Not in Electron')),
    closeAuthWindow: () => Promise.reject(new Error('Not in Electron')),
    sendOAuthToken: () => console.warn('Not in Electron'),
    onOAuthToken: () => () => {},
    onOAuthCancelled: () => () => {},
    openExternal: () => Promise.reject(new Error('Not in Electron'))
};

// Exposition de l'API
contextBridge.exposeInMainWorld('electronAPI', isElectron ? electronAPI : mockAPI);

// Détection automatique du callback OAuth dans la fenêtre d'auth
if (isElectron && window.location.href.includes('/oauth-callback')) {
    window.addEventListener('load', () => {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const idToken = params.get('id_token');

        if (idToken) {
            console.log('🔑 Token OAuth détecté dans la fenêtre de callback');
            electronAPI.sendOAuthToken(idToken);
        }
    });
}