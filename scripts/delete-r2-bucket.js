/**
 * delete-r2-bucket.js
 * Supprime tous les objets d'un bucket Cloudflare R2 (S3-compatible) et les données associées dans D1.
 * 
 * ATTENTION: Ce script supprime:
 * - Tous les objets du bucket R2
 * - Toutes les données des tables: files, file_metadata, user_files, uploads
 * - NE SUPPRIME PAS les utilisateurs (table profil)
 *
 * Usage:
 *   R2_ENDPOINT="https://...r2.cloudflarestorage.com" \
 *   R2_ACCESS_KEY_ID="..." \
 *   R2_SECRET_ACCESS_KEY="..." \
 *   BUCKET_NAME="videomi" \
 *   CLOUDFLARE_ACCOUNT_ID="..." \
 *   CLOUDFLARE_API_TOKEN="..." \
 *   D1_DATABASE_ID="..." \
 *   node delete-r2-bucket.js
 *
 * Où trouver les variables:
 * - D1_DATABASE_ID: Déjà dans wrangler.jsonc (ligne 27) = "3a2fb995-cf6b-4f66-abee-30ad5965089c"
 * - CLOUDFLARE_ACCOUNT_ID: Dashboard Cloudflare > Barre latérale droite (sous votre email/nom)
 * - CLOUDFLARE_API_TOKEN: Dashboard > My Profile > API Tokens > Create Token
 *   (Template: "Edit Cloudflare Workers" avec permissions D1 + Workers)
 */

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const R2_ENDPOINT = process.env.R2_ENDPOINT || "https://9c481453b29ab0730e629ddb831636dc.r2.cloudflarestorage.com"
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "14c7f56a909ad09315f2c457e39aabd0"
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "8b50017a4372b874a61703f1c94006bb7ae40223e986d912b1286efc1fc2573f"
const BUCKET_NAME = process.env.BUCKET_NAME || "videomi"
// Variables optionnelles pour supprimer aussi les données D1
// Si non définies, seul R2 sera nettoyé
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "9c481453b29ab0730e629ddb831636dc"
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "4_a-XIQdLQua3qrhTFFDWImMUWEwjqKM7mwGZG10"
const D1_DATABASE_ID = process.env.D1_DATABASE_ID || "3a2fb995-cf6b-4f66-abee-30ad5965089c"

if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    console.error("❌ Veuillez fournir R2_ACCESS_KEY_ID et R2_SECRET_ACCESS_KEY via les variables d'environnement.");
    process.exit(1);
}

const s3 = new S3Client({
    endpoint: R2_ENDPOINT,
    region: "auto",
    credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
    },
});

async function deleteAllObjects(bucketName) {
    let continuationToken = undefined;
    let deletedCount = 0;

    try {
        while (true) {
            const listCmd = new ListObjectsV2Command({
                Bucket: bucketName,
                ContinuationToken: continuationToken,
                MaxKeys: 1000,
            });

            const listResp = await s3.send(listCmd);
            const contents = listResp.Contents;

            if (!contents || contents.length === 0) {
                if (!continuationToken) {
                    console.log("ℹ️ Le bucket semble vide.");
                }
                break;
            }

            const objectsToDelete = contents.map(obj => ({ Key: obj.Key }));

            const deleteCmd = new DeleteObjectsCommand({
                Bucket: bucketName,
                Delete: { Objects: objectsToDelete, Quiet: false },
            });

            const deleteResp = await s3.send(deleteCmd);
            const actuallyDeleted = deleteResp.Deleted ? deleteResp.Deleted.length : 0;
            deletedCount += actuallyDeleted;

            console.log(`✅ Supprimé ${actuallyDeleted} objets sur cette page (demandé: ${objectsToDelete.length}).`);

            if (!listResp.IsTruncated) break;
            continuationToken = listResp.NextContinuationToken;
        }

        console.log(`\n🎯 Opération terminée. Total d'objets supprimés : ${deletedCount}`);
    } catch (err) {
        console.error("❌ Erreur lors de la suppression :", err);
        process.exit(1);
    }
}

