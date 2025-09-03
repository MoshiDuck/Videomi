# Videomi

**Une application de médiathèque vidéo privée et intelligente, avec lecteur intégré, interface PyQt6 et serveur de streaming personnel.**

---

## 🧠 Concept global

Videomi est une solution **tout-en-un**, pensée pour les passionnés de vidéo qui souhaitent organiser, consulter et partager leur collection personnelle, **sans dépendre de services externes** comme Netflix, Google Drive ou Backblaze.

Elle repose sur deux piliers :  
1. **Une application de bureau multiplateforme** (Windows, macOS) avec une interface moderne en PyQt6, intégrant un lecteur vidéo `mpv`, un système d’indexation, de tri, d’upload et de filtrage.  
2. **Un serveur personnel de streaming multimédia**, hébergé sur une carte Orange Pi 5+ (ou Max/Ultra), avec SSD NVMe, services VPN, DNS local et contrôle parental.

Le tout conçu **pour une famille ou un cercle d'amis**, avec un **accès restreint, sécurisé, silencieux et élégant**.

---

## ⚙️ Fonctionnalités principales (Application PC/macOS)

- 🧭 Interface **moderne et fluide** en PyQt6
- 📁 **Indexation automatique** des vidéos depuis les dossiers définis
- 🎞️ **Miniatures dynamiques** (générées via FFmpeg)
- 📊 **Extraction complète des métadonnées** (titre, durée, codecs, pistes audio/sous-titres via `ffprobe`)
- 🗃️ **Tri et filtrage** par durée, titre, date, langue, etc.
- 🔍 **Recherche intelligente** dans la médiathèque
- 🎬 **Lecture intégrée via `mpv`**, avec support des flux en ligne
- 🎵 **Ajout manuel de pistes audio** (fonctionnalité en cours)
- 🌐 **Upload automatique vers le serveur personnel** (future intégration)
- 🧠 **Base SQLite légère et persistante et Realtime Database** pour toutes les données

---

## 🌐 Fonctionnalités serveur (Orange Pi 5+ ou Max/Ultra)

- 💽 Stockage haute capacité en **SSD NVMe silencieux**
  - SSD Secondaire pour backup
- 🔌 **Alimentation USB-C** + refroidissement passif ou ventilé silencieusement
- 📡 **Serveur de streaming personnel**, accessible partout dans le monde
- 🔐 **VPN maison (OpenVPN / Wireguard)** pour accès sécurisé à distance
- 🌍 **DNS local** avec possibilité de bloquer certains sites (publicités, contenu sensible)
- 👪 **Profils utilisateurs** avec contrôle parental
  - Accès limité par âge (films -18, -16, etc.)
  - Changement de profil protégé par mot de passe parent
- 📚 **Partage de fichiers et documents personnels à distance**
- 📺 **Connexion directe via mini-box TV maison** (à base de HDMI + Android TV perso)
- 📲 **Lecture sur TV connectée** via Wi-Fi ambiant ou HDMI sans configuration réseau compliquée
- 👦 **Contrôle des connexions locales** (ex. : enfants connectés via point d’accès de l’Orange Pi, pas via box principale)

---

## 🔐 Sécurité et confidentialité

- Aucun stockage sur le cloud commercial  
- Données 100% privées, stockées chez soi  
- Accès limité à la famille et aux amis proches  
- Gestion des profils, des droits, du contenu par utilisateur  
- VPN personnel pour sécuriser les flux, notamment pour accès international (ex. Netflix US)

---

## 🔧 Matériel recommandé

- 🔸 **Orange Pi 5 Max **  
- 🔸 **SSD NVMe (10 To conseillé)** avec dissipateur thermique  
- 🔸 **SSD Secondaire NVMe (10 To conseillé)** avec dissipateur thermique   
- 🔸 **Carte d’extension PCIe (si besoin)** pour SSD en direct  
- 🔸 **Boîtier silencieux** avec refroidissement adapté  
- 🔸 **Alimentation USB-C fiable**  
- 🔸 **Clé HDMI (optionnelle)** pour lecture directe sur téléviseur  

