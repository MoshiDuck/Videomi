# Référence des API de Métadonnées Multimédias

Ce document liste toutes les API disponibles pour l'enrichissement des métadonnées multimédias dans Videomi, avec leurs spécifications, authentification et recommandations d'usage.

---

## 🎞️ Films & Séries

### TMDb (The Movie Database) ⭐ **FORTEMENT RECOMMANDÉ**

**Type :** API REST publique  
**Authentification :** Clé API (gratuite)  
**Limites :** 40 requêtes / 10 secondes (gratuit)  
**Documentation :** https://developers.themoviedb.org/3/getting-started/introduction  
**Obtention clé :** https://www.themoviedb.org/settings/api

**Usage principal :**
- Films : titres, années, synopsis, cast, genres, posters, backdrops
- Séries : informations séries, saisons, épisodes, cast
- Images haute qualité (posters, backdrops, logos)

**Endpoints pertinents :**
- `GET /search/movie` - Recherche de films
- `GET /search/tv` - Recherche de séries
- `GET /movie/{id}` - Détails d'un film
- `GET /tv/{id}` - Détails d'une série
- `GET /tv/{id}/season/{season_number}` - Détails d'une saison
- `GET /tv/{id}/season/{season_number}/episode/{episode_number}` - Détails d'un épisode
- `GET /movie/{id}/images` - Images d'un film
- `GET /tv/{id}/images` - Images d'une série

**Recommandation :** API principale pour films et séries. Base de données très complète, images de qualité, support multilingue.

---

### TheTVDB

**Type :** API REST  
**Authentification :** Clé API (process de demande requis)  
**Limites :** Variables selon le plan  
**Documentation :** https://thetvdb.com/api-information  
**Obtention clé :** https://thetvdb.com/dashboard/account/apikey

**Usage principal :**
- Source spécialisée pour séries TV
- Informations détaillées sur épisodes, saisons
- Alternative à TMDb pour certaines séries

**Endpoints pertinents :**
- `GET /search/series` - Recherche de séries
- `GET /series/{id}` - Détails d'une série
- `GET /series/{id}/episodes` - Épisodes d'une série

**Recommandation :** Utile comme complément à TMDb pour les séries TV spécifiques. Attention au licensing et au processus d'obtention de clé.

---

### OMDb (Open Movie Database)

**Type :** API REST simple  
**Authentification :** Clé API (payante pour usage étendu, gratuite limitée)  
**Limites :** 1,000 requêtes / jour (gratuit), illimité (payant)  
**Documentation :** http://www.omdbapi.com/  
**Obtention clé :** http://www.omdbapi.com/apikey.aspx

**Usage principal :**
- Fallback pour films via IMDb ID
- Recherche simple par titre
- Métadonnées basiques (titre, année, synopsis, poster)

**Endpoints pertinents :**
- `GET /?t={title}` - Recherche par titre
- `GET /?i={imdbID}` - Recherche par IMDb ID

**Recommandation :** Pratique comme fallback si TMDb ne trouve rien. API simple mais limitée en fonctionnalités.

---

### Trakt

**Type :** API REST  
**Authentification :** OAuth 2.0  
**Limites :** Variables selon le plan  
**Documentation :** https://trakt.docs.apiary.io/  
**Obtention clé :** https://trakt.tv/oauth/applications/new

**Usage principal :**
- Watchlists utilisateur
- Identification basée sur historique utilisateur
- Statistiques de visionnage
- Recommandations personnalisées

**Endpoints pertinents :**
- `GET /search` - Recherche globale
- `GET /movies/{id}` - Détails d'un film
- `GET /shows/{id}` - Détails d'une série

**Recommandation :** Bon complément à TMDb pour les fonctionnalités sociales et watchlists. Nécessite OAuth pour les fonctionnalités utilisateur.

---

## 🎵 Musique

### MusicBrainz ⭐ **FORTEMENT RECOMMANDÉ**

