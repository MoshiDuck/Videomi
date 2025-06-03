# database/videos.py

import os
import json
import logging
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

from config.config import VIDEO_EXTENSIONS, FFPROBE_PATH
from database.folder_database import FolderDatabase
from cache.cache import VideoCache

# Configuration basique du logger pour le module vidéo
logging.basicConfig(level=logging.DEBUG, format='[%(levelname)s] %(message)s')


def normaliser_langue(lang: str) -> str:
    """
    Convertit une étiquette de langue (fr, fre, français, en, eng, anglais, esp, etc.)
    en code standard ISO 639-2 (fra, eng, spa).
    """
    lang = lang.lower().strip()
    mapping = {
        # Français
        "fr": "fra", "fre": "fra", "français": "fra", "francais": "fra",

        # Anglais
        "en": "eng", "eng": "eng", "anglais": "eng",

        # Espagnol
        "es": "spa", "esp": "spa", "espagnol": "spa", "español": "spa",
    }
    return mapping.get(lang, lang)



def obtenir_videos(video_info: dict) -> tuple[list[dict], dict]:
    """
    Parcourt récursivement tous les dossiers vidéo, extrait ou récupère
    les métadonnées, et renvoie :
      - une liste de dicts { 'nom', 'chemin', 'duree', 'codec',
                             'audio_langues', 'sous_titres_langues' }
      - un dict new_info contenant les chemins nouvellement découverts.
    Utilise VideoCache pour stocker temporairement le résultat.
    """
    cache = VideoCache()
    if cached := cache.object("videos"):
        return cached, {}

    extensions = VIDEO_EXTENSIONS
    videos: list[dict] = []
    new_info: dict = {}
    folder = FolderDatabase()
    dossiers_videos = folder.get_all_folders()

    with ThreadPoolExecutor() as executor:
        futures = []
        for dossier in dossiers_videos:
            if os.path.exists(dossier):
                futures.append(
                    executor.submit(process_folder, dossier, extensions, video_info)
                )
            else:
                logging.warning(f"Dossier inexistant : {dossier}")

        for future in as_completed(futures):
            folder_videos, folder_new_info = future.result()
            videos.extend(folder_videos)
            new_info.update(folder_new_info)

    cache.insert("videos", videos, max(len(videos) // 10, 1))
    return videos, new_info


def process_folder(dossier: str, extensions: tuple[str, ...], video_info: dict) -> tuple[list[dict], dict]:
    """
    Parcourt un dossier donné, renvoie :
      - folder_videos : liste de dicts pour chaque fichier vidéo trouvé
      - folder_new_info : dict { chemin: metadata } pour les nouveaux fichiers
    """
    folder_videos: list[dict] = []
    folder_new_info: dict = {}

    for root, _, files in os.walk(dossier):
        for file in files:
            if not file.lower().endswith(extensions):
                continue

            path = os.path.join(root, file)
            if path in video_info:
                info = video_info[path]
            else:
                info = get_video_metadata(path)
                folder_new_info[path] = info

            folder_videos.append({
                'nom': os.path.splitext(file)[0],
                'chemin': path,
                **info
            })

    return folder_videos, folder_new_info


def get_video_metadata(chemin_video: str) -> dict:
    """
    Utilise ffprobe pour extraire :
      - durée (en secondes)
      - codec vidéo
      - liste d'audio_langues (fra, eng, etc.)
      - liste de sous_titres_langues (fra, eng, etc.)
    En cas d'erreur, renvoie des valeurs par défaut.
    """
    commande = [
        FFPROBE_PATH,
        '-v', 'error',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        chemin_video
    ]

    try:
        resultat = subprocess.run(
            commande,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )
        data = json.loads(resultat.stdout)

        # Durée
        duration = 0.0
        if "format" in data and "duration" in data["format"]:
            try:
                duration = float(data["format"]["duration"])
            except Exception as e:
                logging.warning(f"Erreur conversion durée pour {chemin_video} : {e}")

        # Codec vidéo
        codec = "inconnu"
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "video":
                codec = stream.get("codec_name", "inconnu")
                break

        # Langues audio + sous-titres
        audio_langues: list[str] = []
        sous_titres_langues: list[str] = []
        for stream in data.get("streams", []):
            codec_type = stream.get("codec_type")
            tags = stream.get("tags", {})
            lang = normaliser_langue(tags.get("language", "inconnue"))
            if codec_type == "audio" and lang not in audio_langues:
                audio_langues.append(lang)
            elif codec_type == "subtitle" and lang not in sous_titres_langues:
                sous_titres_langues.append(lang)
        return {
            "duree": duration,
            "codec": codec,
            "audio_langues": audio_langues,
            "sous_titres_langues": sous_titres_langues
        }

    except subprocess.CalledProcessError as e:
        logging.error(f"Erreur ffprobe pour {chemin_video}: {e.stderr.decode().strip()}")
    except Exception as e:
        logging.error(f"Exception extraction métadonnées pour {chemin_video} : {e}")

    return {
        "duree": 0.0,
        "codec": "inconnu",
        "audio_langues": [],
        "sous_titres_langues": []
    }
