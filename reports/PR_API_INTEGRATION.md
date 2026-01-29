# Pull Request – Vérification intégration API métadonnées

## Titre suggéré
`feat(api): vérification complète intégration API métadonnées + tests + CI`

## Description

Vérification complète et méthodique de l’intégration des API de métadonnées multimédias (films/séries, musique, anime/manga, sous-titres, images, livres/comics) : corrections, tests automatisés, CI et rapport de vérification.

## Changelog

### Corrections
- **base.ts** : Retry sur 5xx (3 tentatives, backoff exponentiel), constantes `CACHE_TTL_MS` / `RETRY_*`, `ApiCache` typé `unknown`, export de `ApiCache`.
- **index.ts** : Alias de catégories `films` / `film` → `videos`, `music` → `musics` ; type env `TVDB_API_KEY`.
- **films-series.ts** : TMDb getDetails avec `append_to_response=credits` pour directors/actors.

### Tests
- **tests/api/** : 7 fichiers, 36 tests (base, manager, films-series, music, fallback, metadata-types, cache-network).
- Scripts : `npm run test:api`, `npm run test:api:watch`, `npm run test:api:coverage`.

### CI
- **.github/workflows/test-api.yml** : exécution des tests API sur push/PR (chemins api/metadata/tests).

### Documentation
- **reports/api_integration_verification.md** : rapport de vérification (checklist, preuves, bugs/correctifs, recommandations).
- **reports/PR_API_INTEGRATION.md** : ce fichier (description PR + changelog).

### Dépendances
- **devDependencies** : `vitest`, `@vitest/coverage-v8`.
- **vitest.config.ts** : config tests + coverage pour `app/utils/media/api` et `app/types/metadata.ts`.

## Checklist avant merge
- [ ] `npm run test:api` passe
- [ ] `npm run test:api:coverage` exécuté (optionnel)
- [ ] Rapport `reports/api_integration_verification.md` relu
- [ ] Champ « Reviewer QA » complété après validation

## Fichiers modifiés / ajoutés

- `app/utils/media/api/base.ts`
- `app/utils/media/api/index.ts`
- `app/utils/media/api/films-series.ts`
- `package.json`
- `vitest.config.ts`
- `tests/api/base.spec.ts`
- `tests/api/manager.spec.ts`
- `tests/api/films-series.spec.ts`
- `tests/api/music.spec.ts`
- `tests/api/fallback.spec.ts`
- `tests/api/metadata-types.spec.ts`
- `tests/api/cache-network.spec.ts`
- `.github/workflows/test-api.yml`
- `reports/api_integration_verification.md`
- `reports/PR_API_INTEGRATION.md`
