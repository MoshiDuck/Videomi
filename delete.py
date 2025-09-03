import os
import sys
import yaml
from Core.logger_config import logger
from Service.py1FichierClient import FichierClient

def delete_all_files_and_folders(client: FichierClient, folder_id: int = 0):
    """
    Supprime récursivement tous les fichiers puis tous les sous-dossiers.
    Le dossier racine (id=0) n'est pas supprimé, seulement son contenu.
    """
    try:
        # 1) Obtenir les informations du dossier avec les méthodes du client
        folder_info = client.get_folders(folder_id)
        logger.debug("Réponse get_folders: %s", folder_info)

        # 2) Obtenir les fichiers avec la méthode du client
        files_info = client._get_files(folder_id)
        logger.debug("Réponse _get_files: %s", files_info)

        # 3) Vérifier la structure des réponses et traiter les fichiers
        # La réponse de _get_files utilise 'items' au lieu de 'files'
        if files_info and 'items' in files_info:
            files = files_info['items']
            if files:
                urls = [f.get("url") for f in files if f.get("url")]
                if urls:
                    result = client.remove_file(urls)
                    logger.info("Supprimé %d fichiers dans le dossier %s", len(urls), folder_id)

        # 4) Traiter les sous-dossiers
        # La réponse de get_folders utilise 'sub_folders' au lieu de 'folders'
        subfolders = []
        if folder_info and 'sub_folders' in folder_info:
            subfolders = folder_info['sub_folders']

        logger.info("Trouvé %d sous-dossiers dans le dossier %s", len(subfolders), folder_id)

        # Descendre récursivement dans chaque sous-dossier
        for sf in subfolders:
            sf_id = sf.get("id")
            sf_name = sf.get("name", "Inconnu")
            if sf_id is not None:
                logger.info("Traitement du sous-dossier: %s (ID: %s)", sf_name, sf_id)
                delete_all_files_and_folders(client, sf_id)

                # Supprimer le sous-dossier après avoir vidé son contenu
                try:
                    resp_rm = client.api_call(
                        "https://api.1fichier.com/v1/folder/rm.cgi",
                        json={"folder_id": sf_id}
                    )
                    if resp_rm.get("status") == "OK":
                        logger.info("Dossier %s (%s) supprimé avec succès", sf_name, sf_id)
                    else:
                        logger.error("Erreur suppression dossier %s : %s", sf_id, resp_rm.get("message"))
                except Exception as e:
                    logger.error("Erreur suppression dossier %s : %s", sf_id, e)

    except Exception as e:
        logger.error("Erreur lors du traitement du dossier %s : %s", folder_id, e)


def _load_config(path: str) -> dict:
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception as e:
        logger.error("Erreur lecture config %s : %s", path, e)
        return {}


if __name__ == "__main__":
    CONFIG_PATH = "Config/config.yaml"
    cfg = _load_config(CONFIG_PATH)
    api_key = cfg.get("onefichier", {}).get("api_key", "")
    if not api_key:
        logger.critical("Clé API introuvable dans %s", CONFIG_PATH)
        sys.exit(1)

    client = FichierClient(api_key)

    # D'abord, vider complètement le dossier racine (sans le supprimer)
    logger.info("Début de la suppression de tous les fichiers et dossiers...")
    delete_all_files_and_folders(client, 0)

    logger.info("Suppression complète terminée.")