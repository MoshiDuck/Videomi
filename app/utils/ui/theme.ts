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
    
    // Couleurs de texte
    text: {
        primary: '#ffffff',      // Texte principal
        secondary: '#b3b3b3',    // Texte secondaire
        tertiary: '#8a8a8a',     // Texte tertiaire (subtitles)
        disabled: '#666666',     // Texte désactivé
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
    
    // Couleurs de bordure
    border: {
        primary: '#2a2a2a',
        secondary: '#333333',
        light: '#404040',
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
