// INFO : electron/config.ts
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Constantes exportées
export const IS_DEV = Boolean(process.env.ELECTRON_START_URL);
export const START_URL = process.env.ELECTRON_START_URL || 'https://videomi.uk';
export const PRELOAD_PATH = path.join(process.cwd(), 'dist', 'electron', 'preload.js');
export const WORKER_URL = process.env.WORKER_URL || 'https://your-worker.your-account.workers.dev';

// Configuration CSP
export const MAIN_WINDOW_CSP = [
    "default-src 'self' https://videomi.uk https://accounts.google.com https://www.googleapis.com",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://www.gstatic.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com https://www.gstatic.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://videomi.uk https://accounts.google.com https://www.googleapis.com",
    "frame-src 'self' https://accounts.google.com",
    "worker-src 'self' blob:",
    "child-src 'self' blob:"
].join('; ');

export const AUTH_WINDOW_CSP = [
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
    "script-src * 'unsafe-inline' 'unsafe-eval'",
    "style-src * 'unsafe-inline'",
    "img-src * data: blob:",
    "font-src *",
    "connect-src *",
    "frame-src *",
    "media-src *"
].join('; ');

// Configuration par défaut pour les en-têtes d'upload
export const DEFAULT_UPLOAD_HEADERS = {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*'
};

// Debug log
console.log('🔧 Configuration chargée:');
console.log('📡 WORKER_URL:', WORKER_URL);
console.log('🌍 IS_DEV:', IS_DEV);