import os
import subprocess
import threading

from config.config import FOLDER_DB_PATH, VIDEO_EXTENSIONS, THUMBNAIL_VIDEO_DIR, FFMPEG_PATH
from database.folder_database import FolderDatabase
from database import metadata_utils

os.makedirs(THUMBNAIL_VIDEO_DIR, exist_ok=True)
folder_db = FolderDatabase(db_path=FOLDER_DB_PATH)

class MiniatureVideoDataBase:
    def __init__(self, video_db):
        self.video_db = video_db

    def start_indexing(self):
        threading.Thread(target=self._index_thumbnails, daemon=True).start()

    def _index_thumbnails(self):
        self.generate_thumbnails_from_folders()

    def generate_thumbnails_from_folders(self):
        existing = self.video_db.get_all_video_paths()
        print(f"[INFO] Vidéos déjà indexées en base : {len(existing)}")

        for folder in folder_db.get_all_folders():
            for root, _, files in os.walk(folder):
                for f in files:
                    if f.lower().endswith(VIDEO_EXTENSIONS):
                        path = os.path.join(root, f)
                        name, _ = os.path.splitext(f)
                        thumb_path = os.path.join(THUMBNAIL_VIDEO_DIR, f"{name}.jpg")

                        cond = (path not in existing or not os.path.exists(thumb_path))
                        if cond:
                            metadata_utils.process_video(path, self.video_db)

    @staticmethod
    def generate_thumbnail(video_path):
        name, _ = os.path.splitext(os.path.basename(video_path))
        output_path = os.path.join(THUMBNAIL_VIDEO_DIR, f"{name}.jpg")
        if os.path.exists(output_path):
            return

        try:
            meta = metadata_utils.get_metadata(video_path)
            duration = float(meta.get('format', {}).get('duration', 0))
            timestamp = duration * 0.15
            ts_str = f"{int(timestamp // 3600):02d}:{int((timestamp % 3600) // 60):02d}:{int(timestamp % 60):02d}"

            cmd = [
                FFMPEG_PATH,
                "-ss", ts_str,
                "-i", video_path,
                "-frames:v", "1",
                "-q:v", "2",
                "-y",
                output_path
            ]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"[Miniature] Générée à {ts_str} -> {output_path}")
        except Exception as e:
            print(f"[Erreur] Échec génération miniature {video_path} : {e}")
