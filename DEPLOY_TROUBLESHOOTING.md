# Guide de dépannage - Erreur 403 Forbidden lors du déploiement

## Problèmes de déploiement Cloudflare

### Problème 1 : Erreur 403 lors de l'upload des assets
Erreur `403 Forbidden` lors de l'upload des assets Cloudflare Workers :
```
POST /accounts/.../workers/scripts/videomi/assets-upload-session -> 403 Forbidden
```

### Problème 2 : Erreur 403 lors de la configuration du domaine custom
Erreur `403 Forbidden` lors de la configuration du domaine personnalisé :
```
POST /accounts/.../workers/scripts/videomi/domains/changeset -> 403 Forbidden
```

**Solution rapide** : Retirer temporairement la configuration `routes` dans `wrangler.jsonc` et configurer le domaine manuellement dans le dashboard Cloudflare.

## Solutions à essayer

### 1. Vérifier l'authentification Cloudflare

```bash
# Vérifier que vous êtes connecté
wrangler whoami

# Si non connecté, se connecter
wrangler login
```

### 2. Vérifier les permissions du token API

Si vous utilisez un token API (via `CLOUDFLARE_API_TOKEN`), assurez-vous qu'il a les permissions suivantes :
- **Account** : `Workers Scripts:Edit`
- **Account** : `Workers KV Storage:Edit` (si vous utilisez KV)
- **Account** : `Account Settings:Read`
- **Zone** : `Zone:Read` (pour les domaines custom)
- **Zone** : `DNS:Edit` (pour les domaines custom)

Pour créer un nouveau token avec les bonnes permissions :
1. Allez sur https://dash.cloudflare.com/profile/api-tokens
2. Créez un token avec les permissions ci-dessus
3. Exportez-le : `export CLOUDFLARE_API_TOKEN="votre_token"`

**Note** : Si vous avez des problèmes avec les domaines custom, vous pouvez :
- Retirer temporairement la section `routes` de `wrangler.jsonc`
- Configurer le domaine manuellement dans Cloudflare Dashboard : Workers & Pages > videomi > Custom Domains

### 3. Vérifier la configuration wrangler

Assurez-vous que `wrangler.jsonc` est correctement configuré :

```jsonc
{
  "name": "videomi",
  "compatibility_date": "2025-10-08",
  "main": "./workers/app.ts",
  // ... autres configs
}
```

### 4. Nettoyer le cache wrangler

```bash
# Supprimer le cache wrangler
rm -rf .wrangler/

# Réessayer le déploiement
npm run deploy
```

### 5. Vérifier la taille des assets

Si les assets sont trop volumineux, cela peut causer des erreurs. Vérifiez la taille :

```bash
du -sh build/client/
```

Limite recommandée : < 100 MB pour tous les assets.

### 6. Mettre à jour wrangler

```bash
# Mettre à jour wrangler vers la dernière version
npm install -g wrangler@latest

# Ou localement
npm install --save-dev wrangler@latest
```

### 7. Vérifier le compte Cloudflare

Assurez-vous que :
- Votre compte Cloudflare est actif
- Vous avez les droits sur le compte utilisé
- Le plan Workers est suffisant (Free tier a des limites)

### 8. Déployer sans assets (temporaire)

Si le problème persiste, vous pouvez essayer de déployer sans les assets pour isoler le problème :

```bash
# Déployer uniquement le worker (sans assets)
wrangler deploy --no-bundle
```

### 9. Vérifier les logs détaillés

```bash
# Activer les logs détaillés
WRANGLER_LOG=debug wrangler deploy
```

### 10. Solution alternative : Utiliser Pages au lieu de Workers

Si le problème persiste, considérez d'utiliser Cloudflare Pages qui gère mieux les assets statiques.

## Commandes utiles

```bash
# Vérifier la configuration
wrangler whoami
wrangler deployments list

# Nettoyer et redéployer
rm -rf .wrangler/ build/
npm run build
wrangler deploy

# Vérifier les variables d'environnement
echo $CLOUDFLARE_API_TOKEN
```

## Support Cloudflare

Si aucune solution ne fonctionne :
- Ouvrir un ticket : https://support.cloudflare.com/
- Issue GitHub : https://github.com/cloudflare/workers-sdk/issues
