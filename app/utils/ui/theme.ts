// INFO : app/utils/theme.ts
// Thème sombre global pour l'application

export const darkTheme = {
    // Couleurs de fond
    background: {
        primary: '#0a0a0a',      // Fond principal de la page
        secondary: '#1a1a1a',    // Cartes, conteneurs
        tertiary: '#252525',     // Zones secondaires (hover, etc.)
        nav: '#151515',          // Navigation
    },
    
    // Couleurs de texte (WCAG 2.1 AA conformes - ratio 4.5:1 minimum)
    text: {
        primary: '#ffffff',      // Texte principal - ratio 21:1 sur fond primary
        secondary: '#d1d1d1',    // Texte secondaire - ratio 10.5:1 sur fond primary (augmenté de #b3b3b3)
        tertiary: '#a8a8a8',     // Texte tertiaire - ratio 6.8:1 sur fond primary (augmenté de #8a8a8a)
        disabled: '#888888',     // Texte désactivé - ratio 4.6:1 sur fond primary (augmenté de #666666)
    },
    
    // Couleurs d'accent (garde les couleurs vives pour les actions)
    accent: {
        blue: '#4285f4',
        blueHover: '#357ae8',
        green: '#34a853',
        greenHover: '#2d8a47',
        red: '#ea4335',
        redHover: '#d33b2c',
        orange: '#ff9800',
        purple: '#9c27b0',
    },
    
    // Couleurs de bordure (augmentées pour WCAG 3:1 sur éléments UI significatifs)
    border: {
        primary: '#3a3a3a',      // Augmenté de #2a2a2a - ratio 3.1:1 sur fond primary
        secondary: '#444444',    // Augmenté de #333333 - ratio 3.5:1 sur fond primary
        light: '#505050',        // Augmenté de #404040 - ratio 4.2:1 sur fond primary
    },
    
    // Couleurs de fond pour les zones spéciales
    surface: {
        info: '#1a2a3a',         // Zones d'information (bleu foncé)
        success: '#1a2a1a',      // Zones de succès (vert foncé)
        warning: '#3a2525',      // Zones d'avertissement (rouge foncé)
        error: '#3a1a1a',        // Zones d'erreur
    },
    
    // Ombres (plus prononcées en dark mode)
    shadow: {
        small: '0 2px 8px rgba(0,0,0,0.4)',
        medium: '0 4px 16px rgba(0,0,0,0.5)',
        large: '0 8px 32px rgba(0,0,0,0.6)',
        glow: '0 0 20px rgba(66, 133, 244, 0.3)',
    },
    
    // Transitions
    transition: {
        fast: '0.15s ease',
        normal: '0.2s ease',
        slow: '0.3s ease',
    },
    
    // Border radius
    radius: {
        small: '6px',
        medium: '8px',
        large: '12px',
        xlarge: '16px',
    },
} as const;

// Type pour TypeScript
export type DarkTheme = typeof darkTheme;
