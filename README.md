# Videomi  

**Une bibliothèque vidéo intelligente en Python avec interface élégante PySide6**

---

## Version :

0.0.2.6

---

## Lien : 

🔗 [Voir le dépôt GitHub](https://github.com/MoshiDuck/Videomi)

---

## Description :

Videomi est une application de bureau développée en Python, conçue pour explorer, organiser et enrichir automatiquement une collection de vidéos personnelles.

Elle combine puissance des outils FFmpeg avec une interface élégante construite en PySide6.

---

## Fonctionnalités principales :

- 🎞️ **Indexation intelligente** des vidéos depuis les dossiers choisis  
- 📊 **Extraction automatique des métadonnées** (titre, durée, pistes audio/sous-titres) grâce à `ffprobe`  
- 🖼️ **Génération de miniatures intelligentes** (principales pour la médiathèque, secondaires pour le lecteur) avec `FFmpeg`  
- 🧭 **Navigation fluide** dans la médiathèque grâce à une interface PySide6 moderne et responsive  
- 📂 **Organisation intuitive** des fichiers vidéo avec cache, tri et filtrage  
- 🎵 **Ajout de pistes audio** (fonctionnalité en cours de développement)  
- 🧠 **Utilisation de bases SQLite** pour la gestion des miniatures et la persistance des données  


---

## Fonctionnalités futures :

- 🎬 **Lecteur vidéo et audio intégré**, avec interface minimaliste et fluide  
- 🌐 **Double sous-titrage simultané** (ex. : VO + traduction)  
- 🤖 **Traduction automatique des sous-titres** via IA pour une compréhension multilingue  
- ☁️ **Sauvegarde et récupération en ligne** de ses vidéos personnelles via Backblaze + compression (RAR/ZIP)  
- 🎛️ **Éditeur intelligent de métadonnées** (titres, tags, langues, etc.)  
- 📈 **Analyse de contenu audio/vidéo** pour enrichir les fiches des fichiers automatiquement  

---

## PROCHAINE CHOSE À FAIRE :

Mettre une indication de temps pour slide

## GIT

1. Supprimer l'historique Git local + recrée un dépôt Git vierge
   ```bash
   git checkout -b main
   Remove-Item -Recurse -Force .git
   git init
   
2. (Re)ajoute tous les fichiers présents + Commit + Lier au dépôt distant GitHub + Force le push
   ```bash
   git push --force origin main
   git commit -m "[FAIT] Gerer les filtres"
   git add .
   git remote add origin https://github.com/MoshiDuck/Videomi