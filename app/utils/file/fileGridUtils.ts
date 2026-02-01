// INFO : app/utils/file/fileGridUtils.ts
// Tri et regroupement des fichiers par date de création pour grilles masonry

export interface FileWithDate {
    file_id: string;
    category: string;
    size: number;
    mime_type: string;
    filename: string | null;
    created_at?: number;
    uploaded_at: number;
    file_created_at?: number | null;
    [key: string]: unknown;
}

/** Clé de tri : date de création réelle ou date d'upload en fallback */
export function getSortTimestamp(file: FileWithDate): number {
    const t = file.file_created_at ?? file.uploaded_at ?? file.created_at ?? 0;
    return typeof t === 'number' ? t : 0;
}

/** Trie les fichiers par date de création (réelle puis upload) décroissante */
export function sortByFileCreatedAt<T extends FileWithDate>(files: T[]): T[] {
    return [...files].sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
}

/** Un élément de la grille : soit une section (titre), soit un fichier */
export type MasonryGridItem<T> =
    | { type: 'section'; key: string; label: string; sortKey: number }
    | { type: 'file'; key: string; file: T };

/**
 * Groupe les fichiers par mois/année (date de création) et aplatit en liste
 * pour la grille : [ section, file, file, section, file, ... ]
 * Filtre les fichiers sans file_id valide pour éviter les erreurs de virtualisation.
 */
export function groupByMonthForMasonry<T extends FileWithDate>(files: T[]): MasonryGridItem<T>[] {
    const validFiles = (files ?? []).filter(
        (f): f is T => f != null && typeof (f as FileWithDate).file_id === 'string'
    );
    const sorted = sortByFileCreatedAt(validFiles);
    const result: MasonryGridItem<T>[] = [];
    let currentMonthKey = '';

    for (const file of sorted) {
        const ts = getSortTimestamp(file);
        const date = new Date(ts * 1000);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (monthKey !== currentMonthKey) {
            currentMonthKey = monthKey;
            result.push({
                type: 'section',
                key: `section-${monthKey}`,
                label: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
                sortKey: ts,
            });
        }

        result.push({
            type: 'file',
            key: file.file_id,
            file,
        });
    }

    return result;
}
