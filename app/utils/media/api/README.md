# Guide d'Utilisation des API de Métadonnées

Ce guide explique comment utiliser le système d'intégration des API de métadonnées multimédias dans Videomi.

## Vue d'ensemble

Le système d'API de métadonnées est organisé en modules par catégorie :
- **Films & Séries** : TMDb, OMDb, TheTVDB
- **Musique** : MusicBrainz, Spotify, Discogs
- **Anime / Manga** : AniList, Kitsu
- **Sous-titres** : OpenSubtitles
- **Images** : Fanart.tv
- **Livres / Comics** : Google Books, Comic Vine

Chaque module implémente une interface standardisée et un système de fallback automatique.

## Utilisation de Base

### Côté Client (React)

```typescript
import { createMetadataApiManagerFromEnv } from '@/utils/media/api';

// Créer le gestionnaire (nécessite les clés API depuis l'environnement)
const apiManager = createMetadataApiManagerFromEnv({
    TMDB_API_KEY: 'votre_cle_tmdb',
    SPOTIFY_CLIENT_ID: 'votre_client_id',
    SPOTIFY_CLIENT_SECRET: 'votre_client_secret',
    // ... autres clés
});

// Rechercher des métadonnées
const result = await apiManager.search('videos', 'Inception', {
    type: 'movie'
});

if (result && result.matches.length > 0) {
    const bestMatch = result.matches[0];
    console.log('Trouvé:', bestMatch.title, bestMatch.year);
}

// Récupérer les détails complets
const details = await apiManager.getDetails(
    'videos',
    '27205', // ID TMDb
    'tmdb',
    { type: 'movie' }
);
```

### Côté Serveur (Workers)

```typescript
import { createMetadataApiManagerFromEnv } from '@/utils/media/api';

// Dans un handler Cloudflare Worker
app.get('/api/metadata/search', async (c) => {
    const category = c.req.query('category') as MediaCategory;
    const query = c.req.query('query');
    
    if (!category || !query) {
        return c.json({ error: 'Category and query required' }, 400);
    }
    
    // Créer le gestionnaire depuis les variables d'environnement
    const apiManager = createMetadataApiManagerFromEnv(c.env);
    
    // Rechercher
    const result = await apiManager.search(category, query);
    
    return c.json(result);
});
```

## Recherche avec Fallback Automatique

Le système utilise automatiquement un fallback entre API :

```typescript
// Pour les films : TMDb → OMDb → TheTVDB
const result = await apiManager.searchWithFallback('videos', 'Inception');

// Pour la musique : MusicBrainz → Spotify → Discogs
const musicResult = await apiManager.searchWithFallback('musics', 'Bohemian Rhapsody', {
    artist: 'Queen'
});

// Pour l'anime : AniList → Kitsu
const animeResult = await apiManager.searchWithFallback('anime', 'Attack on Titan');
```

## Exemples par Catégorie

### Films & Séries

```typescript
// Recherche de films
const films = await apiManager.search('videos', 'The Matrix', {
    type: 'movie'
});

// Recherche de séries
const series = await apiManager.search('videos', 'Breaking Bad', {
    type: 'tv'
});

// Recherche mixte (films + séries)
const all = await apiManager.search('videos', 'The', {
    type: 'both'
});
```

### Musique

```typescript
// Recherche par titre seul
const tracks = await apiManager.search('musics', 'Bohemian Rhapsody');

// Recherche avec artiste (plus précise)
const tracksWithArtist = await apiManager.search('musics', 'Bohemian Rhapsody', {
    artist: 'Queen'
});

// Récupérer les détails (inclut jaquette via Cover Art Archive)
const details = await apiManager.getDetails('musics', 'mbid-123', 'musicbrainz');
```

### Anime / Manga

```typescript
// Recherche anime
const anime = await apiManager.search('anime', 'Attack on Titan', {
    type: 'ANIME'
});

// Recherche manga
const manga = await apiManager.search('manga', 'One Piece', {
    type: 'MANGA'
});

// Recherche mixte
const all = await apiManager.search('anime', 'Naruto', {
    type: 'both'
});
```

### Sous-titres

```typescript
import { OpenSubtitlesApi } from '@/utils/media/api/subtitles';

// Recherche par hash de fichier (plus précis)
const subtitles = await apiManager.search('videos', '', {
    fileHash: 'abc123...',
    fileSize: 1234567890,
    language: 'fr'
});

// Recherche par IMDb ID
const subtitlesByImdb = await apiManager.search('videos', '', {
    imdbId: 'tt0133093',
    language: 'fr,en'
});

// Recherche par titre
const subtitlesByTitle = await apiManager.search('videos', 'Inception', {
    language: 'fr'
});
```

### Livres

```typescript
// Recherche par titre
const books = await apiManager.search('books', '1984');

// Recherche par ISBN
const bookByIsbn = await apiManager.search('books', '', {
    isbn: '9780451524935'
});
```

## Configuration Personnalisée

Vous pouvez créer un gestionnaire avec une configuration personnalisée :

```typescript
import { MetadataApiManager } from '@/utils/media/api';

const manager = new MetadataApiManager({
    tmdb: {
        enabled: true,
        apiKey: 'votre_cle',
        rateLimit: { maxRequests: 40, windowMs: 10000 }
    },
    musicbrainz: {
        enabled: true,
        userAgent: 'MonApp/1.0',
        rateLimit: { maxRequests: 1, windowMs: 1000 }
    },
    // ... autres API
});
```

## Vérification de Disponibilité

```typescript
// Vérifier si une catégorie a des API disponibles
if (apiManager.isCategoryAvailable('videos')) {
    // Rechercher des vidéos
}

// Lister les API disponibles pour une catégorie
const availableApis = apiManager.getAvailableApis('musics');
console.log('API disponibles:', availableApis);
// ['musicbrainz', 'spotify', 'discogs']
```

## Gestion des Erreurs

```typescript
try {
    const result = await apiManager.search('videos', 'Inception');
    if (!result || result.matches.length === 0) {
        console.log('Aucun résultat trouvé');
    }
} catch (error) {
    console.error('Erreur lors de la recherche:', error);
    // Le système de fallback essaiera automatiquement les autres API
}
```

## Rate Limiting

Le système gère automatiquement le rate limiting pour chaque API :
- **TMDb** : 40 requêtes / 10 secondes
- **MusicBrainz** : 1 requête / seconde
- **Spotify** : 10 requêtes / seconde
- **AniList** : 90 requêtes / minute
- etc.

Les requêtes sont automatiquement mises en file d'attente si nécessaire.

## Cache

Les résultats sont automatiquement mis en cache pendant 7 jours pour éviter les appels API répétés. Le cache est géré automatiquement par chaque module d'API.

## Types TypeScript

Tous les types sont disponibles dans `app/types/metadata.ts` :

```typescript
import type { 
    MediaMetadata, 
    MediaMatch, 
    MediaSearchResult,
    MetadataSource,
    MediaCategory 
} from '@/types/metadata';
```

## Documentation Complète

Pour plus de détails sur chaque API, consultez :
- [API_METADATA_REFERENCE.md](../../../docs/API_METADATA_REFERENCE.md) - Référence complète de toutes les API
- [CONFIGURATION_API_KEYS.md](../../../CONFIGURATION_API_KEYS.md) - Configuration des clés API
