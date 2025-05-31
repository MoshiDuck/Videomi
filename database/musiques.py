# database/musiques.py

import os
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from mutagen import File as MutagenFile

from config.config import AUDIO_EXTENSIONS
from database.folder_database import FolderDatabase
from test_py.navigateur.cache import MusiqueCache

# Configuration basique du logger pour le module musique
logging.basicConfig(level=logging.DEBUG, format='[%(levelname)s] %(message)s')


def normaliser_artiste(artist: str) -> str:
    """
    Nettoie le nom de l'artiste : retire espaces inutiles.
    """
    return artist.strip()


def normaliser_album(album: str) -> str:
    """
    Nettoie le nom de l'album : retire espaces inutiles.
    """
    return album.strip()


def obtenir_musiques(music_info: dict) -> tuple[list[dict], dict]:
    """
    Parcourt récursivement tous les dossiers audio, extrait ou récupère
    les métadonnées (via Mutagen), et renvoie :
      - une liste de dicts { 'titre', 'artiste', 'album', 'duree', 'chemin' }
      - un dict new_info contenant les chemins nouvellement découverts.
    Utilise MusicCache pour stocker temporairement le résultat.
    """
    cache = MusiqueCache()
    if cached := cache.object("musiques"):
        return cached, {}

    extensions = AUDIO_EXTENSIONS
    musiques: list[dict] = []
    new_info: dict = {}
    folder = FolderDatabase()
    dossiers_audios = folder.get_all_folders()

    with ThreadPoolExecutor() as executor:
        futures = []
        for dossier in dossiers_audios:
            if os.path.exists(dossier):
                futures.append(
                    executor.submit(process_audio_folder, dossier, extensions, music_info)
                )
            else:
                logging.warning(f"Dossier audio inexistant : {dossier}")

        for future in as_completed(futures):
            folder_musiques, folder_new_info = future.result()
            musiques.extend(folder_musiques)
            new_info.update(folder_new_info)

    cache.insert("musiques", musiques, max(len(musiques) // 10, 1))
    return musiques, new_info


def process_audio_folder(dossier: str, extensions: tuple[str, ...], music_info: dict) -> tuple[list[dict], dict]:
    """
    Parcourt un dossier audio, renvoie :
      - folder_musiques : liste de dicts pour chaque fichier audio trouvé
      - folder_new_info : dict { chemin: metadata } pour les nouveaux fichiers
    """
    folder_musiques: list[dict] = []
    folder_new_info: dict = {}

    for root, _, files in os.walk(dossier):
        for file in files:
            if not file.lower().endswith(extensions):
                continue

            path = os.path.join(root, file)
            if path in music_info:
                info = music_info[path]
            else:
                info = get_audio_metadata(path)
                folder_new_info[path] = info

            folder_musiques.append({
                'titre': info.get('titre', os.path.splitext(file)[0]),
                'artiste': info.get('artiste', ''),
                'album': info.get('album', ''),
                'duree': info.get('duree', 0),
                'chemin': path
            })

    return folder_musiques, folder_new_info


def get_audio_metadata(chemin_audio: str) -> dict:
    """
    Utilise Mutagen pour extraire :
      - titre (filename si absent)
      - artiste (Inconnu si absent)
      - album (Inconnu si absent)
      - durée (en secondes, 0 si erreur)
    En cas d'erreur, renvoie des valeurs par défaut.
    """
    try:
        audio = MutagenFile(chemin_audio, easy=True)
        titre = (
            audio.get('title', [os.path.splitext(os.path.basename(chemin_audio))[0]])[0]
            if audio else os.path.splitext(os.path.basename(chemin_audio))[0]
        )
        artiste = (
            normaliser_artiste(audio.get('artist', ['Inconnu'])[0])
            if audio and audio.get('artist') else 'Inconnu'
        )
        album = (
            normaliser_album(audio.get('album', ['Inconnu'])[0])
            if audio and audio.get('album') else 'Inconnu'
        )
        duree = int(audio.info.length) if audio and hasattr(audio.info, 'length') else 0
        return {
            'titre': titre,
            'artiste': artiste,
            'album': album,
            'duree': duree
        }

    except Exception as e:
        logging.error(f"Exception extraction métadonnées audio pour {chemin_audio}: {e}")
        return {
            'titre': os.path.splitext(os.path.basename(chemin_audio))[0],
            'artiste': 'Inconnu',
            'album': 'Inconnu',
            'duree': 0
        }
