# Configuration des Clés API

Ce document explique comment configurer les clés API nécessaires pour l'enrichissement des métadonnées.

> 📖 **Documentation complète :** Voir [API_METADATA_REFERENCE.md](./docs/API_METADATA_REFERENCE.md) pour la liste complète de toutes les API disponibles.

## Clés API par Catégorie

### 🎞️ Films & Séries

#### 1. TMDb API Key ⭐ **FORTEMENT RECOMMANDÉ**
**Pour :** Films et séries (API principale)
**Où l'obtenir :** https://www.themoviedb.org/settings/api
**Limite :** 40 requêtes / 10 secondes (gratuit)
**Commandes :**
```bash
npx wrangler secret put TMDB_API_KEY
# Entrez votre clé API TMDb quand demandé
```

#### 2. OMDb API Key (Backup optionnel)
**Pour :** Films (backup si TMDb ne trouve rien)
**Où l'obtenir :** http://www.omdbapi.com/apikey.aspx
**Limite :** 1,000 requêtes / jour (gratuit)
**Commandes :**
```bash
npx wrangler secret put OMDB_API_KEY
# Entrez votre clé API OMDb quand demandé
```

#### 3. TheTVDB API Key (Optionnel)
**Pour :** Séries TV (complément à TMDb)
**Où l'obtenir :** https://thetvdb.com/dashboard/account/apikey
**Note :** Process de demande requis, attention au licensing
**Commandes :**
```bash
npx wrangler secret put TVDB_API_KEY
# Entrez votre clé API TheTVDB quand demandé
```

#### 4. Gemini API Key (Optionnel - Fallback pré-identification)
**Pour :** Extraction du titre film/série depuis le nom de fichier quand les variantes regex n'ont trouvé aucun match TMDb/OMDb. L'IA nettoie le filename (qualité, codec, VOSTFR, etc.) et retourne un titre propre pour réessayer la recherche.
**Où l'obtenir :** https://aistudio.google.com/apikey (Google AI Studio)
**Limite :** Quota gratuit selon Google AI
**Commandes :**
```bash
npx wrangler secret put GEMINI_API_KEY
# Entrez votre clé API Gemini quand demandé
```

### 🎵 Musique

#### 4. MusicBrainz (Pas de clé nécessaire) ⭐ **FORTEMENT RECOMMANDÉ**
**Pour :** Musique (API principale, sans clé)
**Aucune clé requise** - L'API est publique mais nécessite un User-Agent (déjà configuré)
**Limite :** 1 requête / seconde (strict)
**Note :** Si MusicBrainz ne trouve pas de résultat, Spotify sera utilisé automatiquement comme backup, puis Discogs en dernier recours

#### 4b. AcoustID API Key (Optionnel – identification avant Spotify) ✅
**Pour :** Musique – identification par empreinte Chromaprint **avant** Spotify. Si le client envoie `fingerprint` + `duration` (dans `basicMetadata.acoustid`), le worker appelle AcoustID en premier ; en cas de match (score ≥ 0.8), titre/artiste/album sont pris depuis AcoustID/MusicBrainz (sans appel Spotify).
**Où l'obtenir :** https://acoustid.org/new-application (clé application = paramètre `client`)
**Limite :** 3 requêtes / seconde (gratuit, usage non commercial)
**Commandes :**
```bash
npx wrangler secret put ACOUSTID_API_KEY
# Entrez votre clé AcoustID (application key) quand demandé
```
**Côté client :** Pour que AcoustID soit utilisé, le client doit envoyer `basicMetadata.acoustid = { fingerprint, duration }` (empreinte Chromaprint + durée en secondes). La durée est extraite automatiquement ; le fingerprint doit être calculé côté client (ex. future lib Chromaprint/WASM).

