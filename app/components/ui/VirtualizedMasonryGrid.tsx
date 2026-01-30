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

export function VirtualizedMasonryGrid<T>({
    items,
    renderCard,
    columnWidth = 280,
    gutter = 16,
    itemHeightEstimate = 280,
    itemKey = (item) => item.key,
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
                if (data.type === 'section') {
                    return <SectionCell label={data.label} width={width} />;
                }
                return <>{renderCard({ data: data.file, width })}</>;
            },
        [renderCard]
    );

    if (items.length === 0) return null;

    return (
        <Masonry
            items={items}
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
