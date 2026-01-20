// INFO : app/components/ui/VideoSubCategoryBar.tsx
// Sous-barre de navigation pour Films et Séries

import React from 'react';
import { darkTheme } from '~/utils/ui/theme';
import { useLanguage } from '~/contexts/LanguageContext';

export type VideoSubCategory = 'films' | 'series';

interface VideoSubCategoryBarProps {
    selectedSubCategory: VideoSubCategory;
    onSubCategoryChange: (subCategory: VideoSubCategory) => void;
}

export function VideoSubCategoryBar({ selectedSubCategory, onSubCategoryChange }: VideoSubCategoryBarProps) {
    const { t } = useLanguage();

    const subCategories: Array<{ key: VideoSubCategory; label: string; icon: string }> = [
        { key: 'films', label: t('videos.films'), icon: '🎬' },
        { key: 'series', label: t('videos.series'), icon: '📺' }
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
