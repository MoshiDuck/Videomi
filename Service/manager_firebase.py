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
                # 1) Récupère tout le sous‑nœud metadata
                metadata = info.get("metadata", {})

                # 2) Calcul de la durée (déjà en place)
                duration = None
                try:
                    duration = float(
                        metadata.get("duration")
                        or metadata.get("ffprobe", {}).get("format", {}).get("duration")
                        or 0
                    )
                except (TypeError, ValueError):
                    duration = None

                # 3) Extrait le nœud ffprobe complet
                ffprobe_meta = metadata.get("ffprobe", {})

                # 4) Construit l’info finale en incluant ffprobe
                self.items[title] = {
                    "thumbnail": info.get("thumbnail_link"),
                    "duration": duration,
                    "ffprobe": ffprobe_meta,
                }

        except Exception as e:
            self.error = str(e)
