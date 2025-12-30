// INFO : electron/config.ts
import * as path from 'path';
import * as dotenv from 'dotenv';

// Charger les variables d'environnement dès le début
dotenv.config();

export const isDev = process.env.ELECTRON_START_URL ? true : false;
export const startUrl = process.env.ELECTRON_START_URL || 'https://videomi.uk';
export const preloadPath = path.join(process.cwd(), 'dist', 'electron', 'preload.js');

// Configuration Cloudflare Worker
export const WORKER_CONFIG = {
    url: process.env.WORKER_URL || 'https://your-worker.your-account.workers.dev',
    defaultUploadHeaders: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*'
    }
};

// Afficher pour débogage
console.log('🔧 Configuration chargée:');
console.log('📡 WORKER_URL:', WORKER_CONFIG.url);
console.log('🌍 isDev:', isDev);