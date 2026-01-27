<div align="center">

# Videomi

**Application de gestion de médias personnels** — Interface style Netflix/Spotify, déployée sur Cloudflare Workers.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1%20%2B%20R2-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![WCAG 2.1 AA](https://img.shields.io/badge/WCAG-2.1%20AA-005A9C?logo=accessibility)](https://www.w3.org/WAI/WCAG21/quickref/)

**[Site en production](https://videomi.uk)** · **[Documentation](./docs/)** · **[Dépôt](https://github.com/MoshiDuck/Videomi)**

</div>

---

## À propos

**Videomi** est une application web full‑stack qui permet de gérer, organiser et consommer vos médias personnels (vidéos, musique, images, documents) via une interface moderne inspirée de Netflix et Spotify. Streaming HLS, enrichissement automatique des métadonnées (TMDb, Spotify, etc.), cache multi‑niveaux et accessibilité WCAG 2.1 AA en font une solution complète et professionnelle.

---

## Table des matières

- [Fonctionnalités](#-fonctionnalités)
- [Architecture technique](#-architecture-technique)
- [Prérequis](#-prérequis)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Développement](#-développement)
- [Déploiement](#-déploiement)
- [Documentation](#-documentation)
- [Structure du projet](#-structure-du-projet)
- [Workflow Git](#-workflow-git)
- [Roadmap](#-roadmap)
- [Statistiques](#-statistiques)
- [Licence](#-licence)
- [Liens](#-liens)

---

## Fonctionnalités

### Gestion de fichiers

| Capacité | Détail |
|----------|--------|
| **Upload multi‑format** | Vidéos, musiques, images, documents, archives |
| **Chunked upload** | Reprise automatique, upload par morceaux |
| **Déduplication** | Hash SHA‑256 pour éviter les doublons |
| **Streaming** | HLS pour la lecture vidéo |

### Interface utilisateur

| Capacité | Détail |
|----------|--------|
| **Films & séries** | Interface type Netflix (carrousels, fiches) |
| **Musique** | Interface type Spotify (playlists, mini‑player) |
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

## Prérequis

- **Node.js** 18+  
- **npm** 9+  
- **Compte Cloudflare** avec accès à Workers, D1 et R2  
- **Wrangler CLI** : `npm install -g wrangler` (ou utilisation via `npx wrangler`)  

---

## Installation

```bash
# Cloner le dépôt
git clone https://github.com/MoshiDuck/Videomi.git
cd Videomi

# Installer les dépendances
npm install
```

Ensuite, configurer **Wrangler** et les **secrets** Cloudflare (voir [Configuration](#-configuration)).

---

## Configuration

### 1. Wrangler & ressources Cloudflare

Créez ou adaptez `wrangler.jsonc` avec vos identifiants Cloudflare (IDs Workers, D1, R2). Les ressources typiques sont :

- **D1** : base `videomi_db`  
- **R2** : bucket `videomi-storage`  

### 2. Secrets (variables d'environnement)

```bash
# Authentification (obligatoire)
npx wrangler secret put JWT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET

# Métadonnées (optionnel mais recommandé)
npx wrangler secret put TMDB_API_KEY
npx wrangler secret put OMDB_API_KEY
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET
npx wrangler secret put DISCOGS_API_TOKEN
```

Pour le détail des clés API et où les obtenir : **[CONFIGURATION_API_KEYS.md](./CONFIGURATION_API_KEYS.md)**.

---

## Développement

### Démarrer l’app en local

```bash
npm run dev
```

L’application est accessible sur **http://localhost:5173**.

### Scripts npm

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement (React Router + Vite) |
| `npm run build` | Build de production |
| `npm run preview` | Build + prévisualisation du build |
| `npm run deploy` | Build + déploiement sur Cloudflare Workers |
| `npm run typecheck` | Génération des types Wrangler + vérification TypeScript |
| `npm run electron:build` | Build du package Electron |
| `npm run electron:deploy` | Build Electron + lancement en mode prod (videomi.uk) |
| `npm run total:build` | Build web + Electron |
| `npm run total:deploy` | Build web + Electron, déploiement Cloudflare, puis lancement Electron |

---

## Déploiement

### Déployer sur Cloudflare

```bash
npm run deploy
```

Le site est alors disponible sur **https://videomi.uk** (ou votre domaine configuré).

### Dépannage

En cas d’erreurs (403, CORS, secrets, etc.) : **[DEPLOY_TROUBLESHOOTING.md](./DEPLOY_TROUBLESHOOTING.md)**.

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

## Structure du projet

```
videomi/
├── app/
│   ├── components/          # Composants React
│   │   ├── auth/            # AuthGuard, GoogleAuthButton
│   │   ├── navigation/      # Navigation
│   │   ├── profile/         # UserProfile
│   │   ├── ui/              # Composants UI (categoryBar, MiniPlayer, etc.)
│   │   └── upload/          # UploadManager
│   ├── contexts/            # Auth, DragDrop, Language, Player
│   ├── hooks/               # useAuth, useFiles, useLocalCache, etc.
│   ├── routes/              # Pages (films, séries, musique, documents, …)
│   ├── types/               # Types TypeScript
│   └── utils/               # Cache, fichiers, i18n, thème
├── workers/                 # Cloudflare Workers (Hono)
│   ├── app.ts               # Application principale
│   ├── auth.ts              # Authentification
│   ├── cache.ts             # Cache Edge
│   └── upload.ts            # Gestion uploads
├── electron/                # App desktop (optionnel)
├── public/                  # Assets statiques, Service Worker
├── docs/                    # Documentation
├── wrangler.jsonc           # Configuration Cloudflare
└── package.json
```

---

## Workflow Git

### Récupérer la version distante

```bash
git fetch origin
git reset --hard origin/main
```

### Sauvegarde locale avant mise à jour

```bash
git branch backup-local
git fetch origin
git reset --hard origin/main
# Restaurer : git checkout backup-local
```

### Pousser des modifications

```bash
git add .
git commit -m "Description des changements"
git push origin main
```

---

## Roadmap

### En cours

- [ ] Grille d’images améliorée  
- [ ] Grille de documents avec dates  
- [ ] Option de stockage local dans l’upload  

### Prévu

- [ ] Streaming via liens YouTube  
- [ ] Téléchargement depuis flux  
- [ ] Sous-titres (.srt, .vtt)  
- [ ] Partage de fichiers par liens temporaires  

### Idées futures

- [ ] Mode hors ligne amélioré  
- [ ] Import depuis Google Drive / Dropbox  
- [ ] Extension navigateur  
- [ ] Application mobile  

---

## Statistiques

| Métrique | Valeur |
|----------|--------|
| Composants React | 20 |
| Hooks personnalisés | 8 |
| Contextes React | 4 |
| Routes | 18 |
| Endpoints API | 42 |
| Langues | 4 (FR, EN, ES, DE) |
| Conformité WCAG | 100 % (AA) |
| Conformité cache | 100 % |

---

## Licence

© **2025–2026 Videomi** — Tous droits réservés.

Ce projet (code, design, textes, images, animations) est la propriété exclusive de **Videomi** (auteur : **MoshiDoki**).

- Aucune autorisation n’est accordée pour la copie, la modification, la distribution ou l’exploitation.  
- Toute utilisation commerciale est interdite sans accord écrit explicite.  
- La redistribution, même partielle, est interdite.

Vous pouvez consulter le projet, mais **aucune utilisation, copie ou modification** n’est autorisée sans accord écrit de l’auteur.

---

## Liens

| Ressource | URL |
|-----------|-----|
| **Site en production** | [https://videomi.uk](https://videomi.uk) |
| **Dépôt GitHub** | [https://github.com/MoshiDuck/Videomi](https://github.com/MoshiDuck/Videomi) |
