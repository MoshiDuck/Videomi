<div align="center">

# Videomi

**Application de gestion de médias personnels** — Interface style Netflix/Spotify, déployée sur Cloudflare Workers.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1%20%2B%20R2-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![WCAG 2.1 AA](https://img.shields.io/badge/WCAG-2.1%20AA-005A9C?logo=accessibility)](https://www.w3.org/WAI/WCAG21/quickref/)

[**Site**](https://videomi.uk) · [**Documentation**](./docs/)

</div>

---

## Présentation

**Videomi** est une application web full‑stack pour gérer, organiser et consommer vos médias personnels (vidéos, musique, images, documents) via une interface moderne inspirée de Netflix et Spotify.

Streaming HLS · Enrichissement TMDb/Spotify · Cache multi‑niveaux · Accessibilité WCAG 2.1 AA

---

## Table des matières

[Documentation](#-documentation) · [Workflow Git](#-workflow-git) · [Roadmap](#-roadmap) · [Statistiques](#-statistiques)

---

## Documentation

| Document | Description |
|----------|-------------|
| [API_REFERENCE.md](./docs/API_REFERENCE.md) | Référence API (42 endpoints) |
| [COMPONENTS_REFERENCE.md](./docs/COMPONENTS_REFERENCE.md) | Composants React |
| [HOOKS_CONTEXTS_REFERENCE.md](./docs/HOOKS_CONTEXTS_REFERENCE.md) | Hooks et contextes |
| [CACHE_ARCHITECTURE.md](./docs/CACHE_ARCHITECTURE.md) | Architecture du cache |
| [CACHE_README.md](./docs/CACHE_README.md) | Cache — vue d'ensemble |
| [CACHE_BEST_PRACTICES.md](./docs/CACHE_BEST_PRACTICES.md) | Cache — bonnes pratiques |
| [CACHE_EXAMPLES.md](./docs/CACHE_EXAMPLES.md) | Cache — exemples |
| [CACHE_CONFORMITY_FINAL_AUDIT.md](./docs/CACHE_CONFORMITY_FINAL_AUDIT.md) | Audit conformité cache |
| [CACHE_DOCUMENTARY_CHECKLIST.md](./docs/CACHE_DOCUMENTARY_CHECKLIST.md) | Checklist documentaire |
| [UX_AUDIT_SPRINT1_2.md](./docs/UX_AUDIT_SPRINT1_2.md) | Audit UX Sprint 1 & 2 |
| [UX_CONFORMITY_AUDIT.md](./docs/UX_CONFORMITY_AUDIT.md) | Audit WCAG 2.1 AA |
| [AUDIT_FINAL_DOCUMENTATION.md](./docs/AUDIT_FINAL_DOCUMENTATION.md) | Audit exhaustif |

---

## Workflow Git

**Quotidien** · `status` · `diff` · `add` · `commit -m "msg"` · `push` · `pull`

**Historique** · `log --oneline` · `reset --hard HEAD~1` · `reset --hard <hash>` · `revert HEAD`

**Branches** · `branch nom` · `checkout nom` · `stash` / `stash pop` · `fetch` + `reset --hard origin/main`

---

## Roadmap

| Priorité | Fonctionnalité |
|:--------:|----------------|
| **Haute** | Sous-titres (.srt, .vtt) · Lecture PDF intégrée · Reprise d'upload · Recherche globale · Grilles images/documents |
| **Moyenne** | Catégorie Livres · Streaming YouTube · Partage temporaire · Import depuis URL · i18n |
| **Basse** | Mode hors ligne · Import Drive/Dropbox · Option stockage local |

---

## Statistiques

**20** composants · **8** hooks · **4** contextes · **19** routes · **42** endpoints · **4** langues (FR, EN, ES, DE)

WCAG 2.1 AA · Cache 100 %