---

## 💡 Cas d’usage typique

- 📺 Visionnage de films familiaux à distance
- 🧒 Contrôle parental actif à la maison
- 🌍 Accès à ses données personnelles depuis l’étranger
- 🔧 Projet éducatif personnel (auto-hébergement, VPN, DNS, stockage)
- 🎁 Héritage numérique futur pour les enfants

---

## 📌 Objectifs futurs

- Synchronisation automatique app ↔ serveur  
- Intégration totale du VPN dans l’interface utilisateur  
- Interface TV maison avec télécommande Python (ou autre)  
- Interface simplifiée pour enfant  
- Compression automatique des fichiers pour stockage intelligent  
- Traduction automatique des sous-titres multilingues  

---

## 🧾 Licence et projet

Projet personnel, privé, non destiné à une diffusion publique à grande échelle.  
Conçu pour expérimenter, apprendre, partager en cercle restreint.

---

## 🔗 Dépôt GitHub

https://github.com/MoshiDuck/Videomi

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
   git remote add origin https://github.com/MoshiDuck/Videomi
   ```
---

### Ajouter / Modifier

1. Ajoutez les dossiers  
    ```bash
    git add .
    ```
2. Commit  
    ```bash
    git commit -m "[FAIT] - corriger icone upload "
    ```
   
3. Version
   ```bash
   git tag 0.1.0.4
   ```
   
4. Force le push  
    ```bash
    git push --force origin main
    ```

---
   
## PROCHAINE CHOSE À FAIRE :

Corriger :

- Améliorer vitesse publication
- Eviter double validation telechargement streaming
- mettre tread de telechargement dans fichier appart qui gere tout 
- Faire que quand je télécharge via streaming ça ajoute les données dans Realtime Database et sqlite
- ajouter fichier avec miniature flouté téléchargeable ou regardable avec mot de passe
- ajouter profil comme netflix 
- mettre mot de passe a 4 chiffre sur profil
- Integrer vitesse dans lecteur
- Limiter le fichier a pour upload 5gb
- Permettre importer fichier locale

Objectif:

- Créer icon parametre dans BarBase
- proposer commentaire Mini-trivia / Fun facts : afficher des anecdotes sur le film ou la musique pendant la lecture.
- Notification quand un utilisateur rajoute un item et catégoriser les nouveaux
- Ajouter age métadonné pour bloquer enfant 
- Statistiques familiales et classement : nombre de fichiers ajoutés par membre, temps passé sur chaque média, etc.
- Mettre systeme d'etoiles mais par adresse ip de sorte de faire classement global avec top 10 et petit badge quand le classement change
- Pouvoir creer dossier et glisser les documents dedans
- Faire que le tout fonctionne en local si panne de connexion et fichier téléchargé
- idées poétiques comme des capsules temporelles, des messages vidéo pour dans 20 ans, etc.
- Des Photos ou vidéos qui s'affiche apres 1 an ou 10 ans comme facebook, peut-etre montage
- Faire comme netflix pour le coté videos et comme spotify pour le coté musique
- Traduction contextuelle automatique : détection de la langue et affichage de sous-titres adaptés ou notes culturelles.
- Playlists ou collections thématiques : les utilisateurs peuvent créer et partager des playlists collaboratives (films, séries, musiques).
- ajoutez genre action romance, etc. dans le catalogue
- ajoutez abonnement premium

---

## Licence
© 2025 MoshiDoki. Tous droits réservés.  

Ce projet est mis à disposition pour un usage personnel et privé.  
- ✅ Vous pouvez l’utiliser librement pour vos besoins personnels.  
- ✅ Vous pouvez modifier le code pour expérimenter ou corriger des bugs, **à condition de partager vos améliorations avec l’auteur** afin qu’elles puissent être intégrées dans le projet principal.  
- ❌ Toute utilisation commerciale, hébergement public ou redistribution du code source/exécutable est interdite sans autorisation explicite de l’auteur.  

En résumé : vous pouvez contribuer à améliorer Videomi, mais le projet reste protégé et contrôlé par son auteur.

