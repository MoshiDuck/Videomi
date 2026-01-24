# Référence des Composants React — Videomi

> **Date de mise à jour** : 24 janvier 2026  
> **Version** : 1.0  
> **Répertoire source** : `app/components/`

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Composants d'authentification](#composants-dauthentification)
3. [Composants de navigation](#composants-de-navigation)
4. [Composants de profil](#composants-de-profil)
5. [Composants UI](#composants-ui)
6. [Composants d'upload](#composants-dupload)
7. [Accessibilité (WCAG 2.1 AA)](#accessibilité)

---

## Vue d'ensemble

### Structure du répertoire

```
app/components/
├── auth/
│   ├── AuthGuard.tsx         # Protection des routes
│   └── GoogleAuthButton.tsx  # Bouton de connexion Google
├── navigation/
│   └── Navigation.tsx        # Barre de navigation principale
├── profile/
│   └── UserProfile.tsx       # Affichage du profil utilisateur
├── ui/
│   ├── categoryBar.tsx       # Barre de catégories
│   ├── ConfirmDialog.tsx     # Dialog de confirmation
│   ├── DraggableItem.tsx     # Élément drag & drop
│   ├── DropZoneOverlay.tsx   # Overlay des zones de drop
│   ├── ErrorDisplay.tsx      # Affichage des erreurs
│   ├── LanguageSelector.tsx  # Sélecteur de langue
│   ├── LoadingSpinner.tsx    # Indicateur de chargement
│   ├── MiniPlayer.tsx        # Lecteur média réduit
│   ├── NetflixCarousel.tsx   # Carrousel style Netflix
│   ├── RatingModal.tsx       # Modal de notation
│   ├── SplashScreen.tsx      # Écran de démarrage
│   ├── StarRating.tsx        # Composant d'étoiles
│   ├── Toast.tsx             # Notifications toast
│   ├── Tooltip.tsx           # Infobulles
│   └── VideoSubCategoryBar.tsx # Sous-catégories vidéo
└── upload/
    └── UploadManager.tsx     # Gestionnaire d'upload
```

### Statistiques

| Catégorie | Nombre | Fichiers |
|-----------|--------|----------|
| Auth | 2 | `AuthGuard.tsx`, `GoogleAuthButton.tsx` |
| Navigation | 1 | `Navigation.tsx` |
| Profile | 1 | `UserProfile.tsx` |
| UI | 14 | Voir liste ci-dessus |
| Upload | 1 | `UploadManager.tsx` |
| **Total** | **19** | |

---

## Composants d'authentification

### AuthGuard

**Fichier** : `app/components/auth/AuthGuard.tsx`

Protection des routes nécessitant une authentification.

#### Props

```typescript
interface AuthGuardProps {
    children: React.ReactNode;
    requireAuth?: boolean;  // Défaut: true
    redirectTo?: string;    // Défaut: '/login'
}
```

#### Hooks utilisés

| Hook | Source | Description |
|------|--------|-------------|
| `useAuth()` | `~/hooks/useAuth` | État d'authentification |
| `useLocation()` | `react-router` | URL courante |

#### Comportement

1. Si `loading` → affiche `<LoadingSpinner />`
2. Si `requireAuth && !isAuthenticated` → `<Navigate to={redirectTo} />`
3. Sinon → affiche `children`

#### Exemple d'utilisation

```tsx
<AuthGuard>
    <ProtectedPage />
</AuthGuard>

<AuthGuard requireAuth={false} redirectTo="/home">
    <LoginPage />
</AuthGuard>
```

---

### GoogleAuthButton

**Fichier** : `app/components/auth/GoogleAuthButton.tsx`

Bouton de connexion Google OAuth (web et Electron).

#### Props

```typescript
interface GoogleAuthButtonProps {
    isElectron: boolean;
    googleClientId: string;
    loading: boolean;
    onElectronAuth: () => void;
    onWebAuth: (credential: CredentialResponse) => void;
    onError: () => void;
}
```

#### Dépendances externes

- `@react-oauth/google` : `GoogleLogin`, `CredentialResponse`

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `alt` | "Google" | Image logo |
| `disabled` | `loading` | Bouton Electron |

#### Rendu conditionnel

- **Electron** : Bouton personnalisé avec logo Google
- **Web** : Composant `<GoogleLogin />` de `@react-oauth/google`

---

## Composants de navigation

### Navigation

**Fichier** : `app/components/navigation/Navigation.tsx`

Barre de navigation principale de l'application.

#### Props

```typescript
interface NavigationProps {
    user: User;
    onLogout: () => void;
}
```

#### Hooks utilisés

| Hook | Source | Description |
|------|--------|-------------|
| `useState` | React | État `showLogoutConfirm` |
| `useLocation()` | `react-router` | Détection route active |
| `useLanguage()` | `~/contexts/LanguageContext` | Traductions |

#### Composants enfants

- `ConfirmDialog` : Dialog de confirmation de déconnexion
- `LanguageSelector` : Sélecteur de langue

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `aria-current` | `"page"` | Lien actif |
| `alt` | `user.name` | Avatar |

#### Liens de navigation

| Lien | Route | Icône |
|------|-------|-------|
| Accueil | `/home` | 🏠 |
| Upload | `/upload` | ⬆️ |
| Mes fichiers | `/films` | 📁 |
| Profil | `/profile` | 👤 |
| Déconnexion | - | 🚪 |

---

## Composants de profil

### UserProfile

**Fichier** : `app/components/profile/UserProfile.tsx`

Affichage des informations de profil utilisateur.

#### Props

```typescript
interface UserProfileProps {
    user: User;
    onLogout: () => void;
}
```

#### Types dépendants

```typescript
// ~/types/auth.ts
interface User {
    id: string;
    email: string;
    name: string;
    picture: string;
    email_verified: boolean;
}
```

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `alt` | Description | Avatar |

---

## Composants UI

### categoryBar

**Fichier** : `app/components/ui/categoryBar.tsx`

Barre de sélection des catégories de fichiers.

#### Props

```typescript
interface CategoryBarProps {
    selectedCategory: FileCategory;
    onCategoryChange: (category: FileCategory) => void;
}
```

#### Types dépendants

```typescript
// ~/utils/file/fileClassifier.ts
type FileCategory = 
    | 'videos' 
    | 'musics' 
    | 'images' 
    | 'documents' 
    | 'archives' 
    | 'executables' 
    | 'others';
```

#### Hooks utilisés

| Hook | Source | Description |
|------|--------|-------------|
| `useAuth()` | `~/hooks/useAuth` | Utilisateur |
| `useLanguage()` | `~/contexts/LanguageContext` | Traductions |
| `useFilesPreloader()` | `~/hooks/useFilesPreloader` | Préchargement |

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `aria-current` | `"page"` | Catégorie sélectionnée |

#### Préchargement

- `onMouseEnter` → `preloadCategory(category)`

---

### ConfirmDialog

**Fichier** : `app/components/ui/ConfirmDialog.tsx`

Dialog modal de confirmation pour actions destructives.

#### Props

```typescript
interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;      // Défaut: 'Confirmer'
    cancelText?: string;       // Défaut: 'Annuler'
    confirmColor?: string;     // Défaut: darkTheme.accent.red
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}
```

#### États internes

| État | Type | Description |
|------|------|-------------|
| `isSubmitting` | boolean | Action en cours |

#### Hooks utilisés

| Hook | Source | Description |
|------|--------|-------------|
| `useState` | React | État `isSubmitting` |
| `useRef` | React | Refs dialog et bouton cancel |
| `useEffect` | React | Gestion Escape, focus initial |

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `role` | `"dialog"` | Container |
| `aria-modal` | `"true"` | Container |
| `aria-labelledby` | ID titre | Container |
| `aria-describedby` | ID message | Container |

#### Gestion clavier

- **Escape** : Ferme le dialog (si pas en cours)
- **Focus initial** : Bouton annuler

#### Protection double-clic

```typescript
const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
        await onConfirm();
    } finally {
        setIsSubmitting(false);
    }
};
```

---

### DraggableItem

**Fichier** : `app/components/ui/DraggableItem.tsx`

Wrapper pour rendre un élément draggable (HTML5 Drag & Drop).

#### Props

```typescript
interface DraggableItemProps {
    item: DraggableFileItem;
    children: React.ReactNode;
    disabled?: boolean;        // Défaut: false
    className?: string;
    style?: React.CSSProperties;
    onDragStart?: () => void;
    onDragEnd?: () => void;
}
```

#### Types dépendants

```typescript
// ~/types/dragdrop.ts
interface DraggableFileItem {
    file_id: string;
    category: string;
    filename: string;
    size?: number;
    mime_type?: string;
}
```

#### Hooks utilisés

| Hook | Source | Description |
|------|--------|-------------|
| `useState` | React | État `isDraggingThis` |
| `useRef` | React | Ref `dragStarted` |
| `useCallback` | React | Handlers |
| `useDragDrop()` | `~/contexts/DragDropContext` | Contexte D&D |

#### Événements HTML5 Drag

| Événement | Handler |
|-----------|---------|
| `onDragStart` | `handleDragStart` |
| `onDragEnd` | `handleDragEnd` |
| `onDrag` | `handleDrag` |

---

### DropZoneOverlay

**Fichier** : `app/components/ui/DropZoneOverlay.tsx`

Overlay affichant les zones de drop pendant un drag.

#### Composants internes

| Composant | Description |
|-----------|-------------|
| `DropZone` | Zone de drop individuelle |
| `ConfirmToast` | Toast de confirmation après drop |

#### Hooks utilisés

| Hook | Source | Description |
|------|--------|-------------|
| `useState` | React | États `isHovered`, `isVisible`, `countdown` |
| `useCallback` | React | Handlers |
| `useEffect` | React | Animations, countdown |
| `useDragDrop()` | `~/contexts/DragDropContext` | Contexte D&D |

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `role` | `"alert"` | ConfirmToast |
| `aria-live` | `"assertive"` | ConfirmToast |
| `aria-atomic` | `"true"` | ConfirmToast |

---

### ErrorDisplay

**Fichier** : `app/components/ui/ErrorDisplay.tsx`

Affichage des messages d'erreur avec option de retry.

#### Props

```typescript
interface ErrorDisplayProps {
    error: string;
    onRetry?: () => void;
    retryText?: string;        // Défaut: 'Réessayer'
}
```

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `role` | `"alert"` | Container |
| `aria-live` | `"assertive"` | Container |
| `aria-hidden` | `"true"` | Icône ⚠️ |

---

### LanguageSelector

**Fichier** : `app/components/ui/LanguageSelector.tsx`

Sélecteur de langue (compact ou complet).

#### Props

```typescript
interface LanguageSelectorProps {
    compact?: boolean;         // Défaut: false
}
```

#### Langues supportées

| Code | Langue | Drapeau |
|------|--------|---------|
| `fr` | Français | 🇫🇷 |
| `en` | English | 🇬🇧 |
| `es` | Español | 🇪🇸 |
| `de` | Deutsch | 🇩🇪 |

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `aria-label` | `"Sélectionner {langue}"` | Boutons |
| `aria-pressed` | `true/false` | Boutons |

---

### LoadingSpinner

**Fichier** : `app/components/ui/LoadingSpinner.tsx`

Indicateur de chargement avec message personnalisable.

#### Props

```typescript
interface LoadingSpinnerProps {
    message?: string;          // Défaut: 'Chargement en cours...'
    size?: 'small' | 'medium' | 'large';  // Défaut: 'medium'
}
```

#### Tailles

| Size | Dimensions |
|------|------------|
| `small` | 24px |
| `medium` | 40px |
| `large` | 56px |

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `role` | `"status"` | Container |
| `aria-live` | `"polite"` | Container |
| `aria-label` | `message` | Container |
| `aria-hidden` | `"true"` | Spinner visuel |

---

### MiniPlayer

**Fichier** : `app/components/ui/MiniPlayer.tsx`

Lecteur média réduit flottant (audio/vidéo).

#### Hooks utilisés

| Hook | Source | Description |
|------|--------|-------------|
| `useState` | React | États UI |
| `useRef` | React | Ref position drag |
| `useEffect` | React | Détection client, drag |
| `useNavigate()` | `react-router` | Navigation |
| `usePlayer()` | `~/contexts/PlayerContext` | État lecteur |

#### États internes

| État | Type | Description |
|------|------|-------------|
| `isDragging` | boolean | Drag en cours |
| `position` | `{x, y}` | Position du player |
| `isClient` | boolean | Rendu client |
| `mediaError` | string | Erreur média |

#### Fonctionnalités

- Drag & drop pour repositionnement
- Contrôles : ⏮ ⏸/▶ ⏭ ✕
- Navigation playlist
- Click pour agrandir

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `aria-label` | Description | Tous les boutons |

---

### NetflixCarousel

**Fichier** : `app/components/ui/NetflixCarousel.tsx`

Carrousel horizontal style Netflix.

#### Props

```typescript
interface NetflixCarouselProps {
    title: string;
    icon?: string;
    children: React.ReactNode;
}
```

#### Fonctionnalités

- Scroll horizontal avec flèches
- Masquage intelligent des flèches (début/fin)
- Animation au hover

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `aria-label` | `"Défiler vers la gauche/droite"` | Flèches |

---

### RatingModal

**Fichier** : `app/components/ui/RatingModal.tsx`

Modal de notation avec étoiles (1-5).

#### Props

```typescript
interface RatingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRate: (rating: number) => void | Promise<void>;
    title: string;
    thumbnail?: string | null;
}
```

#### États internes

| État | Type | Description |
|------|------|-------------|
| `hoveredRating` | number | Étoile survolée |
| `selectedRating` | number | Étoile sélectionnée |
| `isSubmitting` | boolean | Soumission en cours |

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `role` | `"dialog"` | Container |
| `aria-modal` | `"true"` | Container |
| `aria-labelledby` | ID titre | Container |
| `aria-label` | `"Noter X étoile(s)"` | Étoiles |

#### Gestion clavier

- **Escape** : Ferme le modal

---

### SplashScreen

**Fichier** : `app/components/ui/SplashScreen.tsx`

Écran de démarrage avec logo animé.

#### Comportement

- Affiche le logo Videomi
- Redirection automatique vers `/home` après 2 secondes

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `role` | `"banner"` | Container |
| `aria-label` | `"Écran de démarrage Videomi"` | Container |

#### Animations

Respect de `prefers-reduced-motion` :
```css
@media (prefers-reduced-motion: reduce) {
    * {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}
```

---

### StarRating

**Fichier** : `app/components/ui/StarRating.tsx`

Composant d'étoiles de notation inline.

#### Props

```typescript
interface StarRatingProps {
    userRating: number | null;
    averageRating: number | null;
    onRate: (rating: number) => void;
    disabled?: boolean;        // Défaut: false
}
```

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `aria-label` | `"X étoile(s)"` | Chaque étoile |

---

### Toast

**Fichier** : `app/components/ui/Toast.tsx`

Système de notifications toast.

#### Types

```typescript
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;  // Défaut: 3000ms
}
```

#### Hook useToast

```typescript
const { toasts, addToast, removeToast } = useToast();

addToast({ message: 'Succès !', type: 'success' });
```

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `role` | `"alert"` | Toast |
| `aria-live` | `"assertive"` (error) / `"polite"` | Toast |
| `aria-atomic` | `"true"` | Toast |
| `tabIndex` | `0` | Toast |
| `aria-label` | `"Fermer la notification"` | Bouton ✕ |

---

### Tooltip

**Fichier** : `app/components/ui/Tooltip.tsx`

Infobulles avec positionnement intelligent.

#### Props

```typescript
interface TooltipProps {
    content: string;
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';  // Défaut: 'top'
    delay?: number;            // Défaut: 300ms
}
```

#### Positionnement

- Calcul automatique pour rester dans le viewport
- Repositionnement au scroll/resize

#### Accessibilité

| Déclencheur | Description |
|-------------|-------------|
| `onMouseEnter` | Affiche tooltip |
| `onMouseLeave` | Cache tooltip |
| `onFocus` | Affiche tooltip (clavier) |
| `onBlur` | Cache tooltip (clavier) |

---

### VideoSubCategoryBar

**Fichier** : `app/components/ui/VideoSubCategoryBar.tsx`

Sous-catégories pour les vidéos (Films / Séries).

#### Props

```typescript
interface VideoSubCategoryBarProps {
    selectedSubCategory: VideoSubCategory;
    onSubCategoryChange: (subCategory: VideoSubCategory) => void;
}

type VideoSubCategory = 'films' | 'series';
```

#### Accessibilité

| Attribut | Valeur | Élément |
|----------|--------|---------|
| `aria-current` | `"page"` | Sous-catégorie sélectionnée |

---

## Composants d'upload

### UploadManager

**Fichier** : `app/components/upload/UploadManager.tsx`

Gestionnaire d'upload de fichiers avec chunking.

#### Props

```typescript
interface UploadManagerProps {
    onUploadComplete?: (fileId: string) => void;
    onProgress?: (progress: UploadProgress[]) => void;
    maxConcurrentUploads?: number;  // Défaut: 3
    chunkSize?: number;             // Défaut: 10MB
}
```

#### Handle (via forwardRef)

```typescript
interface UploadManagerHandle {
    uploadFiles: (files: FileList | File[]) => Promise<void>;
    cancelUpload: (fileId: string) => void;
    pauseUpload: (fileId: string) => void;
    resumeUpload: (fileId: string) => void;
    getUploads: () => UploadProgress[];
}
```

#### Types

```typescript
interface UploadProgress {
    fileId: string;
    filename: string;
    progress: number;        // 0-100
    status: UploadStatus;
    error?: string;
    speed?: number;          // bytes/s
    eta?: number;            // secondes restantes
}

type UploadStatus = 
    | 'pending' 
    | 'uploading' 
    | 'paused' 
    | 'completed' 
    | 'error' 
    | 'cancelled';
```

#### Hooks utilisés

| Hook | Source | Description |
|------|--------|-------------|
| `useState` | React | États UI |
| `useRef` | React | Refs queue, controllers |
| `useCallback` | React | `updateProgress` |
| `useEffect` | React | Callback progress |
| `useImperativeHandle` | React | Handle ref |
| `useAuth()` | `~/hooks/useAuth` | Utilisateur |
| `useLanguage()` | `~/contexts/LanguageContext` | Traductions |

#### Fonctionnalités

1. **Upload par chunks** : Fichiers découpés en morceaux de 10MB
2. **Calcul de hash** : SHA-256 pour déduplication
3. **Classification automatique** : Détection du type de fichier
4. **Upload concurrent** : Jusqu'à 3 fichiers simultanés
5. **Annulation/Pause/Reprise** : Contrôle total
6. **Invalidation cache** : Après upload réussi

---

## Accessibilité

### Conformité WCAG 2.1 AA

Tous les composants respectent les critères WCAG 2.1 niveau AA.

### Checklist par composant

| Composant | role | aria-label | Clavier | Focus |
|-----------|------|------------|---------|-------|
| ConfirmDialog | ✅ dialog | ✅ | ✅ Escape | ✅ Initial |
| RatingModal | ✅ dialog | ✅ | ✅ Escape | ✅ Initial |
| Toast | ✅ alert | ✅ | ✅ Enter | ✅ |
| LoadingSpinner | ✅ status | ✅ | N/A | N/A |
| ErrorDisplay | ✅ alert | N/A | ✅ Retry | ✅ |
| DropZoneOverlay | ✅ alert | ✅ | N/A | N/A |

### CSS global (`app/root.tsx`)

```css
/* Focus visible */
*:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
    * {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}
```

---

## Dépendances externes

| Package | Composants |
|---------|------------|
| `@react-oauth/google` | GoogleAuthButton |
| `@floating-ui/react` | (routes films/series) |
| `react-router` | AuthGuard, Navigation, MiniPlayer, SplashScreen |

---

## Thème

Tous les composants utilisent le thème depuis `app/utils/ui/theme.ts`.

```typescript
import { darkTheme } from '~/utils/ui/theme';
```

### Couleurs principales

| Variable | Valeur | Usage |
|----------|--------|-------|
| `bg.primary` | `#141414` | Fond principal |
| `bg.secondary` | `#1f1f1f` | Fond secondaire |
| `text.primary` | `#ffffff` | Texte principal |
| `text.secondary` | `#d1d1d1` | Texte secondaire |
| `accent.primary` | `#e50914` | Accent Netflix |
| `accent.green` | `#46d369` | Succès |
| `accent.red` | `#e50914` | Erreur/Danger |

---

*Document généré automatiquement — Janvier 2026*
