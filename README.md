## 🔗 Dépôt GitHub

https://github.com/MoshiDuck/Videomi

### Revenir en arriere

1. Ajoutez les dossiers
    ```bash
    git fetch origin
    ```
2. Commit
    ```bash
    git reset --hard origin/main
    ```

### Utiliser code onlime pour remplacer code offline

1. Crée une sauvegarde de ton code actuel
    ```bash
    git branch backup-local
    ```
2. Met à jour les informations locales du dépôt avec la dernière version en ligne , sans modifier ton code.
    ```bash
    git fetch origin 
    ```
3. Remplace complètement ton code local par la version en ligne de la branche main
    ```bash
    git reset --hard origin/main 
    ```
4. Permet de revenir à ta sauvegarde locale si tu veux restaurer ton ancien code.
   ```bash
   git checkout backup-local
    ```

### Réinitialiser

1. Supprimer l'historique Git local + recrée un dépôt Git vierge
    ```bash
   Remove-Item -Recurse -Force .git
   ```

2. Init git
    ```bash       
   git init
   ```

3. Mettre main
   ```bash  
   git checkout -b main
   ```

4. Lier au dépôt distant GitHub
    ```bash
   git remote add origin git@github.com:MoshiDuck/Videomi.git
   ```
---

### Ajouter / Modifier

1. Ajoutez les dossiers
    ```bash
    git add .
    ```
2. Commit
    ```bash
    git commit -m "[FAIT] Premier Comit"
    ```

3. Version
   ```bash
   git tag 0.0.0.0
   ```

4. Force le push
    ```bash
    git push --force origin main
    ```



---

## CloudFlare

1. Tester localement
    ```bash
    npm run dev
    ```
2. Déployer sur Cloudflare Pages
    ```bash
   npm run deploy
    ```

---

## PROCHAINE CHOSE À FAIRE :

Corriger :

- Image grid
- Document grid
- Upload metadata image et document pour date
- Grid avec date 
- Mettre option garder local dans upload
- Differencier fichier local de fichier upload
- Streaming via lien youtube ou autre
- Telechargement via Streaming
- Ameliorer language

### 🎯 Améliorations suggérées :

#### 🔍 Recherche & Navigation
- Barre de recherche globale (recherche dans tous les fichiers, pas seulement par catégorie)
- Filtres avancés (par date, taille, type, tags personnalisés)
- Tri personnalisable (nom, date, taille, popularité)
- Tags/labels personnalisés pour organiser les fichiers
- Collections/playlists personnalisées
- Historique de lecture (reprendre où on s'est arrêté)
- Favoris/bookmarks

#### 📱 Expérience Utilisateur
- Mode sombre/clair (si pas déjà fait)
- Raccourcis clavier pour navigation et lecture
- Drag & drop pour réorganiser les fichiers
- Vue liste vs vue grille (toggle)
- Prévisualisation rapide au survol (hover preview)
- Notifications pour uploads terminés
- Indicateur de progression pour uploads en cours dans la barre de navigation
- Mode hors ligne amélioré (synchronisation différée)

#### 🎬 Lecteur & Streaming
- Sous-titres (support .srt, .vtt)
- Vitesse de lecture variable (0.5x à 2x)
- Qualité vidéo adaptative (si plusieurs qualités disponibles)
- Picture-in-Picture (PiP) pour vidéos
- Contrôle de volume global
- Égaliseur audio pour musiques
- Mode lecture aléatoire (shuffle)
- Mode répétition (repeat one/all)
- Synchronisation de lecture entre appareils (si multi-device)

#### 📊 Statistiques & Analytics
- Dashboard avec statistiques détaillées (temps de visionnage, fichiers les plus regardés)
- Graphiques d'utilisation (par catégorie, par mois)
- Estimation de stockage restant
- Historique d'activité
- Export de données utilisateur

#### 🔐 Sécurité & Partage
- Partage de fichiers/collections avec liens temporaires
- Permissions granulaires (lecture seule, téléchargement, etc.)
- Authentification à deux facteurs (2FA)
- Chiffrement des fichiers sensibles
- Versioning de fichiers (garder plusieurs versions)

#### 🤖 Intelligence & Automatisation
- Détection automatique de doublons
- Suggestions de contenu similaire
- Auto-tagging intelligent (basé sur contenu/métadonnées)
- Organisation automatique par dossiers intelligents
- Rappels pour contenu non regardé depuis X temps
- Compression automatique des fichiers volumineux (optionnel)

#### 🌐 Intégrations
- Import depuis Google Drive / Dropbox / OneDrive
- Export vers services externes
- Webhook pour intégrations tierces
- API publique pour développeurs
- Extension navigateur pour upload rapide
- Intégration Plex/Jellyfin (si compatible)

#### ⚡ Performance & Optimisation
- Lazy loading amélioré pour grandes collections
- Pagination infinie (infinite scroll)
- Compression d'images automatique à l'upload
- Génération de miniatures en arrière-plan
- Préchargement intelligent (précharger le prochain épisode)
- Optimisation du cache (stratégies plus agressives)

#### 🎨 Interface & Design
- Thèmes personnalisables
- Personnalisation de la mise en page
- Animations et transitions fluides
- Mode compact pour grandes listes
- Accessibilité améliorée (ARIA, navigation clavier complète)
- Responsive design mobile amélioré

#### 📝 Métadonnées & Organisation
- Édition en masse de métadonnées
- Import/export de métadonnées (JSON, CSV)
- Détection automatique de saisons/épisodes pour séries
- Groupement automatique par série/album
- Notes et commentaires sur les fichiers
- Système de notation amélioré (avec reviews)

#### 🔧 Fonctionnalités Techniques
- Support de formats supplémentaires (MKV, FLAC, etc.)
- Conversion de formats à la volée
- Extraction audio depuis vidéos
- Découpage/édition vidéo basique
- Support multi-langues amélioré (traductions complètes)
- Logs détaillés pour debugging
- Mode développeur avec outils de diagnostic

Objectif:




---

## 🛡️ Licence

© 2025 Videomi — Tous droits réservés.

Ce projet, y compris son code source, son design, ses textes, ses images et ses animations,
est la propriété exclusive de Videomi (auteur : MoshiDoki).

- ❌ Aucune autorisation n’est accordée pour la copie, la modification, la distribution ou l’exploitation du code, du design ou du contenu.
- ❌ Toute utilisation commerciale, reproduction publique ou hébergement en ligne de tout ou partie du projet est strictement interdite sans accord écrit explicite de l’auteur.
- ❌ La redistribution, même partielle, sous quelque forme que ce soit, est interdite.

Ce dépôt GitHub est publié à titre de démonstration et ne confère aucun droit d’utilisation, d’adaptation ou de publication.
En résumé :

🔒 Ce projet est protégé. Vous pouvez le consulter, mais vous n’avez pas le droit de l’utiliser, le copier ou le modifier sans autorisation écrite de l’auteur.
# Videomi
