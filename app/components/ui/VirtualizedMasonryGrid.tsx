// INFO : app/components/ui/VirtualizedMasonryGrid.tsx
// Grille masonry virtualisée (Masonic) avec sections par date

import React, { useMemo } from 'react';
import { Masonry } from 'masonic';
import { darkTheme } from '~/utils/ui/theme';
import type { MasonryGridItem } from '~/utils/file/fileGridUtils';

export interface VirtualizedMasonryGridProps<T> {
    /** Liste d’éléments (sections + fichiers) déjà triée/groupée */
    items: MasonryGridItem<T>[];
    /** Rendu d’une carte fichier (largeur = colonne) */
    renderCard: (props: { data: T; width: number }) => React.ReactNode;
    /** Largeur de colonne en px */
    columnWidth?: number;
    /** Espace entre colonnes / lignes */
    gutter?: number;
    /** Hauteur estimée d’une carte pour le calcul de virtualisation */
    itemHeightEstimate?: number;
    /** Clé unique par élément (défaut: item.key) */
    itemKey?: (item: MasonryGridItem<T>) => string;
}

function SectionCell({ label, width }: { label: string; width: number }) {
    return (
        <div
            style={{
                width,
                padding: '12px 0 8px',
                color: darkTheme.text.secondary,
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'capitalize',
                borderBottom: `1px solid ${darkTheme.border.primary}`,
            }}
        >
            {label}
        </div>
    );
}

/** Filtre les items invalides (undefined/null ou sans clé) pour éviter les erreurs Masonic lors des suppressions. */
function filterValidMasonryItems<T>(items: MasonryGridItem<T>[]): MasonryGridItem<T>[] {
    return (items ?? []).filter(
        (item): item is MasonryGridItem<T> =>
            item != null && typeof item === 'object' && typeof (item as MasonryGridItem<T>).key === 'string'
    );
}

export function VirtualizedMasonryGrid<T>({
    items,
    renderCard,
    columnWidth = 280,
    gutter = 16,
    itemHeightEstimate = 280,
    itemKey = (item) => (item != null && item.key != null ? item.key : 'fallback'),
}: VirtualizedMasonryGridProps<T>) {
    const render = useMemo(
        () =>
            function MasonryCell({
                data,
                width,
            }: {
                data: MasonryGridItem<T>;
                width: number;
                index: number;
            }) {
                if (data == null) return null;
                if (data.type === 'section') {
                    return <SectionCell label={data.label} width={width} />;
                }
                return <>{renderCard({ data: data.file, width })}</>;
            },
        [renderCard]
    );

    const validItems = filterValidMasonryItems(items);
    if (validItems.length === 0) return null;

    // Clé stable qui change à chaque modification de la liste.
    // Force un remontage complet pour éviter le bug Masonic #12 (WeakMap invalid key lors des suppressions).
    const masonryKey = validItems.map((i) => i.key).join('|');

    return (
        <Masonry
            key={masonryKey}
            items={validItems}
            render={render}
            columnWidth={columnWidth}
            columnGutter={gutter}
            rowGutter={gutter}
            itemHeightEstimate={itemHeightEstimate}
            itemKey={itemKey}
            maxColumnCount={12}
        />
    );
}
