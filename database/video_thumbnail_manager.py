import multiprocessing
import os
import re
import subprocess
import sqlite3
from collections import deque

from PyQt6 import QtCore, QtGui
from config.config import (
    THUMBNAIL_VIDEO_DIR,
    VIDEOS_DB_PATH,
    FFMPEG_PATH,
    FFPROBE_PATH,
    THUMBNAIL_VIDEO_PROGRESS_DIR
)
from cache.cache import ThumbnailCache

class VideoThumbnailManager(QtCore.QObject):
    thumbnail_ready = QtCore.pyqtSignal(str, QtGui.QPixmap)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.videos_dir = VIDEOS_DB_PATH
        self.thumbnail_dir = THUMBNAIL_VIDEO_DIR
        os.makedirs(self.thumbnail_dir, exist_ok=True)
        self.cache = ThumbnailCache()
        self._sanitized_cache = {}

        self.progress_file = THUMBNAIL_VIDEO_PROGRESS_DIR
        self.secondary_progress = self._load_progress()

        self.priority_queue = deque()
        self.secondary_queue = deque()
        self._processing = False
        self.active_processes = {}
        self._shutting_down = False

    def get_thumbnail_for_time(self, titre_video: str, seconds: float) -> str:
        titre = self.sanitize_title(titre_video)
        folder = os.path.join(self.thumbnail_dir, titre)
        if not os.path.exists(folder):
            return ""

        # 1 miniature toutes les 30 secondes → index = secondes // 30
        index = int(seconds // 30)
        filename = f"{index:04d}.jpg"
        path = os.path.join(folder, filename)
        if os.path.exists(path):
            return path
        return ""

    def _load_progress(self):
        progress = {}
        try:
            conn = sqlite3.connect(self.progress_file)
            c = conn.cursor()

            c.execute("""
                CREATE TABLE IF NOT EXISTS thumbnail_progress (
                    titre_nettoye TEXT PRIMARY KEY,
                    done INTEGER NOT NULL
                )
            """)
            conn.commit()

            c.execute("SELECT titre_nettoye, done FROM thumbnail_progress")
            for titre_nettoye, done in c.fetchall():
                progress[titre_nettoye] = {"done": bool(done)}
            conn.close()
        except Exception as e:
            print("Erreur chargement suivi miniatures:", e)
        return progress

    def _save_progress(self):
        try:
            conn = sqlite3.connect(self.progress_file)
            c = conn.cursor()

            c.execute("""
                CREATE TABLE IF NOT EXISTS thumbnail_progress (
                    titre_nettoye TEXT PRIMARY KEY,
                    done INTEGER NOT NULL
                )
            """)
            conn.commit()

            for titre_nettoye, data in self.secondary_progress.items():
                if not titre_nettoye:
                    continue
                done_flag = 1 if data.get("done") else 0
                c.execute(
                    "INSERT OR REPLACE INTO thumbnail_progress (titre_nettoye, done) VALUES (?, ?)",
                    (titre_nettoye, done_flag)
                )
            conn.commit()
            conn.close()
        except Exception as e:
            print("Erreur sauvegarde suivi miniatures:", e)

    def sanitize_title(self, title: str) -> str:
        if title not in self._sanitized_cache:
            safe = re.sub(r'[\\/*?:"<>|]', '-', title)
            self._sanitized_cache[title] = safe
        return self._sanitized_cache[title]

    def stop_all_processes(self):
        self._shutting_down = True
        for key, process in list(self.active_processes.items()):
            try:
                process.finished.disconnect()
                process.errorOccurred.disconnect()
                if process.state() == QtCore.QProcess.ProcessState.Running:
                    process.terminate()
                    if not process.waitForFinished(1000):
                        process.kill()
                        process.waitForFinished(1000)
            except Exception:
                pass
            finally:
                self.active_processes.pop(key, None)
                process.deleteLater()

    def get_thumbnail_status(self, titre_video: str) -> dict:
        titre_nettoye = self.sanitize_title(titre_video)
        path = os.path.join(self.thumbnail_dir, titre_nettoye, "thumb_15.jpg")
        return {
            'exists': os.path.exists(path),
            'path': path,
            'in_queue': any(t[1] == titre_video for t in self.priority_queue)
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

    def check_and_queue_thumbnail(self, chemin_video: str, titre_video: str):
        titre_nettoye = self.sanitize_title(titre_video)
        dossier = os.path.join(self.thumbnail_dir, titre_nettoye)
        thumb_prio = os.path.join(dossier, "thumb_15.jpg")

        if titre_nettoye not in self.active_processes and not os.path.exists(thumb_prio):
            self.priority_queue.appendleft((chemin_video, titre_video, "priority"))
            if not self._processing:
                self._process_next()
            return

        if os.path.exists(thumb_prio):
            done_flag = self.secondary_progress.get(titre_nettoye, {}).get("done", False)
            if not done_flag and titre_nettoye not in self.active_processes:
                self.secondary_queue.appendleft((chemin_video, titre_video, "secondary"))
                if not self._processing:
                    self._process_next()

    def _run_thumbnail_generation(self, chemin_video: str, titre_video: str, task_type: str):
        if self._shutting_down:
            return

        ffmpeg = FFMPEG_PATH
        ffprobe = FFPROBE_PATH
        if not os.path.exists(ffmpeg):
            self._process_next()
            return

        titre = self.sanitize_title(titre_video)
        dossier = os.path.join(self.thumbnail_dir, titre)
        os.makedirs(dossier, exist_ok=True)

        if titre in self.active_processes:
            self._process_next()
            return

        num_threads = str(multiprocessing.cpu_count())

        if task_type == "priority":
            flag = os.path.join(dossier, "thumb_15.done")
            out = os.path.join(dossier, "thumb_15.jpg")

            if os.path.exists(flag):
                self._process_next()
                return

            try:
                probe = os.path.join(os.path.dirname(ffprobe), "ffprobe")
                res = subprocess.run(
                    [probe, '-v', 'error', '-show_entries', 'format=duration',
                     '-of', 'default=noprint_wrappers=1:nokey=1', chemin_video],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True
                )
                dur = float(res.stdout.strip())
            except:
                dur = 0.0

            t15 = dur * 0.15 if dur > 0 else 0

            filt = "crop='if(gt(iw/ih\\,16/9)\\,ih*16/9\\,iw)':if(gt(iw/ih\\,16/9)\\,ih\\,iw*9/16),scale=320:180"

            cmd = [
                ffmpeg,
                '-hide_banner', '-loglevel', 'error',
                '-hwaccel', 'auto',
                '-ss', str(t15),
                '-i', chemin_video,
                '-vf', filt,
                '-vframes', '1',
                '-qscale:v', '2',
                '-preset', 'fast',
                '-threads', num_threads,
                '-nostdin', '-y', out
            ]

        else:
            if self.secondary_progress.get(titre, {}).get("done", False):
                self._process_next()
                return

            existing_jpgs = sorted([
                f for f in os.listdir(dossier)
                if re.match(r'^\d{4}\.jpg$', f)
            ])
            if existing_jpgs:
                try:
                    last_index = max(int(name.split('.')[0]) for name in existing_jpgs)
                except:
                    last_index = len(existing_jpgs) - 1
            else:
                last_index = -1  # aucun JPEG trouvé

            flag = os.path.join(dossier, ".done")
            if os.path.exists(flag):
                self.secondary_progress[titre] = {"done": True}
                self._save_progress()
                self._process_next()
                return

            start_num = last_index + 1
            print(f"[SECONDARY] Démarrage génération secondaire pour {titre}, start_num={start_num}")

            filt2 = "fps=1/30,crop='if(gt(iw/ih\\,16/9)\\,ih*16/9\\,iw)':if(gt(iw/ih\\,16/9)\\,ih\\,iw*9/16),scale=320:180"

            cmd = [
                ffmpeg,
                '-hide_banner', '-loglevel', 'error',
                '-hwaccel', 'auto',
                '-i', chemin_video,
                '-vf', filt2,
                '-vsync', 'vfr',
                '-qscale:v', '5',
                '-preset', 'fast',
                '-threads', num_threads,
                '-start_number', str(start_num),
                '-nostdin', '-y', os.path.join(dossier, '%04d.jpg')
            ]

        proc = QtCore.QProcess(self)
        proc.setProperty('flag', flag)
        proc.setProperty('type', task_type)
        proc.setProperty('titre', titre)
        proc.setProperty('path', chemin_video)
        self.active_processes[titre] = proc

        proc.finished.connect(lambda ec, es: self._on_process_finished(titre, proc, ec, es))
        proc.errorOccurred.connect(lambda e: self._handle_process_error(titre, proc, e))

        proc.start(cmd[0], cmd[1:])

    def _on_process_finished(self, titre: str, proc: QtCore.QProcess, code: int, status):
        if self._shutting_down or not proc:
            return

        self.active_processes.pop(titre, None)

        try:
            if code == 0:
                flag = proc.property('flag')
                with open(flag, 'w', encoding='utf-8') as fh:
                    fh.write('done')

                if proc.property('type') == 'priority':
                    # — Prioritaire terminé : signal vers l'UI —
                    p = os.path.join(self.thumbnail_dir, titre, "thumb_15.jpg")
                    if os.path.exists(p):
                        pix = QtGui.QPixmap(p)
                        self.thumbnail_ready.emit(proc.property('path'), pix)
                    self.check_and_queue_thumbnail(proc.property('path'), titre)

                else:
                    self.secondary_progress[titre] = {"done": True}
                    self._save_progress()

            else:
                print(f"[FFMPEG] Erreur code {code} pour {titre}")

        except Exception as e:
            print("Exception dans _on_process_finished:", e)

        finally:
            proc.deleteLater()
            self._process_next()

    def _handle_process_error(self, titre: str, proc: QtCore.QProcess, error):
        print(f"[ERROR] Process error pour {titre} : {error}")
        self.active_processes.pop(titre, None)
        proc.deleteLater()
        self._process_next()

    def get_thumbnail_pixmap(self, chemin_video: str, titre_video: str):
        titre = self.sanitize_title(titre_video)
        path = os.path.join(self.thumbnail_dir, titre, "thumb_15.jpg")
        if os.path.exists(path):
            pix = QtGui.QPixmap(path)
            if not pix.isNull():
                self.cache.insert(chemin_video, pix, 1)
            return pix
        return None

    def get_cached_pixmap(self, chemin: str, titre_video: str):
        return self.get_thumbnail_pixmap(chemin, titre_video)
