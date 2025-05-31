import os
import sqlite3
import json
from PyQt6 import QtCore
from config.config import VIDEO_EXTENSIONS, FFMPEG_PATH, FOLDER_DB_PATH


class GestionnaireConfiguration(QtCore.QObject):

    def __init__(self):
        super().__init__()
        self.conn = sqlite3.connect(FOLDER_DB_PATH)
        self._create_tables()
        self._load_defaults()

    def _create_tables(self):
        with self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS folders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    path TEXT UNIQUE NOT NULL
                )
            """)

    def _load_defaults(self):
        # Charger les paramètres en mémoire ou insérer les valeurs par défaut
        self.extensions = self._get_config('extensions')
        if self.extensions is None:
            self.extensions = VIDEO_EXTENSIONS
            self._set_config('extensions', self.extensions)

        self.ffmpeg_path = self._get_config('ffmpeg_path')
        if self.ffmpeg_path is None:
            self.ffmpeg_path = FFMPEG_PATH
            self._set_config('ffmpeg_path', self.ffmpeg_path)

        self.favoris = self._get_config('favoris') or []

    def _get_config(self, key):
        cursor = self.conn.execute("SELECT value FROM config WHERE key = ?", (key,))
        row = cursor.fetchone()
        if row:
            try:
                return json.loads(row[0])
            except json.JSONDecodeError:
                return None
        return None

    def _set_config(self, key, value):
        val_json = json.dumps(value)
        with self.conn:
            self.conn.execute("""
                INSERT INTO config (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value
            """, (key, val_json))

    # Méthodes pour gérer les dossiers vidéos
    def add_folder(self, folder_path):
        try:
            with self.conn:
                self.conn.execute("INSERT INTO folders (path) VALUES (?)", (folder_path,))
            return True
        except sqlite3.IntegrityError:
            return False

    def delete_folder(self, folder_path):
        with self.conn:
            cursor = self.conn.execute("DELETE FROM folders WHERE path = ?", (folder_path,))
        return cursor.rowcount > 0

    def get_all_folders(self):
        cursor = self.conn.execute("SELECT path FROM folders ORDER BY id")
        return [row[0] for row in cursor.fetchall()]

    # Gestion favoris
    def get_favoris(self):
        return self.favoris

    def set_favoris(self, favoris_list):
        self.favoris = favoris_list
        self._set_config('favoris', favoris_list)

    def get_ffmpeg_path(self):
        return self.ffmpeg_path

    def set_ffmpeg_path(self, path):
        self.ffmpeg_path = path
        self._set_config('ffmpeg_path', path)

    def get_extensions(self):
        return self.extensions

    def set_extensions(self, extensions_list):
        self.extensions = extensions_list
        self._set_config('extensions', extensions_list)

    def close(self):
        if self.conn:
            self.conn.close()
