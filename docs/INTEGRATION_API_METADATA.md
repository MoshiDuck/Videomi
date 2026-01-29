# Intégration des API de Métadonnées - Guide Complet

Ce document résume l'intégration complète des API de métadonnées multimédias dans Videomi.

## 📋 Vue d'Ensemble

Le système d'intégration des API de métadonnées a été créé pour permettre l'enrichissement automatique des fichiers multimédias avec des informations détaillées provenant de diverses sources.

### Structure Créée

```
app/
├── types/
│   └── metadata.ts                    # Types standardisés pour toutes les métadonnées
└── utils/
    └── media/
        └── api/
            ├── base.ts                # Classes de base et utilitaires
            ├── films-series.ts        # TMDb, OMDb
            ├── music.ts               # MusicBrainz, Spotify, Discogs
            ├── anime-manga.ts          # AniList, Kitsu
            ├── subtitles.ts            # OpenSubtitles
            ├── books.ts                # Google Books, Comic Vine
            ├── images.ts              # Fanart.tv
            ├── index.ts               # Point d'entrée principal
            ├── README.md              # Guide d'utilisation
            └── EXAMPLES.md            # Exemples d'intégration

docs/
└── API_METADATA_REFERENCE.md         # Référence complète de toutes les API
```

## 🎯 Fonctionnalités

### ✅ Implémenté

1. **Types Standardisés** (`app/types/metadata.ts`)
   - Types pour tous les médias (films, séries, musique, anime, manga, livres, comics, sous-titres)
   - Interface commune `MediaMetadata` avec types spécifiques par catégorie
   - Types pour les correspondances (`MediaMatch`) et résultats de recherche

2. **Modules d'Intégration API**
   - **Films & Séries** : TMDb, OMDb
   - **Musique** : MusicBrainz, Spotify, Discogs
   - **Anime / Manga** : AniList, Kitsu
   - **Sous-titres** : OpenSubtitles
   - **Images** : Fanart.tv
   - **Livres / Comics** : Google Books, Comic Vine

3. **Système de Fallback**
   - Fallback automatique entre API de la même catégorie
   - Ordre de priorité configurable
   - Gestion d'erreurs transparente

4. **Rate Limiting**
   - Gestion automatique des limites de chaque API
   - File d'attente intelligente
   - Respect des quotas

5. **Cache**
   - Cache automatique des résultats (7 jours)
   - Réduction des appels API répétés
   - Performance optimisée

6. **Documentation**
   - Référence complète de toutes les API
   - Guide d'utilisation
   - Exemples d'intégration
   - Configuration des clés API

## 📚 API Disponibles

### Films & Séries
- ✅ **TMDb** (The Movie Database) - Principal
- ✅ **OMDb** (Open Movie Database) - Fallback
- 📝 **TheTVDB** - Documenté, à intégrer si nécessaire
- 📝 **Trakt** - Documenté, à intégrer si nécessaire

### Musique
- ✅ **MusicBrainz** - Principal (sans clé)
- ✅ **Spotify** - Fallback (images haute qualité)
- ✅ **Discogs** - Dernier recours
- 📝 **TheAudioDB** - Documenté, à intégrer si nécessaire
- ✅ **Cover Art Archive** - Automatique avec MusicBrainz

### Anime / Manga
- ✅ **AniList** - Principal (GraphQL, sans clé)
- ✅ **Kitsu** - Alternative (REST)
- 📝 **AniDB** - Documenté, complexe, à intégrer si nécessaire

### Sous-titres
- ✅ **OpenSubtitles** - Principal

### Images / Artwork
- ✅ **Fanart.tv** - Images haute qualité
- ✅ **TMDb Images** - Déjà inclus avec TMDb
- ✅ **Cover Art Archive** - Déjà inclus avec MusicBrainz

### Livres / Comics
- ✅ **Google Books** - Principal (sans clé, mieux avec clé)
- ✅ **Comic Vine** - Comics

## 🔧 Configuration

### Clés API Requises

Voir [CONFIGURATION_API_KEYS.md](../CONFIGURATION_API_KEYS.md) pour la configuration complète.

**Configuration minimale recommandée :**
```bash
# Films & Séries
npx wrangler secret put TMDB_API_KEY

# Musique
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET

# Sous-titres
npx wrangler secret put OPENSUBTITLES_API_KEY
```

**API fonctionnant sans clé :**
- MusicBrainz (User-Agent requis, déjà configuré)
- AniList (pour requêtes publiques)
- Kitsu (pour requêtes publiques)
- Google Books (fonctionne sans clé, mieux avec)

### Mise à Jour des Types Workers

Les types dans `workers/types.ts` ont été mis à jour pour inclure toutes les nouvelles clés API :

```typescript
export interface Bindings {
    // ... existants
    TMDB_API_KEY?: string;
    OMDB_API_KEY?: string;
    TVDB_API_KEY?: string;
    SPOTIFY_CLIENT_ID?: string;
    SPOTIFY_CLIENT_SECRET?: string;
    DISCOGS_API_TOKEN?: string;
    OPENSUBTITLES_API_KEY?: string;
    FANARTTV_API_KEY?: string;
    GOOGLE_BOOKS_API_KEY?: string;
    COMIC_VINE_API_KEY?: string;
    // ...
}
```

## 🚀 Utilisation

### Exemple Simple

