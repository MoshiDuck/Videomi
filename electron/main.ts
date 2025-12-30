// INFO : electron/main.ts
import { app, BrowserWindow, shell, ipcMain, dialog, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

import { isDev, startUrl, preloadPath, WORKER_CONFIG } from './config.js';
import { computeFileSHA256, checkAssetExists, uploadToWorker } from './upload.js';
import {
    runFfmpegWithConcurrentUpload,
    createMetadataFile,
    getVideoDuration
} from './ffmpeg.js';
import { FileInfo } from './types.js';
import { authManager } from "./auth.js";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: true
        },
    });

    mainWindow.once('ready-to-show', () => mainWindow?.show());

    const extraHeaders = ['X-Electron-App: true'];
    mainWindow.loadURL(startUrl, {
        httpReferrer: startUrl,
        userAgent: `${mainWindow.webContents.getUserAgent()} Electron/Videomi-App`,
        extraHeaders: extraHeaders.join('\n')
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'right' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Gérer l'ouverture de liens externes
ipcMain.handle('open-external', async (_ev, url: string) => {
    try {
        await shell.openExternal(url);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: String(err) };
    }
});

// Gérer les téléchargements
ipcMain.handle('download', async (ev, { url, filename }: { url: string; filename?: string }) => {
    const focused = BrowserWindow.getFocusedWindow() || mainWindow;
    if (!focused) return { ok: false, error: 'No window' };

    let defaultName = 'download';
    if (filename) {
        defaultName = filename;
    } else {
        try {
            const u = new URL(url);
            defaultName = path.basename(u.pathname) || defaultName;
        } catch {
            const parts = url.split(/[\/\\?#]+/).filter(Boolean);
            defaultName = parts.length ? parts[parts.length - 1] : defaultName;
        }
    }

    const { filePath, canceled } = await dialog.showSaveDialog(focused, {
        defaultPath: defaultName,
    });

    if (canceled || !filePath) return { ok: false, error: 'Cancelled' };

    return new Promise((resolve) => {
        const onWillDownload = (event: Electron.Event, item: Electron.DownloadItem) => {
            if (item.getURL() !== url) return;

            item.setSavePath(filePath);

            item.once('done', (_e, state) => {
                session.defaultSession.removeListener('will-download', onWillDownload);
                if (state === 'completed') {
                    resolve({ ok: true, filePath });
                } else {
                    resolve({ ok: false, error: `Download failed: ${state}` });
                }
            });
        };

        session.defaultSession.on('will-download', onWillDownload);
        focused.webContents.downloadURL(url);
    });
});

// Sélectionner des fichiers
ipcMain.handle('select-files', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Vidéos', extensions: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'mpeg', 'mpg', '3gp', 'm4v', 'ts', 'mts', 'm2ts', 'ogv', 'qt'] },
            { name: 'Tous les fichiers', extensions: ['*'] }
        ]
    });

    if (result.canceled) {
        return [];
    }

    return result.filePaths;
});

// Obtenir les informations d'un fichier
ipcMain.handle('get-file-info', async (event, filePath: string): Promise<FileInfo> => {
    try {
        const stats = fs.statSync(filePath);
        const name = path.basename(filePath);
        return {
            name,
            path: filePath,
            size: stats.size,
            lastModified: stats.mtime,
            extension: path.extname(name).toLowerCase()
        };
    } catch (error) {
        console.error('Erreur lors de la lecture du fichier:', error);
        throw error;
    }
});