#### 5. Spotify API (Recommandé pour images) ✅
**Pour :** Musique (backup si MusicBrainz ne trouve rien, meilleures images de couverture)
**Où l'obtenir :** https://developer.spotify.com/dashboard/applications
1. Créez une application Spotify
2. Notez le **Client ID** et **Client Secret**
**Limite :** 10 requêtes / seconde (gratuit avec compte Spotify Developer)
**Commandes :**
```bash
npx wrangler secret put SPOTIFY_CLIENT_ID
# Entrez votre Client ID quand demandé

npx wrangler secret put SPOTIFY_CLIENT_SECRET
# Entrez votre Client Secret quand demandé
```

#### 6. Enrichment Artist Similarity Threshold (Optionnel, variable d’environnement)
**Pour :** Musique – seuil de similarité (0–1) pour accepter un match Spotify "sans artiste" quand un artiste est connu (ID3/filename). En dessous du seuil, le match est refusé (évite reprises / mauvais artistes).
**Défaut :** `0.6`
**Exemple :** `ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD=0.8` (plus strict)
**Note :** Peut être défini dans `wrangler.jsonc` (vars) ou en secret selon l’hébergeur.

#### 6b. Enrichment Title Similarity Threshold (Optionnel)
**Pour :** Musique – seuil de similarité titre (0–1), basé sur Levenshtein normalisé. **Défaut :** `0.75`. **Exemple :** `ENRICHMENT_TITLE_SIMILARITY_THRESHOLD=0.85`

#### 7. Discogs API Token (Optionnel, backup pour musique) ✅
**Pour :** Musique (dernier recours si MusicBrainz et Spotify ne trouvent rien)
**Où l'obtenir :** https://www.discogs.com/settings/developers
1. Créez un compte Discogs (gratuit)
2. Allez dans **Settings** > **Developers**
3. Créez un nouveau token personnel
4. Notez votre **Personal Access Token**
**Limite :** 25 requêtes / minute sans token, 60 requêtes / minute avec token (gratuit)
**Commandes :**
```bash
npx wrangler secret put DISCOGS_API_TOKEN
# Entrez votre Personal Access Token quand demandé
```

### 🐉 Anime / Manga

#### 7. AniList (Pas de clé nécessaire pour usage public) ⭐ **FORTEMENT RECOMMANDÉ**
**Pour :** Anime et manga (API principale)
**Aucune clé requise** pour les requêtes publiques
**Où obtenir clé (optionnel) :** https://anilist.co/settings/developer (pour OAuth si nécessaire)
**Limite :** 90 requêtes / minute (gratuit)
**Note :** API GraphQL moderne et flexible

#### 8. Kitsu (Pas de clé nécessaire)
**Pour :** Anime et manga (alternative à AniList)
**Aucune clé requise** pour les requêtes publiques
**Où obtenir clé (optionnel) :** https://kitsu.io/settings/applications (pour OAuth si nécessaire)

### 🔤 Sous-titres

#### 9. OpenSubtitles API Key ⭐ **RECOMMANDÉ**
**Pour :** Recherche et téléchargement de sous-titres
**Où l'obtenir :** https://www.opensubtitles.com/en/accounts/profile/subtitles/api
1. Créez un compte OpenSubtitles (gratuit)
2. Allez dans votre profil > API
3. Créez une clé API
**Limite :** Variables selon le plan
**Commandes :**
```bash
npx wrangler secret put OPENSUBTITLES_API_KEY
# Entrez votre clé API OpenSubtitles quand demandé
```

### 🖼️ Images / Artwork

#### 10. Fanart.tv API Key (Optionnel)
**Pour :** Images haute qualité (posters, fanart, logos)
**Où l'obtenir :** https://fanart.tv/get-an-api-key/
**Limite :** Variables
**Commandes :**
```bash
npx wrangler secret put FANARTTV_API_KEY
# Entrez votre clé API Fanart.tv quand demandé
```

### 📚 Livres / Comics

