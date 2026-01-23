# Architecture de Cache Multi-Niveaux - Videomi

## Vue d'ensemble

Cette architecture implémente une stratégie de cache à 3 niveaux pour optimiser les performances et réduire les coûts Cloudflare, tout en garantissant une expérience utilisateur fluide de type Netflix/Spotify.

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (React)                            │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  IndexedDB       │  │  Cache Storage   │                │
│  │  (Métadonnées)   │  │  (Images/Media)│                │
│  │  TTL: 1h-24h     │  │  TTL: 7-30 jours │                │
│  └──────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              CLOUDFLARE EDGE (Workers)                       │
│  ┌──────────────────────────────────────────┐               │
│  │  Cache API (caches.default)              │               │
│  │  - Métadonnées API: 5-15 min             │               │
│  │  - Thumbnails: 1-7 jours                 │               │
│  │  - Stats: 1-5 min                        │               │
│  └──────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              ORIGINE (D1 + R2)                                │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │  D1 Database │  │  R2 Storage  │                        │
│  │  (Métadonnées)│  │  (Fichiers)  │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

## Niveaux de Cache

### 1. Cache Navigateur (HTTP Headers)

**Rôle** : Cache automatique du navigateur basé sur les headers HTTP.

**Contenu** :
- Métadonnées JSON (listes de fichiers, stats)
- Images et miniatures
- Fichiers média (vidéos, musiques)

**Stratégie** : Cache-Control avec stale-while-revalidate

**TTL par type** :
- Métadonnées utilisateur : `max-age=300, s-maxage=600, stale-while-revalidate=3600`
- Thumbnails : `max-age=604800, s-maxage=2592000, immutable`
- Fichiers média : `max-age=31536000, immutable`
- Stats : `max-age=60, s-maxage=300, stale-while-revalidate=600`

### 2. Cache Edge Cloudflare (Workers + Cache API)

**Rôle** : Réduire les hits D1/R2 et améliorer la latence.

**Contenu** :
- Réponses API JSON (métadonnées, stats)
- Thumbnails et images
- **PAS de données sensibles** (tokens, infos utilisateur privées)

**Stratégie** : Cache-first avec revalidation en arrière-plan

**TTL par type** :
- `/api/upload/user/:userId` : 5 minutes (s-maxage)
- `/api/stats` : 1 minute (s-maxage)
- `/api/files/:category/:fileId/info` : 15 minutes
- `/api/files/:category/:fileId/thumbnail` : 7 jours
- `/api/ratings/*` : 10 minutes
- `/api/watch-progress/*` : Pas de cache (données temps réel)

**Isolation** : Clé de cache inclut `userId` pour éviter les fuites cross-user

### 3. Cache Local Utilisateur (IndexedDB + Cache Storage)

**Rôle** : Offline-first, réduction des requêtes réseau.

**Contenu** :
- **IndexedDB (Dexie)** : Métadonnées structurées (fichiers, stats, ratings)
- **Cache Storage** : Images, miniatures, assets statiques

**TTL par type** :
- Métadonnées fichiers : 1 heure (révalidation en arrière-plan)
- Stats : 5 minutes
- Thumbnails : 7 jours
- Images : 30 jours

**Stratégie** : Cache-first, fallback réseau, mise à jour en arrière-plan

## Politique de TTL Détaillée

| Type de Données | Cache Navigateur | Cache Edge | Cache Local | Invalidation |
|----------------|------------------|------------|-------------|--------------|
| Liste fichiers utilisateur | 5 min | 5 min | 1 h | Upload/Delete |
| Stats utilisateur | 1 min | 1 min | 5 min | Upload/Delete |
| Métadonnées fichier | 15 min | 15 min | 1 h | Update metadata |
| Thumbnails | 7 jours | 7 jours | 7 jours | Upload/Delete |
| Ratings | 10 min | 10 min | 1 h | New rating |
| Watch progress | Pas de cache | Pas de cache | 5 min | Temps réel |
| Fichiers média | 1 an | 1 an | 30 jours | Delete |

## Stratégie d'Invalidation

### Événements déclencheurs

1. **Upload de fichier** :
   - Invalide : liste fichiers, stats, cache local catégorie
   - Edge : purge clé `user:${userId}:files:${category}`

2. **Suppression de fichier** :
   - Invalide : liste fichiers, stats, métadonnées, thumbnails
   - Edge : purge toutes les clés associées au `fileId`

