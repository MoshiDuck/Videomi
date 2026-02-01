// INFO : app/components/ui/VirtualizedMasonryGrid.tsx
// Grille masonry virtualisée (Masonic) avec sections par date

import React, { useMemo } from 'react';
import { Masonry } from 'masonic';
import { darkTheme } from '~/utils/ui/theme';
import type { MasonryGridItem, MasonrySection } from '~/utils/file/fileGridUtils';

export interface SectionedMasonryGridProps<T> {
    /** Sections (date + fichiers) à afficher, empilées verticalement */
    sections: MasonrySection<T>[];
    /** Rendu d'une carte fichier (largeur = colonne) */
    renderCard: (props: { data: T; width: number }) => React.ReactNode;
    /** Largeur de colonne en px */
    columnWidth?: number;
    /** Espace entre colonnes / lignes */
    gutter?: number;
    /** Hauteur estimée d'une carte pour le calcul de virtualisation */
    itemHeightEstimate?: number;
    /** Clé unique par item (défaut: file_id) */
    itemKey?: (item: T, index: number) => string | number;
}

/** Grille par sections : chaque date en haut à gauche, ses items en dessous, section suivante sous la dernière image. */
export function SectionedMasonryGrid<T>({
    sections,
    renderCard,
    columnWidth = 280,
    gutter = 16,
    itemHeightEstimate = 280,
    itemKey: customItemKey,
}: SectionedMasonryGridProps<T>) {
    const defaultItemKey = (item: T, index: number) => {
        const f = item as { file_id?: string };
        return f?.file_id ?? `item-${index}`;
    };
    const itemKey = customItemKey ?? defaultItemKey;

    const render = useMemo(
        () =>
            function MasonryCell({ data, width }: { data: T; width: number }) {
                if (data == null) return null;
                return <>{renderCard({ data, width })}</>;
            },
        [renderCard]
    );

    if (!sections?.length) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {sections.map((section) => (
                <div key={section.key} style={{ marginBottom: 24 }}>
                    <div
                        style={{
                            width: '100%',
                            padding: '12px 0 8px',
                            color: darkTheme.text.secondary,
                            fontSize: '14px',
                            fontWeight: 600,
                            textTransform: 'capitalize',
                            borderBottom: `1px solid ${darkTheme.border.primary}`,
                        }}
                    >
                        {section.label}
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <Masonry
                            key={section.key}
                            items={section.files}
                            render={render}
                            columnWidth={columnWidth}
                            columnGutter={gutter}
                            rowGutter={gutter}
                            itemHeightEstimate={itemHeightEstimate}
                            itemKey={itemKey}
                            maxColumnCount={12}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

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