#### 11. Google Books API Key (Optionnel mais recommandé)
**Pour :** Livres (recherche par ISBN, titre, auteur)
**Où l'obtenir :** https://console.cloud.google.com/apis/credentials
1. Créez un projet Google Cloud
2. Activez l'API Google Books
3. Créez une clé API
**Limite :** 1,000 requêtes / jour (sans clé), 10,000 / jour (avec clé)
**Note :** Fonctionne sans clé mais avec clé c'est mieux
**Commandes :**
```bash
npx wrangler secret put GOOGLE_BOOKS_API_KEY
# Entrez votre clé API Google Books quand demandé
```

#### 12. Comic Vine API Key (Optionnel)
**Pour :** Comics (métadonnées spécifiques)
**Où l'obtenir :** https://comicvine.gamespot.com/api/
**Limite :** Variables
**Commandes :**
```bash
npx wrangler secret put COMIC_VINE_API_KEY
# Entrez votre clé API Comic Vine quand demandé
```

## Configuration Complète

### Configuration Minimale (Recommandée)

Exécutez ces commandes pour la configuration minimale recommandée :

```bash
# Films & Séries
npx wrangler secret put TMDB_API_KEY

# Musique
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET

# Sous-titres
npx wrangler secret put OPENSUBTITLES_API_KEY
```

### Configuration Complète (Toutes les API)

Pour activer toutes les fonctionnalités, exécutez toutes ces commandes :

```bash
# Films & Séries
npx wrangler secret put TMDB_API_KEY
npx wrangler secret put OMDB_API_KEY
npx wrangler secret put TVDB_API_KEY

# Musique
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET
npx wrangler secret put DISCOGS_API_TOKEN

# Sous-titres
npx wrangler secret put OPENSUBTITLES_API_KEY

# Images
npx wrangler secret put FANARTTV_API_KEY

# Livres / Comics
npx wrangler secret put GOOGLE_BOOKS_API_KEY
npx wrangler secret put COMIC_VINE_API_KEY
```

**Note :** MusicBrainz et AniList fonctionnent sans clé API (User-Agent requis, déjà configuré).

## Vérification

Après avoir configuré les clés, vérifiez qu'elles sont bien configurées :

```bash
# Vérifier les secrets (les valeurs ne seront pas affichées, mais la commande confirmera leur existence)
npx wrangler secret list
```

Ou testez directement sur votre site :
- Ouvrez la console navigateur
- Vérifiez `/api/config` qui retourne les clés API (sans afficher les valeurs complètes pour sécurité)

## Redéploiement

Après avoir ajouté les secrets, redéployez l'application :

```bash
npm run deploy
```

## Utilisation

Une fois configurées, les clés API seront automatiquement utilisées lors des uploads pour :

- **Films/Séries** : Enrichissement via TMDb (ou OMDb en backup)
- **Musique** : Enrichissement via MusicBrainz (ou Spotify en backup, puis Discogs en dernier recours)
- **Anime/Manga** : Enrichissement via AniList (ou Kitsu en backup)
- **Sous-titres** : Recherche et téléchargement via OpenSubtitles
- **Livres** : Enrichissement via Google Books
- **Comics** : Enrichissement via Comic Vine

Les métadonnées enrichies (miniatures, genres, albums, etc.) seront automatiquement stockées dans D1.

### Système de Fallback

Le système utilise automatiquement un système de fallback entre API :
1. **Films/Séries** : TMDb → OMDb → TheTVDB
2. **Musique** : MusicBrainz → Spotify → Discogs
3. **Anime/Manga** : AniList → Kitsu

Si une API ne trouve pas de résultat, le système essaie automatiquement l'API suivante dans l'ordre de priorité.

## Note de Sécurité

⚠️ **Important** : Les clés API sont stockées comme secrets Cloudflare et ne sont jamais exposées dans le code source. Elles sont accessibles uniquement via `c.env` dans les Workers Cloudflare.
