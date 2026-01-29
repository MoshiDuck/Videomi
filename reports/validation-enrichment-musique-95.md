# Rapport de validation – Enrichissement musique (objectif ≥95 %)

**Date :** 2026-01-29  
**Objectif :** Refonte de la logique d'enrichissement musique à l'upload pour atteindre un taux de réussite ≥95 % sur le matching titre/artiste/album.

---

## 1. Résumé des changements

### 1.1 Chaîne de fallback

Ordre des tentatives (traçable dans `enrichmentReport.tentatives`) :

1. **ID3** → artiste/titre depuis `basicMetadata` (envoyé par le client après lecture ID3).
2. **Filename** → extraction `Artist - Title (Year)` via `extractArtistTitleFromFilename`.
3. **Heuristiques** → normalisation (unicode, tirets, tags techniques), alias artistes (AC → AC/DC, remhq → R.E.M.), variantes de titre (sans année, parenthèses, feat).
4. **APIs** (avec validations) :
   - **Spotify** avec artiste (toutes les paires artiste×titre) → validation `acceptMusicMatch` (titre + artiste).
   - **Spotify** sans artiste (par variante de titre) → même validation (refus si similarité artiste insuffisante).
   - **MusicBrainz** avec artiste puis sans artiste → même validation.
5. **IA (Gemini)** → extraction artiste/titre depuis le filename, puis réessai Spotify + MusicBrainz avec les nouvelles valeurs.

### 1.2 Validations (anti faux positifs)

- **acceptMusicMatch** :
  - **Titre :** similarité (Levenshtein normalisée) ≥ seuil (défaut 0,75), configurable via `ENRICHMENT_TITLE_SIMILARITY_THRESHOLD`.
  - **Artiste :** si on a un artiste, meilleure similarité avec `trackArtists` ≥ seuil (défaut 0,6), configurable via `ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD`.
  - Optionnel : rejet si mismatch Live (track « Live » vs titre sans « Live »), désactivé par défaut.
- Tout match API est validé avant d’être accepté ; en cas de refus, la raison est loggée dans `tentatives`.

### 1.3 Fuzzy match et similarité

- **titleSimilarity** : normalisation + distance de Levenshtein → score 0–1.
- **stringSimilarity** : utilisé pour les artistes (déjà présent).
- **bestSimilarity** : meilleure similarité entre une chaîne et une liste (ex. nos artistes vs `track.artists`).

### 1.4 APIs utilisées

- **Spotify** : recherche track (avec/sans artiste), images artiste/album.
- **MusicBrainz** : recherche enregistrements (`/ws/2/recording/?query=...&inc=releases`), puis **Cover Art Archive** pour la pochette (`/release/{mbid}`).

---

## 2. Fichiers modifiés / ajoutés

| Fichier | Action |
|--------|--------|
| `workers/musicEnrichment.ts` | Modifié – `titleSimilarity`, `bestSimilarity`, `getTitleSimilarityThreshold`, `acceptMusicMatch`, `levenshteinDistance` |
| `workers/types.ts` | Modifié – `ENRICHMENT_TITLE_SIMILARITY_THRESHOLD` |
| `workers/upload.ts` | Modifié – imports, `extractArtistTitleWithGemini`, `searchMusicBrainz`, refactor bloc musique : Spotify (avec/sans artiste) + MusicBrainz + Gemini, utilisation de `acceptMusicMatch` partout |
| `tests/workers/musicEnrichment.spec.ts` | Modifié – tests `titleSimilarity`, `bestSimilarity`, `acceptMusicMatch`, `getTitleSimilarityThreshold` |
| `tests/workers/musicEnrichment-integration.spec.ts` | **Ajouté** – tests d’intégration (mock) chaîne ID3→filename→variantes, validation accept/refuse |
| `reports/validation-enrichment-musique-95.md` | **Ajouté** – ce rapport |

---

## 3. Tests ajoutés / modifiés

### 3.1 Unitaires (`tests/workers/musicEnrichment.spec.ts`)

- **titleSimilarity** : identiques, proches, différents.
- **bestSimilarity** : chaîne vide / liste vide, meilleur candidat.
- **acceptMusicMatch** : acceptation si titre+artiste OK, refus si titre faible, refus si artiste différent.
- **getTitleSimilarityThreshold** : défaut 0,75, valeur env.

### 3.2 Intégration (`tests/workers/musicEnrichment-integration.spec.ts`)

