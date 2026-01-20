// INFO : electron/main.ts
import { app, BrowserWindow, shell, session, ipcMain, IpcMainInvokeEvent } from 'electron';
import {
    IS_DEV,
    START_URL,
    PRELOAD_PATH,
    MAIN_WINDOW_CSP,
    AUTH_WINDOW_CSP
} from './config.js';

// Types
interface AuthCallbackUrl {
    url: string;
    hasToken: boolean;
    token?: string | null;
}

// Variables globales
let mainWindow: BrowserWindow | null = null;
let authWindow: BrowserWindow | null = null;

// Configuration commune pour les fenêtres
const WINDOW_CONFIG = {
    preload: PRELOAD_PATH,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    sandbox: false
} as const;

// Création de la fenêtre principale
function createMainWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: WINDOW_CONFIG
    });

    setupCSPHeaders(mainWindow, MAIN_WINDOW_CSP);
    setupWindowOpenHandler(mainWindow);

    mainWindow.loadURL(START_URL);

    if (IS_DEV) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Configuration des en-têtes CSP
function setupCSPHeaders(window: BrowserWindow, csp: string): void {
    window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        const responseHeaders = details.responseHeaders || {};

        if (csp.includes('*')) {
            // Pour la fenêtre d'authentification permissive
            delete responseHeaders['content-security-policy'];
            delete responseHeaders['content-security-policy-report-only'];
        }

        responseHeaders['content-security-policy'] = [csp];

        // En-têtes supplémentaires pour la fenêtre d'authentification
        if (csp.includes('*')) {
            responseHeaders['access-control-allow-origin'] = ['*'];
            responseHeaders['access-control-allow-methods'] = ['GET, POST, OPTIONS'];
        }

        callback({ responseHeaders });
    });
}

// Gestionnaire d'ouverture de fenêtre
function setupWindowOpenHandler(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler(({ url }) => {
        console.log('Tentative d\'ouverture de fenêtre:', url);

        if (isAuthUrl(url)) {
            createAuthWindow(url);
            return { action: 'deny' };
        }

        shell.openExternal(url);
        return { action: 'deny' };
    });
}

// Vérification des URLs d'authentification
function isAuthUrl(url: string): boolean {
    return url.includes('accounts.google.com') || url.includes('/api/auth/google');
}

// Création de la fenêtre d'authentification
function createAuthWindow(url: string): void {
    if (authWindow) {
        authWindow.focus();
        return;
    }

    authWindow = new BrowserWindow({
        parent: mainWindow!,
        modal: true,
        show: false,
        width: 800,
        height: 600,
        webPreferences: WINDOW_CONFIG
    });

    setupCSPHeaders(authWindow, AUTH_WINDOW_CSP);
    setupAuthWindowHandlers(authWindow, url);

    authWindow.loadURL(url);
    authWindow.show();

    if (IS_DEV) {
        authWindow.webContents.openDevTools();
    }

    authWindow.on('closed', () => {
        authWindow = null;
        mainWindow?.webContents.send('oauth-cancelled');
    });
}

// Configuration des handlers pour la fenêtre d'authentification
function setupAuthWindowHandlers(window: BrowserWindow, initialUrl: string): void {
    // Écoute des redirections OAuth
    window.webContents.on('will-redirect', (event, newUrl) => {
        console.log('🔄 Redirection OAuth détectée:', newUrl);

        if (isOAuthCallback(newUrl)) {
            event.preventDefault();
            handleOAuthCallback(newUrl, window);
        }
    });

    // Écoute des messages IPC depuis le preload
    window.webContents.on('ipc-message', (event, channel, ...args) => {
        if (channel === 'oauth-complete' && mainWindow) {
            const token = args[0];
            mainWindow.webContents.send('oauth-token-received', token);
            closeAuthWindow();
        }
    });

    // Gestion des erreurs de chargement
    window.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error('❌ Erreur de chargement dans authWindow:', {
            errorCode,
            errorDescription,
            validatedURL
        });
    });
}

// Vérification d'une URL de callback OAuth
function isOAuthCallback(url: string): boolean {
    return url.includes('/oauth-callback') || url.includes('id_token=');
}

// Extraction du token depuis l'URL
function extractTokenFromUrl(url: string): string | null {
    try {
        const urlObj = new URL(url);

        // Vérifier le fragment URL (hash)
        if (urlObj.hash) {
            const hashParams = new URLSearchParams(urlObj.hash.substring(1));
            const tokenFromHash = hashParams.get('id_token');
            if (tokenFromHash) return tokenFromHash;
        }

        // Vérifier les paramètres de recherche
        return urlObj.searchParams.get('id_token');
    } catch (error) {
        console.error('Erreur lors de l\'extraction du token:', error);
        return null;
    }
}

// Gestion du callback OAuth
function handleOAuthCallback(url: string, window: BrowserWindow): void {
    const token = extractTokenFromUrl(url);

    if (token && mainWindow) {
        console.log('✅ Token extrait, fermeture de la fenêtre d\'auth');
        mainWindow.webContents.send('oauth-token-received', token);
        setTimeout(() => closeAuthWindow(), 500);
    } else {
        console.warn('⚠️ Aucun token trouvé dans l\'URL de callback');
        window.loadURL(url); // Laisser la page extraire le token
    }
}

// Fermeture de la fenêtre d'authentification
function closeAuthWindow(): void {
    if (authWindow) {
        authWindow.close();
        authWindow = null;
    }
}

// Gestionnaires IPC
ipcMain.handle('open-auth-window', (event: IpcMainInvokeEvent, url: string) => {
    createAuthWindow(url);
});

ipcMain.handle('close-auth-window', closeAuthWindow);

ipcMain.handle('open-external', (event: IpcMainInvokeEvent, url: string) => {
    shell.openExternal(url);
});

// Lifecycle de l'application
app.whenReady().then(() => {
    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});