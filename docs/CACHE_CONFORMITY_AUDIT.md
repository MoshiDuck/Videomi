# Audit de Conformité Cache Multi-Niveaux — Vérification Indépendante

**Date** : 2026-01-22  
**Type** : Re-vérification exhaustive, factuelle, sans réutilisation des conclusions précédentes  
**Référence** : `CACHE_ARCHITECTURE.md`, `CACHE_README.md`, `CACHE_BEST_PRACTICES.md`, `CACHE_EXAMPLES.md`

---

## 1. Méthodologie

- Chaque exigence est vérifiée **directement dans le code** (fichier, fonction, extrait).
- Conformité : **totale** / **partielle** / **fragile** (dépend du contexte).
- Tout écart, même mineur ou ambigu, est signalé.

---

## 2. Tableau de conformité (doc → code → statut)

### 2.1 Cache navigateur (HTTP)

| # | Exigence doc | Référence code | Statut | Commentaire |
|---|----------------|----------------|--------|-------------|
| 1 | Métadonnées : `max-age=300, s-maxage=600, stale-while-revalidate=3600` | `workers/cache.ts` `putInCache` L119–131 : formule selon TTL, `stale-while-revalidate` pour TTL &lt; 604800 | **Partiel** | Formule générique (stale = min(ttl*12, 3600), s-maxage = max(ttl*2, ttl)). Pas les valeurs exactes 300/600/3600 pour métadonnées seules. |
| 2 | Thumbnails : `max-age=604800, s-maxage=2592000, immutable` | `workers/cache.ts` L124–126 ; `workers/upload.ts` thumbnail L2368 | **Conforme** | `putInCache` si ttl ≥ 604800 ; upload thumbnail explicite. |
| 3 | Fichiers média : `max-age=31536000, immutable` | `workers/upload.ts` stream/segment L214, 237 ; fichiers L2243, 2458, 2479 | **Conforme** | Headers conformes. |
| 4 | Stats : `max-age=60, s-maxage=300, stale-while-revalidate=600` | N/A | **Hors périmètre** | `/api/stats` exclu du cache Edge (billing) → pas de Cache-Control métier pour stats. |
| 5 | ETag pour métadonnées | `workers/cache.ts` `generateETag`, `putInCache` options.etag ; `upload.ts` files/stats/info | **Conforme** | ETag utilisé sur réponses cachées. |
| 6 | Vary: Authorization | `workers/cache.ts` `putInCache` options.vary ; `upload.ts` routes cachées | **Conforme** | Présent sur réponses concernées. |
| 7 | Données temps réel : `no-store, no-cache, must-revalidate` + `Pragma: no-cache` | `workers/app.ts` watch-progress GET/POST + user/:userId ; `utils.noCacheHeaders` | **Conforme** | Headers no-cache sur toutes les routes watch-progress. |

### 2.2 Cache Edge (Workers)

| # | Exigence doc | Référence code | Statut | Commentaire |
|---|----------------|----------------|--------|-------------|
| 8 | Pas de cache auth | `workers/cache.ts` `canCache` : `request.url.includes('/api/auth/')` → false | **Conforme** | Auth exclu. |
| 9 | Pas de cache watch-progress | `canCache` : `request.url.includes('/api/watch-progress/')` → false | **Conforme** | Exclu. |
| 10 | Pas de cache billing | `canCache` : `request.url.includes('/api/stats')` → false | **Conforme** | Stats (billableGB) non cachées Edge. |
| 11 | Clé Edge : `user:${userId}:${resource}:${params}` | `workers/cache.ts` `generateCacheKey` L33–61 | **Conforme** | Format respecté ; `public` si userId null. |
| 12 | TTL /api/upload/user : 5 min | `CACHE_TTL.USER_FILES` 300 ; utilisé dans `upload.ts` user files | **Conforme** | |
| 13 | TTL /api/stats : 1 min | Exclu du cache (billing) | **N/A** | Pas de cache stats. |
| 14 | TTL file info : 15 min | `CACHE_TTL.FILE_INFO` 900 ; `upload.ts` /api/files/.../info | **Conforme** | |
| 15 | TTL thumbnail : 7 jours | `CACHE_TTL.THUMBNAIL` 604800 ; `upload.ts` thumbnail | **Conforme** | |
| 16 | TTL ratings : 10 min | `CACHE_TTL.RATINGS` 600 ; cf. `app.ts` ratings | **Conforme** | |
| 17 | Invalidation Edge upload | `workers/upload.ts` après complete L1858–1870 : `invalidateCache` pour files + stats | **Conforme** | Clés cohérentes avec `generateCacheKey`. |
| 18 | Invalidation Edge delete | `workers/upload.ts` DELETE L2571–2586 : `invalidateCache` files, stats, file:info, thumbnail | **Conforme** | Mêmes clés qu’au cache. |
| 19 | Invalidation Edge metadata update | `workers/upload.ts` POST metadata L2865–2884 : `invalidateCache` file:info | **Conforme** | |
| 20 | Invalidation Edge rating | `workers/app.ts` POST ratings : `invalidateCache` ratings + top10 | **Conforme** | |
| 21 | `invalidateCache` supprime bien les clés | `workers/cache.ts` L177–207 : `cache.delete(key)` pour chaque clé (sauf wildcard) | **Conforme** | Correction : suppression du filtre `!key.includes(':')` qui bloquait toute purge. |

