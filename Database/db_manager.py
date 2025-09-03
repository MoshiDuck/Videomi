import sqlite3
import threading
from typing import Dict, Any

from Core.settings import DB_LOCAL_PATH

class DatabaseManager:
    def __init__(self):

        self.db_path = DB_LOCAL_PATH
        self.lock = threading.Lock()
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._init_db()

    def _init_db(self) -> None:
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category TEXT NOT NULL,
                    title TEXT NOT NULL,
                    file_link TEXT,
                    thumbnail_url TEXT,
                    thumbnail_path TEXT,
                    metadata_json TEXT,
                    tmdb_metadata TEXT,
                    music_metadata TEXT,
                    entry_hash TEXT,
                    file_extension TEXT,
                    local_path TEXT
                )
            """)
            # Essayons d'ajouter les colonnes si elles n'existent pas
            for column in ["file_extension", "local_path", "tmdb_metadata", "music_metadata"]:
                try:
                    cursor.execute(f"ALTER TABLE files ADD COLUMN {column} TEXT")
                except sqlite3.OperationalError:
                    pass  # La colonne existe déjà
            self.conn.commit()

    def fetch_all(self) -> Dict[tuple, Dict[str, Any]]:
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute(
                "SELECT category, title, file_link, thumbnail_url, thumbnail_path, metadata_json, tmdb_metadata, music_metadata, entry_hash, file_extension, local_path FROM files")
            rows = cursor.fetchall()
            return {
                (row[0], row[1]): {
                    "file_link": row[2],
                    "thumbnail_url": row[3],
                    "thumbnail_path": row[4],
                    "metadata_json": row[5],
                    "tmdb_metadata": row[6],
                    "music_metadata": row[7],
                    "entry_hash": row[8],
                    "file_extension": row[9],
                    "local_path": row[10]
                }
                for row in rows
            }

    def insert_file(
            self,
            category: str,
            title: str,
            file_link: str,
            thumb_url: str,
            thumb_path: str,
            metadata_json: str,
            tmdb_metadata: str,
            music_metadata: str,
            entry_hash: str,
            file_extension: str,
            local_path: str = None
    ) -> None:
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute("""
                INSERT INTO files (category, title, file_link, thumbnail_url, thumbnail_path, metadata_json, tmdb_metadata, music_metadata, entry_hash, file_extension, local_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (category, title, file_link, thumb_url, thumb_path, metadata_json, tmdb_metadata, music_metadata, entry_hash, file_extension, local_path))
            self.conn.commit()

    def update_file(
            self,
            category: str,
            title: str,
            file_link: str,
            thumb_url: str,
            thumb_path: str,
            metadata_json: str,
            tmdb_metadata: str,
            music_metadata: str,
            entry_hash: str,
            file_extension: str,
            local_path: str = None
    ) -> None:
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute("""
                UPDATE files
                SET file_link=?, thumbnail_url=?, thumbnail_path=?, metadata_json=?, tmdb_metadata=?, music_metadata=?, entry_hash=?, file_extension=?, local_path=?
                WHERE category=? AND title=?
            """, (file_link, thumb_url, thumb_path, metadata_json, tmdb_metadata, music_metadata, entry_hash, file_extension, local_path, category, title))
            self.conn.commit()

    def update_local_path(self, category: str, title: str, local_path: str):
        """Met à jour uniquement le chemin local"""
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute("""
                UPDATE files SET local_path=? WHERE category=? AND title=?
            """, (local_path, category, title))
            self.conn.commit()

    def delete_file(self, category: str, title: str) -> None:
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute("DELETE FROM files WHERE category=? AND title=?", (category, title))
            self.conn.commit()

    def close(self) -> None:
        with self.lock:
            self.conn.close()