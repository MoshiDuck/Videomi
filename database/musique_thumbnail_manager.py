import os
import re
import sqlite3
from collections import deque

from PyQt6 import QtCore, QtGui
from mutagen import File as MutagenFile

from config.config import THUMBNAIL_MUSIC_DIR, MUSIQUES_DB_PATH
from test_py.navigateur.cache import ThumbnailCache

class MusiqueThumbnailManager(QtCore.QObject):
    thumbnail_ready = QtCore.pyqtSignal(str, QtGui.QPixmap)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.audio_db = MUSIQUES_DB_PATH
        self.thumbnail_dir = THUMBNAIL_MUSIC_DIR
        os.makedirs(self.thumbnail_dir, exist_ok=True)

        self.cache = ThumbnailCache()
        self._sanitized_cache = {}

        # Table SQLite pour garder la liste des pochettes déjà traitées
        self.progress_file = self.audio_db
        self.progress = self._load_progress()
        # Format en mémoire : { "titre_nettoye": {"done": bool} }

        # File pour la seule tâche "priority"
        self.queue = deque()
        self._processing = False
        self.active_titles = set()
        self._shutting_down = False

    def _load_progress(self):
        """
        Crée et charge la table thumbnail_progress_music (titre_nettoye TEXT PK, done INTEGER).
        """
        progress = {}
        try:
            conn = sqlite3.connect(self.progress_file)
            c = conn.cursor()

            c.execute("""
                CREATE TABLE IF NOT EXISTS thumbnail_progress_music (
                    titre_nettoye TEXT PRIMARY KEY,
                    done INTEGER NOT NULL
                )
            """)
            conn.commit()

            c.execute("SELECT titre_nettoye, done FROM thumbnail_progress_music")
            for titre_nettoye, done in c.fetchall():
                progress[titre_nettoye] = {"done": bool(done)}

            conn.close()
        except Exception as e:
            print("Erreur chargement suivi miniatures musique:", e)

        return progress

    def _save_progress(self):
        """
        Met à jour la table SQLite pour marquer 'done' = 1 ou 0 pour chaque titre.
        """
        try:
            conn = sqlite3.connect(self.progress_file)
            c = conn.cursor()

            c.execute("""
                CREATE TABLE IF NOT EXISTS thumbnail_progress_music (
                    titre_nettoye TEXT PRIMARY KEY,
                    done INTEGER NOT NULL
                )
            """)
            conn.commit()

            for titre_nettoye, data in self.progress.items():
                if not titre_nettoye:
                    continue
                done_flag = 1 if data.get("done") else 0
                c.execute(
                    "INSERT OR REPLACE INTO thumbnail_progress_music (titre_nettoye, done) VALUES (?, ?)",
                    (titre_nettoye, done_flag)
                )

            conn.commit()
            conn.close()
        except Exception as e:
            print("Erreur sauvegarde suivi miniatures musique:", e)

    def sanitize_title(self, title: str) -> str:
        """
        Remplace les caractères invalides dans le titre pour former un nom de dossier sûr.
        """
        if title not in self._sanitized_cache:
            safe = re.sub(r'[\\/*?:"<>|]', '-', title)
            self._sanitized_cache[title] = safe
        return self._sanitized_cache[title]

    def stop_all_processes(self):
        """
        Arrête toute file en cours et empêche de nouvelles tâches d'être lancées.
        """
        self._shutting_down = True
        self.queue.clear()
        self._processing = False

    def get_thumbnail_status(self, titre_audio: str) -> dict:
        """
        - exists  : True si cover.jpg existe pour ce titre nettoyé
        — path    : chemin local vers cover.jpg
        — in_queue: True si ce titre est déjà en file
        """
        titre_nettoye = self.sanitize_title(titre_audio)
        path = os.path.join(self.thumbnail_dir, titre_nettoye, "cover.jpg")
        return {
            'exists': os.path.exists(path),
            'path': path,
            'in_queue': titre_audio in (t[1] for t in self.queue)
        }

    def _process_next(self):
        """
        Tire la prochaine tâche de la file. S'il n'y a rien, relance après UNE seconde.
        """
        if self._shutting_down:
            self._processing = False
            return

        if self.queue:
            self._processing = True
            chemin_audio, titre_audio = self.queue.popleft()
            self._generate_thumbnail(chemin_audio, titre_audio)
        else:
            self._processing = False
            QtCore.QTimer.singleShot(1000, self._process_next)

    def check_and_queue_thumbnail(self, chemin_audio: str, titre_audio: str):
        """
        Si aucune pochette n'existe encore ET qu'on n'a pas déjà traité ce titre, on queue une tâche.
        """
        titre_nettoye = self.sanitize_title(titre_audio)
        dossier = os.path.join(self.thumbnail_dir, titre_nettoye)
        cover_path = os.path.join(dossier, "cover.jpg")

        done_flag = self.progress.get(titre_nettoye, {}).get("done", False)

        if not done_flag and titre_audio not in self.active_titles and not os.path.exists(cover_path):
            self.queue.append((chemin_audio, titre_audio))
            if not self._processing:
                self._process_next()

    def _generate_thumbnail(self, chemin_audio: str, titre_audio: str):
        """
        Lecture des métadonnées audio via Mutagen pour extraire la pochette,
        écriture de cover.jpg et mise à jour du flag done en base.
        """
        titre_nettoye = self.sanitize_title(titre_audio)
        dossier = os.path.join(self.thumbnail_dir, titre_nettoye)
        os.makedirs(dossier, exist_ok=True)

        # Marquer comme en cours pour éviter les doublons
        self.active_titles.add(titre_audio)

        try:
            audio = MutagenFile(chemin_audio)
            image_data = None

            if audio is not None and hasattr(audio, 'tags'):
                if 'APIC:' in audio.tags:
                    image_data = audio.tags['APIC:'].data
                else:
                    for tag in audio.tags.values():
                        if getattr(tag, 'FrameID', '').startswith('APIC'):
                            image_data = tag.data
                            break

            if image_data:
                cover_path = os.path.join(dossier, "cover.jpg")
                with open(cover_path, 'wb') as img_f:
                    img_f.write(image_data)

                # Création du flag .done pour indiquer qu'on a extrait la pochette
                flag_path = os.path.join(dossier, "cover.done")
                with open(flag_path, 'w', encoding='utf-8'):
                    pass

                pix = QtGui.QPixmap(cover_path)
                # On notifie l'UI que la miniature est prête
                self.thumbnail_ready.emit(chemin_audio, pix)

                # On marque en base done = True
                self.progress[titre_nettoye] = {"done": True}
                self._save_progress()

            else:
                print(f"Aucune pochette trouvée pour {chemin_audio}")

        except Exception as e:
            print(f"Erreur extraction pochette pour {chemin_audio}: {e}")

        finally:
            # Nettoyage de l'état en cours, puis on passe à la tâche suivante
            self.active_titles.discard(titre_audio)
            self._process_next()

    def get_thumbnail_pixmap(self, chemin_audio: str, titre_audio: str) -> QtGui.QPixmap:
        """
        Retourne un QPixmap si cover.jpg existe, sinon None.
        """
        titre_nettoye = self.sanitize_title(titre_audio)
        cover_path = os.path.join(self.thumbnail_dir, titre_nettoye, "cover.jpg")
        if os.path.exists(cover_path):
            pix = QtGui.QPixmap(cover_path)
            if not pix.isNull():
                self.cache.insert(chemin_audio, pix, 1)
                return pix
        return None

    def get_cached_pixmap(self, chemin_audio: str, titre_audio: str) -> QtGui.QPixmap:
        return self.get_thumbnail_pixmap(chemin_audio, titre_audio)
