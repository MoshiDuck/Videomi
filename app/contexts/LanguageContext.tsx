// INFO : app/contexts/LanguageContext.tsx
// Contexte pour la gestion des langues
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { detectLanguage, translations, type Language, type Translations } from '~/utils/i18n';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string | any;
    translations: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'videomi_language';

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(() => {
        // Pour SSR, toujours retourner 'fr' par défaut
        // La détection se fera côté client dans useEffect
        if (typeof window === 'undefined') {
            return 'fr';
        }
        
        // Charger depuis localStorage ou détecter (côté client uniquement)
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored && (stored === 'fr' || stored === 'en' || stored === 'es' || stored === 'de')) {
                return stored as Language;
            }
        } catch (e) {
            // localStorage peut être indisponible
        }
        
        return detectLanguage();
    });

    // Détecter et mettre à jour la langue au montage côté client
    useEffect(() => {
        if (typeof window !== 'undefined') {
            // Si pas de langue stockée, détecter
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (!stored) {
                    const detected = detectLanguage();
                    setLanguageState(detected);
                    localStorage.setItem(STORAGE_KEY, detected);
                    document.documentElement.lang = detected;
                }
            } catch (e) {
                // Ignorer les erreurs
            }
        }
    }, []);

    // Sauvegarder dans localStorage quand la langue change
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, language);
            // Mettre à jour l'attribut lang de la balise html
            document.documentElement.lang = language;
        }
    }, [language]);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, lang);
            document.documentElement.lang = lang;
        }
    };

    // Fonction de traduction
    const t = (key: string): string | any => {
        const keys = key.split('.');
        let value: any = translations[language];
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                console.warn(`Translation key not found: ${key}`);
                return key; // Retourner la clé si la traduction n'existe pas
            }
        }
        
        return value;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t, translations: translations[language] }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
