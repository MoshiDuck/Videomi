# Exemples d'Intégration du Cache

## Exemple 1 : Route Films avec Cache Complet

```typescript
// app/routes/films.tsx
import { useLocalCache } from '~/hooks/useLocalCache';
import { useAuth } from '~/hooks/useAuth';
import { handleCacheInvalidation } from '~/utils/cache/cacheInvalidation';

export default function FilmsRoute() {
    const { user } = useAuth();
    const { fetchCached } = useLocalCache({ userId: user?.id || null });
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Récupérer les fichiers avec cache
    useEffect(() => {
        if (!user?.id) return;

        setLoading(true);
        
        fetchCached<{ files: FileItem[] }>(
            `https://videomi.uk/api/upload/user/${user.id}?category=videos`,
            {
                resource: 'files',
                params: { category: 'videos' },
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('videomi_token')}`,
                },
            }
        )
            .then(data => setFiles(data.files))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user?.id, fetchCached]);

    // Écouter les invalidations
    useEffect(() => {
        if (!user?.id) return;

        const handler = (event: CustomEvent) => {
            const { type, category } = event.detail;
            if (type === 'file:upload' && category === 'videos') {
                // Le cache sera automatiquement invalidé
                // Recharger les données
                window.location.reload(); // Ou mieux : refetch
            }
        };

        window.addEventListener('videomi:cache-invalidate', handler);
        return () => window.removeEventListener('videomi:cache-invalidate', handler);
    }, [user?.id]);

    return (
        <div>
            {loading ? <LoadingSpinner /> : <FileList files={files} />}
        </div>
    );
}
```

## Exemple 2 : Upload avec Invalidation

```typescript
// app/components/upload/UploadManager.tsx
import { handleCacheInvalidation } from '~/utils/cache/cacheInvalidation';
import { useAuth } from '~/hooks/useAuth';

export function UploadManager() {
    const { user } = useAuth();

    async function handleUploadComplete(file: File, category: string) {
        // ... logique d'upload ...
        
        // Invalider le cache après upload réussi
        if (user?.id) {
            await handleCacheInvalidation({
                type: 'file:upload',
                userId: user.id,
                category: category,
            });
        }
    }

    return (
        <input 
            type="file" 
            onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                    handleUploadComplete(file, 'videos');
                }
            }}
        />
    );
}
```

## Exemple 3 : Stats avec Cache

```typescript
// app/routes/home.tsx
import { useLocalCache } from '~/hooks/useLocalCache';
import { useAuth } from '~/hooks/useAuth';

export default function HomeRoute() {
    const { user } = useAuth();
    const { fetchCached, invalidateStats } = useLocalCache({ userId: user?.id || null });
    const [stats, setStats] = useState({ fileCount: 0, totalSizeGB: 0 });

    useEffect(() => {
        if (!user?.id) return;

        fetchCached<{ fileCount: number; totalSizeGB: number }>(
            `/api/stats?userId=${user.id}`,
            {
                resource: 'stats',
                params: { userId: user.id },
                ttl: 300, // 5 minutes
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('videomi_token')}`,
                },
            }
        )
            .then(data => setStats(data))
            .catch(console.error);
    }, [user?.id, fetchCached]);

    // Écouter les invalidations de stats
    useEffect(() => {
        if (!user?.id) return;

        const handler = (event: CustomEvent) => {
            if (event.detail.userId === user.id) {
                invalidateStats();
                // Recharger les stats
                // Le cache sera utilisé si disponible, sinon requête réseau
            }
        };

        window.addEventListener('videomi:stats-invalidated', handler);
        return () => window.removeEventListener('videomi:stats-invalidated', handler);
    }, [user?.id, invalidateStats]);

    return (
        <div>
            <p>Fichiers : {stats.fileCount}</p>
            <p>Taille : {stats.totalSizeGB.toFixed(2)} Go</p>
        </div>
    );
}
```

## Exemple 4 : Thumbnail avec Service Worker

```typescript
// app/components/ui/Thumbnail.tsx
import { useState } from 'react';

interface ThumbnailProps {
    fileId: string;
    category: string;
    alt?: string;
}

