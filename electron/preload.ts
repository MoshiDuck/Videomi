// INFO : electron/preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const isElectron = typeof process !== 'undefined' && !!(process as any).versions?.electron;
type UploadProgressPayload = { [key: string]: any };

if (isElectron) {
    console.log('🔌 Preload.js chargé en mode Electron');

    contextBridge.exposeInMainWorld('electronAPI', {
        // NOUVELLE API D'INSCRIPTION
        register: async (email: string, password: string) => {
            const result = await ipcRenderer.invoke('register', { email, password });

            // Stocker les tokens dans localStorage pour le frontend Electron
            if (result.success && result.user) {
                localStorage.setItem('token', result.user.token);
                if (result.refreshToken) {
                    localStorage.setItem('refreshToken', result.refreshToken);
                }
                console.log('✅ Tokens stockés dans localStorage après inscription');
            }

            return result;
        },

        // Authentification avec support refresh token
        login: async (email: string, password: string) => {
            const result = await ipcRenderer.invoke('login', { email, password });

            // Stocker le refresh token dans localStorage pour le frontend Electron
            if (result.success && result.refreshToken) {
                localStorage.setItem('refreshToken', result.refreshToken);
                console.log('✅ Refresh token stocké dans localStorage');
            }

            return result;
        },

        logout: async () => {
            // Récupérer le refresh token du localStorage avant déconnexion
            const refreshToken = localStorage.getItem('refreshToken');
            const result = await ipcRenderer.invoke('logout', { refreshToken });

            // Nettoyer le localStorage
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('token');

            return result;
        },

        getCurrentUser: async () => {
            return await ipcRenderer.invoke('get-current-user');
        },

        checkAuth: async () => {
            return await ipcRenderer.invoke('check-auth');
        },

        hasRefreshToken: async () => {
            return await ipcRenderer.invoke('has-refresh-token');
        },

        refreshAuth: async () => {
            console.log('🔄 Appel à refreshAuth depuis le frontend');
            const result = await ipcRenderer.invoke('refresh-auth');
            console.log('📥 Résultat de refreshAuth:', result);
            return result;
        },

        // [Les APIs existantes restent inchangées...]
        openExternal: async (url: string) => {
            console.log(`🌐 openExternal: ${url}`);
            return await ipcRenderer.invoke('open-external', url);
        },

        download: async (url: string, filename?: string) => {
            console.log(`📥 download: ${url}, filename: ${filename}`);
            return await ipcRenderer.invoke('download', { url, filename });
        },

        selectFiles: async (): Promise<string[]> => {
            console.log('📁 Sélection de fichiers demandée');
            return await ipcRenderer.invoke('select-files');
        },

        getFileInfo: async (filePath: string) => {
            console.log(`📄 getFileInfo: ${filePath}`);
            return await ipcRenderer.invoke('get-file-info', filePath);
        },

        convertAndUploadToHLS: async (filePath: string) => {
            console.log(`🎬 Conversion HLS demandée pour: ${filePath}`);
            return await ipcRenderer.invoke('convert-and-upload-streaming', filePath);
        },

        convertAndUploadToStreaming: async (filePath: string) => {
            console.log(`🎬 Conversion Streaming (HLS+DASH) demandée pour: ${filePath}`);
            return await ipcRenderer.invoke('convert-and-upload-streaming', filePath);
        },

        onUploadProgress: (callback: (progress: UploadProgressPayload) => void) => {
            console.log('🎯 Enregistrement de l\'écouteur de progression');
            const handler = (_ev: IpcRendererEvent, progress: UploadProgressPayload) => {
                console.log('📨 Événement de progression reçu dans preload:', progress);
                callback(progress);
            };
            ipcRenderer.on('upload-progress', handler);
            return () => {
                ipcRenderer.removeListener('upload-progress', handler);
            };
        },

        removeUploadProgressListener: () => {
            console.log('🧹 Suppression des écouteurs de progression');
            ipcRenderer.removeAllListeners('upload-progress');
        },

        isElectron: true
    });
} else {
    console.log('🌐 Preload.js chargé en mode web');

    contextBridge.exposeInMainWorld('electronAPI', {
        // Authentification web
        register: async () => ({ success: false, error: 'Not in Electron' }),
        login: async () => ({ success: false, error: 'Not in Electron' }),
        logout: async () => ({ success: false, error: 'Not in Electron' }),
        getCurrentUser: async () => ({ user: null, isAuthenticated: false }),
        checkAuth: async () => ({ isAuthenticated: false }),
        hasRefreshToken: async () => ({ hasRefreshToken: false }),
        refreshAuth: async () => ({ success: false, error: 'Not in Electron' }),

        // Autres APIs
        openExternal: async () => ({ ok: false, error: 'Not in Electron' }),
        download: async () => ({ ok: false, error: 'Not in Electron' }),
        selectFiles: async () => [],
        getFileInfo: async () => null,
        convertAndUploadToHLS: async () => ({ success: false, error: 'Not in Electron' }),
        convertAndUploadToStreaming: async () => ({ success: false, error: 'Not in Electron' }),
        onUploadProgress: () => () => {},
        removeUploadProgressListener: () => {},
        isElectron: false
    });
}