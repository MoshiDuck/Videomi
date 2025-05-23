import os
import sqlite3

from config.config import THUMBNAIL_VIDEO_DIR
from fonction.def_format_duration import format_duration


os.makedirs(THUMBNAIL_VIDEO_DIR, exist_ok=True)

class VideoDataBase:
    def __init__(self, db_path=None):
        if db_path is None:
            data_dir = os.path.join(os.path.dirname(__file__), "data")
            os.makedirs(data_dir, exist_ok=True)
            db_path = os.path.join(data_dir, "videos.db")

        self.db_path = db_path
        self._create_tables_once()


    def _create_tables_once(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS videos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                title TEXT,
                duration REAL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audio_tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id INTEGER,
                language TEXT,
                codec TEXT,
                type TEXT,
                FOREIGN KEY(video_id) REFERENCES videos(id)
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS subtitle_tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id INTEGER,
                language TEXT,
                codec TEXT,
                type TEXT,
                FOREIGN KEY(video_id) REFERENCES videos(id)
            )
        """)
        conn.commit()
        conn.close()

    def _connect(self):
        return sqlite3.connect(self.db_path)

    def get_all_video_paths(self):
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT path FROM videos")
            return set(row[0] for row in cursor.fetchall())

    def remove_video_by_path(self, path):
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM videos WHERE path = ?", (path,))
            conn.commit()

    def insert_video(self, path, title, duration):
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR IGNORE INTO videos (path, title, duration) VALUES (?, ?, ?)",
                (path, title, duration)
            )
            conn.commit()
            return cursor.lastrowid

    def insert_audio(self, video_id, language, codec, track_type):
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO audio_tracks (video_id, language, codec, type) VALUES (?, ?, ?, ?)",
                (video_id, language, codec, track_type)
            )
            conn.commit()

    def insert_subtitle(self, video_id, language, codec, track_type):
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO subtitle_tracks (video_id, language, codec, type) VALUES (?, ?, ?, ?)",
                (video_id, language, codec, track_type)
            )
            conn.commit()

    def get_all_for_display(self):
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, title, duration, path FROM videos")
            rows = cursor.fetchall()

        result = []
        for id_, title, raw_duration, path in rows:


            name, _ = os.path.splitext(os.path.basename(path))
            thumbnail_path = os.path.join(
                os.path.dirname(__file__),
                "data", "miniature", "videos", f"{name}.jpg"
            )
            if not os.path.exists(thumbnail_path):
                thumbnail_path = None

            result.append({
                "id": id_,
                "title": title,
                "duration": format_duration(raw_duration),
                "thumbnail_path": thumbnail_path,
                "path": path
            })

        return result

