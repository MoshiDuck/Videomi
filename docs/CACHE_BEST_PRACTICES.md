# Bonnes Pratiques et Guide d'Utilisation du Cache

## Vue d'ensemble

Ce guide explique comment utiliser efficacement le système de cache multi-niveaux de Videomi.

## Architecture en Bref

1. **Cache Navigateur** : Headers HTTP automatiques
2. **Cache Edge** : Cloudflare Workers Cache API
3. **Cache Local** : IndexedDB + Service Worker

## Utilisation du Cache Local

### Exemple : Récupérer une liste de fichiers avec cache

```typescript
import { useLocalCache } from '~/hooks/useLocalCache';
import { useAuth } from '~/hooks/useAuth';

function MyComponent() {
    const { user } = useAuth();
    const { fetchCached } = useLocalCache({ userId: user?.id || null });
    const [files, setFiles] = useState([]);

    useEffect(() => {
        if (!user?.id) return;

        fetchCached<{ files: FileItem[] }>(
            `https://videomi.uk/api/upload/user/${user.id}?category=videos`,
            {
                resource: 'files',
                params: { category: 'videos' },
                ttl: 3600, // 1 heure
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('videomi_token')}`,
                },
            }
        ).then(data => {
            setFiles(data.files);
        }).catch(error => {
            console.error('Erreur:', error);
        });
    }, [user?.id, fetchCached]);
}
```

### Exemple : Invalider le cache après un upload

```typescript
import { useLocalCache } from '~/hooks/useLocalCache';
import { handleCacheInvalidation } from '~/utils/cache/cacheInvalidation';

async function handleFileUpload(file: File, category: string) {
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
```

## Headers HTTP Automatiques

Les routes API retournent automatiquement les headers de cache appropriés :

- **Métadonnées** : `Cache-Control: public, max-age=300, s-maxage=600, stale-while-revalidate=3600`
- **Thumbnails** : `Cache-Control: public, max-age=604800, s-maxage=2592000, immutable`
- **Fichiers média** : `Cache-Control: public, max-age=31536000, immutable`

## Invalidation du Cache

### Événements d'invalidation

Le système émet des événements personnalisés pour invalider le cache :

```typescript
// Écouter les événements d'invalidation
useEffect(() => {
    if (!user?.id) return;

    const handler = (event: CustomEvent) => {
        const { type, category, fileId } = event.detail;
        
        if (type === 'file:upload' && category === 'videos') {
            // Recharger la liste des vidéos
            refetchVideos();
        }
    };

    window.addEventListener('videomi:cache-invalidate', handler);
    return () => window.removeEventListener('videomi:cache-invalidate', handler);
}, [user?.id]);
```

### Invalidation manuelle

```typescript
const { invalidateCategory, invalidateFile, invalidateStats } = useLocalCache({ userId: user?.id || null });

// Invalider une catégorie
await invalidateCategory('videos');

// Invalider un fichier spécifique
await invalidateFile('file123');

// Invalider les stats
await invalidateStats();
```

## Service Worker pour Images

Le Service Worker met automatiquement en cache les images et thumbnails.

### Invalider le cache d'images

```typescript
import { invalidateServiceWorkerCache } from '~/utils/cache/serviceWorker';

// Invalider toutes les images d'un fichier
await invalidateServiceWorkerCache(`/api/files/videos/${fileId}/thumbnail`);
```

## Pièges à Éviter

### ❌ Ne pas mettre en cache

```typescript
// ❌ MAUVAIS : Mettre en cache les données d'authentification
const token = await fetchCached('/api/auth/token'); // NE JAMAIS FAIRE ÇA

// ❌ MAUVAIS : Mettre en cache les watch progress
const progress = await fetchCached('/api/watch-progress/file123'); // Trop dynamique

// ✅ BON : Ne pas cacher les données temps réel
const progress = await fetch('/api/watch-progress/file123');
```

### ❌ Oublier l'invalidation

