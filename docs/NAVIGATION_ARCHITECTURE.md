# Architecture de navigation — Videomi

Ce document décrit l’architecture de navigation de l’application : routing, layouts, transitions, gestion d’état et bonnes pratiques.

---

## 1. Vue d’ensemble

- **Framework** : React Router v7 (SSR activé).
- **Objectifs** : navigation instantanée, code splitting par route, layouts réutilisables, deep linking, gestion d’erreurs et de chargement.

---

## 2. Structure des routes

### 2.1 Fichier de configuration : `app/routes.ts`

Toutes les routes sont déclarées dans `app/routes.ts` via les helpers `index`, `route` et `layout` de `@react-router/dev/routes` :

- **Index** : `/` → redirection vers `/splash` (fichier `routes/index.tsx`).
- **Layout public** (`_public.tsx`) : routes sans authentification.
  - `/splash` — écran de démarrage
  - `/login` — connexion
- **Layout app** (`_app.tsx`) : routes protégées (AuthGuard + barre de navigation).
  - `/home`, `/upload`, `/profile`, `/films`, `/series`, `/musics`, `/images`, `/documents`, `/archives`, `/executables`, `/others`
  - `/reader/:category/:fileId`, `/match/:category/:fileId`, `/info/:category/:fileId`
  - `/videos` — redirection vers `/films`
- **Route splat** : `*` → page 404 (`routes/not-found.tsx`).

L’ordre des routes est important : la route `*` doit être en dernier pour attraper les chemins non reconnus.

### 2.2 Layouts (pathless)

- **`routes/_public.tsx`**  
  Layout minimal pour splash et login : pas de barre de navigation, uniquement `<Outlet />`.

- **`routes/_app.tsx`**  
  Layout principal authentifié :
  - `AuthGuard` (redirection vers `/login` si non connecté)
  - `Navigation` (barre avec liens Home, Upload, Fichiers, Profil)
  - `AppLayoutLoadingBar` (barre de chargement en haut pendant la navigation)
  - `PageTransition` + `<Outlet />` pour le contenu des routes enfants
  - Export `ErrorBoundary` pour les erreurs des routes enfants

Les fichiers de layout préfixés par `_` sont des **pathless layout routes** : ils n’ajoutent pas de segment à l’URL.

---

## 3. Navigation et prefetch

- **Composant** : `app/components/navigation/Navigation.tsx`.
- **Prefetch** : les `<Link>` principaux (Home, Upload, Fichiers, Profil) utilisent `prefetch="intent"` pour précharger la route au survol (ou à l’intention de clic), ce qui accélère la navigation.
- **PrefetchPageLinks** : préchargement des routes `/home`, `/films`, `/upload` et `/profile` dès l’affichage de la barre de navigation (composant `PrefetchPageLinks` de React Router). Les liens principaux sont ainsi préchargés dès que l’utilisateur voit la nav ; un prefetch basé sur le viewport (Intersection Observer) peut être ajouté plus tard pour d’autres liens secondaires.
- **View Transitions API** : tous les liens de la nav ont `viewTransition` pour envelopper la navigation dans `document.startViewTransition()` (cross-fade fluide entre pages). Styles dans `root.tsx` pour `::view-transition-old(root)` / `::view-transition-new(root)` ; `prefers-reduced-motion` désactive les animations.
- **État actif** : `aria-current="page"` sur le lien de la page courante pour l’accessibilité.

---

## 4. Transitions et chargement

- **`PageTransition`** (`app/components/navigation/PageTransition.tsx`)  
  Enveloppe le contenu de chaque page avec une courte animation de fondu. Respecte `prefers-reduced-motion`.

- **`AppLayoutLoadingBar`** (`app/components/navigation/AppLayoutLoadingBar.tsx`)  
  Barre fine en haut de l’écran affichée pendant `navigation.state === 'loading'` (chargement des loaders / actions). Donne un retour visuel sans bloquer l’UI.

