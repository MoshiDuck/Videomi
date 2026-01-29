# Plan d’amélioration – Enrichissement musique ≥95 % de réussite

**Constat :** Sur 100 fichiers musicaux uploadés, 43 ne sont pas correctement identifiés (titre, artiste ou album).  
**Objectif :** Atteindre ≥95 % de taux de réussite (match correct titre/artiste/album).

---

## 1. Analyse des logs (avant correctifs)

### 1.1 Faux positifs (mauvais match accepté)

| Fichier / ID3 | Match incorrect | Cause |
|---------------|------------------|--------|
| The Kids Aren't Alright / The Offspring | **Anjer** – The Kids Aren't Alright (20th Anniversary) | Recherche "sans artiste" trop permissive → premier résultat pris sans vérifier l’artiste |
| Look Around / Red Hot Chili Peppers | **Rain Parade** – I Look Around | Idem |
| Encore / Red Hot Chili Peppers | **JAY-Z, Linkin Park** – Numb / Encore | Titre court "Encore" → match sur une autre chanson |
| Detroit / Red Hot Chili Peppers | **KISS** – Detroit Rock City | Titre court "Detroit" → match sur un autre artiste |

**Correctif déjà en place :** `acceptMusicMatch` avec seuils titre (0,75) et artiste (0,6) refuse ces cas. À confirmer en déploiement.

### 1.2 Échecs (pas de match alors qu’attendu)

| Fichier / ID3 | Problème identifié |
|---------------|---------------------|
| **Hotel California** / Eagles | Titre ID3 "Hotel California" écrasé par le filename "Eagles - Hotel California (Live 1977) (Official Video) [HD]" → requêtes Spotify avec un titre trop long / technique → aucun résultat. MusicBrainz trouvait un enregistrement mais refusé (similarité artiste 0 % car titre de recherche incorrect). |
| **Metallica: Enter Sandman** | Titre ID3 "Metallica: Enter Sandman" et filename avec deux-points pleine chasse (：) → titre de recherche "Metallica： Enter Sandman (Official Music" (tronqué) → aucun match. |
| **Gotye - Somebody That I Used To Know** | Artiste ID3 "gotyemusic", titre ID3 "Gotye - Somebody That I Used To Know" → recherche avec titre entier au lieu de "Somebody That I Used To Know" + artiste "Gotye". |
| **The Calling - Wherever You Will Go** | Artiste "TheCallingVEVO" non reconnu → pas d’alias. |
| **3 Doors Down - Here Without You** | Artiste "3doorsdown" → alias manquant pour "3 Doors Down". |
| **Monarchy of Roses** / Red Hot Chili Peppers | 1 seule variante de titre → pas de variante sans année / sans parenthèses. |
| **Feasting on the Flowers** / Red Hot Chili Peppers | Idem (recherche Spotify avec artiste peut échouer selon format). |
| **Encore** (RHCP) | Match refusé correctement si `acceptMusicMatch` déployé (JAY-Z/Linkin Park). |

---

## 2. Modifications de code (résumé)

### 2.1 Priorité ID3 vs filename

- **Règle :** Ne plus écraser un **titre ID3 propre** par le titre extrait du filename.
- **Implémentation :**
  - Si le titre ID3 ressemble à "Artist - Title" ou "Artist: Title" → `parseArtistTitleFromId3Title` : on utilise le **titre** extrait et, si absent, l’**artiste** extrait.
  - Sinon, si le titre ID3 est "propre" (`isCleanId3Title`) → on **conserve le titre ID3** (ex. "Hotel California", "Encore").
  - Sinon (titre ID3 vide ou ressemblant à un filename) → on utilise le titre extrait du filename.
- **Fichiers :** `workers/upload.ts` (bloc musique), `workers/musicEnrichment.ts` (`parseArtistTitleFromId3Title`, `isCleanId3Title`).

### 2.2 Parsing titre ID3 "Artist - Title" / "Artist: Title"

- **Fonction :** `parseArtistTitleFromId3Title(title)`.
  - Détecte " - ", ":", "：" (U+FF1A) et extrait artiste + titre.
  - Utilisée pour "Gotye - Somebody That I Used To Know", "Metallica: Enter Sandman".
- **Normalisation :** Dans `normalizeMusicText`, remplacement de "：" et ":" par " - " pour un parsing cohérent.

### 2.3 Alias artistes (VEVO / chaînes)

