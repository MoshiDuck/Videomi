import multiprocessing
import os
import re
import sqlite3
from collections import deque

from PyQt6 import QtCore, QtGui
from mutagen import File as MutagenFile

from config.config import THUMBNAIL_MUSIC_DIR, MUSIQUES_DB_PATH, AUDIO_EXTENSIONS
from test_py.navigateur.cache import ThumbnailCache, SortCache, SearchCache


class MusiqueThumbnailManager(QtCore.QObject):
    thumbnail_ready = QtCore.pyqtSignal(str, QtGui.QPixmap)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.audio_db = MUSIQUES_DB_PATH
        self.thumbnail_dir = THUMBNAIL_MUSIC_DIR
        os.makedirs(self.thumbnail_dir, exist_ok=True)
        self.cache = ThumbnailCache()
        self._sanitized_cache = {}
        self.progress_file = os.path.join(self.thumbnail_dir, "thumbnail_progress_music.json")
        self.secondary_progress = self._load_progress()
        self.priority_queue = deque()
        self.secondary_queue = deque()
        self._processing = False
        self.active_processes = {}
        self._shutting_down = False

    def _load_progress(self):
        progress = {}
        try:
            conn = sqlite3.connect(self.audio_db)
            c = conn.cursor()
            c.execute("SELECT titre_nettoye, done FROM thumbnail_progress_music")
            for titre_nettoye, done in c.fetchall():
                progress[titre_nettoye] = {"done": bool(done)}
            conn.close()
        except Exception as e:
            print("Erreur chargement suivi miniatures musique:", e)
        return progress

    def _save_progress(self):
        try:
            conn = sqlite3.connect(self.audio_db)
            c = conn.cursor()
            for titre_nettoye, data in self.secondary_progress.items():
                c.execute(
                    "INSERT OR REPLACE INTO thumbnail_progress_music (titre_nettoye, done) VALUES (?, ?)",
                    (titre_nettoye, 1 if data.get("done") else 0)
                )
            conn.commit()
            conn.close()
        except Exception as e:
            print("Erreur sauvegarde suivi miniatures musique:", e)

    def sanitize_title(self, title):
        if title not in self._sanitized_cache:
            safe = re.sub(r'[\\/*?:"<>|]', '-', title)
            self._sanitized_cache[title] = safe
        return self._sanitized_cache[title]

    def stop_all_processes(self):
        self._shutting_down = True
        # No external processes used for music thumbnails
        self.priority_queue.clear()
        self.secondary_queue.clear()
        self._processing = False

    def get_thumbnail_status(self, titre_audio):
        titre_nettoye = self.sanitize_title(titre_audio)
        path = os.path.join(self.thumbnail_dir, titre_nettoye, "cover.jpg")
        return {
            'exists': os.path.exists(path),
            'path': path,
            'in_queue': any(t[1] == titre_audio for t in self.priority_queue)
        }

    def _process_next(self):
        if self._shutting_down:
            self._processing = False
            return
        if self.priority_queue:
            self._processing = True
            task = self.priority_queue.popleft()
            self._run_thumbnail_generation(*task)
        elif self.secondary_queue:
            self._processing = True
            task = self.secondary_queue.popleft()
            self._run_thumbnail_generation(*task)
        else:
            self._processing = False
            QtCore.QTimer.singleShot(1000, self._process_next)

    def check_and_queue_thumbnail(self, chemin_audio, titre_audio):
        titre_nettoye = self.sanitize_title(titre_audio)
        dossier = os.path.join(self.thumbnail_dir, titre_nettoye)
        thumb = os.path.join(dossier, "cover.jpg")
        if titre_nettoye in self.active_processes:
            return
        if not os.path.exists(thumb):
            self.priority_queue.appendleft((chemin_audio, titre_audio, "priority"))
            if not self._processing:
                self._process_next()
        else:
            flag = os.path.join(dossier, ".done")
            if not os.path.exists(flag) and not self.secondary_progress.get(titre_nettoye, {}).get("done"):
                self.secondary_queue.appendleft((chemin_audio, titre_audio, "secondary"))
                if not self._processing:
                    self._process_next()

    def _run_thumbnail_generation(self, chemin_audio, titre_audio, task_type):
        if self._shutting_down:
            return

        titre = self.sanitize_title(titre_audio)
        dossier = os.path.join(self.thumbnail_dir, titre)
        os.makedirs(dossier, exist_ok=True)
        if titre in self.active_processes:
            self._process_next()
            return

        # Extraction de la pochette depuis les métadonnées
        try:
            audio = MutagenFile(chemin_audio)
            image_data = None
            if audio is not None and hasattr(audio, 'tags'):
                if 'APIC:' in audio.tags:
                    image_data = audio.tags['APIC:'].data
                else:
                    # Recherche d'autre frame contenant l'image
                    for tag in audio.tags.values():
                        if tag.FrameID.startswith('APIC'):
                            image_data = tag.data
                            break
            if image_data:
                out = os.path.join(dossier, "cover.jpg")
                with open(out, 'wb') as img_f:
                    img_f.write(image_data)
                # Création du flag
                flag = os.path.join(dossier, "cover.done")
                with open(flag, 'w') as fh:
                    fh.write('done')
                pix = QtGui.QPixmap(out)
                if task_type == 'priority':
                    self.thumbnail_ready.emit(chemin_audio, pix)
                else:
                    self.secondary_progress[titre] = {'done': True}
                    self._save_progress()
            else:
                print(f"Aucune pochette trouvée pour {chemin_audio}")
        except Exception as e:
            print(f"Erreur extraction pochette pour {chemin_audio}: {e}")
        finally:
            if titre in self.active_processes:
                del self.active_processes[titre]
            self._process_next()

    def get_thumbnail_pixmap(self, chemin_audio, titre_audio):
        titre = self.sanitize_title(titre_audio)
        path = os.path.join(self.thumbnail_dir, titre, "cover.jpg")
        if os.path.exists(path):
            pix = QtGui.QPixmap(path)
            if not pix.isNull():
                self.cache.insert(chemin_audio, pix, 1)
            return pix
        return None

    def get_cached_pixmap(self, chemin, titre_audio):
        return self.get_thumbnail_pixmap(chemin, titre_audio)