3. **Mise à jour métadonnées** :
   - Invalide : métadonnées fichier, liste si changement visible
   - Edge : purge clé `file:${fileId}:info`

4. **Nouveau rating** :
   - Invalide : ratings fichier, top10
   - Edge : purge clés ratings

5. **Logout** :
   - Vide : tout le cache local (IndexedDB + Cache Storage)
   - Edge : pas d'action (expiration naturelle)

### Mécanisme d'invalidation

**Côté Client** :
- Événements personnalisés (`videomi:cache-invalidate`)
- Service Worker pour invalidation Cache Storage
- Dexie pour nettoyage IndexedDB

**Côté Edge** :
- Headers `Cache-Tags` pour invalidation par tag
- Purge manuelle via Cache API `cache.delete()`
- Versioning des clés de cache

## Isolation et Sécurité

### Isolation par utilisateur

- **Clés de cache Edge** : Toujours inclure `userId`
  - Format : `user:${userId}:${resource}:${params}`
  - Exemple : `user:abc123:files:videos`

- **IndexedDB** : Base de données par utilisateur
  - Nom : `videomi_cache_${userId}`
  - Nettoyage automatique au logout

- **Cache Storage** : Namespace par utilisateur
  - Préfixe : `videomi_${userId}_`

### Données sensibles

**Jamais mis en cache Edge** :
- Tokens d'authentification
- Données de profil privées
- Watch progress (données temps réel)
- Informations de facturation

**Cache local uniquement** :
- Préférences utilisateur
- Historique de navigation
- Cache de recherche

## Headers HTTP

### Métadonnées API

```http
Cache-Control: public, max-age=300, s-maxage=600, stale-while-revalidate=3600
ETag: "abc123def456"
Vary: Authorization
Cache-Tags: user:abc123, category:videos
```

### Thumbnails

```http
Cache-Control: public, max-age=604800, s-maxage=2592000, immutable
ETag: "thumbnail_abc123"
```

### Fichiers média

```http
Cache-Control: public, max-age=31536000, immutable
Accept-Ranges: bytes
```

### Données temps réel (pas de cache)

```http
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
```

## Optimisations Coûts Cloudflare

### Réduction des hits D1

- Cache Edge : 80-90% des requêtes métadonnées
- IndexedDB : 95%+ des requêtes répétées côté client

### Réduction des hits R2

- Cache Edge : 70-80% des requêtes thumbnails
- Cache Storage : 90%+ des requêtes images répétées

### Estimation économies

Pour 1000 utilisateurs actifs/jour :
- **Avant** : ~500k requêtes D1/jour, ~200k requêtes R2/jour
- **Après** : ~50k requêtes D1/jour, ~40k requêtes R2/jour
- **Économie** : ~90% réduction coûts D1, ~80% réduction coûts R2

## Bonnes Pratiques

### 1. Toujours utiliser stale-while-revalidate

Permet de servir du contenu stale pendant la revalidation, améliorant la perception de performance.

### 2. Versioning des clés de cache

Inclure un numéro de version dans les clés pour faciliter l'invalidation globale lors de changements de schéma.

### 3. Monitoring des hit rates

Surveiller les taux de hit du cache Edge pour ajuster les TTL si nécessaire.

### 4. Gestion des erreurs

En cas d'erreur réseau, servir depuis le cache local même si stale.

### 5. Progressive enhancement

L'application fonctionne sans cache, mais est optimisée avec cache.

## Pièges à Éviter

### ❌ Ne pas mettre en cache

- Données d'authentification
- Watch progress (trop dynamique)
- Données de facturation
- Tokens API externes

### ❌ Ne pas oublier

- L'isolation par utilisateur (sécurité critique)
- L'invalidation lors des mutations
- Les headers Vary pour les requêtes authentifiées
- Le nettoyage du cache au logout

### ❌ Ne pas sur-cacher

- Données qui changent fréquemment
- Données personnalisées par session
- Données nécessitant une cohérence stricte

## Métriques de Performance Cibles

- **Time to First Byte (TTFB)** : < 100ms (depuis Edge)
- **Time to Interactive (TTI)** : < 2s (avec cache local)
- **Cache Hit Rate Edge** : > 80%
- **Cache Hit Rate Local** : > 90% (requêtes répétées)
- **Réduction coûts D1** : > 85%
- **Réduction coûts R2** : > 75%