/**
 * Supprime toutes les données de fichiers dans D1 (sans toucher aux utilisateurs)
 */
async function deleteAllFileDataFromD1() {
    // Vérifier si les variables ont des valeurs valides (pas de chaînes vides ou "videomi" par défaut)
    const hasValidAccountId = CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_ACCOUNT_ID !== "videomi";
    const hasValidToken = CLOUDFLARE_API_TOKEN && CLOUDFLARE_API_TOKEN !== "videomi";
    const hasValidDatabaseId = D1_DATABASE_ID && D1_DATABASE_ID.length > 0;
    
    if (!hasValidAccountId || !hasValidToken || !hasValidDatabaseId) {
        console.warn("⚠️ Variables d'environnement Cloudflare manquantes ou invalides:");
        if (!hasValidAccountId) console.warn("   - CLOUDFLARE_ACCOUNT_ID manquant ou invalide");
        if (!hasValidToken) console.warn("   - CLOUDFLARE_API_TOKEN manquant ou invalide");
        if (!hasValidDatabaseId) console.warn("   - D1_DATABASE_ID manquant ou invalide");
        console.warn("⚠️ Seul le bucket R2 sera nettoyé. Les données D1 ne seront pas supprimées.");
        console.warn("   Pour nettoyer aussi D1, définissez ces variables d'environnement avec des valeurs valides.");
        return;
    }

    const apiBaseUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

    try {
        console.log("\n🗄️  Nettoyage des données D1...");

        // Liste des tables à nettoyer (dans l'ordre pour respecter les clés étrangères)
        const tablesToClean = [
            'file_metadata', // Dépend de files
            'user_files',    // Dépend de files et profil (mais on ne touche pas à profil)
            'uploads',       // Table d'uploads en cours
            'files'          // Table principale
        ];

        for (const table of tablesToClean) {
            try {
                console.log(`  🗑️  Suppression des données de la table: ${table}...`);
                
                // Exécuter DELETE sur la table
                const response = await fetch(apiBaseUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sql: `DELETE FROM ${table}`
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.warn(`  ⚠️  Erreur lors de la suppression de ${table}: ${response.status} ${response.statusText}`);
                    console.warn(`     Détails: ${errorText.substring(0, 200)}`);
                    continue;
                }

                const result = await response.json();
                if (result.success) {
                    const changes = result.meta?.changes || 0;
                    console.log(`  ✅ Table ${table} nettoyée (${changes} ligne(s) supprimée(s))`);
                } else {
                    console.warn(`  ⚠️  Échec pour ${table}: ${result.errors || 'Erreur inconnue'}`);
                }
            } catch (error) {
                console.error(`  ❌ Erreur lors de la suppression de ${table}:`, error.message);
            }
        }

        console.log("\n✅ Nettoyage D1 terminé.");
    } catch (error) {
        console.error("\n❌ Erreur lors du nettoyage D1:", error);
        throw error;
    }
}

/**
 * Fonction principale qui supprime tout (R2 + D1)
 */
async function deleteEverything() {
    console.log("🚨 DÉBUT DE LA SUPPRESSION COMPLÈTE");
    console.log("⚠️  ATTENTION: Cette opération est IRRÉVERSIBLE!\n");

    try {
        // 1. Supprimer les objets R2
        await deleteAllObjects(BUCKET_NAME);

        // 2. Supprimer les données D1
        await deleteAllFileDataFromD1();

        console.log("\n🎯 Opération terminée avec succès!");
    } catch (error) {
        console.error("\n❌ Erreur lors de l'opération:", error);
        process.exit(1);
    }
}

// Exécution si appelé directement
if (process.argv[1] === new URL(import.meta.url).pathname) {
    deleteEverything();
}

export { deleteAllObjects, deleteAllFileDataFromD1, deleteEverything };
