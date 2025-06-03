# -*- coding: utf-8 -*-
import os
import subprocess
import sqlite3
import logging
import json
from concurrent.futures import ProcessPoolExecutor, as_completed
from PyQt6 import QtCore

from config.config import SOUS_TITRES_DB_PATH, FFMPEG_PATH, FFPROBE_PATH, SRT_DIR, VIDEO_EXTENSIONS, EXTRACTABLE_CODECS
from database.folder_database import FolderDatabase

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(levelname)s - %(message)s")


class SousTitreManager:
    def __init__(self):
        self.db_path = SOUS_TITRES_DB_PATH
        self.conn = None
        self._connect()
        self._create_or_update_table()
        self.folder_db = FolderDatabase()
        self.cache = SousTitreCache(self.db_path)  # <-- Cache singleton instancié

    def _connect(self):
        try:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            self.conn = sqlite3.connect(self.db_path)
        except Exception as e:
            logger.error(f"Erreur connexion DB sous-titres (« {self.db_path} ») : {e}")

    def _create_or_update_table(self):
        try:
            with self.conn:
                self.conn.execute("""
                    CREATE TABLE IF NOT EXISTS subtitles (
                        video_path TEXT PRIMARY KEY,
                        index_sub INTEGER,
                        language TEXT,
                        codec TEXT,
                        srt_path TEXT,
                        sup_path TEXT
                    )
                """)
        except Exception as e:
            logger.error(f"Erreur création ou mise à jour table subtitles : {e}")

    def get_subtitle_streams(self, video_path: str) -> list[dict]:
        cmd = [
            FFPROBE_PATH, "-v", "error",
            "-show_entries", "stream=index,codec_type,codec_name:stream_tags=language",
            "-select_streams", "s", "-of", "json", video_path
        ]
        try:
            output = subprocess.check_output(cmd, text=True)
            data = json.loads(output)
            streams = [
                {
                    "index": s["index"],
                    "codec": s.get("codec_name"),
                    "language": s.get("tags", {}).get("language", "inconnu")
                }
                for s in data.get("streams", [])
                if s.get("codec_type") == "subtitle"
            ]
            if not streams:
                raise ValueError(f"Aucun sous-titre trouvé pour {video_path}")
            return streams
        except subprocess.CalledProcessError as e:
            logger.error(f"ffprobe erreur sur « {video_path} » : {e}")
            raise

    def save_subtitle(self, video_path: str, index_sub: int, language: str, codec: str, srt_path: str = None, sup_path: str = None):
        try:
            with self.conn:
                self.conn.execute("""
                    INSERT OR REPLACE INTO subtitles (video_path, index_sub, language, codec, srt_path, sup_path)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (video_path, index_sub, language, codec, srt_path, sup_path))
            logger.info(f"[DB] Enregistré : {video_path} (flux {index_sub}, {language}, {codec}) srt:{srt_path} sup:{sup_path}")

            # MAJ cache aussi
            self.cache.insert(video_path, index_sub, language, codec, srt_path, sup_path)
        except Exception as e:
            logger.error(f"Erreur sauvegarde sous-titres pour « {video_path} » : {e}")

    def _subtitle_exists_in_db(self, video_path: str) -> bool:
        # Utiliser le cache pour vérifier d'abord
        if self.cache.exists(video_path):
            return True
        # Sinon fallback base (en cas d'info manquante dans cache)
        try:
            cursor = self.conn.execute("SELECT srt_path, sup_path FROM subtitles WHERE video_path = ?", (video_path,))
            row = cursor.fetchone()
            if row and (row[0] or row[1]):
                # Mise en cache si trouvé en base
                self.cache.insert(video_path, None, None, None, row[0], row[1])
                return True
            return False
        except Exception as e:
            logger.error(f"Erreur vérification sous-titres (« {video_path} ») : {e}")
            return False

    def extract_subtitles_from_videos(self, max_workers: int = None):
        videos_to_process = []
        for folder in self.folder_db.get_all_folders():
            logger.info(f"[SCAN] Parcours dossier : {folder}")
            for root, _, files in os.walk(folder):
                for f in files:
                    if os.path.splitext(f)[1].lower() in VIDEO_EXTENSIONS:
                        video_path = os.path.join(root, f)
                        if not self._subtitle_exists_in_db(video_path):
                            videos_to_process.append(video_path)
                        else:
                            logger.debug(f"[SKIP] Sous-titres déjà présents : {video_path}")

        max_workers = max_workers or os.cpu_count() or 1
        logger.info(f"Extraction sous-titres en parallèle sur {max_workers} workers")

        results = []
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(self._extract_subtitle_worker, vp): vp for vp in videos_to_process}
            for future in as_completed(futures):
                video_path = futures[future]
                try:
                    res = future.result()
                    if res:
                        results.append(res)
                except Exception as e:
                    logger.error(f"Erreur extraction pour « {video_path} » : {e}")

        for res in results:
            self.save_subtitle(**res)

    @staticmethod
    def _extract_subtitle_worker(video_path: str):
        try:
            cmd = [
                FFPROBE_PATH, '-v', 'error',
                '-show_entries', 'stream=index,codec_type,codec_name:stream_tags=language',
                '-select_streams', 's',
                '-of', 'json', video_path
            ]
            output = subprocess.check_output(cmd, text=True)
            data = json.loads(output)
            streams = data.get("streams", [])

            video_title = os.path.splitext(os.path.basename(video_path))[0]

            for s in streams:
                if s.get("codec_type") != "subtitle":
                    continue

                codec = s.get("codec_name", "").lower()
                index_sub = s.get("index")
                language = (s.get("tags") or {}).get("language", "und").lower()
                subtitle_folder = os.path.join(SRT_DIR, video_title, language)
                os.makedirs(subtitle_folder, exist_ok=True)

                if codec in EXTRACTABLE_CODECS:
                    srt_path = os.path.join(subtitle_folder, f"{video_title}.srt")
                    if SousTitreManager._extract_srt(video_path, index_sub, srt_path):
                        return dict(video_path=video_path, index_sub=index_sub, language=language,
                                    codec=codec, srt_path=srt_path, sup_path=None)
                elif codec == "hdmv_pgs_subtitle":
                    sup_path = os.path.join(subtitle_folder, f"{video_title}.sup")
                    if SousTitreManager._extract_sup(video_path, index_sub, sup_path):
                        return dict(video_path=video_path, index_sub=index_sub, language=language,
                                    codec=codec, srt_path=None, sup_path=sup_path)
            return None
        except Exception as e:
            logger.error(f"Erreur extraction sous-titres worker pour « {video_path} » : {e}")
            return None

    def extract_subtitle_for_file(self, video_path: str):
        if self._subtitle_exists_in_db(video_path):
            logger.info(f"[SKIP] Sous-titres déjà présents pour : {video_path}")
            return

        logger.info(f"[START] Extraction sous-titres pour : {video_path}")
        result = self._extract_subtitle_worker(video_path)
        if result:
            self.save_subtitle(**result)
            logger.info(f"[DONE] Sous-titres extraits pour : {video_path}")
        else:
            logger.warning(f"[NO SUB] Aucun sous-titre extrait pour : {video_path}")

    @staticmethod
    def _extract_srt(video_path: str, stream_index: int, out_path: str) -> bool:
        cmd = [FFMPEG_PATH, "-y", "-i", video_path, "-map", f"0:{stream_index}", "-c:s", "srt", out_path]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"Erreur extraction SRT (flux {stream_index}) : {e}")
            return False

    @staticmethod
    def _extract_sup(video_path: str, stream_index: int, out_path: str) -> bool:
        cmd = [FFMPEG_PATH, "-y", "-i", video_path, "-map", f"0:{stream_index}", "-c:s", "copy", out_path]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"Erreur extraction SUP (flux {stream_index}) : {e}")
            return False

    def clear_cache(self):
        self.cache.clear()

    def close(self):
        if self.conn:
            self.conn.close()
        self.folder_db.close()
        if self.cache:
            self.cache.close()


# --- Classe SousTitreCache intégrée ici (idem code fourni précédemment) ---

class SousTitreCache:
    _instance = None

    def __new__(cls, db_path=None):
        if not cls._instance:
            cls._instance = super().__new__(cls)
            cls._cache = {}
            cls._max_size = 1024 * 1024 * 100  # 100MB max
            cls._current_size = 0
            cls._lock = QtCore.QMutex()
            cls._db_path = db_path or "sous_titres.db"
            cls._conn = None
            cls._connect_db()
            cls._create_table()
            cls._load_cache_from_db()
        return cls._instance

    @classmethod
    def _connect_db(cls):
        if cls._conn is None:
            cls._conn = sqlite3.connect(cls._db_path, check_same_thread=False)
            cls._conn.execute("PRAGMA foreign_keys = ON")

    @classmethod
    def _create_table(cls):
        cls._conn.execute("""
            CREATE TABLE IF NOT EXISTS subtitles (
                video_path TEXT PRIMARY KEY,
                index_sub INTEGER,
                language TEXT,
                codec TEXT,
                srt_path TEXT,
                sup_path TEXT
            )
        """)
        cls._conn.commit()

    @classmethod
    def _load_cache_from_db(cls):
        cursor = cls._conn.execute("SELECT video_path, index_sub, language, codec, srt_path, sup_path FROM subtitles")
        with QtCore.QMutexLocker(cls._lock):
            for row in cursor:
                video_path = row[0]
                data = {
                    "index_sub": row[1],
                    "language": row[2],
                    "codec": row[3],
                    "srt_path": row[4],
                    "sup_path": row[5],
                }
                size = cls._estimate_size(data)
                if cls._current_size + size <= cls._max_size:
                    cls._cache[video_path] = data
                    cls._current_size += size
                else:
                    break

    @classmethod
    def _estimate_size(cls, data):
        size = 0
        for k, v in data.items():
            if isinstance(v, str) and v:
                size += len(v.encode("utf-8"))
            else:
                size += 50
        return size

    def exists(self, video_path: str) -> bool:
        locker = QtCore.QMutexLocker(self._lock)
        if video_path in self._cache:
            data = self._cache[video_path]
            return bool(data.get("srt_path") or data.get("sup_path"))
        else:
            cursor = self._conn.execute("SELECT srt_path, sup_path FROM subtitles WHERE video_path = ?", (video_path,))
            row = cursor.fetchone()
            if row:
                data = {
                    "index_sub": None,
                    "language": None,
                    "codec": None,
                    "srt_path": row[0],
                    "sup_path": row[1],
                }
                size = self._estimate_size(data)
                if self._current_size + size <= self._max_size:
                    self._cache[video_path] = data
                    self._current_size += size
                return bool(row[0] or row[1])
            return False

    def insert(self, video_path: str, index_sub: int, language: str, codec: str, srt_path: str = None, sup_path: str = None):
        locker = QtCore.QMutexLocker(self._lock)
        data = {
            "index_sub": index_sub,
            "language": language,
            "codec": codec,
            "srt_path": srt_path,
            "sup_path": sup_path,
        }
        size = self._estimate_size(data)
        if size > self._max_size:
            return False

        while self._current_size + size > self._max_size and self._cache:
            oldest_key = next(iter(self._cache))
            old_size = self._estimate_size(self._cache[oldest_key])
            self._cache.pop(oldest_key)
            self._current_size -= old_size

        self._cache[video_path] = data
        self._current_size += size

        try:
            with self._conn:
                self._conn.execute("""
                    INSERT OR REPLACE INTO subtitles (video_path, index_sub, language, codec, srt_path, sup_path)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (video_path, index_sub, language, codec, srt_path, sup_path))
        except Exception as e:
            logger.error(f"[Erreur DB] {e}")
            return False
        return True

    def get(self, video_path: str):
        locker = QtCore.QMutexLocker(self._lock)
        return self._cache.get(video_path)

    def clear(self):
        locker = QtCore.QMutexLocker(self._lock)
        self._cache.clear()
        self._current_size = 0
        try:
            with self._conn:
                self._conn.execute("DELETE FROM subtitles")
        except Exception as e:
            logger.error(f"[Erreur DB] {e}")

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None
