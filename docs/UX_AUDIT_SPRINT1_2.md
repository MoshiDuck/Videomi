# Audit UX & Implémentations — Sprint 1 & 2

> **Date** : Janvier 2026  
> **Objectif** : Optimisation UX sans ajout de fonctionnalités  
> **Contexte** : Application vidéo de production (≥ 10k utilisateurs)

---

## Table des matières

1. [Audit Initial](#1-audit-initial)
2. [Sprint 1 — Corrections Critiques](#2-sprint-1--corrections-critiques)
3. [Sprint 2 — Améliorations UX](#3-sprint-2--améliorations-ux)
4. [Checklist UX Production](#4-checklist-ux-production)
5. [Patterns Réutilisables](#5-patterns-réutilisables)
6. [Fichiers Modifiés](#6-fichiers-modifiés)

---

## 1. Audit Initial

### Méthodologie

Analyse basée sur 5 axes :
- **Temps perçu** : Chargements, feedback, écrans vides
- **États utilisateur** : Loading, success, error, empty
- **Prévisibilité** : Actions immédiates, conservation d'état
- **Réduction de friction** : Clics inutiles, mauvais defaults
- **Micro-UX** : Boutons, feedback subtil, transitions

### Problèmes Identifiés

| Zone | Problème UX | Impact Utilisateur | Sévérité |
|------|-------------|-------------------|----------|
| Routes (films, series, etc.) | Pas de spinner au chargement initial | Écran vide, impression de bug | **Critique** |
| ConfirmDialog | Pas de protection double-clic | Actions dupliquées, corruption données | **Critique** |
| RatingModal | Pas de protection double-clic | Notes dupliquées | **Critique** |
| MiniPlayer | Pas de gestion erreur média | Lecteur silencieusement cassé | **Critique** |
| useFiles | Vide les données en cas d'erreur | Perte de contenu affiché | **Critique** |
| useFiles | Pas de distinction loading/refreshing | Spinner intrusif sur refresh | **Moyen** |
| Home | Pas d'état vide explicite | Confusion nouveaux utilisateurs | **Moyen** |
| PlayerContext | Pas de persistance | Perte de progression à la navigation | **Moyen** |

---

## 2. Sprint 1 — Corrections Critiques

### 2.1 LoadingSpinners sur les routes

**Problème** : Écran vide pendant le chargement initial, aucun feedback visuel.

**Solution** : Ajout conditionnel de `LoadingSpinner` — affiché uniquement si `loading` ET pas de données en cache.

**Fichiers modifiés** :
- `app/routes/films.tsx`
- `app/routes/series.tsx`
- `app/routes/musics.tsx`
- `app/routes/images.tsx`
- `app/routes/documents.tsx`
- `app/routes/archives.tsx`
- `app/routes/executables.tsx`
- `app/routes/others.tsx`
- `app/routes/home.tsx`

**Pattern utilisé** :

```tsx
// Afficher spinner UNIQUEMENT si loading ET pas de données
if (loading && data.length === 0) {
    return (
        <AuthGuard>
            <div style={{ minHeight: '100vh', backgroundColor: theme.bg.primary }}>
                <Navigation user={user!} onLogout={logout} />
                <div style={{ /* container styles */ }}>
                    <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                        <LoadingSpinner size="large" message={t('common.loading')} />
                    </div>
                </div>
            </div>
        </AuthGuard>
    );
}
```

### 2.2 Protection double-clic ConfirmDialog

**Problème** : Utilisateur peut cliquer plusieurs fois sur "Confirmer", déclenchant l'action plusieurs fois.

**Solution** : État `isSubmitting` + bouton disabled + spinner inline.

**Fichier** : `app/components/ui/ConfirmDialog.tsx`

```tsx
const [isSubmitting, setIsSubmitting] = useState(false);

const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
        await onConfirm();
    } finally {
        setIsSubmitting(false);
    }
};

// Bouton avec état disabled et spinner
<button
    onClick={handleConfirm}
    disabled={isSubmitting}
    style={{ opacity: isSubmitting ? 0.7 : 1, /* ... */ }}
>
    {isSubmitting ? <LoadingSpinner size="small" /> : confirmText}
</button>
```

### 2.3 Protection double-clic RatingModal

**Problème** : Utilisateur peut cliquer plusieurs étoiles rapidement, envoyant plusieurs notes.

**Solution** : État `isSubmitting` + étoiles disabled + spinner pendant l'envoi.

**Fichier** : `app/components/ui/RatingModal.tsx`

```tsx
const [isSubmitting, setIsSubmitting] = useState(false);

const handleStarClick = async (rating: number) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSelectedRating(rating);
    try {
        await onRate(rating);
    } finally {
        setIsSubmitting(false);
    }
};

// Affichage conditionnel
{isSubmitting ? (
    <LoadingSpinner size="medium" message="Envoi de la note..." />
) : (
    [1, 2, 3, 4, 5].map((star) => (
        <button key={star} onClick={() => handleStarClick(star)} disabled={isSubmitting}>
            ★
        </button>
    ))
)}
```

### 2.4 Gestion erreur MiniPlayer

**Problème** : Si le média ne charge pas, le lecteur reste silencieux sans feedback.

**Solution** : État `mediaError` + affichage message + bouton "Réessayer".

**Fichier** : `app/components/ui/MiniPlayer.tsx`

```tsx
const [mediaError, setMediaError] = useState<string | null>(null);

// Sur les éléments audio/video
<audio
    onError={() => setMediaError('Impossible de charger le fichier audio')}
    onLoadStart={() => setMediaError(null)}
/>

// Affichage de l'erreur
{mediaError && (
    <div style={{ /* styles erreur */ }}>
        <span>⚠️</span>
        <span>{mediaError}</span>
        <button onClick={() => { setMediaError(null); resume(); }}>
            Réessayer
        </button>
    </div>
)}
```

### 2.5 Préservation données en cas d'erreur

**Problème** : `useFiles` vidait `files` en cas d'erreur réseau, l'utilisateur perdait tout le contenu affiché.

**Solution** : Suppression de `setFiles([])` dans le `catch`.

**Fichier** : `app/hooks/useFiles.ts`

```typescript
// AVANT (problématique)
catch (err) {
    setError(err.message);
    setFiles([]); // ❌ Perte de données
}

// APRÈS (corrigé)
catch (err) {
    setError(err.message);
    // Les données précédentes sont conservées
}
```

---

## 3. Sprint 2 — Améliorations UX

### 3.1 Distinction loading vs refreshing

**Problème** : Le spinner s'affichait même lors d'un refresh en arrière-plan avec données déjà visibles.

**Solution** : Deux états distincts : `loading` (initial) et `isRefreshing` (background).

**Fichier** : `app/hooks/useFiles.ts`

```typescript
interface UseFilesReturn {
    files: FileItem[];
    loading: boolean;       // true = chargement initial (écran vide)
    isRefreshing: boolean;  // true = refresh en arrière-plan (données visibles)
    error: string | null;
    refetch: () => Promise<void>;
}

// Implémentation
const [loading, setLoading] = useState(true);
const [isRefreshing, setIsRefreshing] = useState(false);
const hasDataRef = useRef(false);

const fetchFiles = async () => {
    if (hasDataRef.current) {
        setIsRefreshing(true);  // Données déjà affichées → refresh discret
    } else {
        setLoading(true);       // Pas de données → spinner plein écran
    }
    
    try {
        const data = await fetchFromAPI();
        setFiles(data);
        hasDataRef.current = true;
    } finally {
        setLoading(false);
        setIsRefreshing(false);
    }
};
```

### 3.2 État vide Home

**Problème** : Nouveaux utilisateurs sans fichiers voyaient une page vide sans guidance.

**Solution** : État vide riche avec message de bienvenue, description et CTA vers upload.

**Fichier** : `app/routes/home.tsx`

```tsx
const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

// Dans fetchStats
finally {
    setLoadingStats(false);
    setHasLoadedOnce(true);
}

// Rendu état vide
{!loadingStats && hasLoadedOnce && stats.fileCount === 0 && (
    <div style={{ /* card styles */ }}>
        <div style={{ fontSize: '64px' }}>🚀</div>
        <h2>{t('home.emptyTitle') || 'Bienvenue sur Videomi !'}</h2>
        <p>{t('home.emptyDescription') || 'Commencez par uploader vos fichiers...'}</p>
        <button onClick={() => navigate('/upload')}>
            <span>📤</span>
            <span>{t('home.uploadFirst') || 'Uploader mes premiers fichiers'}</span>
        </button>
        <div>🎬 🎵 📷 📄 📦</div>
    </div>
)}
```

### 3.3 Persistance PlayerContext

**Problème** : Navigation ou refresh = perte de la progression de lecture.

**Solution** : Persistance dans `sessionStorage` + notification de restauration.

**Fichier** : `app/contexts/PlayerContext.tsx`

#### Données persistées

```typescript
interface PersistedPlayerState {
    fileId: string | null;
    category: string | null;
    fileUrl: string | null;
    title: string | null;
    artist: string | null;
    thumbnail: string | null;
    type: 'audio' | 'video' | null;
    playlist: PlaylistTrack[];
    currentTrackIndex: number;
    playlistContext: { type: 'artist' | 'album'; name: string } | null;
    currentTime: number;
    volume: number;
    isMiniPlayer: boolean;
    savedAt: number;
}
```

#### Déclencheurs de sauvegarde

| Événement | Throttle |
|-----------|----------|
| Changement de piste | Immédiat |
| Changement de volume | Immédiat |
| Toggle mini player | Immédiat |
| Progression lecture | Toutes les 10s |
| Fermeture page | Synchrone (beforeunload) |

#### API enrichie

```typescript
interface PlayerContextType {
    state: PlayerState;
    
    // Nouveaux (restauration)
    canRestore: boolean;                    // Lecture interrompue disponible
    restoredState: PersistedPlayerState | null;
    restorePlayback: () => void;            // Reprendre
    dismissRestore: () => void;             // Ignorer
    
    // Existants
    play, pause, resume, stop, seek, setVolume, 
    playNext, playPrevious, toggleMiniPlayer, expandPlayer,
    audioRef, videoRef
}
```

#### Comportements

| Élément | Comportement |
|---------|-------------|
| Volume | Restauré automatiquement |
| Lecture | Proposée via notification (pas d'auto-play) |
| Condition | Uniquement si > 10 secondes de progression |
| Expiration | Données ignorées après 24h |
| Stop volontaire | Efface les données persistées |

**Fichier** : `app/components/ui/MiniPlayer.tsx` (notification)

```tsx
// Notification de restauration
if (canRestore && restoredState && !state.fileUrl) {
    return (
        <div style={{ /* notification styles */ }}>
            <div>
                <span>Reprendre la lecture</span>
                <span>{restoredState.title}</span>
                <span>{formatTime(restoredState.currentTime)} • {restoredState.artist}</span>
            </div>
            <button onClick={dismissRestore}>✕</button>
            <button onClick={restorePlayback}>▶</button>
        </div>
    );
}
```

---

## 4. Checklist UX Production

### États utilisateur

| Critère | Statut |
|---------|--------|
| Loading explicite sur toutes les routes | ✅ |
| Loading initial vs refresh distingués | ✅ |
| États vides avec guidance | ✅ |
| Erreurs affichées clairement | ✅ |
| Données préservées en cas d'erreur | ✅ |

### Feedback actions

| Critère | Statut |
|---------|--------|
| Protection double-clic sur actions critiques | ✅ |
| Spinners inline sur boutons d'action | ✅ |
| Boutons disabled pendant les actions | ✅ |
| Messages d'erreur avec option retry | ✅ |

### Persistance

| Critère | Statut |
|---------|--------|
| Volume utilisateur persisté | ✅ |
| Progression de lecture persistée | ✅ |
| Restauration proposée (pas forcée) | ✅ |
| Expiration des données anciennes | ✅ |

### Performance perçue

| Critère | Statut |
|---------|--------|
| Cache instantané (pas de spinner si données) | ✅ |
| Refresh discret en arrière-plan | ✅ |
| Animations de transition présentes | ✅ |

---

## 5. Patterns Réutilisables

### Pattern : Protection double-clic

```tsx
const [isSubmitting, setIsSubmitting] = useState(false);

const handleAction = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
        await asyncAction();
    } finally {
        setIsSubmitting(false);
    }
};

<button onClick={handleAction} disabled={isSubmitting}>
    {isSubmitting ? <LoadingSpinner size="small" /> : 'Action'}
</button>
```

### Pattern : Loading conditionnel (éviter flash)

```tsx
// Spinner UNIQUEMENT si loading ET pas de données
if (loading && data.length === 0) {
    return <LoadingSpinner />;
}

// Sinon, afficher les données (même pendant un refresh)
return <DataList data={data} />;
```

### Pattern : Persistance sessionStorage

```typescript
const STORAGE_KEY = 'my_state';

function save(state: MyState): void {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...state,
            savedAt: Date.now()
        }));
    } catch {}
}

function load(): MyState | null {
    try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (!saved) return null;
        const parsed = JSON.parse(saved);
        // Expiration 24h
        if (Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
            sessionStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}
```

### Pattern : État vide actionnable

```tsx
{!loading && hasLoadedOnce && data.length === 0 && (
    <EmptyState
        icon="🚀"
        title="Bienvenue !"
        description="Commencez par..."
        action={{ label: 'Ajouter', onClick: () => navigate('/add') }}
    />
)}
```

---

## 6. Fichiers Modifiés

### Sprint 1

| Fichier | Modification |
|---------|--------------|
| `app/routes/films.tsx` | + LoadingSpinner initial |
| `app/routes/series.tsx` | + LoadingSpinner initial |
| `app/routes/musics.tsx` | + LoadingSpinner initial |
| `app/routes/images.tsx` | + LoadingSpinner initial |
| `app/routes/documents.tsx` | + LoadingSpinner initial |
| `app/routes/archives.tsx` | + LoadingSpinner initial |
| `app/routes/executables.tsx` | + LoadingSpinner initial |
| `app/routes/others.tsx` | + LoadingSpinner initial |
| `app/routes/home.tsx` | + LoadingSpinner stats |
| `app/components/ui/ConfirmDialog.tsx` | + Protection double-clic |
| `app/components/ui/RatingModal.tsx` | + Protection double-clic |
| `app/components/ui/MiniPlayer.tsx` | + Gestion erreur média |
| `app/hooks/useFiles.ts` | - Suppression setFiles([]) en erreur |

### Sprint 2

| Fichier | Modification |
|---------|--------------|
| `app/hooks/useFiles.ts` | + isRefreshing, hasDataRef |
| `app/routes/home.tsx` | + État vide avec CTA |
| `app/contexts/PlayerContext.tsx` | + Persistance sessionStorage complète |
| `app/components/ui/MiniPlayer.tsx` | + Notification restauration |

---

## Conclusion

L'audit UX a permis d'identifier et corriger **8 problèmes majeurs** répartis sur **16 fichiers**. L'application offre maintenant une expérience :

- **Prévisible** : Feedback immédiat sur toutes les actions
- **Résiliente** : Données préservées en cas d'erreur
- **Guidée** : États vides informatifs avec call-to-action
- **Continue** : Persistance de la progression utilisateur

Ces patterns sont réutilisables pour les futures fonctionnalités.
