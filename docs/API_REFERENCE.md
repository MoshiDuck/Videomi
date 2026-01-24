# Référence API Videomi — Workers Cloudflare

> **Date de mise à jour** : 24 janvier 2026  
> **Version** : 1.0  
> **Fichiers source** : `workers/app.ts`, `workers/auth.ts`, `workers/upload.ts`, `workers/cache.ts`

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Authentification](#authentification)
3. [Configuration](#configuration)
4. [Gestion des fichiers](#gestion-des-fichiers)
5. [Upload](#upload)
6. [Streaming](#streaming)
7. [Statistiques](#statistiques)
8. [Métadonnées](#métadonnées)
9. [Progression de lecture](#progression-de-lecture)
10. [Ratings](#ratings)
11. [Codes d'erreur](#codes-derreur)
12. [Headers de cache](#headers-de-cache)

---

## Vue d'ensemble

### Architecture

L'API est déployée sur Cloudflare Workers avec :
- **Hono** : Framework HTTP minimaliste
- **D1** : Base de données SQLite distribuée
- **R2** : Stockage objet S3-compatible
- **Cache API** : Cache Edge Cloudflare

### Base URL

```
Production : https://videomi.uk
```

### Format des réponses

Toutes les réponses sont en JSON avec les headers CORS appropriés.

```http
Content-Type: application/json
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

---

## Authentification

### POST `/api/auth/google`

Authentifie un utilisateur via Google OAuth.

**Fichier source** : `workers/auth.ts` (lignes 1-80)

**Headers requis** : Aucun

**Body** :
```json
{
    "idToken": "string" // Token ID Google (requis)
}
```

**Réponse succès (200)** :
```json
{
    "success": true,
    "token": "JWT_TOKEN",
    "user": {
        "id": "google_id",
        "email": "user@example.com",
        "name": "John Doe",
        "picture": "https://...",
        "email_verified": true
    }
}
```

**Erreurs** :
| Code | Message | Description |
|------|---------|-------------|
| 400 | `Missing idToken` | Token non fourni |
| 401 | `Invalid Google token` | Token Google invalide |
| 500 | `Server misconfigured` | JWT_SECRET manquant |

**Cache** : Aucun (données sensibles)

---

### GET `/api/auth/electron-init`

Initialise l'authentification OAuth pour Electron.

**Fichier source** : `workers/app.ts` (lignes 150-180)

**Réponse** : URL d'authentification Google OAuth

**Erreurs** :
| Code | Message |
|------|---------|
| 500 | `GOOGLE_CLIENT_ID not configured` |

---

### GET `/api/auth/google/electron`

URL d'authentification Google pour Electron avec prompt de sélection de compte.

**Fichier source** : `workers/app.ts` (lignes 182-210)

**Réponse** : Redirection vers Google OAuth avec `prompt=select_account`

---

## Configuration

### GET `/api/config`

Retourne la configuration publique de l'application.

**Fichier source** : `workers/app.ts` (lignes 100-130)

**Headers requis** : Aucun

**Réponse (200)** :
```json
{
    "googleClientId": "string | null",
    "tmdbApiKey": "string | null",
    "omdbApiKey": "string | null",
    "spotifyClientId": "string | null",
    "spotifyClientSecret": "string | null",
    "discogsApiToken": "string | null"
}
```

**Cache** : `Cache-Control: no-cache` (config sensible)

---

## Gestion des fichiers

### GET `/api/upload/user/:userId`

Liste les fichiers d'un utilisateur, optionnellement filtrés par catégorie.

**Fichier source** : `workers/upload.ts` (lignes 1850-1960)

**Paramètres URL** :
| Param | Type | Description |
|-------|------|-------------|
| `userId` | string | ID utilisateur (requis) |

**Paramètres query** :
| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filtrer par catégorie (optionnel) |

**Réponse (200)** :
```json
{
    "files": [
        {
            "file_id": "string",
            "filename": "string",
            "category": "videos|musics|images|documents|...",
            "size": 12345678,
            "mime_type": "video/mp4",
            "created_at": "2026-01-24T12:00:00Z",
            "title": "string | null",
            "description": "string | null",
            "thumbnail_url": "string | null",
            "artists": ["string"],
            "albums": ["string"],
            "genres": ["string"],
            "season": 1,
            "episode": 5
        }
    ]
}
```

**Cache** :
- Edge TTL : 300s (5 min) — `workers/cache.ts:11`
- Headers : `Cache-Control: public, max-age=300, s-maxage=600, stale-while-revalidate=3600`
- Support ETag : Oui (304 Not Modified)

---

### GET `/api/files/:category/:fileId/info`

Retourne les informations détaillées d'un fichier.

**Fichier source** : `workers/upload.ts` (lignes 2080-2150)

**Paramètres URL** :
| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Catégorie du fichier |
| `fileId` | string | ID du fichier |

**Réponse (200)** :
```json
{
    "file": {
        "file_id": "string",
        "filename": "string",
        "category": "string",
        "size": 12345678,
        "mime_type": "string",
        "title": "string | null",
        "description": "string | null",
        "thumbnail_url": "string | null",
        "thumbnail_r2_path": "string | null",
        "backdrop_url": "string | null",
        "source_api": "tmdb | spotify | null",
        "source_id": "string | null",
        "genres": ["string"],
        "artists": ["string"],
        "albums": ["string"],
        "season": 1,
        "episode": 5
    }
}
```

**Cache** :
- Edge TTL : 900s (15 min) — `workers/cache.ts:16`
- Support ETag : Oui

**Erreurs** :
| Code | Message |
|------|---------|
| 404 | `File not found` |

---

### GET `/api/files/:category/:fileId`

Télécharge un fichier complet ou en streaming (Range requests).

**Fichier source** : `workers/upload.ts` (lignes 2250-2350)

**Paramètres URL** :
| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Catégorie du fichier |
| `fileId` | string | ID du fichier |

**Headers optionnels** :
| Header | Description |
|--------|-------------|
| `Range: bytes=0-1023` | Téléchargement partiel |

**Réponse succès** :
- `200 OK` : Fichier complet
- `206 Partial Content` : Chunk (avec header Range)

**Headers réponse** :
```http
Content-Type: application/octet-stream
Accept-Ranges: bytes
Content-Range: bytes 0-1023/123456 (si Range)
Cache-Control: public, max-age=31536000, immutable
```

---

### GET `/api/files/:category/:fileId/thumbnail`

Retourne la miniature d'un fichier.

**Fichier source** : `workers/upload.ts` (lignes 2360-2450)

**Réponse** : Image (JPEG, PNG, WebP)

**Cache** :
- Edge TTL : 604800s (7 jours) — `workers/cache.ts:19`
- Headers : `Cache-Control: public, max-age=604800, s-maxage=2592000, immutable`

**Fallback** :
1. R2 (`thumbnail_r2_path`)
2. Extensions alternatives (.jpg, .png, .webp)
3. URL externe (`thumbnail_url`)

---

### DELETE `/api/files/:category/:fileId`

Supprime un fichier.

**Fichier source** : `workers/upload.ts` (lignes 2550-2650)

**Headers requis** :
```http
Authorization: Bearer <JWT_TOKEN>
```

**Paramètres query** :
| Param | Type | Description |
|-------|------|-------------|
| `userId` | string | ID utilisateur (requis) |

**Réponse (200)** :
```json
{
    "success": true,
    "deleted": true
}
```

**Erreurs** :
| Code | Message |
|------|---------|
| 400 | `Missing userId` |
| 401 | `Unauthorized` |
| 404 | `File not found or not owned by user` |

**Cache** : Invalidation automatique du cache Edge

---

## Upload

### POST `/api/upload/check`

Vérifie si un fichier existe déjà (par hash SHA-256).

**Fichier source** : `workers/upload.ts` (lignes 200-250)

**Body** :
```json
{
    "hash": "sha256_hash_string"
}
```

**Réponse (200)** :
```json
{
    "exists": true,
    "fileId": "existing_file_id | null"
}
```

---

### POST `/api/upload/init`

Initialise un upload multipart.

**Fichier source** : `workers/upload.ts` (lignes 300-450)

**Headers requis** :
```http
Authorization: Bearer <JWT_TOKEN>
```

**Body** :
```json
{
    "fileId": "string",
    "category": "videos | musics | images | documents | archives | executables | others",
    "size": 12345678,
    "mimeType": "video/mp4",
    "userId": "string",
    "filename": "video.mp4",
    "hash": "sha256_hash"
}
```

**Réponse (200)** :
```json
{
    "uploadId": "multipart_upload_id",
    "fileId": "string",
    "category": "string",
    "expiresIn": 3600
}
```

Ou si le fichier existe déjà :
```json
{
    "exists": true,
    "fileId": "existing_file_id",
    "category": "string",
    "uploadId": null,
    "expiresIn": 0
}
```

---

### POST `/api/upload/part`

Upload un chunk de fichier.

**Fichier source** : `workers/upload.ts` (lignes 500-600)

**Headers requis** :
| Header | Description |
|--------|-------------|
| `X-Upload-Id` | ID de l'upload multipart |
| `X-Part-Number` | Numéro du chunk (1-indexed) |
| `X-File-Id` | ID du fichier |
| `X-Category` | Catégorie du fichier |
| `X-Filename` | Nom du fichier (optionnel) |

**Body** : `ArrayBuffer` (données binaires du chunk)

**Réponse (200)** :
```json
{
    "success": true,
    "partNumber": 1,
    "etag": "\"part_etag\""
}
```

---

### POST `/api/upload/complete`

Finalise un upload multipart.

**Fichier source** : `workers/upload.ts` (lignes 650-800)

**Body** :
```json
{
    "uploadId": "string",
    "parts": [
        { "partNumber": 1, "etag": "\"etag1\"" },
        { "partNumber": 2, "etag": "\"etag2\"" }
    ],
    "filename": "video.mp4",
    "basicMetadata": {
        "title": "string",
        "duration": 7200
    }
}
```

**Réponse (200)** :
```json
{
    "success": true,
    "fileId": "string",
    "category": "string",
    "url": "https://..."
}
```

---

### POST `/api/upload/link`

Lie un fichier existant à un utilisateur (déduplication).

**Fichier source** : `workers/upload.ts` (lignes 850-920)

**Body** :
```json
{
    "fileId": "string",
    "userId": "string"
}
```

**Réponse (200)** :
```json
{
    "success": true,
    "alreadyLinked": false
}
```

---

## Streaming

### GET `/api/stream/:fileId/master.m3u8`

Retourne la playlist HLS master.

**Fichier source** : `workers/upload.ts` (lignes 180-220)

**Réponse** :
```http
Content-Type: application/vnd.apple.mpegurl
Cache-Control: public, max-age=3600
```

---

### GET `/api/stream/:fileId/:segment`

Retourne un segment vidéo HLS.

**Fichier source** : `workers/upload.ts` (lignes 225-260)

**Réponse** :
```http
Content-Type: video/mp4
Cache-Control: public, max-age=31536000, immutable
```

---

## Statistiques

### GET `/api/stats`

Retourne les statistiques d'utilisation d'un utilisateur.

**Fichier source** : `workers/upload.ts` (lignes 2130-2200)

**Headers requis** :
```http
Authorization: Bearer <JWT_TOKEN>
```

**Paramètres query** :
| Param | Type | Description |
|-------|------|-------------|
| `userId` | string | ID utilisateur (requis) |

**Réponse (200)** :
```json
{
    "fileCount": 42,
    "totalSizeBytes": 12345678901,
    "totalSizeGB": 11.5,
    "billableGB": 12.0
}
```

**Cache** : `Cache-Control: no-store, no-cache, must-revalidate`
- **Raison** : Contient des données de facturation (jamais en cache Edge selon `workers/cache.ts:231`)

---

## Métadonnées

### POST `/api/files/:fileId/metadata`

Met à jour les métadonnées d'un fichier.

**Fichier source** : `workers/upload.ts` (lignes 1700-1800)

**Body** (tous les champs optionnels) :
```json
{
    "title": "string",
    "description": "string",
    "episode_description": "string",
    "thumbnail_url": "string",
    "backdrop_url": "string",
    "thumbnail_r2_path": "string",
    "source_api": "tmdb | spotify",
    "source_id": "string",
    "genres": ["Action", "Sci-Fi"],
    "subgenres": ["Cyberpunk"],
    "season": 1,
    "episode": 5,
    "artists": ["Artist Name"],
    "albums": ["Album Name"],
    "album_thumbnails": ["https://..."],
    "year": 2026
}
```

**Réponse (200)** :
```json
{
    "success": true
}
```

**Cache** : Invalidation automatique du cache Edge

---

### POST `/api/media/thumbnail`

Télécharge et stocke une image de miniature externe.

**Fichier source** : `workers/upload.ts` (lignes 1600-1700)

**Body** :
```json
{
    "imageUrl": "https://example.com/image.jpg",
    "fileId": "string",
    "category": "videos"
}
```

**Réponse (200)** :
```json
{
    "thumbnail_r2_path": "thumbnails/videos/abc123.jpg",
    "url": "https://..."
}
```

---

## Progression de lecture

### GET `/api/watch-progress/:fileId`

Récupère la progression de lecture d'un fichier.

**Fichier source** : `workers/app.ts` (lignes 300-380)

**Headers requis** :
```http
Authorization: Bearer <JWT_TOKEN>
```

**Réponse (200)** :
```json
{
    "user_id": "string",
    "file_id": "string",
    "current_time": 1234.5,
    "duration": 7200,
    "progress_percent": 17.1,
    "last_watched": 1706140800000
}
```

Ou `null` si aucune progression.

**Cache** : `Cache-Control: no-cache`
- **Raison** : Données temps réel (jamais en cache selon `workers/cache.ts:225`)

---

### POST `/api/watch-progress/:fileId`

Sauvegarde la progression de lecture.

**Fichier source** : `workers/app.ts` (lignes 400-480)

**Headers requis** :
```http
Authorization: Bearer <JWT_TOKEN>
```

**Body** :
```json
{
    "current_time": 1234.5,
    "duration": 7200,
    "user_id": "string"
}
```

**Réponse (200)** :
```json
{
    "success": true
}
```

---

### GET `/api/watch-progress/user/:userId`

Liste les progressions de lecture récentes (pour "Continuer à regarder").

**Fichier source** : `workers/app.ts` (lignes 500-580)

**Headers requis** :
```http
Authorization: Bearer <JWT_TOKEN>
```

**Réponse (200)** :
```json
{
    "progressions": [
        {
            "file_id": "string",
            "current_time": 1234.5,
            "duration": 7200,
            "progress_percent": 17.1,
            "last_watched": 1706140800000
        }
    ]
}
```

**Limite** : 20 dernières progressions (5% < progress < 95%)

---

## Ratings

### POST `/api/ratings/:fileId`

Note un fichier.

**Fichier source** : `workers/app.ts` (lignes 600-700)

**Headers requis** :
```http
Authorization: Bearer <JWT_TOKEN>
```

**Body** :
```json
{
    "rating": 4,
    "user_id": "string"
}
```

**Réponse (200)** :
```json
{
    "success": true,
    "userRating": 4,
    "averageRating": 4.2
}
```

**Erreurs** :
| Code | Message |
|------|---------|
| 400 | `Rating doit être entre 1 et 5` |

**Cache** : Invalidation automatique

---

### GET `/api/ratings/:fileId`

Récupère les notes d'un fichier.

**Fichier source** : `workers/app.ts` (lignes 720-800)

**Headers requis** :
```http
Authorization: Bearer <JWT_TOKEN>
```

**Paramètres query** :
| Param | Type | Description |
|-------|------|-------------|
| `user_id` | string | ID utilisateur (requis) |

**Réponse (200)** :
```json
{
    "userRating": 4,
    "averageRating": 4.2
}
```

---

### GET `/api/ratings/top10`

Retourne le top 10 des fichiers les mieux notés.

**Fichier source** : `workers/app.ts` (lignes 820-920)

**Headers requis** :
```http
Authorization: Bearer <JWT_TOKEN>
```

**Paramètres query** :
| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Catégorie (défaut: `videos`) |
| `groupBySeries` | boolean | Grouper par série (optionnel) |

**Réponse (200)** :
```json
{
    "top10": [
        {
            "file_id": "string",
            "averageRating": 4.8,
            "ratingCount": 125
        }
    ]
}
```

Avec `groupBySeries=true` :
```json
{
    "top10": [
        {
            "source_id": "tmdb_12345",
            "averageRating": 4.8,
            "ratingCount": 450,
            "episodeCount": 24
        }
    ]
}
```

**Cache** :
- Edge TTL : 600s (10 min) — `workers/cache.ts:24`

---

## Codes d'erreur

### Format standard

```json
{
    "error": "Message d'erreur court",
    "message": "Description détaillée (optionnel)",
    "details": "Stack trace tronqué (optionnel, dev only)"
}
```

### Codes HTTP

| Code | Description |
|------|-------------|
| 200 | Succès |
| 206 | Partial Content (Range request) |
| 304 | Not Modified (ETag match) |
| 400 | Bad Request (paramètres manquants/invalides) |
| 401 | Unauthorized (token manquant/invalide) |
| 404 | Not Found (ressource introuvable) |
| 500 | Internal Server Error |

---

## Headers de cache

### Configuration TTL

**Fichier source** : `workers/cache.ts` (lignes 9-28)

```typescript
export const CACHE_TTL = {
    USER_FILES: 300,     // 5 minutes
    USER_STATS: 60,      // 1 minute (mais no-cache en headers)
    FILE_INFO: 900,      // 15 minutes
    FILE_METADATA: 900,  // 15 minutes
    THUMBNAIL: 604800,   // 7 jours
    BACKDROP: 604800,    // 7 jours
    RATINGS: 600,        // 10 minutes
    TOP10: 600,          // 10 minutes
    CONFIG: 3600,        // 1 heure
};
```

### Endpoints sans cache

| Endpoint | Raison | Référence |
|----------|--------|-----------|
| `/api/auth/*` | Données sensibles | `workers/cache.ts:220` |
| `/api/watch-progress/*` | Temps réel | `workers/cache.ts:225` |
| `/api/stats` | Facturation | `workers/cache.ts:231` |

### Headers par type

| Type | Cache-Control |
|------|--------------|
| Métadonnées | `public, max-age=300, s-maxage=600, stale-while-revalidate=3600` |
| Thumbnails | `public, max-age=604800, s-maxage=2592000, immutable` |
| Fichiers média | `public, max-age=31536000, immutable` |
| Temps réel | `no-store, no-cache, must-revalidate` |

---

## Health Check

### GET `/health`

Vérifie l'état des services.

**Fichier source** : `workers/app.ts` (lignes 50-80)

**Réponse (200)** :
```json
{
    "status": "ok",
    "d1_available": true,
    "has_jwt_secret": true,
    "has_google_client_id": true
}
```

---

## Résumé des endpoints

| Méthode | Endpoint | Auth | Cache |
|---------|----------|------|-------|
| POST | `/api/auth/google` | Non | Non |
| GET | `/api/config` | Non | no-cache |
| GET | `/api/upload/user/:userId` | Non | 5 min |
| POST | `/api/upload/check` | Non | Non |
| POST | `/api/upload/init` | Bearer | Non |
| POST | `/api/upload/part` | Non | Non |
| POST | `/api/upload/complete` | Non | Non |
| POST | `/api/upload/link` | Non | Non |
| GET | `/api/files/:cat/:id/info` | Non | 15 min |
| GET | `/api/files/:cat/:id` | Non | immutable |
| GET | `/api/files/:cat/:id/thumbnail` | Non | 7 jours |
| DELETE | `/api/files/:cat/:id` | Bearer | Invalidation |
| GET | `/api/stream/:id/master.m3u8` | Non | 1 h |
| GET | `/api/stream/:id/:segment` | Non | immutable |
| GET | `/api/stats` | Bearer | no-cache |
| POST | `/api/files/:id/metadata` | Non | Invalidation |
| POST | `/api/media/thumbnail` | Non | Non |
| GET | `/api/watch-progress/:id` | Bearer | no-cache |
| POST | `/api/watch-progress/:id` | Bearer | Non |
| GET | `/api/watch-progress/user/:id` | Bearer | no-cache |
| POST | `/api/ratings/:id` | Bearer | Invalidation |
| GET | `/api/ratings/:id` | Bearer | 10 min |
| GET | `/api/ratings/top10` | Bearer | 10 min |
| GET | `/health` | Non | Non |

---

*Document généré automatiquement — Janvier 2026*
