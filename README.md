<div align="center">

# Videomi

**Application de gestion de médias personnels** — Interface style Netflix/Spotify, déployée sur Cloudflare Workers.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1%20%2B%20R2-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![WCAG 2.1 AA](https://img.shields.io/badge/WCAG-2.1%20AA-005A9C?logo=accessibility)](https://www.w3.org/WAI/WCAG21/quickref/)

**[Site en production](https://videomi.uk)** · **[Documentation](./docs/)**

</div>

---

## À propos

**Videomi** est une application web full‑stack qui permet de gérer, organiser et consommer vos médias personnels (vidéos, musique, images, documents) via une interface moderne inspirée de Netflix et Spotify. Streaming HLS, enrichissement automatique des métadonnées (TMDb, Spotify, etc.), cache multi‑niveaux et accessibilité WCAG 2.1 AA en font une solution complète et professionnelle.

---

## Table des matières

- [Fonctionnalités](#-fonctionnalités)
- [Architecture technique](#-architecture-technique)
- [Documentation](#-documentation)
- [Workflow Git](#-workflow-git)
- [Roadmap](#-roadmap)
- [Statistiques](#-statistiques)

---

## Fonctionnalités

### Gestion de fichiers

| Capacité | Détail |
|----------|--------|
| **Upload multi‑format** | Vidéos, musiques, images, documents, archives, exécutables |
| **Chunked upload** | Reprise automatique, upload par morceaux |
| **Déduplication** | Hash SHA‑256 pour éviter les doublons |
| **Streaming** | HLS pour la lecture vidéo |
| **Catalogue local (D1 seul)** | Métadonnées en base sans stockage R2 ; chemin du fichier stocké en D1 pour lecture sans redemander (voir ci‑dessous) |

**Chemin du fichier local (`local_file_path`)**  
En mode « catalogue local », l’app envoie le chemin du fichier au backend pour le stocker en D1. À la lecture, si un chemin est enregistré, le fichier est ouvert directement (sans redemander le fichier).  
**En navigateur** : pour des raisons de sécurité, le JavaScript n’a pas accès au chemin réel du fichier (le `File` issu de `<input type="file">` n’expose pas le chemin, ou seulement un faux chemin type `C:\fakepath\...`). Donc **en navigateur, `local_file_path` reste toujours null** et l’utilisateur doit choisir le fichier à chaque lecture.  
**Avec l’app Electron** : le `File` expose `file.path` ; le chemin est envoyé à l’upload, stocké en D1, et réutilisé à la lecture sans redemander le fichier.

### Interface utilisateur

| Capacité | Détail |
|----------|--------|
| **Films & séries** | Interface type Netflix (carrousels, fiches) |
| **Musique** | Interface type Spotify (playlists, mini‑player) |
| **Lecteur** | Vidéo HLS et audio avec progression, playlist, mini‑player |
| **Correspondance manuelle** | Page de match pour lier fichiers à TMDb/Spotify (artiste → album → titre) |
| **Mini‑player** | Lecteur flottant avec playlist et contrôles |
| **Drag & drop** | Réorganisation et suppression de fichiers |

### Enrichissement des métadonnées

| Source | Usage |
|--------|--------|
| **TMDb** | Films et séries |
| **Spotify** | Musique (pochettes, infos) |
| **OMDb / Discogs** | Compléments optionnels |
| **Miniatures** | Génération automatique |

### Performances & accessibilité

- **Cache multi‑niveaux** : Navigateur (IndexedDB), Edge (Cache API), Service Worker pour images/médias  
- **Préchargement** : Catégories préchargées de façon intelligente  
- **WCAG 2.1 AA** : Conformité certifiée, navigation clavier, `prefers-reduced-motion`  
- **i18n** : FR, EN, ES, DE  

---

## Architecture technique

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT (React 19 + Vite 6)                    │
│  ┌────────────────────┐  ┌────────────────────┐                  │
│  │  IndexedDB         │  │  Service Worker    │                  │
│  │  (métadonnées)     │  │  (images / média)  │                  │
│  └────────────────────┘  └────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│              CLOUDFLARE EDGE (Workers + Hono)                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Cache API · Headers HTTP · ETag                            │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│              STOCKAGE (Cloudflare D1 + R2)                       │
│  ┌────────────────────┐  ┌────────────────────┐                  │
│  │  D1 (SQLite)       │  │  R2 (S3‑compatible)│                  │
│  │  Métadonnées       │  │  Fichiers          │                  │
│  └────────────────────┘  └────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

### Stack technique

| Couche | Technologies |
|--------|--------------|
| **Frontend** | React 19, Vite 6, TypeScript, React Router v7, Tailwind CSS, Motion |
| **Backend** | Cloudflare Workers, Hono, D1, R2 |
| **Auth** | Google OAuth 2.0, JWT (jose) |
| **Cache** | IndexedDB, Service Worker, Cache API |
| **Desktop** | Electron (optionnel) |


---

## Documentation

### Technique

| Document | Description |
|----------|-------------|
| [API_REFERENCE.md](./docs/API_REFERENCE.md) | Référence API (42 endpoints) |
| [COMPONENTS_REFERENCE.md](./docs/COMPONENTS_REFERENCE.md) | Composants React |
| [HOOKS_CONTEXTS_REFERENCE.md](./docs/HOOKS_CONTEXTS_REFERENCE.md) | Hooks et contextes |

### Cache

| Document | Description |
|----------|-------------|
| [CACHE_ARCHITECTURE.md](./docs/CACHE_ARCHITECTURE.md) | Architecture du cache 3 niveaux |
| [CACHE_README.md](./docs/CACHE_README.md) | Vue d’ensemble |
| [CACHE_BEST_PRACTICES.md](./docs/CACHE_BEST_PRACTICES.md) | Bonnes pratiques |
| [CACHE_EXAMPLES.md](./docs/CACHE_EXAMPLES.md) | Exemples d’intégration |
| [CACHE_CONFORMITY_FINAL_AUDIT.md](./docs/CACHE_CONFORMITY_FINAL_AUDIT.md) | Audit de conformité |
| [CACHE_DOCUMENTARY_CHECKLIST.md](./docs/CACHE_DOCUMENTARY_CHECKLIST.md) | Checklist documentaire |

### UX & accessibilité

| Document | Description |
|----------|-------------|
| [UX_AUDIT_SPRINT1_2.md](./docs/UX_AUDIT_SPRINT1_2.md) | Audit UX Sprint 1 & 2 |
| [UX_CONFORMITY_AUDIT.md](./docs/UX_CONFORMITY_AUDIT.md) | Audit WCAG 2.1 AA |

### Audits

| Document | Description |
|----------|-------------|
| [AUDIT_FINAL_DOCUMENTATION.md](./docs/AUDIT_FINAL_DOCUMENTATION.md) | Audit exhaustif de conformité |

---

## Workflow Git

### Commandes quotidiennes

| Action | Commande |
|--------|----------|
| **Voir l'état** | `git status` |
| **Voir les différences** | `git diff` (ou `git diff --staged` pour ce qui est déjà add) |
| **Ajouter des fichiers** | `git add .` (tout) ou `git add fichier.tsx` (un fichier) |
| **Commiter** | `git commit -m "Message descriptif"` |
| **Pousser** | `git push origin main` |
| **Récupérer** | `git pull origin main` |

### Historique et navigation

| Action | Commande |
|--------|----------|
| **Voir les commits** | `git log --oneline` |
| **Revenir au commit précédent** | `git reset --hard HEAD~1` puis `git push --force` |
| **Revenir à un commit précis** | `git reset --hard <hash>` puis `git push --force` |
| **Annuler sans réécrire** | `git revert HEAD` puis `git push origin main` |

### Branches et sauvegarde

| Action | Commande |
|--------|----------|
| **Créer une branche** | `git branch ma-branche` |
| **Changer de branche** | `git checkout ma-branche` |
| **Stasher (mettre de côté)** | `git stash` (puis `git stash pop` pour récupérer) |
| **Sauvegarder avant reset** | `git branch backup-$(date +%Y%m%d)` |
| **Synchroniser avec origin** | `git fetch origin` puis `git reset --hard origin/main` |

---

## Roadmap

Fonctionnalités utiles à ajouter pour rendre l'app plus complète et fonctionnelle :

### Priorité haute (impact utilisateur direct)

- [ ] **Sous-titres (.srt, .vtt)** — Affichage dans le lecteur vidéo
- [ ] **Lecture PDF intégrée** — Ouvrir les PDF dans le reader au lieu de téléchargement
- [ ] **Reprise d'upload** — Finaliser la reprise avec les chunks déjà uploadés (TODO dans UploadManager)
- [ ] **Recherche globale** — Rechercher dans films, séries, musiques, documents
- [ ] **Grille d'images** — Vue galerie avec lightbox, dates, tri
- [ ] **Grille de documents** — Dates, tri par type, aperçu rapide

### Priorité moyenne

- [ ] **Catégorie Livres** — EPUB, MOBI avec métadonnées
- [ ] **Streaming YouTube** — Ajouter des vidéos via liens
- [ ] **Partage temporaire** — Liens avec expiration pour partager un fichier
- [ ] **Téléchargement depuis flux** — Import depuis URL
- [ ] **Améliorer i18n** — Compléter les traductions manquantes (FR, EN, ES, DE)

### Priorité basse

- [ ] **Mode hors ligne** — PWA améliorée, cache plus agressif
- [ ] **Import Google Drive / Dropbox** — Connexion OAuth
- [ ] **Option stockage local** — Choix dans l'upload (D1 seul vs R2)

---

## Statistiques

| Métrique | Valeur |
|----------|--------|
| Composants React | 20 |
| Hooks personnalisés | 8 |
| Contextes React | 4 |
| Routes | 19 |
| Endpoints API | 42 |
| Langues | 4 (FR, EN, ES, DE) |
| Conformité WCAG | 100 % (AA) |
| Conformité cache | 100 % |

