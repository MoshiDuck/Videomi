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
   git tag 0.0.2.4
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

-

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