```typescript
import { createMetadataApiManagerFromEnv } from '@/utils/media/api';

// Créer le gestionnaire depuis les variables d'environnement
const apiManager = createMetadataApiManagerFromEnv(c.env);

// Rechercher avec fallback automatique
const result = await apiManager.searchWithFallback('videos', 'Inception');

if (result) {
    console.log('Trouvé:', result.title, result.year);
}
```

### Exemple Complet

```typescript
// Recherche avec options
const result = await apiManager.search('musics', 'Bohemian Rhapsody', {
    artist: 'Queen',
    limit: 10
});

if (result && result.matches.length > 0) {
    // Récupérer les détails complets
    const details = await apiManager.getDetails(
        'musics',
        result.matches[0].source_id,
        result.matches[0].source_api
    );
    
    // Utiliser les métadonnées
    console.log('Titre:', details.title);
    console.log('Artiste:', details.artist);
    console.log('Album:', details.album);
    console.log('Jaquette:', details.thumbnail_url);
}
```

Voir [app/utils/media/api/README.md](../app/utils/media/api/README.md) et [app/utils/media/api/EXAMPLES.md](../app/utils/media/api/EXAMPLES.md) pour plus d'exemples.

## 🔄 Système de Fallback

Le système utilise automatiquement un fallback entre API :

1. **Films/Séries** : TMDb → OMDb → TheTVDB
2. **Musique** : MusicBrainz → Spotify → Discogs
3. **Anime/Manga** : AniList → Kitsu

Si une API ne trouve pas de résultat, le système essaie automatiquement l'API suivante.

## 📊 Mapping Standardisé

Toutes les métadonnées sont mappées vers un format standardisé :

```typescript
interface StandardMetadata {
    source_api: MetadataSource;
    source_id: string;
    title: string;
    year: number | null;
    description: string | null;
    thumbnail_url: string | null;
    backdrop_url: string | null;
    genres: string[] | null;
    // ... selon le type de média
}
```

Cela permet d'utiliser les métadonnées de manière uniforme, quelle que soit la source API.

## 🎨 Intégration dans le Projet Existant

### Points d'Intégration Recommandés

1. **Upload de fichiers** (`workers/upload.ts`)
   - Enrichissement automatique après upload
   - Utilisation du système de fallback

2. **Recherche manuelle** (`app/routes/match.tsx`)
   - Permettre à l'utilisateur de rechercher et sélectionner des métadonnées
   - Affichage des correspondances proposées

3. **Endpoints API** (`workers/app.ts`)
   - Endpoints pour recherche et récupération de métadonnées
   - Utilisation côté client

### Migration depuis l'Ancien Système

Le système existant dans `app/utils/media/mediaMetadata.ts` peut être progressivement migré vers le nouveau système. Les deux peuvent coexister pendant la transition.

## 📝 Documentation

- **[API_METADATA_REFERENCE.md](./API_METADATA_REFERENCE.md)** - Référence complète de toutes les API
- **[CONFIGURATION_API_KEYS.md](../CONFIGURATION_API_KEYS.md)** - Configuration des clés API
- **[app/utils/media/api/README.md](../app/utils/media/api/README.md)** - Guide d'utilisation
- **[app/utils/media/api/EXAMPLES.md](../app/utils/media/api/EXAMPLES.md)** - Exemples d'intégration

## ⚠️ Notes Importantes

1. **Rate Limiting** : Respectez les limites de chaque API. Le système gère automatiquement le rate limiting, mais évitez les boucles sans délai.

2. **Cache** : Les résultats sont mis en cache pendant 7 jours. Pour forcer une nouvelle recherche, utilisez un paramètre unique.

3. **Erreurs** : Toujours gérer les erreurs avec try/catch. Les API peuvent échouer pour diverses raisons.

4. **Configuration** : Vérifiez toujours que les clés API sont configurées avant d'utiliser une API (`api.isAvailable()`).

5. **Licensing** : Vérifiez les conditions d'utilisation de chaque API avant utilisation commerciale.

## 🔮 Prochaines Étapes

### À Faire

1. **Intégration dans les Workers**
   - Ajouter les endpoints API dans `workers/app.ts`
   - Intégrer dans le processus d'upload

2. **Interface Utilisateur**
   - Créer/modifier la route `match.tsx` pour la recherche manuelle
   - Affichage des correspondances proposées

3. **Tests**
   - Tester chaque API individuellement
   - Tester le système de fallback
   - Tester le rate limiting

4. **Optimisations**
   - Ajuster les durées de cache selon les besoins
   - Optimiser les requêtes API

### API Optionnelles à Intégrer Plus Tard

- **TheTVDB** - Si besoin de plus de données séries TV
- **Trakt** - Pour fonctionnalités sociales/watchlists
- **TheAudioDB** - Complément rapide pour musique
- **AniDB** - Si besoin de base hardcore anime
- **VGMdb** - Pour OST jeux vidéo

## ✅ Checklist d'Intégration

- [x] Types standardisés créés
- [x] Modules API créés pour chaque catégorie
- [x] Système de fallback implémenté
- [x] Rate limiting géré
- [x] Cache implémenté
- [x] Documentation complète
- [x] Configuration des clés API documentée
- [x] Exemples d'utilisation fournis
- [ ] Intégration dans les Workers (à faire)
- [ ] Interface utilisateur (à faire)
- [ ] Tests (à faire)

## 📞 Support

Pour toute question ou problème :
1. Consultez la documentation dans `docs/`
2. Vérifiez les exemples dans `app/utils/media/api/EXAMPLES.md`
3. Consultez la référence API dans `docs/API_METADATA_REFERENCE.md`
