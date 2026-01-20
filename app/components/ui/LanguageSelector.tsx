// INFO : app/components/ui/LanguageSelector.tsx
// Sélecteur de langue
import React from 'react';
import { useLanguage } from '~/contexts/LanguageContext';
import { type Language } from '~/utils/i18n';
import { darkTheme } from '~/utils/ui/theme';
import { Tooltip } from '~/components/ui/Tooltip';

const languages: Array<{ code: Language; name: string; flag: string }> = [
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' }
];

interface LanguageSelectorProps {
    compact?: boolean;
}

export function LanguageSelector({ compact = false }: LanguageSelectorProps) {
    const { language, setLanguage } = useLanguage();

    if (compact) {
        // Version compacte : dropdown
        return (
            <div style={{ position: 'relative', display: 'inline-block' }}>
                <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as Language)}
                    style={{
                        backgroundColor: darkTheme.background.secondary,
                        color: darkTheme.text.primary,
                        border: `1px solid ${darkTheme.background.tertiary}`,
                        borderRadius: '8px',
                        padding: '8px 32px 8px 12px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23${darkTheme.text.secondary.replace('#', '')}' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 10px center',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = darkTheme.accent.blue;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = darkTheme.background.tertiary;
                    }}
                >
                    {languages.map(lang => (
                        <option key={lang.code} value={lang.code}>
                            {lang.flag} {lang.name}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    // Version complète : boutons avec tooltips
    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {languages.map(lang => (
                <Tooltip key={lang.code} content={lang.name} position="top">
                    <button
                        onClick={() => setLanguage(lang.code)}
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '8px',
                            border: `2px solid ${language === lang.code ? darkTheme.accent.blue : darkTheme.background.tertiary}`,
                            backgroundColor: language === lang.code 
                                ? darkTheme.surface.info 
                                : darkTheme.background.secondary,
                            fontSize: '20px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            padding: 0
                        }}
                        onMouseEnter={(e) => {
                            if (language !== lang.code) {
                                e.currentTarget.style.borderColor = darkTheme.accent.blue;
                                e.currentTarget.style.backgroundColor = darkTheme.background.tertiary;
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (language !== lang.code) {
                                e.currentTarget.style.borderColor = darkTheme.background.tertiary;
                                e.currentTarget.style.backgroundColor = darkTheme.background.secondary;
                            }
                        }}
                    >
                        {lang.flag}
                    </button>
                </Tooltip>
            ))}
        </div>
    );
}