- **Ajouts dans `ARTIST_ALIASES` :**
  - `gotyemusic` → Gotye  
  - `thecallingvevo` / `the calling vevo` → The Calling  
  - `3doorsdown` / `3 doors down` → 3 Doors Down  
- **Fichier :** `workers/musicEnrichment.ts`.

### 2.4 Variantes de titre

- **Variante sans préfixe "Artist - "/"Artist: " :**  
  Dans `generateMusicTitleVariants`, appel à `parseArtistTitleFromId3Title` pour ajouter la variante "titre seul" quand le titre contient un séparateur artiste–titre.
- **Fichier :** `workers/musicEnrichment.ts`.

### 2.5 Validations (déjà en place)

- `acceptMusicMatch` : seuil titre (défaut 0,75), seuil artiste (défaut 0,6).
- Refus des matchs "sans artiste" quand l’artiste connu ne correspond pas au(x) artiste(s) du track.

---

## 3. Fichiers modifiés

| Fichier | Modifications |
|---------|----------------|
| `workers/musicEnrichment.ts` | `normalizeMusicText` (：/ : → " - "), `parseArtistTitleFromId3Title`, `isCleanId3Title`, `ARTIST_ALIASES` (Gotye, The Calling, 3 Doors Down), `generateMusicTitleVariants` (variante sans préfixe artiste) |
| `workers/upload.ts` | Priorité ID3 : utiliser `parseArtistTitleFromId3Title` si titre type "Artist - Title", sinon conserver titre ID3 si `isCleanId3Title`, sinon filename |
| `tests/workers/musicEnrichment.spec.ts` | Tests `parseArtistTitleFromId3Title`, `isCleanId3Title`, alias gotyemusic / 3doorsdown |

---

## 4. Indicateurs de performance

### 4.1 Avant (état actuel – 57 % de réussite)

- **Réussite :** 57/100 (43 échecs).
- **Faux positifs :** The Offspring → Anjer, RHCP Look Around → Rain Parade, RHCP Encore → JAY-Z/Linkin Park, RHCP Detroit → KISS.
- **Causes principales d’échec :**
  - Titre ID3 propre écrasé par le filename (Hotel California, etc.).
  - Titre ID3 "Artist - Title" ou "Artist: Title" non parsé (Gotye, Metallica).
  - Artistes VEVO / chaînes non reconnus (gotyemusic, TheCallingVEVO, 3doorsdown).
  - Deux-points pleine chasse (：) non gérée.

### 4.2 Après (attendu avec correctifs déployés)

- **Cible :** ≥95 % de réussite (≤5 échecs sur 100).
- **Effets attendus :**
  - Hotel California : titre de recherche "Hotel California" + artiste "Eagles" → match Spotify/MusicBrainz.
  - Metallica Enter Sandman / Nothing Else Matters : titre "Enter Sandman" / "Nothing Else Matters" + artiste "Metallica" → match.
  - Gotye : artiste "Gotye", titre "Somebody That I Used To Know" → match.
  - The Calling, 3 Doors Down : alias → bons noms pour la recherche.
  - Faux positifs (Anjer, Rain Parade, JAY-Z/Linkin Park, KISS) : refusés par `acceptMusicMatch` (similarité artiste < 0,6).

### 4.3 Mesure après déploiement

1. Ré-uploader un échantillon représentatif (ex. les 100 mêmes fichiers ou un nouveau lot).
2. Compter : `enrichmentReport.success === true` / total.
3. Vérifier manuellement un sous-ensemble pour les faux positifs (titre/artiste/album cohérents).
4. Ajuster si besoin : `ENRICHMENT_TITLE_SIMILARITY_THRESHOLD`, `ENRICHMENT_ARTIST_SIMILARITY_THRESHOLD`, ou ajout d’alias.

---

## 5. Commandes utiles

```bash
# Tests
npx vitest run --config vitest.config.ts tests/workers/
npm run test:api

# Déploiement
npm run build && wrangler deploy
```

---

## 6. Checklist déploiement

- [ ] Tests workers et test:api verts.
- [ ] Déploiement Worker (wrangler deploy).
- [ ] Vérification sur quelques cas types : Hotel California (Eagles), Enter Sandman (Metallica), Gotye, The Calling, 3 Doors Down, Encore (RHCP) → pas de match JAY-Z/Linkin Park.
- [ ] Mesure du taux de réussite sur 100 uploads et comparaison à l’objectif ≥95 %.
