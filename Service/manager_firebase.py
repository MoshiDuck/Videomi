from PyQt6.QtCore import QThread
from firebase_admin import db

class ManagerFirebase(QThread):
    def __init__(self, auth, cat, parent_catalogue):
        super().__init__()
        self.auth = auth
        self.cat = cat
        self.parent_catalogue = parent_catalogue
        self.items = {}
        self.error = None

    def run(self):
        try:
            user_uid = self.auth.get_uid()
            if not user_uid:
                self.error = "Aucun user_uid récupéré"
                return

            ref = db.reference(f'users/{user_uid}/{self.cat}')
            data = ref.get() or {}

            for title, info in data.items():
                metadata = info.get("metadata", {})

                try:
                    duration = float(
                        metadata.get("duration")
                        or metadata.get("ffprobe", {}).get("format", {}).get("duration")
                        or 0
                    )
                except (TypeError, ValueError):
                    duration = None

                ffprobe_meta = metadata.get("ffprobe", {})

                self.items[title] = {
                    "thumbnail": info.get("thumbnail_link"),
                    "duration": duration,
                    "ffprobe": ffprobe_meta,
                }

        except Exception as e:
            self.error = str(e)