- **Skeleton loaders** :  
  - `PageSkeleton` (`app/components/ui/PageSkeleton.tsx`) : barres ou grille de cartes animées (shimmer). Utilisé sur Musiques en chargement.  
  - `MediaPageSkeleton` (`app/components/ui/MediaPageSkeleton.tsx`) : hero + lignes de cartes type Netflix. Utilisé sur Films et Séries en chargement.

---

## 5. Gestion des erreurs

- **Root** (`app/root.tsx`)  
  Export `ErrorBoundary` : erreurs non gérées plus bas dans l’arbre. Affiche un message et un lien vers `/home` dans une page HTML minimale.

- **Layout app** (`routes/_app.tsx`)  
  Export `ErrorBoundary` : erreurs dans les routes enfants (loaders, composants). Affiche un message et un lien « Retour à l’accueil ».

- **Page 404**  
  Route `*` → `routes/not-found.tsx`. Page dédiée avec titre, message et lien vers `/home`. Métadonnées `robots: noindex` pour le SEO.

---

## 6. Deep linking et URLs

- Chaque vue est accessible par URL directe.
- Paramètres dynamiques : `reader/:category/:fileId`, `match/:category/:fileId`, `info/:category/:fileId`.
- **État dans l’URL (Musiques)** : la page Musiques synchronise la vue (artistes / albums d’un artiste / titres d’un album) avec les query params : `view=artists | artist-albums | album-tracks`, `artist=…`, `album=…`. Une URL comme `/musics?view=album-tracks&artist=…&album=…` est partageable et restaure la vue au chargement.
- **État dans l’URL (Films / Séries)** : les pages Films et Séries lisent le paramètre `?genre=…`. Au chargement, si ce paramètre est présent et correspond à un genre existant, la page défile automatiquement (smooth scroll) vers la section carousel de ce genre. Chaque carousel par genre a un `id` du type `genre-${encodeURIComponent(genre)}` pour permettre ce deep link (ex. `/films?genre=Action`, `/series?genre=Drame`).

---

## 7. Code splitting et performance

- React Router v7 associe une entrée de route à un fichier ; le chargement des composants de route est **lazy** par défaut (code splitting par route).
- Les layouts sont chargés une fois puis réutilisés ; seules les pages enfants changent au fil de la navigation.
- Prefetch `intent` sur les liens principaux pour réduire la latence perçue.

---

## 8. Accessibilité et SEO

- **Focus** : styles `:focus-visible` et skip link dans `root.tsx`.
- **Focus après navigation** : dans le layout app (`_app.tsx`), après chaque changement de page (`location.pathname` / `location.search`), le focus est déplacé sur `#main-content` (avec `tabIndex={-1}` pour le rendre focusable) pour les utilisateurs clavier et lecteurs d’écran.
- **Motion** : `prefers-reduced-motion` respecté dans les animations (PageTransition, LoadingBar, View Transitions, skeletons).
- **Sémantique** : `role="main"`, `id="main-content"` dans le layout app ; `aria-current="page"` sur le lien actif.
- **Meta par route** : les routes clés exportent `meta()` pour le titre et la description (SEO, onglet navigateur) : home, films, series, musics, profile, upload, not-found.
- **SSR** : activé dans `react-router.config.ts` pour un premier rendu côté serveur et un meilleur référencement.

---

## 9. Fichiers clés