- Chaîne ID3 → filename → variantes produit des candidats exploitables.
- acceptMusicMatch accepte un match type Spotify réel.
- acceptMusicMatch refuse un faux positif (autre artiste).
- Normalisation + variantes couvrent reprises/remasters.

### 3.3 Lancer les tests

```bash
# Tous les tests workers (cache + musicEnrichment + intégration)
npx vitest run --config vitest.config.ts tests/workers/

# Toute la suite API (y compris workers)
npm run test:api
```

---

## 4. Métriques de validation (taux de réussite)

### 4.1 Avant refonte

- Une seule API (Spotify), validation limitée (similarité artiste sur « sans artiste »).
- Pas de seuil sur le titre → risque de faux positifs (reprises, titres proches).
- Pas de MusicBrainz ni de fallback IA.

### 4.2 Après refonte (attendu)

- **Objectif :** ≥95 % de taux de réussite sur matching titre/artiste/album pour les fichiers avec ID3 ou filename correct.
- **Méthode de mesure :**
  1. Déployer les changements.
  2. Collecter les logs d’enrichissement (`wrangler tail` ou équivalent) sur un échantillon d’uploads musique (ex. 100–200 fichiers variés).
  3. Compter : `success: true` / total, et analyser les `tentatives` pour les échecs (dernière étape, raison du refus).
  4. Ajuster si besoin : seuils (`ENRICHMENT_TITLE_SIMILARITY_THRESHOLD`, `ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD`), ou ajout d’alias/patterns.

### 4.3 Rapport avant/après (à remplir après déploiement)

| Métrique | Avant | Après (à mesurer) |
|----------|--------|--------------------|
| Taux de réussite (match trouvé) | ~X % | ≥95 % (cible) |
| Faux positifs (match incorrect) | À réduire | Validations titre+artiste |
| Sources utilisées | Spotify seul | Spotify + MusicBrainz + Gemini |

---

## 5. Configuration

### 5.1 Variables d’environnement / secrets

- **SPOTIFY_CLIENT_ID** / **SPOTIFY_CLIENT_SECRET** : requis pour Spotify.
- **GEMINI_API_KEY** : optionnel, pour le fallback IA (extraction artiste/titre depuis filename).
- **ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD** : optionnel, défaut `0.6` (0–1).
- **ENRICHMENT_TITLE_SIMILARITY_THRESHOLD** : optionnel, défaut `0.75` (0–1).

Aucune clé pour MusicBrainz ni Cover Art Archive (User-Agent suffit).

### 5.2 Commandes d’installation

Aucun nouveau package npm ajouté (Levenshtein implémenté en pur JS dans `musicEnrichment.ts`).

```bash
npm ci
npm run test:api
```

---

## 6. Checklist de déploiement

- [ ] `npm run test:api` vert (dont `tests/workers/*`).
- [ ] Secrets/config : `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` ; optionnel : `GEMINI_API_KEY`, `ENRICHMENT_*_THRESHOLD`.
- [ ] Déploiement Worker (ex. `wrangler deploy`).
- [ ] Vérification en conditions réelles : quelques uploads musique, vérifier les logs `[ENRICHMENT]` et `enrichmentReport.tentatives`.
- [ ] Mesure du taux de réussite sur un échantillon (voir §4.2) et ajustement des seuils si besoin.

---

## 7. PR / Commits suggérés

1. **feat(music): title similarity + acceptMusicMatch (validations titre/artiste)** – `workers/musicEnrichment.ts`, `workers/types.ts`
2. **feat(music): fallback MusicBrainz + Cover Art Archive** – `workers/upload.ts` (`searchMusicBrainz`)
3. **feat(music): fallback IA Gemini (extract artist/title from filename)** – `workers/upload.ts` (`extractArtistTitleWithGemini`)
4. **refactor(music): full enrichment chain Spotify → MusicBrainz → Gemini with acceptMusicMatch** – `workers/upload.ts`
5. **test(workers): titleSimilarity, acceptMusicMatch, getTitleSimilarityThreshold** – `tests/workers/musicEnrichment.spec.ts`
6. **test(workers): music enrichment integration (mock)** – `tests/workers/musicEnrichment-integration.spec.ts`
7. **docs: validation report and deployment checklist (≥95% target)** – `reports/validation-enrichment-musique-95.md`

Une seule PR peut regrouper ces commits.
