import os
from PySide6.QtCore import QThread, Signal

from config.config import FOLDER_DB_PATH
from database.folder_database import FolderDatabase

class Indexer(QThread):
    new = Signal(dict)
    finished_indexing = Signal()

    def __init__(self, db, extensions: tuple, name_folder: str, process_func, parent=None):
        super().__init__(parent)
        self.db = db
        self.display_func = db.get_all_for_display
        self.extensions = extensions
        self.name_folder = name_folder
        self.process_func = process_func

    def run(self):


        emitted = set()
        display_entries = self.display_func()

        for entry in display_entries:
            self.new.emit(entry)
            emitted.add(entry['path'])
        folder_db = FolderDatabase(db_path=FOLDER_DB_PATH)
        for folder in folder_db.get_all_folders():
            for root, _, files in os.walk(folder):
                for f in files:
                    if f.lower().endswith(self.extensions):
                        p = os.path.join(root, f)
                        name, _ = os.path.splitext(f)
                        thumb_path = os.path.join(
                            os.path.dirname(__file__),
                            "data", "miniature", self.name_folder, f"{name}.jpg"
                        )
                        needs_thumbnail = not os.path.exists(thumb_path)
                        needs_indexing = p not in emitted

                        if needs_indexing or needs_thumbnail:
                            try:
                                self.process_func(p, self.db)

                                # Rafraîchir dynamiquement après indexation
                                display_entries = self.display_func()
                                updated_entry = next(e for e in display_entries if e['path'] == p)

                                if p not in emitted:
                                    self.new.emit(updated_entry)
                                    emitted.add(p)
                            except Exception as e:
                                print(f"Erreur indexation {self.name_folder} {p}: {e}")

        folder_db.close()
        self.finished_indexing.emit()