export function Thumbnail({ fileId, category, alt }: ThumbnailProps) {
    const [error, setError] = useState(false);
    const thumbnailUrl = `https://videomi.uk/api/files/${category}/${fileId}/thumbnail`;

    // Le Service Worker met automatiquement en cache l'image
    // Pas besoin de code supplémentaire !

    return (
        <img
            src={thumbnailUrl}
            alt={alt}
            onError={() => setError(true)}
            style={{
                width: '100%',
                height: 'auto',
                objectFit: 'cover',
            }}
        />
    );
}
```

## Exemple 5 : Logout avec Nettoyage

```typescript
// app/hooks/useAuth.ts
import { clearLocalCache } from '~/utils/cache/localCache';
import { clearServiceWorkerCache } from '~/utils/cache/serviceWorker';

export function useAuth() {
    const logout = useCallback(async () => {
        const userId = user?.id;
        
        // Nettoyer le cache local
        if (userId) {
            await clearLocalCache(userId);
        }
        
        // Nettoyer le cache Service Worker
        await clearServiceWorkerCache();
        
        // Nettoyer localStorage
        localStorage.removeItem('videomi_token');
        localStorage.removeItem('videomi_user');
        
        setUser(null);
        navigate('/login');
    }, [user?.id]);

    return { logout, ... };
}
```

## Exemple 6 : Worker avec Cache Edge

```typescript
// workers/upload.ts (déjà implémenté)
app.get('/api/upload/user/:userId', async (c) => {
    const userId = c.req.param('userId');
    const category = c.req.query('category');
    
    // Vérifier le cache Edge
    const cache = caches.default;
    const cacheKey = generateCacheKey(userId, 'files', { category });
    
    const cachedResponse = await getFromCache(cache, cacheKey);
    if (cachedResponse) {
        return c.json(await cachedResponse.json());
    }
    
    // Requête D1
    const files = await c.env.DATABASE.prepare(/* ... */).all();
    
    // Mettre en cache
    const response = c.json({ files: files.results });
    await putInCache(cache, cacheKey, response.clone(), CACHE_TTL.USER_FILES);
    
    return response;
});
```

## Exemple 7 : Invalidation après Delete

```typescript
// app/routes/info.tsx
import { handleCacheInvalidation } from '~/utils/cache/cacheInvalidation';
import { useAuth } from '~/hooks/useAuth';

export default function InfoRoute() {
    const { user } = useAuth();

    async function handleDelete(fileId: string, category: string) {
        // Supprimer le fichier
        await fetch(`/api/files/${category}/${fileId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('videomi_token')}`,
            },
        });
        
        // Invalider le cache
        if (user?.id) {
            await handleCacheInvalidation({
                type: 'file:delete',
                userId: user.id,
                fileId: fileId,
                category: category,
            });
        }
        
        // Naviguer vers la liste
        navigate(`/${category}`);
    }

    return (
        <button onClick={() => handleDelete(fileId, category)}>
            Supprimer
        </button>
    );
}
```

## Exemple 8 : Préchargement Intelligent

```typescript
// app/hooks/useFilesPreloader.ts (déjà implémenté)
export function useFilesPreloader({ userId, enabled = true }: Options) {
    const preloadCategory = useCallback((category: FileCategory) => {
        if (!userId || !enabled) return;
        
        // Vérifier le cache d'abord
        const cacheKey = `videomi_files_${userId}_${category}`;
        const cached = localStorage.getItem(cacheKey);
        
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
                return; // Déjà en cache récent
            }
        }
        
        // Précharger en arrière-plan
        fetch(`https://videomi.uk/api/upload/user/${userId}?category=${category}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('videomi_token')}`,
            },
        }).then(response => {
            if (response.ok) {
                return response.json();
            }
        }).then(data => {
            if (data?.files) {
                localStorage.setItem(cacheKey, JSON.stringify({
                    data: data.files,
                    timestamp: Date.now(),
                }));
            }
        });
    }, [userId, enabled]);

    return { preloadCategory };
}
```

Ces exemples montrent comment intégrer le cache dans différentes parties de l'application.
