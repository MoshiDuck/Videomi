# Référence des Hooks et Contextes — Videomi

> **Date de mise à jour** : 24 janvier 2026  
> **Version** : 1.0  
> **Répertoires source** : `app/hooks/`, `app/contexts/`

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Hooks personnalisés](#hooks-personnalisés)
3. [Contextes React](#contextes-react)
4. [Diagramme des dépendances](#diagramme-des-dépendances)

---

## Vue d'ensemble

### Structure des répertoires

```
app/hooks/
├── useAuth.ts           # Authentification et session
├── useConfig.ts         # Configuration API
├── useElectronAuth.ts   # Auth spécifique Electron
├── useFileActions.ts    # Actions sur fichiers (delete)
├── useFiles.ts          # Liste des fichiers avec cache
├── useFilesPreloader.ts # Préchargement des fichiers
├── useLocalCache.ts     # Hook wrapper IndexedDB
└── useUploadManager.tsx # Gestion des uploads

app/contexts/
├── AuthContext.tsx      # Contexte d'authentification
├── DragDropContext.tsx  # Contexte drag & drop
├── LanguageContext.tsx  # Contexte i18n
└── PlayerContext.tsx    # Contexte lecteur média
```

### Statistiques

| Catégorie | Nombre |
|-----------|--------|
| Hooks | 8 |
| Contextes | 4 |
| **Total** | **12** |

---

## Hooks personnalisés

### useAuth

**Fichier** : `app/hooks/useAuth.ts`

Gestion de l'authentification utilisateur et de la session.

#### Signature

```typescript
function useAuth(): {
    user: ApiAuthResponse['user'] | null;
    loading: boolean;
    error: string | null;
    setError: (error: string | null) => void;
    handleAuthWithToken: (idToken: string, config: AuthConfig) => Promise<void>;
    logout: () => Promise<void>;
    isAuthenticated: boolean;
}
```

#### Dépendances

| Import | Source | Description |
|--------|--------|-------------|
| `useNavigate` | `react-router` | Navigation |
| `clearLocalCache` | `~/utils/cache/localCache` | Nettoyage IndexedDB |
| `clearServiceWorkerCache` | `~/utils/cache/serviceWorker` | Nettoyage SW |
| `setServiceWorkerUserId` | `~/utils/cache/serviceWorker` | Isolation SW |
| `handleCacheInvalidation` | `~/utils/cache/cacheInvalidation` | Invalidation |

#### Stockage

| Clé localStorage | Description |
|------------------|-------------|
| `videomi_user` | Objet utilisateur (JSON) |
| `videomi_token` | JWT token |

#### Flux d'authentification

```
1. Chargement initial
   → Lecture localStorage
   → Si user trouvé : setServiceWorkerUserId(userId)
   → isAuthenticated = true

2. Login (handleAuthWithToken)
   → POST /api/auth/google
   → Stockage localStorage
   → setServiceWorkerUserId(userId)
   → Navigate('/home')

3. Logout
   → handleCacheInvalidation({ type: 'user:logout' })
   → clearLocalCache(userId)
   → clearServiceWorkerCache(userId, true)
   → Nettoyage localStorage/sessionStorage
   → Navigate('/login')
```

#### Exemple d'utilisation

```tsx
function MyComponent() {
    const { user, isAuthenticated, logout, loading } = useAuth();
    
    if (loading) return <LoadingSpinner />;
    if (!isAuthenticated) return <Navigate to="/login" />;
    
    return (
        <div>
            <p>Bienvenue, {user.name}</p>
            <button onClick={logout}>Déconnexion</button>
        </div>
    );
}
```

---

### useConfig

**Fichier** : `app/hooks/useConfig.ts`

Récupération de la configuration publique de l'application.

#### Signature

```typescript
function useConfig(): {
    config: AuthConfig | null;
    loading: boolean;
    error: string | null;
}
```

#### Type AuthConfig

```typescript
interface AuthConfig {
    googleClientId: string | null;
    tmdbApiKey: string | null;
    omdbApiKey: string | null;
    spotifyClientId: string | null;
    spotifyClientSecret: string | null;
    discogsApiToken: string | null;
}
```

#### Comportement

- Appel unique à `GET /api/config` au montage
- Détection de l'environnement Electron via `window.electronAPI?.isElectron`

#### Exemple d'utilisation

```tsx
function LoginPage() {
    const { config, loading, error } = useConfig();
    
    if (loading) return <LoadingSpinner />;
    if (error || !config?.googleClientId) return <ErrorDisplay error={error} />;
    
    return <GoogleAuthButton googleClientId={config.googleClientId} />;
}
```

---

### useElectronAuth

**Fichier** : `app/hooks/useElectronAuth.ts`

Gestion de l'authentification OAuth pour Electron.

#### Signature

```typescript
function useElectronAuth(): {
    credential: string | null;
    error: string | null;
    openAuthInBrowser: (authUrl: string) => Promise<void>;
}
```

#### Communication Electron

| Événement | Direction | Description |
|-----------|-----------|-------------|
| `onOAuthToken` | Electron → React | Token reçu |
| `onOAuthCancelled` | Electron → React | Auth annulée |
| `openExternal` | React → Electron | Ouvre URL externe |

#### Exemple d'utilisation

```tsx
function ElectronLogin() {
    const { credential, error, openAuthInBrowser } = useElectronAuth();
    const { handleAuthWithToken } = useAuth();
    
    useEffect(() => {
        if (credential) {
            handleAuthWithToken(credential, config);
        }
    }, [credential]);
    
    return (
        <button onClick={() => openAuthInBrowser(authUrl)}>
            Connexion Google
        </button>
    );
}
```

---

### useFileActions

**Fichier** : `app/hooks/useFileActions.ts`

Actions sur les fichiers (suppression) avec intégration drag & drop.

#### Signature

```typescript
function useFileActions(options: UseFileActionsOptions): {
    deleteFile: (item: DraggableFileItem) => Promise<DropResult>;
}

interface UseFileActionsOptions {
    userId: string | null;
    onFileDeleted?: (fileId: string, category: string) => void;
    onError?: (error: string) => void;
    onSuccess?: (message: string) => void;
}
```

#### Dépendances

| Import | Source | Description |
|--------|--------|-------------|
| `useDragDrop` | `~/contexts/DragDropContext` | Contexte D&D |
| `handleCacheInvalidation` | `~/utils/cache/cacheInvalidation` | Invalidation |

#### Flux de suppression

```
1. deleteFile(item)
   → DELETE /api/files/${category}/${fileId}?userId=${userId}
   → handleCacheInvalidation({ type: 'file:delete', ... })
   → onFileDeleted(fileId, category)
   → return { success: true }
```

#### Exemple d'utilisation

```tsx
function FileList() {
    const { user } = useAuth();
    const { addToast } = useToast();
    
    const { deleteFile } = useFileActions({
        userId: user?.id,
        onFileDeleted: (fileId, category) => refetch(),
        onError: (error) => addToast({ message: error, type: 'error' }),
        onSuccess: (message) => addToast({ message, type: 'success' }),
    });
    
    return (
        <DraggableItem item={file}>
            <FileCard file={file} />
        </DraggableItem>
    );
}
```

---

### useFiles

**Fichier** : `app/hooks/useFiles.ts`

Liste des fichiers d'un utilisateur avec système de cache multi-niveaux.

#### Signature

```typescript
function useFiles(options: UseFilesOptions): UseFilesReturn;

interface UseFilesOptions {
    category: FileCategory;
    userId: string | null;
    enabled?: boolean;         // Défaut: true
    refetchInterval?: number;  // En ms (optionnel)
}

interface UseFilesReturn {
    files: FileItem[];
    loading: boolean;          // Chargement initial uniquement
    isRefreshing: boolean;     // Refresh en arrière-plan
    error: string | null;
    refetch: () => Promise<void>;
}
```

#### Système de cache

| Niveau | Durée | Clé |
|--------|-------|-----|
| Mémoire (Map) | 24h | `${userId}_${category}` |
| localStorage | 24h | `videomi_files_${userId}_${category}` |

#### Fonctions d'invalidation exportées

```typescript
// Invalide une catégorie pour un utilisateur
export function invalidateFileCache(userId: string, category: string): void;

// Invalide tout le cache fichiers
export function invalidateAllFileCache(): void;

// Invalide tout le cache d'un utilisateur
export function invalidateUserFileCache(userId: string): void;

// Listener d'invalidation
export function onCacheInvalidation(listener: () => void): () => void;
```

#### Variables globales (debug)

```javascript
window.__fileCache // Map du cache mémoire
```

#### Exemple d'utilisation

```tsx
function FilmsPage() {
    const { user } = useAuth();
    const { files, loading, isRefreshing, error, refetch } = useFiles({
        category: 'videos',
        userId: user?.id,
    });
    
    if (loading) return <LoadingSpinner />;
    if (error) return <ErrorDisplay error={error} onRetry={refetch} />;
    
    return (
        <>
            {isRefreshing && <RefreshIndicator />}
            <FileGrid files={files} />
        </>
    );
}
```

---

### useFilesPreloader

**Fichier** : `app/hooks/useFilesPreloader.ts`

Préchargement intelligent des fichiers par catégorie.

#### Signature

```typescript
function useFilesPreloader(options: UseFilesPreloaderOptions): {
    preloadCategory: (category: FileCategory) => void;
}

interface UseFilesPreloaderOptions {
    userId: string | null;
    enabled?: boolean;         // Défaut: true
    preloadOnHover?: boolean;  // Défaut: true
}
```

#### Comportement

| Phase | Description |
|-------|-------------|
| Montage | Précharge toutes les catégories après 1s |
| Hover | `preloadCategory(category)` appelé manuellement |
| Cache | Vérifie cache mémoire et localStorage (< 5 min) |

#### Exemple d'utilisation

```tsx
function CategoryBar({ selectedCategory, onCategoryChange }) {
    const { user } = useAuth();
    const { preloadCategory } = useFilesPreloader({ userId: user?.id });
    
    return (
        <div>
            {categories.map(cat => (
                <button
                    key={cat}
                    onClick={() => onCategoryChange(cat)}
                    onMouseEnter={() => preloadCategory(cat)}
                >
                    {cat}
                </button>
            ))}
        </div>
    );
}
```

---

### useLocalCache

**Fichier** : `app/hooks/useLocalCache.ts`

Hook wrapper pour le système de cache IndexedDB.

#### Signature

```typescript
function useLocalCache(options: UseLocalCacheOptions): {
    fetchCached: <T>(url: string, options: FetchOptions) => Promise<T>;
    invalidate: (pattern: string) => Promise<void>;
    clear: () => Promise<void>;
    invalidateCategory: (category: string) => Promise<void>;
    invalidateFile: (fileId: string) => Promise<void>;
    invalidateStats: () => Promise<void>;
}

interface UseLocalCacheOptions {
    userId: string | null;
}

interface FetchOptions extends RequestInit {
    cacheKey?: string;
    ttl?: number;
    resource?: string;
    params?: Record<string, string | number | null>;
}
```

#### TTL par défaut

```typescript
// ~/utils/cache/localCache.ts
export const LOCAL_CACHE_TTL = {
    USER_FILES: 3600,      // 1 heure
    USER_STATS: 300,       // 5 minutes
    FILE_INFO: 3600,       // 1 heure
    FILE_METADATA: 3600,   // 1 heure
    RATINGS: 3600,         // 1 heure
    TOP10: 3600,           // 1 heure
    THUMBNAIL_URL: 604800, // 7 jours
};
```

#### Exemple d'utilisation

```tsx
function StatsComponent() {
    const { user } = useAuth();
    const { fetchCached, invalidateStats } = useLocalCache({ userId: user?.id });
    
    const loadStats = async () => {
        const data = await fetchCached<{ stats: Stats }>(
            `/api/stats?userId=${user.id}`,
            {
                resource: 'stats',
                ttl: LOCAL_CACHE_TTL.USER_STATS,
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            }
        );
        setStats(data.stats);
    };
    
    // Après action qui modifie les stats
    await invalidateStats();
    await loadStats();
}
```

---

### useUploadManager

**Fichier** : `app/hooks/useUploadManager.tsx`

Gestion complète des uploads de fichiers.

#### Signature

```typescript
function useUploadManager(): {
    uploads: UploadProgress[];
    isUploading: boolean;
    error: string | null;
    uploadFiles: (files: FileList | File[]) => Promise<void>;
    cancelUpload: (fileId: string) => void;
    getStatusColor: (status: UploadStatus) => string;
    formatSpeed: (bytesPerSecond: number) => string;
    formatTime: (seconds: number) => string;
    uploadFile: (file: File) => Promise<string>;
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
    eta?: number;            // secondes
}

type UploadStatus = 
    | 'pending' 
    | 'uploading' 
    | 'paused' 
    | 'completed' 
    | 'error' 
    | 'cancelled';
```

#### Dépendances

| Import | Source | Description |
|--------|--------|-------------|
| `useAuth` | `~/hooks/useAuth` | Utilisateur |
| `calculateSHA256` | `~/utils/file/hashCalculator` | Hash fichier |
| `generateFileId` | `~/utils/file/hashCalculator` | ID unique |
| `classifyFile` | `~/utils/file/fileClassifier` | Classification |

#### Flux d'upload

```
1. uploadFiles(files)
   → Pour chaque fichier :
     → calculateSHA256(file)
     → POST /api/upload/check (déduplication)
     → Si exists → POST /api/upload/link
     → Sinon :
       → POST /api/upload/init
       → Pour chaque chunk :
         → POST /api/upload/part
       → POST /api/upload/complete
     → handleCacheInvalidation({ type: 'file:upload' })
```

#### Exemple d'utilisation

```tsx
function UploadPage() {
    const {
        uploads,
        isUploading,
        uploadFiles,
        cancelUpload,
        formatSpeed,
        formatTime,
    } = useUploadManager();
    
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        uploadFiles(e.dataTransfer.files);
    };
    
    return (
        <div onDrop={handleDrop}>
            {uploads.map(upload => (
                <div key={upload.fileId}>
                    <span>{upload.filename}</span>
                    <progress value={upload.progress} max={100} />
                    <span>{formatSpeed(upload.speed)}</span>
                    <span>ETA: {formatTime(upload.eta)}</span>
                    {upload.status === 'uploading' && (
                        <button onClick={() => cancelUpload(upload.fileId)}>
                            Annuler
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
```

---

## Contextes React

### AuthContext

**Fichier** : `app/contexts/AuthContext.tsx`

Contexte d'authentification utilisateur.

#### Type

```typescript
interface AuthContextType {
    user: any;
    loading: boolean;
    error: string | null;
    isAuthenticated: boolean;
    logout: () => void;
    setError: (error: string | null) => void;
    handleAuthWithToken: (token: string, config: any) => Promise<void>;
}
```

#### Provider

```tsx
function AuthProvider({ children }: { children: React.ReactNode }) {
    const auth = useAuth();
    return (
        <AuthContext.Provider value={auth}>
            {children}
        </AuthContext.Provider>
    );
}
```

#### Hook associé

```typescript
function useAuthContext(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuthContext must be used within AuthProvider');
    }
    return context;
}
```

---

### DragDropContext

**Fichier** : `app/contexts/DragDropContext.tsx`

Contexte de gestion du drag & drop.

#### Types

```typescript
interface DragDropContextValue {
    // État
    dragState: DragState;
    dropZones: DropZoneConfig[];
    
    // Actions
    startDrag: (item: DraggableFileItem, event: React.DragEvent) => void;
    updateDragPosition: (x: number, y: number) => void;
    endDrag: () => void;
    setActiveDropZone: (zoneId: DropZoneAction | null) => void;
    executeDrop: (action: DropZoneAction) => Promise<DropResult | null>;
    
    // Configuration
    setDropZones: (zones: DropZoneConfig[]) => void;
    setDropActionHandler: (handler: DropActionHandler) => void;
    
    // Confirmation
    pendingAction: { action: DropZoneAction; item: DraggableFileItem } | null;
    confirmAction: () => Promise<void>;
    cancelAction: () => void;
}

interface DragState {
    isDragging: boolean;
    draggedItem: DraggableFileItem | null;
    activeDropZone: DropZoneAction | null;
    dragPosition: { x: number; y: number };
}

type DropZoneAction = 'delete' | 'archive' | 'move' | 'favorite';

interface DropZoneConfig {
    id: DropZoneAction;
    label: string;
    icon: string;
    color: string;
    requireConfirm: boolean;
}
```

#### Zones par défaut

```typescript
const DEFAULT_DROP_ZONES: DropZoneConfig[] = [
    {
        id: 'delete',
        label: 'Supprimer',
        icon: '🗑️',
        color: '#e50914',
        requireConfirm: true,
    },
];
```

#### Exemple d'utilisation

```tsx
function FileCard({ file }) {
    const { startDrag, endDrag } = useDragDrop();
    
    return (
        <DraggableItem
            item={{
                file_id: file.file_id,
                category: file.category,
                filename: file.filename,
            }}
        >
            <Card file={file} />
        </DraggableItem>
    );
}
```

---

### LanguageContext

**Fichier** : `app/contexts/LanguageContext.tsx`

Contexte d'internationalisation (i18n).

#### Type

```typescript
interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string | any;
    translations: Translations;
}

type Language = 'fr' | 'en' | 'es' | 'de';
```

#### Stockage

| Clé localStorage | Description |
|------------------|-------------|
| `videomi_language` | Code langue |

#### Détection automatique

1. `localStorage.getItem('videomi_language')`
2. `navigator.language.split('-')[0]`
3. Défaut : `'fr'`

#### Fonction t()

```typescript
// Accès par chemin avec notation pointée
t('nav.home')     // → "Accueil"
t('errors.retry') // → "Réessayer"
```

#### Exemple d'utilisation

```tsx
function MyComponent() {
    const { t, language, setLanguage } = useLanguage();
    
    return (
        <div>
            <h1>{t('home.title')}</h1>
            <select value={language} onChange={e => setLanguage(e.target.value)}>
                <option value="fr">Français</option>
                <option value="en">English</option>
            </select>
        </div>
    );
}
```

---

### PlayerContext

**Fichier** : `app/contexts/PlayerContext.tsx`

Contexte du lecteur média (audio/vidéo).

#### Type

```typescript
interface PlayerContextType {
    state: PlayerState;
    canRestore: boolean;
    restoredState: PersistedPlayerState | null;
    restorePlayback: () => void;
    dismissRestore: () => void;
    play: (params: PlayParams) => void;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    seek: (time: number) => void;
    setVolume: (volume: number) => void;
    playNext: () => void;
    playPrevious: () => void;
    toggleMiniPlayer: (show: boolean) => void;
    expandPlayer: () => void;
    audioRef: React.RefObject<HTMLAudioElement>;
    videoRef: React.RefObject<HTMLVideoElement>;
}

interface PlayerState {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    fileId: string | null;
    category: string | null;
    fileUrl: string | null;
    title: string | null;
    artist: string | null;
    thumbnail: string | null;
    type: 'audio' | 'video' | null;
    playlist: PlaylistTrack[];
    currentTrackIndex: number;
    playlistContext: string | null;
    isMiniPlayer: boolean;
}

interface PlaylistTrack {
    file_id: string;
    title: string;
    filename: string;
    category: string;
    artists?: string[];
    albums?: string[];
    album_thumbnails?: string[];
    thumbnail_url?: string;
}
```

#### Persistance (sessionStorage)

| Clé | Description |
|-----|-------------|
| `videomi_player_state` | État du lecteur |
| `videomi_player_timestamp` | Timestamp sauvegarde |

#### Conditions de restauration

- Position > 10 secondes
- Sauvegarde < 24 heures
- Même session navigateur

#### Exemple d'utilisation

```tsx
function VideoPlayer() {
    const {
        state,
        play,
        pause,
        resume,
        seek,
        setVolume,
        videoRef,
        canRestore,
        restorePlayback,
        dismissRestore,
    } = usePlayer();
    
    // Proposer restauration
    if (canRestore) {
        return (
            <div>
                <p>Reprendre la lecture ?</p>
                <button onClick={restorePlayback}>Oui</button>
                <button onClick={dismissRestore}>Non</button>
            </div>
        );
    }
    
    return (
        <video
            ref={videoRef}
            onTimeUpdate={(e) => /* mis à jour automatiquement */}
        />
    );
}
```

---

## Diagramme des dépendances

```
┌─────────────────────────────────────────────────────────────┐
│                      root.tsx                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                LanguageProvider                      │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │              AuthProvider                      │  │   │
│  │  │  ┌─────────────────────────────────────────┐  │  │   │
│  │  │  │           PlayerProvider                 │  │  │   │
│  │  │  │  ┌───────────────────────────────────┐  │  │  │   │
│  │  │  │  │        DragDropProvider           │  │  │  │   │
│  │  │  │  │                                   │  │  │  │   │
│  │  │  │  │  ┌───────────────────────────┐   │  │  │  │   │
│  │  │  │  │  │        <Outlet />         │   │  │  │  │   │
│  │  │  │  │  │        <MiniPlayer />     │   │  │  │  │   │
│  │  │  │  │  │        <DropZoneOverlay /> │   │  │  │  │   │
│  │  │  │  │  └───────────────────────────┘   │  │  │  │   │
│  │  │  │  └───────────────────────────────────┘  │  │  │   │
│  │  │  └─────────────────────────────────────────┘  │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Dépendances entre hooks

```
useAuth
    ├── localStorage (videomi_user, videomi_token)
    ├── clearLocalCache (localCache.ts)
    ├── clearServiceWorkerCache (serviceWorker.ts)
    ├── setServiceWorkerUserId (serviceWorker.ts)
    └── handleCacheInvalidation (cacheInvalidation.ts)

useFiles
    ├── window.__fileCache (cache mémoire)
    ├── localStorage (videomi_files_*)
    └── API /api/upload/user/:userId

useFilesPreloader
    ├── window.__fileCache
    ├── localStorage
    └── useFiles (indirectement)

useLocalCache
    └── localCache.ts (IndexedDB)

useFileActions
    ├── useDragDrop (contexte)
    ├── handleCacheInvalidation
    └── API /api/files/:cat/:id

useUploadManager
    ├── useAuth
    ├── hashCalculator.ts
    ├── fileClassifier.ts
    └── handleCacheInvalidation
```

---

## Bonnes pratiques

### 1. Toujours vérifier userId

```typescript
// ❌ Mauvais
const { fetchCached } = useLocalCache({ userId: user.id });

// ✅ Bon
const { fetchCached } = useLocalCache({ userId: user?.id || null });
```

### 2. Gérer les états de chargement

```typescript
// ❌ Mauvais
if (loading) return null;

// ✅ Bon
if (loading) return <LoadingSpinner />;
```

### 3. Invalider le cache après mutations

```typescript
// ❌ Mauvais
await deleteFile(fileId);
// Le cache n'est pas invalidé

// ✅ Bon
await deleteFile(fileId);
await handleCacheInvalidation({
    type: 'file:delete',
    userId,
    fileId,
    category,
});
```

### 4. Utiliser les types stricts

```typescript
// ❌ Mauvais
const category = 'videos';

// ✅ Bon
const category: FileCategory = 'videos';
```

---

*Document généré automatiquement — Janvier 2026*