**Type :** API REST publique  
**Authentification :** Aucune (User-Agent requis)  
**Limites :** 1 requête / seconde (strict)  
**Documentation :** https://musicbrainz.org/doc/MusicBrainz_API  
**Obtention clé :** Aucune nécessaire

**Usage principal :**
- Référence principale pour artistes, albums, tracks
- Métadonnées détaillées (MBID, relations, tags)
- Base de données collaborative très complète

**Endpoints pertinents :**
- `GET /ws/2/recording` - Recherche d'enregistrements
- `GET /ws/2/artist` - Recherche d'artistes
- `GET /ws/2/release` - Recherche de releases/albums
- `GET /ws/2/recording/{mbid}` - Détails d'un enregistrement

**Recommandation :** API principale pour musique. Base de données exhaustive, mais rate limit strict (1 req/s). Nécessite User-Agent.

---

### Cover Art Archive

**Type :** API REST (liée à MusicBrainz)  
**Authentification :** Aucune  
**Limites :** 5 requêtes / seconde  
**Documentation :** https://musicbrainz.org/doc/Cover_Art_Archive/API  
**Obtention clé :** Aucune nécessaire

**Usage principal :**
- Récupération de jaquettes d'albums
- Images haute qualité pour releases MusicBrainz

**Endpoints pertinents :**
- `GET /release/{mbid}/front` - Jaquette principale
- `GET /release/{mbid}` - Toutes les images d'un release

**Recommandation :** Utilisée automatiquement avec MusicBrainz pour récupérer les jaquettes d'albums.

---

### Discogs

**Type :** API REST  
**Authentification :** OAuth 1.0 ou Personal Access Token  
**Limites :** 25 req/min (sans token), 60 req/min (avec token)  
**Documentation :** https://www.discogs.com/developers/  
**Obtention clé :** https://www.discogs.com/settings/developers

**Usage principal :**
- Pressings physiques (vinyles, CDs)
- Labels, éditions spéciales
- Métadonnées très détaillées pour musique physique

**Endpoints pertinents :**
- `GET /database/search` - Recherche globale
- `GET /releases/{id}` - Détails d'un release
- `GET /artists/{id}` - Détails d'un artiste

**Recommandation :** Excellent pour musique physique et éditions spéciales. Dernier recours si MusicBrainz/Spotify ne trouvent rien.

---

### TheAudioDB

**Type :** API REST  
**Authentification :** Clé API (gratuite)  
**Limites :** Variables  
**Documentation :** https://www.theaudiodb.com/api_guide.php  
**Obtention clé :** https://www.theaudiodb.com/member/register

**Usage principal :**
- Posters d'artistes
- Informations basiques (genre, biographie)
- API simple et rapide

**Endpoints pertinents :**
- `GET /search.php?s={artist}` - Recherche d'artiste
- `GET /searchtrack.php?s={track}` - Recherche de track

**Recommandation :** API simple comme complément rapide. Moins complet que MusicBrainz mais plus rapide.

---

### Spotify

**Type :** API REST  
**Authentification :** OAuth 2.0 (Client Credentials)  
**Limites :** 10 requêtes / seconde  
**Documentation :** https://developer.spotify.com/documentation/web-api  
**Obtention clé :** https://developer.spotify.com/dashboard/applications

**Usage principal :**
- Pochettes d'albums haute qualité
- Informations artistes, albums, tracks
- Images de meilleure qualité que MusicBrainz

**Endpoints pertinents :**
- `GET /v1/search` - Recherche globale
- `GET /v1/tracks/{id}` - Détails d'un track
- `GET /v1/artists/{id}` - Détails d'un artiste

**Recommandation :** Excellent pour les images de couverture. Utilisé comme backup après MusicBrainz.

---

## 🐉 Anime / Manga

### AniList ⭐ **FORTEMENT RECOMMANDÉ**

