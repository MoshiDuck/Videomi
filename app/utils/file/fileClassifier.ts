// INFO : app/utils/fileClassifier.ts
// Classification des fichiers pour déterminer s'ils doivent être transcodés
// Seuls 'videos' et 'musics' sont transcodés avec WebCodecs pour Shaka Player
export type FileCategory =
    | 'videos'      // Transcoder avec WebCodecs pour Shaka Player
    | 'musics'      // Transcoder avec WebCodecs pour Shaka Player
    | 'images'      // Ne pas transcoder (JPEG, PNG, NEF, etc.)
    | 'documents'   // Ne pas transcoder
    | 'archives'    // Ne pas transcoder
    | 'executables' // Ne pas transcoder
    | 'others';     // Ne pas transcoder

export interface FileMetadata {
    id: string;
    name: string;
    size: number;
    type: string;
    category: FileCategory;
    lastModified: number;
    hash?: string;
}

// Classification des fichiers par MIME type
const MIME_CATEGORIES: Record<string, FileCategory> = {
    // Vidéos
    'video/mp4': 'videos',
    'video/webm': 'videos',
    'video/quicktime': 'videos',
    'video/x-msvideo': 'videos',
    'video/x-matroska': 'videos',
    'video/ogg': 'videos',

    // Musiques
    'audio/mpeg': 'musics',
    'audio/wav': 'musics',
    'audio/ogg': 'musics',
    'audio/flac': 'musics',
    'audio/aac': 'musics',
    'audio/x-m4a': 'musics',

    // Images
    'image/jpeg': 'images',
    'image/png': 'images',
    'image/gif': 'images',
    'image/webp': 'images',
    'image/svg+xml': 'images',
    'image/bmp': 'images',

    // Documents
    'application/pdf': 'documents',
    'application/msword': 'documents',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'documents',
    'application/vnd.ms-excel': 'documents',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'documents',
    'text/plain': 'documents',
    'text/html': 'documents',
    'text/csv': 'documents',

    // Archives
    'application/zip': 'archives',
    'application/x-rar-compressed': 'archives',
    'application/x-tar': 'archives',
    'application/gzip': 'archives',
    'application/x-7z-compressed': 'archives',

    // Exécutables
    'application/x-msdownload': 'executables',
    'application/x-executable': 'executables',
    'application/x-mach-binary': 'executables',
    'application/vnd.apple.installer+xml': 'executables',
    'application/x-apple-diskimage': 'executables', // DMG
    'application/vnd.android.package-archive': 'executables', // APK
    'application/x-ipynb': 'executables', // Ne pas confondre avec archives
};

// Classification par extension pour les cas limites
const EXTENSION_CATEGORIES: Record<string, FileCategory> = {
    '.mp4': 'videos',
    '.avi': 'videos',
    '.mov': 'videos',
    '.mkv': 'videos',
    '.mp3': 'musics',
    '.wav': 'musics',
    '.flac': 'musics',
    '.jpg': 'images',
    '.jpeg': 'images',
    '.png': 'images',
    '.gif': 'images',
    '.nef': 'images',
    '.pdf': 'documents',
    '.doc': 'documents',
    '.docx': 'documents',
    '.xls': 'documents',
    '.xlsx': 'documents',
    '.txt': 'documents',
    '.zip': 'archives',
    '.rar': 'archives',
    '.tar': 'archives',
    '.gz': 'archives',
    '.exe': 'executables',
    '.dmg': 'executables',
    '.pkg': 'executables',
    '.msi': 'executables',
    '.app': 'executables',
    '.deb': 'executables',
    '.rpm': 'executables',
    '.appimage': 'executables',
    '.run': 'executables',
    '.bin': 'executables',
    '.sh': 'executables',
    '.bat': 'executables',
    '.cmd': 'executables',
    '.com': 'executables',
    '.scr': 'executables',
    '.appx': 'executables',
    '.apk': 'executables',
    '.ipa': 'executables',
};

export function classifyFile(file: File): FileCategory {
    // Liste des extensions d'exécutables (priorité absolue)
    const executableExtensions = ['.exe', '.dmg', '.pkg', '.msi', '.app', '.deb', '.rpm', '.AppImage', '.run', '.bin', '.sh', '.bat', '.cmd', '.com', '.scr', '.appx', '.apk', '.ipa'];
    
    // 1. PRIORITÉ : Vérifier d'abord les extensions d'exécutables
    // Les exécutables doivent avoir la priorité absolue pour éviter qu'ils soient classés comme archives
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (extension) {
        const lowerExtension = extension.toLowerCase();
        
        // Vérifier si c'est un exécutable
        if (executableExtensions.some(ext => lowerExtension === ext || file.name.toLowerCase().endsWith(ext.toLowerCase()))) {
            return 'executables';
        }
        
        // Ensuite vérifier les autres extensions
        if (EXTENSION_CATEGORIES[lowerExtension]) {
            return EXTENSION_CATEGORIES[lowerExtension];
        }
    }

    // 2. Essayez par MIME type (mais pas pour les exécutables, déjà traités)
    // Certains MIME types peuvent être ambigus (ex: application/zip pour certains exécutables)
    if (MIME_CATEGORIES[file.type]) {
        // Double vérification : si le MIME type dit "archive" mais l'extension est exécutable, priorité à l'extension
        const category = MIME_CATEGORIES[file.type];
        if (category === 'archives' && extension) {
            // Ne pas classer comme archive si l'extension suggère un exécutable
            const nameLower = file.name.toLowerCase();
            if (executableExtensions.some(ext => nameLower.endsWith(ext.toLowerCase()))) {
                return 'executables';
            }
        }
        return category;
    }

    // 3. Vérifier le nom pour les vidéos/audio
    const name = file.name.toLowerCase();
    if (name.match(/\.(mp4|avi|mov|mkv|webm|flv|wmv|m4v|mpg|mpeg)$/)) {
        return 'videos';
    }
    if (name.match(/\.(mp3|wav|aac|flac|ogg|m4a|wma)$/)) {
        return 'musics';
    }

    return 'others';
}

/**
 * Détermine si un fichier doit être transcodé.
 * Seuls les fichiers vidéo et musique sont transcodés avec WebCodecs
 * pour être compatibles avec Shaka Player.
 * Les autres fichiers (images, documents, archives, etc.) ne sont pas transcodés.
 */
export function shouldTranscode(category: FileCategory): boolean {
    // Transcoder uniquement les vidéos et musiques pour Shaka Player
    return category === 'videos' || category === 'musics';
}

export function getR2Path(category: FileCategory, fileId: string, filename?: string): string {
    if (filename) {
        return `videomi/${category}/${fileId}/${filename}`;
    }
    return `videomi/${category}/${fileId}`;
}