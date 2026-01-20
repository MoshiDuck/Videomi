# Configuration des Clés API

Ce document explique comment configurer les clés API nécessaires pour l'enrichissement des métadonnées.

## Clés API Nécessaires

### 1. TMDb API Key (Recommandé) ✅
**Pour :** Films et séries
**Où l'obtenir :** https://www.themoviedb.org/settings/api
**Limite :** 40 requêtes / 10 secondes (gratuit)
**Commandes :**
```bash
npx wrangler secret put TMDB_API_KEY
# Entrez votre clé API TMDb quand demandé
```

### 2. OMDb API Key (Backup optionnel)
**Pour :** Films (backup si TMDb ne trouve rien)
**Où l'obtenir :** http://www.omdbapi.com/apikey.aspx
**Limite :** 1,000 requêtes / jour (gratuit)
**Commandes :**
```bash
npx wrangler secret put OMDB_API_KEY
# Entrez votre clé API OMDb quand demandé
```

### 3. Spotify API (Recommandé pour musique) ✅
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

### 4. Discogs API Token (Optionnel, backup pour musique) ✅
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

### 5. MusicBrainz (Pas de clé nécessaire) ✅
**Pour :** Musique (API principale, sans clé)
**Aucune clé requise** - L'API est publique mais nécessite un User-Agent (déjà configuré)
**Note :** Si MusicBrainz ne trouve pas de résultat, Spotify sera utilisé automatiquement comme backup, puis Discogs en dernier recours

## Configuration Complète

Exécutez ces commandes une par une pour configurer toutes les clés :

```bash
# 1. TMDb (recommandé)
npx wrangler secret put TMDB_API_KEY

# 2. OMDb (optionnel, backup)
npx wrangler secret put OMDB_API_KEY

# 3. Spotify (recommandé pour musique)
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET

# 4. Discogs (optionnel, backup pour musique)
npx wrangler secret put DISCOGS_API_TOKEN
```

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
- **Musique** : Enrichissement via MusicBrainz (ou Spotify en backup, puis Discogs en dernier recours pour de meilleures images)

Les métadonnées enrichies (miniatures, genres, albums, etc.) seront automatiquement stockées dans D1.

## Note de Sécurité

⚠️ **Important** : Les clés API sont stockées comme secrets Cloudflare et ne sont jamais exposées dans le code source. Elles sont accessibles uniquement via `c.env` dans les Workers Cloudflare.
