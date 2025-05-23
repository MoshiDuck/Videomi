import os
import sqlite3

class FolderDatabase:
    def __init__(self, db_path=None):
        self.db_path = db_path or self._default_path()
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self._create_table()

    @staticmethod
    def _default_path():
        base_dir = os.path.join(os.path.dirname(__file__), "data")
        return os.path.join(base_dir, "folders.db")

    def _create_table(self):
        with self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS folders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    path TEXT UNIQUE NOT NULL
                )
            """)

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

    def close(self):
        if self.conn:
            self.conn.close()
