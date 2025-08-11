# Videomi

**Une application de médiathèque vidéo privée et intelligente, avec lecteur intégré, interface PyQt6 et serveur de streaming personnel.**

---


## Version :

0.0.6.4

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
    git commit -m "[FAIT] - Bouton play et prochaine vidéos"
    ```
3. Force le push  
    ```bash
    git push --force origin main
    ```

---
   
## PROCHAINE CHOSE À FAIRE :

- Ajoutez lire lien via streaming
- Mettre bouton supprimer avec validation dans card
- Mettre bouton télécharger dans card
    