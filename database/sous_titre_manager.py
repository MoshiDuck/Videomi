# -*- coding: utf-8 -*-
import os
import subprocess
import sqlite3
import logging
import json
from concurrent.futures import ProcessPoolExecutor, as_completed
from cache.cache import SousTitreCache
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
        self.cache = SousTitreCache(SOUS_TITRES_DB_PATH)

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

    @staticmethod
    def get_subtitle_streams(video_path: str) -> list[dict]:
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
        if self.cache.exists(video_path):
            return True
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
            for root, _, files in os.walk(folder):
                for f in files:
                    if os.path.splitext(f)[1].lower() in VIDEO_EXTENSIONS:
                        video_path = os.path.join(root, f)
                        if not self._subtitle_exists_in_db(video_path):
                            videos_to_process.append(video_path)

        max_workers = max_workers or os.cpu_count() or 1
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

    def extract_subtitle_from_video(self, video_path: str):
        if os.path.splitext(video_path)[1].lower() not in VIDEO_EXTENSIONS:
            logger.warning(f"Fichier ignoré (extension non supportée) : {video_path}")
            return

        if self._subtitle_exists_in_db(video_path):
            logger.info(f"Les sous-titres existent déjà pour : {video_path}")
            return

        try:
            results = self._extract_subtitle_worker(video_path)
            if not results:
                logger.info(f"Aucun sous-titre extrait pour : {video_path}")
                return

            if isinstance(results, dict):
                # Un seul sous-titre
                self.save_subtitle(**results)
            elif isinstance(results, list):
                # Plusieurs sous-titres
                for res in results:
                    self.save_subtitle(**res)
            else:
                logger.error(f"Format inattendu de la sortie pour : {video_path} — {type(results)}")

        except Exception as e:
            logger.error(f"Erreur lors de l'extraction des sous-titres pour « {video_path} » : {e}")

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
            results = []

            for s in streams:
                if s.get("codec_type") != "subtitle":
                    continue

                codec = s.get("codec_name", "").lower()
                index_sub = s.get("index")
                language = (s.get("tags") or {}).get("language", "und").lower()
                subtitle_folder = os.path.join(SRT_DIR, video_title, language)
                os.makedirs(subtitle_folder, exist_ok=True)

                if codec in EXTRACTABLE_CODECS:
                    srt_path = os.path.join(subtitle_folder, f"{video_title}_{index_sub}.srt")
                    if SousTitreManager._extract_srt(video_path, index_sub, srt_path):
                        results.append(dict(
                            video_path=video_path,
                            index_sub=index_sub,
                            language=language,
                            codec=codec,
                            srt_path=srt_path,
                            sup_path=None
                        ))
                elif codec == "hdmv_pgs_subtitle":
                    sup_path = os.path.join(subtitle_folder, f"{video_title}_{index_sub}.sup")
                    if SousTitreManager._extract_sup(video_path, index_sub, sup_path):
                        results.append(dict(
                            video_path=video_path,
                            index_sub=index_sub,
                            language=language,
                            codec=codec,
                            srt_path=None,
                            sup_path=sup_path
                        ))

            return results if results else None

        except Exception as e:
            logger.error(f"Erreur extraction sous-titres worker pour « {video_path} » : {e}")
            return None

    def extract_all_srts(self, video_path, output_dir):
        streams = self.get_subtitle_streams(video_path)
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        extracted = []
        for s in streams:
            index = s["index"]
            codec = s["codec"]
            lang = s.get("language", "und")
            filename = f"subtitle_{index}_{lang}.srt"
            output_path = os.path.join(output_dir, filename)

            if codec in EXTRACTABLE_CODECS:
                success = self._extract_srt(video_path, index, output_path)
                if success:
                    extracted.append(output_path)
        return extracted

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
