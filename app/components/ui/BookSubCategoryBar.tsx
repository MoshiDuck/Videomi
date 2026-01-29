// INFO : app/components/ui/BookSubCategoryBar.tsx
// Sous-barre de navigation pour Livre numérique, Comics et Manga

import React from 'react';
import { darkTheme } from '~/utils/ui/theme';
import { useLanguage } from '~/contexts/LanguageContext';

export type BookSubCategory = 'ebooks' | 'comics' | 'manga';

interface BookSubCategoryBarProps {
    selectedSubCategory: BookSubCategory;
    onSubCategoryChange: (subCategory: BookSubCategory) => void;
}

export function BookSubCategoryBar({ selectedSubCategory, onSubCategoryChange }: BookSubCategoryBarProps) {
    const { t } = useLanguage();

    const subCategories: Array<{ key: BookSubCategory; label: string; icon: string }> = [
        { key: 'ebooks', label: t('books.ebooks'), icon: '📖' },
        { key: 'comics', label: t('books.comics'), icon: '🦸' },
        { key: 'manga', label: t('books.manga'), icon: '📕' }
    ];

    return (
        <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '24px',
            padding: '4px',
            backgroundColor: darkTheme.background.tertiary,
            borderRadius: '12px',
            width: 'fit-content'
        }}>
            {subCategories.map(({ key, label, icon }) => {
                const isSelected = selectedSubCategory === key;
                return (
                    <button
                        key={key}
                        onClick={() => onSubCategoryChange(key)}
                        aria-current={isSelected ? 'page' : undefined}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 20px',
                            backgroundColor: isSelected ? darkTheme.accent.blue : 'transparent',
                            color: isSelected ? '#fff' : darkTheme.text.secondary,
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: isSelected ? '600' : '500',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                            if (!isSelected) {
                                e.currentTarget.style.backgroundColor = darkTheme.background.secondary;
                                e.currentTarget.style.color = darkTheme.text.primary;
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isSelected) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = darkTheme.text.secondary;
                            }
                        }}
                    >
                        <span>{icon}</span>
                        <span>{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