// Fonction principale pour conversion et upload avec SHA-256
async function convertAndUploadWithSHA256(
    filePath: string,
    event: Electron.IpcMainInvokeEvent,
    originalFileName: string
): Promise<any> {
    if (!authManager.isAuthenticated()) {
        throw new Error('Authentification requise. Veuillez vous connecter.');
    }

    const uid = authManager.getUID();
    if (!uid) {
        throw new Error('UID utilisateur non disponible');
    }

    console.log(`🎬 Utilisateur authentifié: UID=${uid}`);

    console.log(`🎬 ========================================`);
    console.log(`🎬 Conversion et upload avec SHA-256 pour: ${originalFileName}`);
    console.log(`🎬 ========================================`);

    const stats = fs.statSync(filePath);

    // Étape 1: Calculer le SHA-256 du fichier
    console.log(`🔐 Calcul du SHA-256...`);
    event.sender.send('upload-progress', {
        fileName: originalFileName,
        stage: 'calculating_hash',
        progress: 0
    });

    const sha256 = await computeFileSHA256(filePath);

    event.sender.send('upload-progress', {
        fileName: originalFileName,
        stage: 'calculating_hash',
        progress: 100
    });

    console.log(`✅ SHA-256 calculé: ${sha256}`);

    // Étape 2: Vérifier si l'asset existe déjà
    console.log(`🔍 Vérification de l'existence de l'asset...`);
    event.sender.send('upload-progress', {
        fileName: originalFileName,
        stage: 'checking_asset',
        progress: 0
    });

    const checkResult = await checkAssetExists(sha256);

    event.sender.send('upload-progress', {
        fileName: originalFileName,
        stage: 'checking_asset',
        progress: 100
    });

    // Si l'asset existe déjà, retourner les informations
    if (checkResult.exists && checkResult.url) {
        console.log(`✅ Asset déjà existant, skip upload`);
        return {
            success: true,
            message: 'Asset déjà existant, upload skipped',
            fileName: originalFileName,
            originalSize: stats.size,
            sha256,
            playlistUrl: checkResult.url,
            dashUrl: checkResult.url.replace('master.m3u8', 'manifest.mpd'),
            folder: `videos/${sha256}`,
            workerUrl: WORKER_CONFIG.url,
            existing: true,
            metadata: checkResult.metadata
        };
    }

    // Étape 3: Préparer l'environnement pour la conversion
    console.log(`🆕 Asset non existant, début de la conversion...`);

    const documentsDir = app.getPath('documents');
    const tempDir = path.join(documentsDir, 'videomi-conversions', crypto.randomBytes(8).toString('hex'));
    console.log(`📁 Dossier temporaire: ${tempDir}`);

    // Créer le dossier de sortie local
    const outputPath = path.join(tempDir, sha256);
    fs.mkdirSync(outputPath, { recursive: true });

    // Obtenir la durée de la vidéo
    const durationSeconds = await getVideoDuration(filePath);

    try {
        // Étape 4: Convertir et uploader avec le dossier basé sur SHA-256
        const r2Folder = `videos/${sha256}`;
        console.log(`📂 Dossier R2: ${r2Folder}`);

        event.sender.send('upload-progress', {
            fileName: originalFileName,
            stage: 'conversion_and_upload',
            progress: 0
        });

        const { m3u8Path, mpdPath, m4sFiles, subtitles } = await runFfmpegWithConcurrentUpload(
            filePath,
            outputPath,
            r2Folder,
            (stage, progress, details) => {
                event.sender.send('upload-progress', {
                    fileName: originalFileName,
                    stage,
                    progress,
                    ...details
                });
            }
        );

        console.log(`✅ Conversion terminée. Segments uploadés en parallèle`);

        // Étape 5: Créer et uploader metadata.json
        console.log(`📝 Création du metadata.json...`);
        const metadataPath = createMetadataFile(
            outputPath,
            sha256,
            originalFileName,
            stats.size,
            durationSeconds
        );

        await uploadToWorker(metadataPath, {
            key: 'metadata.json',
            folder: r2Folder,
            cacheControl: 'no-cache'
        });

        console.log(`✅ metadata.json uploadé`);

        // Uploader les init segments d'abord (s'ils n'ont pas été uploadés)
        const initSegments = m4sFiles.filter(f => path.basename(f).includes('init-stream'));
        if (initSegments.length > 0) {
            console.log(`📤 Upload des ${initSegments.length} init segments...`);
            for (const initSegment of initSegments) {
                await uploadToWorker(initSegment, {
                    key: path.basename(initSegment),
                    folder: r2Folder,
                    cacheControl: 'public, max-age=31536000, immutable'
                });
            }
        }

        // Uploader la playlist HLS
        if (m3u8Path && fs.existsSync(m3u8Path)) {
            console.log(`📤 Upload de la playlist HLS: ${m3u8Path}`);
            event.sender.send('upload-progress', {
                fileName: originalFileName,
                stage: 'upload_playlist',
                progress: 0
            });

            await uploadToWorker(m3u8Path, {
                key: 'master.m3u8',
                folder: r2Folder,
                cacheControl: 'no-cache'
            });

            event.sender.send('upload-progress', {
                fileName: originalFileName,
                stage: 'upload_playlist',
                progress: 100
            });
        }

        // Uploader le manifest DASH
        if (mpdPath && fs.existsSync(mpdPath)) {
            console.log(`📤 Upload du manifest DASH: ${mpdPath}`);
            event.sender.send('upload-progress', {
                fileName: originalFileName,
                stage: 'upload_dash',
                progress: 0
            });

            await uploadToWorker(mpdPath, {
                key: 'manifest.mpd',
                folder: r2Folder,
                cacheControl: 'no-cache'
            });

            event.sender.send('upload-progress', {
                fileName: originalFileName,
                stage: 'upload_dash',
                progress: 100
            });
        }

        // Uploader les sous-titres VTT
        const subtitleUploads: Array<any> = [];
        if (subtitles.length > 0) {
            console.log(`📤 Upload des ${subtitles.length} sous-titres VTT`);
            event.sender.send('upload-progress', {
                fileName: originalFileName,
                stage: 'upload_subtitles',
                totalSubtitles: subtitles.length,
                currentSubtitle: 0,
                progress: 0
            });

            for (let i = 0; i < subtitles.length; i++) {
                const subtitle = subtitles[i];
                const subtitleName = path.basename(subtitle.path);

                const subtitleResult = await uploadToWorker(subtitle.path, {
                    key: subtitleName,
                    folder: r2Folder,
                    cacheControl: 'no-cache'
                });

                subtitleUploads.push({
                    ...subtitleResult,
                    language: subtitle.language,
                    format: subtitle.format
                });

                const progress = Math.round(((i + 1) / subtitles.length) * 100);
                event.sender.send('upload-progress', {
                    fileName: originalFileName,
                    stage: 'upload_subtitles',
                    totalSubtitles: subtitles.length,
                    currentSubtitle: i + 1,
                    progress
                });
            }
            console.log(`✅ ${subtitleUploads.length} sous-titres uploadés`);
        }

        // Nettoyer les fichiers temporaires (seulement si tout a réussi)
        try {
            console.log(`🧹 Nettoyage des fichiers temporaires: ${tempDir}`);
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log('✅ Fichiers temporaires nettoyés');
        } catch (cleanupError) {
            console.warn('⚠️ Impossible de nettoyer les fichiers temporaires:', cleanupError);
        }

        // Générer les URLs avec le bon format de dossier
        const hlsUrl = `${WORKER_CONFIG.url}/api/streaming/${uid}/videos/${sha256}/master.m3u8`;
        const dashUrl = `${WORKER_CONFIG.url}/api/streaming/${uid}/videos/${sha256}/manifest.mpd`;

        // Générer les URLs des sous-titres
        const subtitleUrls = subtitleUploads.map(sub => ({
            url: `${WORKER_CONFIG.url}/api/streaming/${uid}/videos/${sha256}/${path.basename(sub.key)}`,
            language: sub.language,
            format: sub.format
        }));

        return {
            success: true,
            message: 'Fichier converti et uploadé en HLS/DASH avec succès',
            fileName: originalFileName,
            originalSize: stats.size,
            segmentsCount: m4sFiles.length,
            playlistUrl: hlsUrl,
            dashUrl: dashUrl,
            folder: `${uid}/videos/${sha256}`,
            sha256,
            workerUrl: WORKER_CONFIG.url,
            subtitles: subtitleUrls,
            subtitleCount: subtitleUrls.length,
            existing: false,
            metadata: {
                originalName: originalFileName,
                size_bytes: stats.size,
                duration_seconds: durationSeconds,
                sha256,
                createdAt: new Date().toISOString()
            }
        };

    } catch (error: any) {
        console.error('❌ Erreur lors de la conversion/upload:', error);
        console.error('❌ Stack trace:', error.stack);

        // Nettoyer les fichiers temporaires en cas d'erreur
        try {
            if (fs.existsSync(tempDir)) {
                console.log(`🧹 Nettoyage des fichiers temporaires après erreur`);
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        } catch (cleanupError) {
            console.warn('⚠️ Impossible de nettoyer les fichiers temporaires après erreur:', cleanupError);
        }

        throw error;
    }
}

// Handler principal pour l'upload streaming
ipcMain.handle('convert-and-upload-streaming', async (event, filePath: string) => {
    console.log(`🎬 Conversion et upload Streaming (HLS + DASH) pour: ${filePath}`);

    try {
        const stats = fs.statSync(filePath);
        const originalFileName = path.basename(filePath);

        console.log(`📄 Fichier source: ${originalFileName} (${stats.size} bytes)`);

        // Utiliser la nouvelle méthode avec SHA-256
        return await convertAndUploadWithSHA256(filePath, event, originalFileName);

    } catch (error: any) {
        console.error('❌ Erreur lors de la conversion/upload Streaming:', error);
        console.error('❌ Stack trace:', error.stack);
        throw error;
    }
});

// Handler pour la connexion (existant)
ipcMain.handle('login', async (event, { email, password }) => {
    try {
        console.log(`🔐 Tentative de connexion pour: ${email}`);
        const result = await authManager.login(email, password);

        if (result.success && result.user) {
            console.log(`✅ Connexion réussie pour: ${email}`);
            console.log(`🔄 Refresh token disponible: ${!!result.user.refreshToken}`);

            return {
                success: true,
                user: result.user,
                refreshToken: result.user.refreshToken
            };
        } else {
            console.log(`❌ Échec de connexion pour: ${email}`, result.error);
            return {
                success: false,
                error: result.error || 'Échec de connexion'
            };
        }
    } catch (error: any) {
        console.error('❌ Erreur lors de la connexion:', error);
        return {
            success: false,
            error: error.message || 'Erreur de connexion'
        };
    }
});

// Handler pour vérifier les refresh tokens
ipcMain.handle('has-refresh-token', async () => {
    const hasRT = authManager.hasRefreshToken();
    console.log(`🔍 Refresh token disponible: ${hasRT}`);
    return { hasRefreshToken: hasRT };
});

// Handler pour l'inscription - CORRIGÉ AVEC LOGS DÉTAILLÉS
ipcMain.handle('register', async (event, { email, password }) => {
    try {
        console.log(`📝 Tentative d'inscription pour: ${email}`);
        console.log(`🌐 URL du worker: ${WORKER_CONFIG.url}`);

        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`${WORKER_CONFIG.url}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Electron-App': 'true'
            },
            body: JSON.stringify({
                email,
                password,
                device: 'Electron App'
            })
        });

        console.log(`📥 Réponse d'inscription reçue, status: ${response.status}`);
        console.log(`📋 Headers de réponse:`, Object.fromEntries(response.headers.entries()));

        // Lire le corps de la réponse d'abord
        const responseText = await response.text();
        console.log(`📝 Corps de la réponse (brut):`, responseText);

        let data;
        try {
            data = JSON.parse(responseText);
            console.log('📦 Données d\'inscription (parsed):', JSON.stringify(data, null, 2));
        } catch (parseError) {
            console.error('❌ Erreur de parsing JSON:', parseError);
            console.error('❌ Corps brut qui a échoué:', responseText);
            throw new Error('Réponse invalide du serveur');
        }

        if (!response.ok) {
            console.error('❌ Erreur d\'inscription (status non OK):', data);
            throw new Error(data.error || 'Échec de l\'inscription');
        }

        // AJOUT DES LOGS DÉTAILLÉS POUR LE DÉBOGAGE
        console.log('='.repeat(80));
        console.log('🔍 DÉBOGAGE INSCRIPTION - DONNÉES COMPLÈTES:');
        console.log('- success:', data.success);
        console.log('- token présent:', !!data.token);
        console.log('- uid présent:', !!data.uid);
        console.log('- refreshToken présent:', !!data.refreshToken);
        console.log('- error:', data.error);
        console.log('- message:', data.message);
        console.log('- expiresIn:', data.expiresIn);
        console.log('='.repeat(80));

        if (data.success && data.token && data.uid) {
            // IMPORTANT: Stocker les tokens dans le gestionnaire d'auth
            console.log(`🔄 Tentative de stockage des tokens dans authManager...`);

            const success = authManager.setUser(
                data.token,
                data.refreshToken // Utiliser le refreshToken retourné par l'API
            );

            if (success) {
                console.log(`✅ Inscription réussie pour: ${email}, UID: ${data.uid}`);
                console.log(`📁 Fichier d'auth sauvegardé: ${authManager['configPath']}`);

                const userInfo = {
                    token: data.token,
                    uid: data.uid,
                    email: email,
                    id: data.uid,
                    refreshToken: data.refreshToken
                };

                return {
                    success: true,
                    user: userInfo,
                    refreshToken: data.refreshToken
                };
            } else {
                console.error('❌ Échec de l\'enregistrement local des tokens dans authManager');
                throw new Error('Échec de l\'enregistrement local des tokens');
            }
        } else {
            console.error('❌ Données d\'inscription incomplètes ou invalides:', data);
            return {
                success: false,
                error: data.error || 'Données d\'inscription incomplètes'
            };
        }
    } catch (error: any) {
        console.error('❌ ERREUR DÉTAILLÉE D\'INSCRIPTION:');
        console.error('❌ Type:', typeof error);
        console.error('❌ Message:', error.message);
        console.error('❌ Stack:', error.stack);

        if (error.code) console.error('❌ Code:', error.code);
        if (error.cause) console.error('❌ Cause:', error.cause);

        return {
            success: false,
            error: error.message || 'Erreur d\'inscription'
        };
    }
});

// Handler pour rafraîchir l'authentification - CORRIGÉ
ipcMain.handle('refresh-auth', async () => {
    try {
        console.log('🔄 Tentative de rafraîchissement du token...');

        if (!authManager.hasRefreshToken()) {
            console.log('❌ Pas de refresh token disponible');
            return {
                success: false,
                error: 'Pas de refresh token disponible'
            };
        }

        const newToken = await authManager.refreshTokenIfPossible();
        console.log(`🔁 Nouveau token généré: ${!!newToken}`);

        if (newToken) {
            return {
                success: true,
                token: newToken
            };
        } else {
            console.log('❌ Impossible de rafraîchir le token');
            return {
                success: false,
                error: 'Impossible de rafraîchir le token'
            };
        }
    } catch (error: any) {
        console.error('❌ Erreur lors du rafraîchissement:', error);
        return {
            success: false,
            error: error.message || 'Erreur de rafraîchissement'
        };
    }
});

// Handler pour la déconnexion
ipcMain.handle('logout', async (event, { refreshToken }) => {
    try {
        console.log('🔐 Déconnexion en cours...');
        await authManager.logout();
        console.log('✅ Déconnexion réussie');
        return { success: true };
    } catch (error: any) {
        console.error('❌ Erreur lors de la déconnexion:', error);
        return {
            success: false,
            error: error.message || 'Erreur de déconnexion'
        };
    }
});

// Handler pour obtenir l'utilisateur actuel
ipcMain.handle('get-current-user', () => {
    const user = authManager.getUser();
    const isAuth = authManager.isAuthenticated();
    console.log(`👤 Utilisateur actuel: ${user ? user.email : 'Aucun'}, Auth: ${isAuth}`);
    return { user, isAuthenticated: isAuth };
});

// Handler pour vérifier l'authentification
ipcMain.handle('check-auth', () => {
    const isAuth = authManager.isAuthenticated();
    console.log(`🔍 Vérification auth: ${isAuth}`);
    return { isAuthenticated: isAuth };
});

// Démarrer l'application
app.whenReady().then(() => {
    console.log('🚀 Application Electron prête');
    console.log(`🌐 URL du worker: ${WORKER_CONFIG.url}`);
    console.log(`🔧 Mode développement: ${isDev}`);

    // Vérifier l'authentification au démarrage
    console.log(`🔍 Auth au démarrage: ${authManager.isAuthenticated()}`);
    console.log(`🔄 Refresh token disponible: ${authManager.hasRefreshToken()}`);

    // Afficher le chemin du fichier d'auth
    console.log(`📁 Chemin du fichier d'auth: ${authManager['configPath']}`);

    // Forcer TLS 1.2+ au niveau de l'application
    app.commandLine.appendSwitch('ssl-version-min', 'tls1.2');
    app.commandLine.appendSwitch('ssl-version-max', 'tls1.3');
    app.commandLine.appendSwitch('cipher-suite-blacklist', '0x0004,0x0005');

    if (process.platform === 'win32') {
        app.setAppUserModelId('com.videomi.app');
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    console.log('🔚 Toutes les fenêtres fermées');
    if (process.platform !== 'darwin') {
        app.quit();
    }
});