**Type :** API GraphQL  
**Authentification :** OAuth 2.0 (optionnel pour requêtes publiques)  
**Limites :** 90 requêtes / minute (gratuit)  
**Documentation :** https://anilist.gitbook.io/anilist-apiv2-docs/  
**Obtention clé :** https://anilist.co/settings/developer

**Usage principal :**
- Matching titres/IDs anime et manga
- Informations détaillées (characters, studios, genres)
- Support multilingue (titres alternatifs)
- API GraphQL moderne et flexible

**Endpoints pertinents :**
- GraphQL Query `Media` - Recherche et détails
- GraphQL Query `Character` - Personnages
- GraphQL Query `Studio` - Studios

**Recommandation :** API principale pour anime/manga. GraphQL très pratique, base de données complète.

---

### Kitsu

**Type :** API REST JSON  
**Authentification :** OAuth 2.0 (optionnel)  
**Limites :** Variables  
**Documentation :** https://kitsu.docs.apiary.io/  
**Obtention clé :** https://kitsu.io/settings/applications

**Usage principal :**
- Alternative à AniList
- Base de données anime/manga
- API REST simple

**Endpoints pertinents :**
- `GET /api/edge/anime` - Recherche anime
- `GET /api/edge/manga` - Recherche manga

**Recommandation :** Alternative décente à AniList. Moins complet mais API REST plus simple.

---

### AniDB

**Type :** API XML (old-school)  
**Authentification :** Clé API (process complexe)  
**Limites :** Variables  
**Documentation :** https://wiki.anidb.net/HTTP_API_Definition  
**Obtention clé :** Process complexe via AniDB

**Usage principal :**
- Base de données hardcore pour anime
- Informations très détaillées
- API complexe et ancienne

**Recommandation :** Utile pour base hardcore, mais API complexe. À utiliser seulement si AniList/Kitsu ne suffisent pas.

---

## 🔤 Sous-titres

### OpenSubtitles

**Type :** API REST  
**Authentification :** Clé API (gratuite)  
**Limites :** Variables selon le plan  
**Documentation :** https://opensubtitles.stoplight.io/docs/opensubtitles-api  
**Obtention clé :** https://www.opensubtitles.com/en/accounts/profile/subtitles/api

**Usage principal :**
- Large catalogue de sous-titres
- Recherche par hash de fichier ou métadonnées
- Téléchargement de sous-titres (.srt, .vtt)

**Endpoints pertinents :**
- `POST /api/v1/subtitles` - Recherche de sous-titres
- `GET /api/v1/download` - Téléchargement

**Recommandation :** Indispensable si identification de sous-titres nécessaire. Large catalogue multilingue.

---

## 🖼️ Images / Artwork

### Fanart.tv

**Type :** API REST  
**Authentification :** Clé API (gratuite)  
**Limites :** Variables  
**Documentation :** https://fanart.tv/api-docs/  
**Obtention clé :** https://fanart.tv/get-an-api-key/

**Usage principal :**
- Posters haute qualité
- Fanart, logos, thumbnails
- Images pour films, séries, musique

**Endpoints pertinents :**
- `GET /v3/movies/{id}` - Images pour un film
- `GET /v3/tv/{id}` - Images pour une série
- `GET /v3/music/{id}` - Images pour un artiste

**Recommandation :** Excellent pour images haute qualité. Complément à TMDb pour artwork.

---

### TMDb Images

**Type :** API REST (via TMDb)  
**Authentification :** Clé API TMDb  
**Limites :** Même que TMDb  
**Documentation :** https://developers.themoviedb.org/3/getting-started/images

**Usage principal :**
- Posters, backdrops, logos via TMDb
- Images haute qualité pour films/séries

**Recommandation :** Déjà inclus avec TMDb. Utilisé automatiquement.

---

## 📚 Livres / Comics

### Google Books

