import hashlib
import json
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Optional, Any

import pythoncom
import requests
from PIL import Image, ImageDraw, ImageFont
from PyQt6.QtCore import QObject, pyqtSignal, QTimer
from pyOneFichierClient.OneFichierAPI import FichierClient
from requests.adapters import HTTPAdapter
from urllib3 import Retry

from Pages.Auth.firebase_auth import FirebaseAuth
from Database.db_manager import DatabaseManager


CACHE_DIR = os.path.join(os.getcwd(), "Cache", "Images")
MAX_CACHE_SIZE_MB = 100

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s][%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def purge_cache(cache_dir: str, max_size_mb: int = MAX_CACHE_SIZE_MB):
    if not os.path.isdir(cache_dir):
        return
    files = [
        (f, os.path.getmtime(os.path.join(cache_dir, f)), os.path.getsize(os.path.join(cache_dir, f)))
        for f in os.listdir(cache_dir)
    ]
    total_size = sum(f[2] for f in files) / (1024 * 1024)
    if total_size <= max_size_mb:
        return
    files.sort(key=lambda x: x[1])
    while total_size > max_size_mb and files:
        fname, mtime, size = files.pop(0)
        try:
            os.remove(os.path.join(cache_dir, fname))
            total_size -= size / (1024 * 1024)
            logger.info(f"Cache purge: supprimé {fname}")
        except Exception as e:
            logger.warning(f"Impossible de supprimer {fname} du cache : {e}")

def parse_json_safe(js: Optional[str]) -> Dict[str, Any]:
    try:
        return json.loads(js or "{}")
    except json.JSONDecodeError as e:
        logger.warning(f"Erreur parsing JSON: {e}")
        return {}

def json_equal(a: Any, b: Any) -> bool:
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)

def compute_entry_hash(file_link: str, thumb_link: str, metadata_json: str, tmdb_metadata: str, music_metadata: str) -> str:
    h = hashlib.sha1()
    h.update((file_link or "").encode("utf-8"))
    h.update((thumb_link or "").encode("utf-8"))
    h.update((metadata_json or "").encode("utf-8"))
    h.update((tmdb_metadata or "").encode("utf-8"))
    h.update((music_metadata or "").encode("utf-8"))
    return h.hexdigest()

