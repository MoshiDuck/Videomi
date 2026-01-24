# Videomi

Application de gestion de médias personnels avec interface style Netflix/Spotify, déployée sur Cloudflare Workers.

---

## Table des matières

1. [Fonctionnalités](#fonctionnalités)
2. [Architecture technique](#architecture-technique)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Développement](#développement)
6. [Déploiement](#déploiement)
7. [Documentation](#documentation)
8. [Structure du projet](#structure-du-projet)
9. [Commandes Git](#commandes-git)
10. [Licence](#licence)

---

## Fonctionnalités

### Gestion de fichiers
- Upload multi-format (vidéos, musiques, images, documents, archives)
- Chunked upload avec reprise automatique
- Déduplication par hash SHA-256
- Streaming HLS pour vidéos

### Interface utilisateur
- Interface style Netflix pour films/séries
- Interface style Spotify pour musique
- Mini-player flottant avec playlist
- Drag & drop pour suppression de fichiers

### Enrichissement de métadonnées
- TMDb pour films et séries
- Spotify pour musique
- Génération automatique de miniatures

### Performances
- Cache multi-niveaux (navigateur, Edge, IndexedDB)
- Préchargement intelligent des catégories
- Service Worker pour cache des images

### Accessibilité
- Conformité WCAG 2.1 AA certifiée
- Navigation clavier complète
- Support `prefers-reduced-motion`
- Internationalisation (FR, EN, ES, DE)

---

## Architecture technique

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (React + Vite)                     │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │  IndexedDB       │  │  Service Worker  │                 │
│  │  (Métadonnées)   │  │  (Images/Media)  │                 │
│  └──────────────────┘  └──────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              CLOUDFLARE EDGE (Workers + Hono)                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Cache API + Headers HTTP + ETag                        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              STOCKAGE (Cloudflare D1 + R2)                   │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │  D1 (SQLite)     │  │  R2 (S3-compat)  │                 │
│  │  Métadonnées     │  │  Fichiers        │                 │
│  └──────────────────┘  └──────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

### Technologies

| Couche | Technologies |
|--------|--------------|
| Frontend | React 18, Vite, TypeScript, React Router v7 |
| Backend | Cloudflare Workers, Hono, D1, R2 |
| Auth | Google OAuth 2.0, JWT |
| Cache | IndexedDB, Service Worker, Cache API |

---

## Installation

### Prérequis

- Node.js 18+
- npm 9+
- Compte Cloudflare (Workers, D1, R2)

### Étapes

```bash
# Cloner le dépôt
git clone https://github.com/MoshiDuck/Videomi.git
cd Videomi

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp wrangler.jsonc.example wrangler.jsonc
# Éditer wrangler.jsonc avec vos IDs Cloudflare
```

---

## Configuration

### Variables d'environnement (Cloudflare Secrets)

```bash
# Authentification
wrangler secret put JWT_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# APIs métadonnées (optionnel)
wrangler secret put TMDB_API_KEY
wrangler secret put OMDB_API_KEY
wrangler secret put SPOTIFY_CLIENT_ID
wrangler secret put SPOTIFY_CLIENT_SECRET
wrangler secret put DISCOGS_API_TOKEN
```

Voir [CONFIGURATION_API_KEYS.md](./CONFIGURATION_API_KEYS.md) pour plus de détails.

### Configuration Cloudflare

| Service | Configuration |
|---------|---------------|
| Workers | `wrangler.jsonc` |
| D1 | Base `videomi_db` |
| R2 | Bucket `videomi-storage` |

---

## Développement

### Démarrage local

```bash
# Serveur de développement
npm run dev
```

L'application sera disponible sur `http://localhost:5173`.

### Scripts disponibles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run deploy` | Déploiement Cloudflare |
| `npm run lint` | Vérification ESLint |
| `npm run typecheck` | Vérification TypeScript |

---

## Déploiement

### Déploiement sur Cloudflare

```bash
npm run deploy
```

### Troubleshooting

Voir [DEPLOY_TROUBLESHOOTING.md](./DEPLOY_TROUBLESHOOTING.md) pour les erreurs courantes (403, etc.).

---

## Documentation

### Documentation technique (`docs/`)

| Document | Description |
|----------|-------------|
| [API_REFERENCE.md](./docs/API_REFERENCE.md) | Référence complète de l'API (42 endpoints) |
| [COMPONENTS_REFERENCE.md](./docs/COMPONENTS_REFERENCE.md) | Référence des composants React (20 composants) |
| [HOOKS_CONTEXTS_REFERENCE.md](./docs/HOOKS_CONTEXTS_REFERENCE.md) | Référence des hooks et contextes (12 fichiers) |

### Documentation cache (`docs/`)

| Document | Description |
|----------|-------------|
| [CACHE_ARCHITECTURE.md](./docs/CACHE_ARCHITECTURE.md) | Architecture cache 3 niveaux |
| [CACHE_README.md](./docs/CACHE_README.md) | Vue d'ensemble du système de cache |
| [CACHE_BEST_PRACTICES.md](./docs/CACHE_BEST_PRACTICES.md) | Bonnes pratiques |
| [CACHE_EXAMPLES.md](./docs/CACHE_EXAMPLES.md) | Exemples d'intégration |
| [CACHE_CONFORMITY_FINAL_AUDIT.md](./docs/CACHE_CONFORMITY_FINAL_AUDIT.md) | Audit conformité 100% |

### Documentation UX/Accessibilité (`docs/`)

| Document | Description |
|----------|-------------|
| [UX_AUDIT_SPRINT1_2.md](./docs/UX_AUDIT_SPRINT1_2.md) | Audit UX Sprint 1 & 2 |
| [UX_CONFORMITY_AUDIT.md](./docs/UX_CONFORMITY_AUDIT.md) | Audit WCAG 2.1 AA certifié |

### Audit final

| Document | Description |
|----------|-------------|
| [AUDIT_FINAL_DOCUMENTATION.md](./docs/AUDIT_FINAL_DOCUMENTATION.md) | Audit exhaustif de conformité |

---

## Structure du projet

```
videomi/
├── app/
│   ├── components/        # Composants React (20 fichiers)
│   │   ├── auth/         # AuthGuard, GoogleAuthButton
│   │   ├── navigation/   # Navigation
│   │   ├── profile/      # UserProfile
│   │   ├── ui/           # Composants UI (15 fichiers)
│   │   └── upload/       # UploadManager
│   ├── contexts/         # Contextes React (4 fichiers)
│   │   ├── AuthContext.tsx
│   │   ├── DragDropContext.tsx
│   │   ├── LanguageContext.tsx
│   │   └── PlayerContext.tsx
│   ├── hooks/            # Hooks personnalisés (8 fichiers)
│   │   ├── useAuth.ts
│   │   ├── useConfig.ts
│   │   ├── useFiles.ts
│   │   ├── useLocalCache.ts
│   │   └── ...
│   ├── routes/           # Pages (18 fichiers)
│   ├── types/            # Types TypeScript
│   └── utils/            # Utilitaires
│       ├── cache/        # Système de cache
│       ├── file/         # Gestion fichiers
│       └── ui/           # Thème
├── workers/              # Cloudflare Workers
│   ├── app.ts            # Application principale
│   ├── auth.ts           # Authentification
│   ├── cache.ts          # Utilitaires cache Edge
│   └── upload.ts         # Gestion fichiers
├── public/
│   └── sw.js             # Service Worker
├── docs/                 # Documentation
└── electron/             # Application desktop (optionnel)
```

---

## Commandes Git

### Récupérer la version en ligne

```bash
git fetch origin
git reset --hard origin/main
```

### Créer une sauvegarde locale

```bash
git branch backup-local
git fetch origin
git reset --hard origin/main
# Pour restaurer: git checkout backup-local
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

- [ ] Grille d'images améliorée
- [ ] Grille de documents avec dates
- [ ] Option de stockage local dans upload

### Prévu

- [ ] Streaming via liens YouTube
- [ ] Téléchargement depuis streaming
- [ ] Sous-titres (.srt, .vtt)
- [ ] Partage de fichiers avec liens temporaires

### Idées futures

- [ ] Mode hors ligne amélioré
- [ ] Import depuis Google Drive/Dropbox
- [ ] Extension navigateur
- [ ] Application mobile

---

## Statistiques du projet

| Métrique | Valeur |
|----------|--------|
| Composants React | 20 |
| Hooks personnalisés | 8 |
| Contextes React | 4 |
| Routes | 18 |
| Endpoints API | 42 |
| Langues supportées | 4 (FR, EN, ES, DE) |
| Conformité WCAG | 100% (AA) |
| Conformité Cache | 100% |

---

## Licence

© 2025-2026 Videomi — Tous droits réservés.

Ce projet, y compris son code source, son design, ses textes, ses images et ses animations, est la propriété exclusive de Videomi (auteur : MoshiDoki).

- ❌ Aucune autorisation n'est accordée pour la copie, la modification, la distribution ou l'exploitation
- ❌ Toute utilisation commerciale est strictement interdite sans accord écrit explicite
- ❌ La redistribution, même partielle, est interdite

🔒 Ce projet est protégé. Vous pouvez le consulter, mais vous n'avez pas le droit de l'utiliser, le copier ou le modifier sans autorisation écrite de l'auteur.

---

## Liens

- **Dépôt GitHub** : https://github.com/MoshiDuck/Videomi
- **Production** : https://videomi.uk
