# Système de Cache Multi-Niveaux - Videomi

## 📋 Résumé

Architecture de cache complète à 3 niveaux pour optimiser les performances et réduire les coûts Cloudflare :

1. **Cache Navigateur** : Headers HTTP automatiques
2. **Cache Edge** : Cloudflare Workers Cache API
3. **Cache Local** : IndexedDB + Service Worker

## 🎯 Objectifs Atteints

✅ Cache Edge implémenté dans les Workers  
✅ Headers HTTP corrects (Cache-Control, ETag, stale-while-revalidate)  
✅ Cache local avec IndexedDB pour métadonnées  
✅ Service Worker pour cache des images  
✅ Système d'invalidation intelligente  
✅ Isolation par utilisateur (sécurité)  
✅ Documentation complète  

## 📁 Fichiers Créés

### Workers
- `workers/cache.ts` : Utilitaires de cache Edge (Cache API)
- `workers/upload.ts` : Routes modifiées avec cache Edge

### Client
- `app/utils/cache/localCache.ts` : Système de cache IndexedDB
- `app/utils/cache/cacheInvalidation.ts` : Système d'invalidation
- `app/utils/cache/serviceWorker.ts` : Utilitaires Service Worker
- `app/hooks/useLocalCache.ts` : Hook React pour le cache local
- `public/sw.js` : Service Worker pour cache des images

### Documentation
- `docs/CACHE_ARCHITECTURE.md` : Architecture détaillée
- `docs/CACHE_BEST_PRACTICES.md` : Bonnes pratiques
- `docs/CACHE_EXAMPLES.md` : Exemples d'utilisation

## 🚀 Démarrage Rapide

### 1. Utiliser le cache local dans un composant

```typescript
import { useLocalCache } from '~/hooks/useLocalCache';
import { useAuth } from '~/hooks/useAuth';

function MyComponent() {
    const { user } = useAuth();
    const { fetchCached } = useLocalCache({ userId: user?.id || null });

    useEffect(() => {
        if (!user?.id) return;

        fetchCached<{ files: FileItem[] }>(
            `https://videomi.uk/api/upload/user/${user.id}?category=videos`,
            {
                resource: 'files',
                params: { category: 'videos' },
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('videomi_token')}`,
                },
            }
        ).then(data => {
            setFiles(data.files);
        });
    }, [user?.id, fetchCached]);
}
```

### 2. Invalider le cache après une mutation

```typescript
import { handleCacheInvalidation } from '~/utils/cache/cacheInvalidation';

// Après un upload
await handleCacheInvalidation({
    type: 'file:upload',
    userId: user.id,
    category: 'videos',
});
```

## 📊 Performance Attendue

### Réduction des Coûts

- **D1 Requests** : -85% à -90%
- **R2 Requests** : -75% à -80%

### Amélioration Latence

- **TTFB depuis Edge** : < 100ms
- **TTI avec cache local** : < 2s
- **Cache Hit Rate Edge** : > 80%
- **Cache Hit Rate Local** : > 90%

## 🔒 Sécurité

- ✅ Isolation par utilisateur (clés de cache incluent `userId`)
- ✅ Pas de données sensibles en cache Edge
- ✅ Nettoyage automatique au logout
- ✅ Headers `Vary: Authorization` pour requêtes authentifiées

## 📚 Documentation

- **Architecture** : `docs/CACHE_ARCHITECTURE.md`
- **Bonnes pratiques** : `docs/CACHE_BEST_PRACTICES.md`
- **Exemples** : `docs/CACHE_EXAMPLES.md`

## 🔧 Configuration

### TTL par Type de Données

| Type | Cache Navigateur | Cache Edge | Cache Local |
|------|------------------|------------|-------------|
| Liste fichiers | 5 min | 5 min | 1 h |
| Stats | 1 min | 1 min | 5 min |
| Métadonnées | 15 min | 15 min | 1 h |
| Thumbnails | 7 jours | 7 jours | 7 jours |

### Modification des TTL

Les TTL sont configurables dans :
- `workers/cache.ts` : `CACHE_TTL` (Edge)
- `app/utils/cache/localCache.ts` : `LOCAL_CACHE_TTL` (Local)

## 🐛 Debugging

### Vérifier le cache

```typescript
// Logs automatiques
// [CACHE] Hit: user:abc123:files:category:videos
// [LOCAL_CACHE] Hit: files:category:videos
```

### Vider le cache

```typescript
// Cache local
const { clear } = useLocalCache({ userId: user?.id || null });
await clear();

// Service Worker
import { clearServiceWorkerCache } from '~/utils/cache/serviceWorker';
await clearServiceWorkerCache();
```

## ✅ Checklist de Déploiement

- [x] Cache Edge implémenté
- [x] Headers HTTP configurés
- [x] Cache local IndexedDB
- [x] Service Worker pour images
- [x] Invalidation intelligente
- [x] Isolation par utilisateur
- [x] Documentation complète
- [ ] Tests en production
- [ ] Monitoring des hit rates
- [ ] Ajustement des TTL si nécessaire

## 📝 Notes Importantes

1. **Ne jamais mettre en cache** :
   - Tokens d'authentification
   - Watch progress (trop dynamique)
   - Données de facturation

2. **Toujours invalider** après :
   - Upload de fichier
   - Suppression de fichier
   - Mise à jour métadonnées
   - Nouveau rating

3. **Isolation utilisateur** :
   - Toujours inclure `userId` dans les clés de cache
   - Nettoyer le cache au logout

## 🆘 Support

Pour toute question, consulter la documentation dans `docs/` ou les commentaires dans le code source.