| Fichier | Rôle |
|--------|------|
| `app/routes.ts` | Déclaration des routes et layouts |
| `app/root.tsx` | Shell HTML, providers, ErrorBoundary racine, styles View Transitions |
| `app/routes/_app.tsx` | Layout authentifié, Navigation, LoadingBar, PageTransition, focus a11y, ErrorBoundary |
| `app/routes/_public.tsx` | Layout public (splash, login) |
| `app/routes/not-found.tsx` | Page 404 |
| `app/components/navigation/Navigation.tsx` | Barre de navigation avec prefetch, viewTransition, PrefetchPageLinks |
| `app/components/navigation/PageTransition.tsx` | Transition entre pages |
| `app/components/navigation/AppLayoutLoadingBar.tsx` | Barre de chargement globale |
| `app/components/ui/PageSkeleton.tsx` | Skeleton générique (bars / cards) |
| `app/components/ui/MediaPageSkeleton.tsx` | Skeleton type Netflix (films / séries) |
| `app/utils/cache/cacheInvalidation.ts` | Invalidation cache + `invalidateStats(userId)` pour révalidation stats home |

---

## 10. Stratégie cache et révalidation

- **clientLoader** : la page `/home` utilise un `clientLoader` pour charger les stats (nombre de fichiers, taille) avec mise en cache locale. Les données sont fournies à la route via `useLoaderData()` et initialisent l’état du composant pour éviter un flash de chargement.
- **Révalidation** : la page home écoute l’événement personnalisé `videomi:stats-invalidated` et appelle `useRevalidator()` pour réexécuter le `clientLoader` et rafraîchir les stats. Cet événement est émis par :
  - `UploadManager` après un upload réussi ;
  - `handleCacheInvalidation({ type: 'stats:update', userId })` dans `app/utils/cache/cacheInvalidation.ts`.
- **Utilitaire** : `invalidateStats(userId)` dans `app/utils/cache/cacheInvalidation.ts` permet à n’importe quel module de déclencher la mise à jour des stats de la page d’accueil sans connaître le nom de l’événement. À utiliser après une action qui modifie le nombre ou la taille des fichiers (upload, suppression, etc.).
- **Cache navigateur (React Router)** : les données des loaders sont mises en cache par React Router ; la révalidation manuelle via `useRevalidator()` ou l’événement ci-dessus permet de rafraîchir sans recharger la page.

---

## 11. Évolutions possibles

- **Loaders + defer** : étendre l’usage de `clientLoader` / `defer` sur d’autres routes (ex. films) lorsque l’auth est disponible côté loader.
- **Prefetch viewport** : prefetch des liens secondaires (ex. liens Fichiers) lorsque le lien entre dans le viewport (Intersection Observer).
- **Layouts par section** : ex. un layout « médias » pour films/séries/musics si la structure diverge de la page d’accueil.

---

## Changelog (session navigation)

Récapitulatif des changements réalisés sur la navigation et les transitions :

- **Layouts** : `_app.tsx` / `_public.tsx`, routes regroupées via `layout()`, route splat `*` → 404.
- **Routes** : suppression des doublons AuthGuard/Navigation dans chaque route (home, films, series, musics, upload, profile, images, documents, archives, executables, others, reader, match, info).
- **Prefetch** : `prefetch="intent"` sur les liens ; `PrefetchPageLinks` pour `/home`, `/films`, `/upload`, `/profile`.
- **Chargement** : `AppLayoutLoadingBar` pendant `navigation.state === 'loading'` ; squelettes `PageSkeleton` (musics) et `MediaPageSkeleton` (films, series).
- **Deep linking** : Musiques (`view`, `artist`, `album` dans l’URL) ; Films et Séries (`?genre=` avec scroll automatique vers la section).
- **Cache / stats** : `clientLoader` + `useRevalidator()` sur home ; `invalidateStats(userId)` dans `cacheInvalidation.ts` ; doc stratégie cache dans ce fichier.
- **Transitions** : suppression de l’effet « deux pages visibles en même temps » — pendant le chargement le `<main>` passe en `opacity: 0`, puis la nouvelle page apparaît en fondu ; `viewTransition` retiré des liens et du `navigate()` vers `/info` pour éviter la View Transitions API qui superposait les deux pages.
- **Accessibilité** : focus sur `#main-content` après navigation ; `prefers-reduced-motion` respecté ; `meta()` sur les routes clés.
