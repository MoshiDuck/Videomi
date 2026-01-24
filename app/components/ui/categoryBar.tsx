// INFO : app/components/ui/categoryBar.tsx
// Composant réutilisable pour la barre de sélection de catégories

import React from 'react';
import { darkTheme } from '~/utils/ui/theme';
import type { FileCategory } from '~/utils/file/fileClassifier';
import { useFilesPreloader } from '~/hooks/useFilesPreloader';
import { useAuth } from '~/hooks/useAuth';
import { useLanguage } from '~/contexts/LanguageContext';

const CATEGORY_ICONS: Record<FileCategory, string> = {
    videos: '🎬',
    musics: '🎵',
    images: '🖼️',
    documents: '📄',
    archives: '📦',
    executables: '⚙️',
    others: '📎'
};

interface CategoryBarProps {
    selectedCategory: FileCategory;
    onCategoryChange: (category: FileCategory) => void;
}

const CATEGORIES: FileCategory[] = ['videos', 'musics', 'images', 'documents', 'archives', 'executables', 'others'];

export function CategoryBar({ selectedCategory, onCategoryChange }: CategoryBarProps) {
    const { user } = useAuth();
    const { t } = useLanguage();
    const { preloadCategory } = useFilesPreloader({ 
        userId: user?.id || null, 
        enabled: !!user?.id,
        preloadOnHover: true 
    });

    return (
        <div style={{
            backgroundColor: darkTheme.background.secondary,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '30px',
            boxShadow: darkTheme.shadow.medium
        }}>
            <div style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                alignItems: 'center'
            }}>
                {CATEGORIES.map(category => (
                    <button
                        key={category}
                        onClick={() => onCategoryChange(category)}
                        onMouseEnter={() => {
                            // Précharger la catégorie au survol pour navigation instantanée
                            if (selectedCategory !== category) {
                                preloadCategory(category);
                            }
                        }}
                        aria-current={selectedCategory === category ? 'page' : undefined}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '500',
                            backgroundColor: selectedCategory === category
                                ? darkTheme.accent.blue
                                : darkTheme.background.tertiary,
                            color: selectedCategory === category
                                ? '#fff'
                                : darkTheme.text.primary,
                            transition: 'all 0.2s',
                            boxShadow: selectedCategory === category
                                ? darkTheme.shadow.small
                                : 'none'
                        }}
                        onMouseOver={(e) => {
                            if (selectedCategory !== category) {
                                e.currentTarget.style.backgroundColor = darkTheme.border.secondary;
                            }
                        }}
                        onMouseOut={(e) => {
                            if (selectedCategory !== category) {
                                e.currentTarget.style.backgroundColor = darkTheme.background.tertiary;
                            }
                        }}
                    >
                        <span>{CATEGORY_ICONS[category]}</span>
                        <span>{t(`categories.${category}`)}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

export { CATEGORIES, CATEGORY_ICONS };