class SyncDatabase(QObject):
    finished_sync = pyqtSignal()
    progress_update = pyqtSignal(str)

    def __init__(self, firebase_auth: FirebaseAuth, db_manager: DatabaseManager, client: FichierClient):
        super().__init__()
        self.auth = firebase_auth
        self.db_manager = db_manager
        self.session = requests.Session()
        self.client: FichierClient = client
        adapter = HTTPAdapter(pool_connections=20, pool_maxsize=20)
        self.session.mount("https://", adapter)
        os.makedirs(CACHE_DIR, exist_ok=True)
        self._thread: threading.Thread | None = None
        self.session = self.create_session_with_retries(total_retries=3, backoff_factor=1)

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        pythoncom.CoInitializeEx(pythoncom.COINIT_MULTITHREADED)
        logger.info("Démarrage de la synchronisation…")
        local_db = DatabaseManager()

        uid = self.auth.get_uid()
        token = self.auth.obtenir_token()
        if not uid or not token:
            logger.warning("UID ou token manquant, arrêt de la synchronisation.")
            local_db.close()
            QTimer.singleShot(0, self._emit_finished)
            return

        try:
            db = self.auth.firebase.database()
            root = db.child("users").child(uid).get(token).val() or {}
        except Exception as e:
            logger.error(f"Erreur récupération données Firebase : {e}")
            local_db.close()
            QTimer.singleShot(0, self._emit_finished)
            return

        local_data = local_db.fetch_all()
        thumbnails_to_dl: Dict[tuple, str] = {}

        # Vérification des miniatures mises à jour
        for category, titles in root.items():
            if not isinstance(titles, dict):
                continue
            for title, entry in titles.items():
                if not isinstance(entry, dict):
                    continue
                thumb_link = entry.get("thumbnail_link", "")
                key = (category, title)

                # Si la miniature a changé ou si elle n'existe pas, on doit la télécharger à nouveau
                if thumb_link and (key not in local_data or local_data[key]["thumbnail_url"] != thumb_link):
                    thumbnails_to_dl[key] = thumb_link

        # Télécharger les miniatures mises à jour
        local_thumbnails = self._download_thumbnails_async(thumbnails_to_dl)
        purge_cache(CACHE_DIR)

        updated = 0
        inserted = 0

        # Mise à jour de la base de données locale
        for category, titles in root.items():
            if not isinstance(titles, dict):
                continue
            for title, entry in titles.items():
                if not isinstance(entry, dict):
                    continue

                file_link = entry.get("file_link", "")
                thumb_link = entry.get("thumbnail_link", "")
                file_extension = entry.get("file_extension", "")
                local_path = entry.get("local_path", "")

                metadata = entry.get("metadata", {})
                metadata_json = json.dumps(metadata, ensure_ascii=False)
                tmdb_metadata = entry.get("tmdb_metadata", "{}")
                music_metadata = entry.get("music_metadata", "{}")
                local_thumb_path = local_thumbnails.get((category, title), "")
                entry_hash = compute_entry_hash(file_link, thumb_link, metadata_json, tmdb_metadata, music_metadata)
                key = (category, title)
                local_entry = local_data.get(key)

                if local_entry:
                    local_hash = local_entry.get("entry_hash", "")
                    if local_hash != entry_hash:
                        logger.info(f"[SYNC] Mise à jour locale pour {category} → {title}")
                        local_db.update_file(category, title, file_link, thumb_link, local_thumb_path, metadata_json,
                                             tmdb_metadata, music_metadata, entry_hash, file_extension, local_path)
                        updated += 1
                    else:
                        logger.debug(f"[SKIP] Aucun changement détecté pour {category} → {title}")
                else:
                    logger.info(f"[SYNC] Nouvelle entrée ajoutée : {category} → {title}")
                    local_db.insert_file(category, title, file_link, thumb_link, local_thumb_path, metadata_json,
                                         tmdb_metadata, music_metadata, entry_hash, file_extension, local_path)
                    inserted += 1

        # Suppression des fichiers supprimés de la base de données locale
        firebase_keys = {(cat, tit) for cat, ts in root.items() if isinstance(ts, dict) for tit in ts.keys()}
        local_keys = set(local_data.keys())
        to_delete = local_keys - firebase_keys
        for category, title in to_delete:
            logger.info(f"Suppression locale : {category} → {title}")
            local_db.delete_file(category, title)

        logger.info(f"Mise à jour terminée : {updated} modifiés, {inserted} insérés.")
        logger.info("Synchronisation terminée.")
        self.session.close()
        local_db.close()
        QTimer.singleShot(0, self._emit_finished)

    def _download_thumbnail(self, url: str) -> str:
        if not url:
            return ""
        fname = hashlib.md5(url.encode("utf-8")).hexdigest() + ".jpg"
        local_path = os.path.join(CACHE_DIR, fname)
        if os.path.exists(local_path):
            return local_path
        ok = self.client.download_file(url, local_path, inline=False, cdn=True, restrict_ip=True)
        if ok:
            logger.info(f"Miniature téléchargée via 1fichier : {local_path}")
            return local_path
        logger.warning(f"Échec téléchargement miniature pour {url} → génération d’un placeholder")
        try:
            size = (200, 200)
            img = Image.new("RGB", size, color=(0, 0, 0))
            draw = ImageDraw.Draw(img)
            font = ImageFont.load_default()
            text = "Pas d’aperçu"
            w, h = draw.textsize(text, font=font)
            position = ((size[0] - w) // 2, (size[1] - h) // 2)
            draw.text(position, text, fill=(255, 255, 255), font=font)
            img.save(local_path, format="JPEG")
            return local_path
        except Exception as e:
            logger.error(f"Impossible de générer le placeholder d’image : {e}")
            return ""

    @staticmethod
    def create_session_with_retries(total_retries=3, backoff_factor=0.5):
        session = requests.Session()
        retries = Retry(total=total_retries, backoff_factor=backoff_factor, status_forcelist=[500, 502, 503, 504], allowed_methods=["GET"], raise_on_status=False)
        adapter = HTTPAdapter(max_retries=retries, pool_connections=20, pool_maxsize=20)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    def _download_thumbnails_async(self, url_list: Dict[tuple, str]) -> Dict[tuple, str]:
        results = {}
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(self._download_thumbnail, url): key for key, url in url_list.items()}
            for future in as_completed(futures):
                key = futures[future]
                try:
                    results[key] = future.result()
                except Exception as e:
                    logger.error(f"Erreur téléchargement asynchrone pour {key}: {e}")
                    results[key] = ""
        return results

    def _emit_finished(self):
        self.finished_sync.emit()