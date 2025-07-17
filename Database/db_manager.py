import os
import sqlite3
import threading
from typing import Dict, Any

DB_PATH = "local_data.db"

class DatabaseManager:
    def __init__(self):
        db_dir = os.path.join(os.getcwd(), "Cache")
        os.makedirs(db_dir, exist_ok=True)
        db_path = os.path.join(db_dir, "local_data.db")
        self.db_path = db_path
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
                    entry_hash TEXT
                )
            """)
            try:
                cursor.execute("ALTER TABLE files ADD COLUMN entry_hash TEXT")
            except sqlite3.OperationalError:
                pass  # La colonne existe déjà
            self.conn.commit()

    def fetch_all(self) -> Dict[tuple, Dict[str, Any]]:
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute(
                "SELECT category, title, file_link, thumbnail_url, thumbnail_path, metadata_json, entry_hash FROM files")
            rows = cursor.fetchall()
            return {
                (row[0], row[1]): {
                    "file_link": row[2],
                    "thumbnail_url": row[3],
                    "thumbnail_path": row[4],
                    "metadata_json": row[5],
                    "entry_hash": row[6],
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
            entry_hash: str
    ) -> None:
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute("""
                INSERT INTO files (category, title, file_link, thumbnail_url, thumbnail_path, metadata_json, entry_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (category, title, file_link, thumb_url, thumb_path, metadata_json, entry_hash))
            self.conn.commit()

    def update_file(
            self,
            category: str,
            title: str,
            file_link: str,
            thumb_url: str,
            thumb_path: str,
            metadata_json: str,
            entry_hash: str
    ) -> None:
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute("""
                UPDATE files
                SET file_link=?, thumbnail_url=?, thumbnail_path=?, metadata_json=?, entry_hash=?
                WHERE category=? AND title=?
            """, (file_link, thumb_url, thumb_path, metadata_json, entry_hash, category, title))
            self.conn.commit()

    def delete_file(self, category: str, title: str) -> None:
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute("DELETE FROM files WHERE category=? AND title=?", (category, title))
            self.conn.commit()

    def close(self) -> None:
        with self.lock:
            self.conn.close()