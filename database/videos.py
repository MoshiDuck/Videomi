import os
import cv2
import sys
import json
import logging
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

from config.config import VIDEO_EXTENSIONS
from database.folder_database import FolderDatabase

# Configuration basique du logger
logging.basicConfig(level=logging.DEBUG, format='[%(levelname)s] %(message)s')

cv2_backend = cv2.CAP_FFMPEG if hasattr(cv2, 'CAP_FFMPEG') else cv2.CAP_ANY


def normaliser_langue(lang):
    lang = lang.lower().strip()
    mapping = {
        "fr": "fra", "fre": "fra", "français": "fra",
        "en": "eng", "eng": "eng", "anglais": "eng"
    }
    result = mapping.get(lang, lang)
    return result


def obtenir_videos(video_info):
    cache = VideoCache()
    if cached := cache.object("videos"):
        return cached, {}
    extensions = VIDEO_EXTENSIONS
    videos = []
    new_info = {}
    folder = FolderDatabase()
    dossier_videos = folder.get_all_folders()

    with ThreadPoolExecutor() as executor:
        futures = []
        for dossier in dossier_videos:
            if os.path.exists(dossier):
                futures.append(executor.submit(process_folder, dossier, extensions, video_info))
            else:
                logging.warning(f"Dossier inexistant : {dossier}")

        for future in as_completed(futures):
            folder_videos, folder_new_info = future.result()
            videos.extend(folder_videos)
            new_info.update(folder_new_info)

    cache.insert("videos", videos, len(videos) // 10)
    return videos, new_info


def process_folder(dossier, extensions, video_info):
    folder_videos = []
    new_info = {}
    for root, _, files in os.walk(dossier):
        for file in files:
            if file.lower().endswith(extensions):
                path = os.path.join(root, file)
                if path in video_info:
                    info = video_info[path]
                else:
                    info = get_video_metadata(path)
                    new_info[path] = info
                folder_videos.append({
                    'nom': os.path.splitext(file)[0],
                    'chemin': path,
                    **info
                })
    return folder_videos, new_info


def get_video_metadata(chemin_video):
    ffprobe_path = r"C:\Users\Gabriel\Desktop\Video Player\bin\ffmpeg\bin\ffprobe.exe"
    commande = [
        ffprobe_path,
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

        duration = 0
        if "format" in data and "duration" in data["format"]:
            try:
                duration = float(data["format"]["duration"])
            except Exception as e:
                logging.warning(f"Erreur conversion durée : {e}")

        codec = "inconnu"
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "video":
                codec = stream.get("codec_name", "inconnu")
                break

        audio_langues = []
        sous_titres_langues = []
        for stream in data.get("streams", []):
            codec_type = stream.get("codec_type")
            tags = stream.get("tags", {})
            lang = normaliser_langue(tags.get("language", "inconnue"))
            if codec_type == "audio":
                if lang not in audio_langues:
                    audio_langues.append(lang)
            elif codec_type == "subtitle":
                if lang not in sous_titres_langues:
                    sous_titres_langues.append(lang)

        return {
            "duree": duration,
            "codec": codec,
            "audio_langues": audio_langues,
            "sous_titres_langues": sous_titres_langues
        }

    except subprocess.CalledProcessError as e:
        logging.error(f"Erreur ffprobe pour {chemin_video}: {e.stderr.decode()}")
    except Exception as e:
        logging.error(f"Exception extraction métadonnées pour {chemin_video}: {e}")

    return {
        "duree": 0,
        "codec": "inconnu",
        "audio_langues": [],
        "sous_titres_langues": []
    }


from test_py.navigateur.cache import VideoCache


def _scanner_dossier(chemin_dossier, extensions):
    videos = []
    try:
        for entry in os.scandir(chemin_dossier):
            try:
                if entry.is_dir():
                    videos.extend(_scanner_dossier(entry.path, extensions))
                elif entry.is_file():
                    if entry.name.lower().endswith(tuple(extensions)):
                        videos.append({
                            'nom': os.path.splitext(entry.name)[0],
                            'chemin': os.path.abspath(entry.path)
                        })
            except (PermissionError, OSError) as e:
                logging.warning(f"Accès refusé : {entry.path} - {e}")
    except Exception as e:
        logging.error(f"Erreur scan {chemin_dossier} : {e}")

    return videos
