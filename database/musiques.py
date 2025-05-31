# Fonctions utilitaires pour scanner et extraire les métadonnées musicales
import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

from mutagen import File

from config.config import AUDIO_EXTENSIONS
from database.folder_database import FolderDatabase

logging.basicConfig(level=logging.DEBUG, format='[%(levelname)s] %(message)s')


def normaliser_artiste(artist):
    return artist.strip()


def normaliser_album(album):
    return album.strip()


def obtenir_musiques(music_info):
    from test_py.navigateur.cache import VideoCache as MusicCache
    cache = MusicCache()
    if cached := cache.object("musiques"):
        return cached, {}

    musiques = []
    new_info = {}
    extensions = AUDIO_EXTENSIONS
    folder = FolderDatabase()
    dossiers_audios = folder.get_all_folders()

    with ThreadPoolExecutor() as executor:
        futures = []
        for dossier in dossiers_audios:
            if os.path.exists(dossier):
                futures.append(executor.submit(process_audio_folder, dossier, extensions, music_info))
            else:
                logging.warning(f"Dossier inexistant : {dossier}")

        for future in as_completed(futures):
            folder_musiques, folder_new_info = future.result()
            musiques.extend(folder_musiques)
            new_info.update(folder_new_info)

    cache.insert("musiques", musiques, len(musiques) // 10)

    return musiques, new_info


def process_audio_folder(dossier, extensions, music_info):
    folder_musiques = []
    new_info = {}
    for root, _, files in os.walk(dossier):
        for file in files:
            if file.lower().endswith(extensions):
                path = os.path.join(root, file)
                if path in music_info:
                    info = music_info[path]
                else:
                    info = get_audio_metadata(path)
                    new_info[path] = info
                folder_musiques.append({
                    'titre': info.get('titre', os.path.splitext(file)[0]),
                    'artiste': info.get('artiste', ''),
                    'album': info.get('album', ''),
                    'duree': info.get('duree', 0),
                    'chemin': path
                })
    return folder_musiques, new_info


def get_audio_metadata(chemin_audio):
    try:
        audio = File(chemin_audio, easy=True)
        titre = audio.get('title', [os.path.splitext(os.path.basename(chemin_audio))[0]])[0]
        artiste = normaliser_artiste(audio.get('artist', ['Inconnu'])[0])
        album = normaliser_album(audio.get('album', ['Inconnu'])[0])
        duree = int(audio.info.length) if audio.info and hasattr(audio.info, 'length') else 0
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