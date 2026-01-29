// INFO : app/utils/routes.ts
// Mapping centralisé des catégories vers leurs routes

import type { FileCategory } from '~/utils/file/fileClassifier';

/**
 * Mapping des catégories de fichiers vers leurs routes correspondantes
 */
export const CATEGORY_ROUTES: Record<FileCategory, string> = {
    'videos': '/films',  // Les vidéos redirigent vers /films par défaut
    'musics': '/musics',
    'images': '/images',
    'raw_images': '/images', // Les images RAW sont fusionnées avec images
    'documents': '/documents',
    'books': '/books',
    'ebooks': '/books',
    'comics': '/books',
    'manga': '/books',
    'archives': '/archives',
    'executables': '/executables',
    'others': '/others'
};

/**
 * Obtient la route correspondant à une catégorie
 */
export function getCategoryRoute(category: FileCategory): string {
    return CATEGORY_ROUTES[category] || '/videos';
}

/**
 * Obtient la catégorie à partir d'un pathname
 */
export function getCategoryFromPathname(pathname: string): FileCategory | null {
    // Gérer /films et /series comme des sous-catégories de videos
    if (pathname === '/films' || pathname === '/series') {
        return 'videos';
    }
    if (pathname === '/books') {
        return 'books';
    }
    for (const [category, route] of Object.entries(CATEGORY_ROUTES) as Array<[FileCategory, string]>) {
        if (pathname === route) {
            return category;
        }
    }
    return null;
}