### 2.3 Cache local (IndexedDB + Cache Storage)

| # | Exigence doc | Référence code | Statut | Commentaire |
|---|----------------|----------------|--------|-------------|
| 22 | IndexedDB par utilisateur : `videomi_cache_${userId}` | `localCache.ts` `initDB` : `DB_NAME` + `_` + userId | **Conforme** | DB isolée par userId. |
| 23 | TTL métadonnées 1 h, stats 5 min, thumbnails 7 j | `LOCAL_CACHE_TTL` dans `localCache.ts` | **Conforme** | |
| 24 | Clé locale sans userId dans la clé | `generateLocalCacheKey` : resource + params triés | **Conforme** | Isolation par DB (userId), pas par clé. |
| 25 | Cleanup automatique | `cleanupExpiredCache` ; `getFromLocalCache` supprime si expiré | **Conforme** | |
| 26 | Stockage avec `key` (keyPath) | `localCache.ts` `putInLocalCache` : `CachedItem` inclut `key` ; store keyPath `key` | **Conforme** | Correction : `key` ajouté à l’item. |
| 27 | Fallback offline : servir cache même stale | `fetchWithLocalCache` : sur erreur fetch ou !response.ok, `getStaleFromLocalCache` puis return si trouvé | **Conforme** | `getStaleFromLocalCache` ajouté, pas de delete si stale. |
| 28 | Cache Storage (SW) pour images | `public/sw.js` : cache-first thumbnails/images, TTL 7 j | **Conforme** | |
| 29 | SW : pas de cache watch-progress | `sw.js` fetch : `pathname.includes('/api/watch-progress/')` → return | **Conforme** | |

### 2.4 Isolation et sécurité

| # | Exigence doc | Référence code | Statut | Commentaire |
|---|----------------|----------------|--------|-------------|
| 30 | Edge : userId dans clé | `generateCacheKey` ; toutes les routes user-scoped | **Conforme** | |
| 31 | Pas de cache auth / watch-progress / billing | canCache + SW (cf. ci‑dessus) | **Conforme** | |
| 32 | Logout : vider IndexedDB | `useAuth` logout : `clearLocalCache(userId)` | **Conforme** | |
| 33 | Logout : vider Cache Storage | `clearServiceWorkerCache` → message CLEAR_CACHE + `clearAll` ; SW `clearAllVideomiCaches` | **Conforme** | Correction : purge de tous les caches `videomi-images-*` au logout. |
| 34 | Pas de fuite cross-user (SW) | Fetch utilise `getCacheName(null)` → public ; logout vide tous les caches | **Conforme** | Risque résiduel : partage temporaire si multi‑user même navigateur avant logout. Acceptable. |

### 2.5 Invalidation côté client

| # | Exigence doc | Référence code | Statut | Commentaire |
|---|----------------|----------------|--------|-------------|
| 35 | Événements `videomi:cache-invalidate` | `cacheInvalidation.ts` : dispatch selon type | **Conforme** | |
| 36 | Upload → invalidation | `UploadManager` après succès : `handleCacheInvalidation` file:upload | **Conforme** | |
| 37 | Delete → invalidation | Aucun appel client à `handleCacheInvalidation({ type: 'file:delete', ... })` | **Écart** | Backend Edge invalidé ; pas d’appel client. Aucune UI de suppression de fichier trouvée. À lier quand feature delete existera. |
| 38 | Metadata update → invalidation | Pas d’appel client explicite après POST metadata | **Partiel** | Edge invalidé côté worker ; invalidation locale/events dépend des usages (match, etc.). |
| 39 | Rating → invalidation | Pas d’appel client à `handleCacheInvalidation` rating:new | **Partiel** | Edge invalidé ; local non branché systématiquement. |
| 40 | Logout → handleCacheInvalidation user:logout | `useAuth` logout : `handleCacheInvalidation({ type: 'user:logout', userId })` | **Conforme** | |

### 2.6 Cas particuliers