```typescript
// ❌ MAUVAIS : Upload sans invalidation
async function uploadFile(file: File) {
    await uploadToServer(file);
    // Oublié d'invalider le cache !
}

// ✅ BON : Invalider après mutation
async function uploadFile(file: File) {
    await uploadToServer(file);
    await handleCacheInvalidation({
        type: 'file:upload',
        userId: user.id,
        category: 'videos',
    });
}
```

### ❌ Cache cross-user

```typescript
// ❌ MAUVAIS : Clé de cache sans userId
const cacheKey = `files:videos`; // DANGEREUX !

// ✅ BON : Toujours inclure userId
const cacheKey = generateLocalCacheKey('files', { 
    userId: user.id, 
    category: 'videos' 
});
```

### ❌ TTL trop longs

```typescript
// ❌ MAUVAIS : TTL de 24h pour des données qui changent souvent
await putInLocalCache(userId, key, data, 86400); // 24h

// ✅ BON : TTL approprié selon le type de données
await putInLocalCache(userId, key, data, 3600); // 1h pour métadonnées
```

## Optimisations

### 1. Préchargement intelligent

```typescript
// Précharger les catégories au survol
const { preloadCategory } = useFilesPreloader({ userId: user?.id });

<button 
    onMouseEnter={() => preloadCategory('videos')}
>
    Vidéos
</button>
```

### 2. Stale-while-revalidate

Le système utilise automatiquement `stale-while-revalidate` :
- Serve le cache immédiatement
- Revalide en arrière-plan
- Met à jour silencieusement

### 3. Nettoyage automatique

Le cache local nettoie automatiquement les entrées expirées. Pas besoin d'intervention manuelle.

## Monitoring

### Vérifier le hit rate du cache

```typescript
// Les logs indiquent les hits/misses
// [CACHE] Hit: user:abc123:files:category:videos
// [LOCAL_CACHE] Hit: files:category:videos
```

### Debugging

```typescript
// Vider tout le cache local (développement uniquement)
const { clear } = useLocalCache({ userId: user?.id || null });
await clear();

// Vider le cache Service Worker
import { clearServiceWorkerCache } from '~/utils/cache/serviceWorker';
await clearServiceWorkerCache();
```

## Exemple Complet : Route avec Cache

```typescript
// app/routes/films.tsx
import { useLocalCache } from '~/hooks/useLocalCache';
import { useAuth } from '~/hooks/useAuth';

export default function FilmsRoute() {
    const { user } = useAuth();
    const { fetchCached, invalidateCategory } = useLocalCache({ userId: user?.id || null });
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);

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
            .then(data => {
                setFiles(data.files);
            })
            .catch(error => {
                console.error('Erreur:', error);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [user?.id, fetchCached]);

    // Écouter les invalidations
    useEffect(() => {
        if (!user?.id) return;

        const handler = (event: CustomEvent) => {
            const { type, category } = event.detail;
            if (type === 'file:upload' && category === 'videos') {
                // Recharger les fichiers
                // Le cache local sera utilisé si disponible
                // Sinon, requête réseau avec cache Edge
            }
        };

        window.addEventListener('videomi:cache-invalidate', handler);
        return () => window.removeEventListener('videomi:cache-invalidate', handler);
    }, [user?.id]);

    // ... reste du composant
}
```

## Checklist de Déploiement

- [ ] Vérifier que les headers HTTP sont corrects
- [ ] Tester l'invalidation après upload/delete
- [ ] Vérifier l'isolation par utilisateur
- [ ] Tester le Service Worker en production
- [ ] Monitorer les hit rates
- [ ] Vérifier les coûts Cloudflare (réduction attendue)

## Support

Pour toute question ou problème, consulter :
- `docs/CACHE_ARCHITECTURE.md` : Architecture détaillée
- `workers/cache.ts` : Implémentation Edge
- `app/utils/cache/localCache.ts` : Implémentation locale