**Type :** API REST publique  
**Authentification :** Clé API (gratuite, optionnelle)  
**Limites :** 1,000 requêtes / jour (sans clé), 10,000 / jour (avec clé)  
**Documentation :** https://developers.google.com/books/docs/v1/using  
**Obtention clé :** https://console.cloud.google.com/apis/credentials

**Usage principal :**
- Recherche par ISBN, titre, auteur
- Métadonnées livres (titre, auteur, description, couverture)
- Base de données Google Books

**Endpoints pertinents :**
- `GET /books/v1/volumes` - Recherche de volumes
- `GET /books/v1/volumes/{volumeId}` - Détails d'un volume

**Recommandation :** API principale pour livres. Gratuite et complète.

---

### Comic Vine

**Type :** API REST  
**Authentification :** Clé API (gratuite)  
**Limites :** Variables  
**Documentation :** https://comicvine.gamespot.com/api/  
**Obtention clé :** https://comicvine.gamespot.com/api/

**Usage principal :**
- Métadonnées spécifiques comics
- Informations détaillées sur séries, volumes, personnages

**Endpoints pertinents :**
- `GET /search` - Recherche globale
- `GET /issue/{id}` - Détails d'un numéro
- `GET /volume/{id}` - Détails d'un volume

**Recommandation :** Spécifique aux comics. Utile si catégorie comics ajoutée.

---

## 🧾 Métadonnées spécialisées / Autres

### VGMdb

**Type :** API REST (non officielle, scraping)  
**Authentification :** Aucune  
**Limites :** Variables  
**Documentation :** Documentation limitée

**Usage principal :**
- OST (Original Soundtrack) de jeux vidéo
- Métadonnées musique de jeux vidéo

**Recommandation :** Spécialisé pour OST jeux vidéo. API non officielle, usage limité.

---

### Simkl

**Type :** API REST (service commercial)  
**Authentification :** Clé API (payant)  
**Limites :** Variables selon le plan  
**Documentation :** https://simkl.docs.apiary.io/

**Usage principal :**
- Large base films/séries/anime
- Service commercial payant

**Recommandation :** Service payant, à considérer seulement si autres API insuffisantes.

---

## 📋 Résumé des Recommandations

### Priorité 1 (Déjà intégrées) ⭐
- **TMDb** - Films et séries (principal)
- **Spotify** - Musique (backup images)
- **OMDb** - Films (fallback)
- **Discogs** - Musique (fallback)

### Priorité 2 (À intégrer) ⭐
- **MusicBrainz** - Musique (principal, remplace Spotify comme principal)
- **AniList** - Anime/Manga (principal)
- **OpenSubtitles** - Sous-titres (indispensable)
- **Google Books** - Livres (principal)
- **Cover Art Archive** - Jaquettes albums (automatique avec MusicBrainz)

### Priorité 3 (Compléments optionnels)
- **TheTVDB** - Séries TV (complément TMDb)
- **Trakt** - Watchlists (fonctionnalités sociales)
- **Fanart.tv** - Images haute qualité
- **Kitsu** - Anime/Manga (alternative AniList)
- **Comic Vine** - Comics (si catégorie ajoutée)
- **TheAudioDB** - Musique (complément rapide)

### Priorité 4 (Spécialisés / Complexes)
- **AniDB** - Anime (base hardcore, API complexe)
- **VGMdb** - OST jeux vidéo (API non officielle)
- **Simkl** - Service commercial payant

---

## Notes de Licensing

⚠️ **Important :** Vérifiez les conditions d'utilisation de chaque API avant intégration :
- Certaines API ont des restrictions commerciales
- Respectez les rate limits
- Certaines nécessitent attribution (crédits)
- Vérifiez les droits d'utilisation des images récupérées

---

## Structure d'Intégration

Voir les fichiers suivants pour l'implémentation :
- `/app/utils/media/api/` - Modules d'intégration par catégorie
- `/app/types/metadata.ts` - Types standardisés des métadonnées
- `/workers/metadata.ts` - Endpoints API pour métadonnées