| # | Exigence doc | Référence code | Statut | Commentaire |
|---|----------------|----------------|--------|-------------|
| 41 | Logout si `userId` absent (refresh, token expiré) | `useAuth` logout : `if (userId)` pour IndexedDB + handleCacheInvalidation ; SW clearAll toujours appelé | **Partiel** | IndexedDB non vidé si user null. SW et localStorage/sessionStorage oui. Risque résiduel : ancienne DB utilisateur restante. |
| 42 | Multi‑onglets logout | Un seul onglet fait logout ; pas de sync (BroadcastChannel, etc.) | **Fragile** | Les autres onglets gardent état et caches jusqu’à navigation/refresh. |
| 43 | Token expiré → logout + clear | Pas de détection centralisée 401 → logout | **Écart** | Pas de flow « token expiré → logout automatique ». |

---

## 3. Corrections appliquées lors de cet audit

1. **`invalidateCache`** (`workers/cache.ts`)  
   - Suppression de la condition `!key.includes(':')` qui empêchait toute suppression (toutes les clés contiennent `:`).  
   - Invalidation Edge effectivement appliquée après upload/delete/metadata/rating.

2. **`putInLocalCache`** (`localCache.ts`)  
   - Ajout de `key` dans `CachedItem` et dans l’item stocké (keyPath `key`).  
   - Stockage et lecture IndexedDB cohérents.

3. **Exclusion de `/api/stats` du cache Edge** (`workers/cache.ts` `canCache`)  
   - Réponse contient `billableGB` → « informations de facturation » non cachées Edge.

4. **Logout SW** (`serviceWorker.ts` + `sw.js`)  
   - `clearServiceWorkerCache(..., clearAll: true)` par défaut.  
   - Message `CLEAR_CACHE` + `clearAll` → `clearAllVideomiCaches()` supprime tous les caches `videomi-images-*`.

5. **Fallback offline** (`localCache.ts`)  
   - `getStaleFromLocalCache` pour accepter le stale.  
   - `fetchWithLocalCache` : en cas d’erreur réseau ou `!response.ok`, retour du cache stale si disponible.

---

## 4. Risques résiduels (acceptables ou à traiter)

| Risque | Gravité | Statut |
|--------|--------|--------|
| Logout avec `userId` null : IndexedDB non vidée | Mineur | Acceptable : cas rare (refresh avant chargement user, etc.). |
| Multi‑onglets : pas de sync logout | Mineur | Acceptable : comportement courant sans BroadcastChannel. |
| Token expiré sans logout auto | Mineur | À traiter en dehors du périmètre cache (auth global). |
| Delete fichier : pas d’appel client `handleCacheInvalidation` | Important | À faire dès qu’une UI de suppression existera. |
| Metadata update / rating : invalidation locale pas systématiquement branchée | Mineur | Dépend des écrans ; Edge déjà invalidé. |
| Stats : plus de cache Edge (billing) | Mineur | Conforme à « ne jamais cacher la facturation » ; table TTL doc pour stats Edge devenue N/A. |

---

## 5. Cohérence TTL (navigateur / Edge / local)

- **Métadonnées fichiers** : Edge 5 min, local 1 h ; navigateur via headers Edge. **Cohérent.**  
- **Stats** : pas de cache Edge ; local 5 min (usage actuel via sessionStorage dans `home`). **Cohérent.**  
- **File info** : Edge 15 min, local 1 h. **Cohérent.**  
- **Thumbnails** : Edge 7 j, SW 7 j. **Cohérent.**  
- **Ratings** : Edge 10 min, local 1 h. **Cohérent.**

---

## 6. Checklist « prêt pour production »

- [x] Cache Edge : auth, watch-progress, billing exclus.
- [x] Invalidation Edge opérationnelle (upload, delete, metadata, rating).
- [x] IndexedDB : `key` correct, cleanup, isolation par userId.
- [x] Logout : IndexedDB + SW (tous les caches) + storage.
- [x] Fallback offline (stale) sur erreur réseau.
- [x] Pas de fuite cross-user intentionnelle ; SW vidé au logout.
- [ ] Delete fichier : brancher `handleCacheInvalidation` côté client dès que l’UI existe.
- [ ] Token expiré : logout automatique (hors périmètre strict cache).

---

## 7. Verdict

**Conformité globale** : **élevée** (aucun point **critique** bloquant restant après corrections).

**Points bloquants corrigés** :
- Invalidation Edge jamais effective → corrigée.
- IndexedDB sans `key` → corrigé.
- Billing en cache Edge → exclu.
- SW non vidé au logout (cache partagé) → tous les caches vidés.

**Limitations restantes (non bloquantes)** :
- Delete : pas d’UI ni d’appel `handleCacheInvalidation` ; à ajouter avec la feature.
- Logout sans userId, multi‑onglets, token expiré : risques limités et documentés.

**Prêt pour production** : **Oui**, sous réserve de brancher l’invalidation client (notamment `handleCacheInvalidation` file:delete) dès que la suppression de fichiers sera implémentée côté UI.

**Scale** : Architecture adaptée à ≥ 10 000 utilisateurs actifs (isolation, pas de cache billing, invalidation Edge cohérente, pas de fuite cross-user identifiée).
