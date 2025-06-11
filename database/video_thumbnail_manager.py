import os
import re
import sqlite3
import multiprocessing
import subprocess
from collections import deque
from threading import Lock
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

        self._progress_lock = Lock()
        self._process_lock = Lock()
        self._progress_timers = {}

    @staticmethod
    def _init_progress_db(conn):
        conn.execute("""
            CREATE TABLE IF NOT EXISTS thumbnail_progress (
                titre_nettoye TEXT PRIMARY KEY,
                done INTEGER NOT NULL,
                last_index INTEGER DEFAULT -1
            )
        """)
        conn.commit()

    def sanitize_title(self, title: str) -> str:
        if title not in self._sanitized_cache:
            self._sanitized_cache[title] = re.sub(r'[\\/*?:"<>|]', '-', title)
        return self._sanitized_cache[title]

    def _load_progress(self):
        progress = {}
        try:
            with sqlite3.connect(self.progress_file) as conn:
                self._init_progress_db(conn)
                cursor = conn.execute("SELECT titre_nettoye, done, last_index FROM thumbnail_progress")
                for titre, done, last_index in cursor.fetchall():
                    progress[titre] = {"done": bool(done), "last_index": last_index or -1}
        except Exception as e:
            print("Erreur chargement suivi miniatures:", e)
        return progress

    def _save_progress(self):
        try:
            with self._progress_lock, sqlite3.connect(self.progress_file) as conn:
                self._init_progress_db(conn)
                for titre, data in self.secondary_progress.items():
                    if not titre:
                        continue
                    done_flag = 1 if data.get("done") else 0
                    last_index = data.get("last_index", -1)
                    conn.execute(
                        "INSERT OR REPLACE INTO thumbnail_progress (titre_nettoye, done, last_index) VALUES (?, ?, ?)",
                        (titre, done_flag, last_index)
                    )
                conn.commit()
        except Exception as e:
            print("Erreur sauvegarde suivi miniatures:", e)

    def get_thumbnail_for_time(self, titre_video: str, seconds: float) -> str:
        titre = self.sanitize_title(titre_video)
        folder = os.path.join(self.thumbnail_dir, titre)
        if not os.path.isdir(folder):
            return ""
        index = int(seconds // 5)
        path = os.path.join(folder, f"{index:04d}.jpg")
        return path if os.path.exists(path) else ""

    def stop_all_processes(self):
        self._shutting_down = True
        with self._process_lock:
            for titre, process in list(self.active_processes.items()):
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
                    self.active_processes.pop(titre, None)
                    process.deleteLater()

    def get_thumbnail_status(self, titre_video: str) -> dict:
        titre = self.sanitize_title(titre_video)
        path = self.get_priority_thumbnail_path(titre)
        in_queue = any(t[1] == titre_video for t in self.priority_queue)
        return {'exists': os.path.exists(path), 'path': path, 'in_queue': in_queue}

    def check_and_queue_thumbnail(self, chemin_video: str, titre_video: str):
        titre = self.sanitize_title(titre_video)
        folder = os.path.join(self.thumbnail_dir, titre)
        thumb_prio = os.path.join(folder, "thumb_15.jpg")

        if titre not in self.active_processes and not os.path.exists(thumb_prio):
            self.priority_queue.appendleft((chemin_video, titre_video, "priority"))
            if not self._processing:
                self._process_next()
            return

        if os.path.exists(thumb_prio) and not self.secondary_progress.get(titre, {}).get("done", False) and titre not in self.active_processes:
            self.secondary_queue.appendleft((chemin_video, titre_video, "secondary"))
            if not self._processing:
                self._process_next()

    def _process_next(self):
        if self._shutting_down:
            self._processing = False
            return
        task = None
        if self.priority_queue:
            task = self.priority_queue.popleft()
        elif self.secondary_queue:
            task = self.secondary_queue.popleft()

        if task:
            self._processing = True
            self._run_thumbnail_generation(*task)
        else:
            self._processing = False
            QtCore.QTimer.singleShot(1000, self._process_next)

    @staticmethod
    def _build_priority_command(chemin_video: str, folder: str, dur: float):
        flag = os.path.join(folder, "thumb_15.done")
        out = os.path.join(folder, "thumb_15.jpg")

        t15 = dur * 0.15 if dur > 0 else 0
        filt = "crop='if(gt(iw/ih\\,16/9)\\,ih*16/9\\,iw)':if(gt(iw/ih\\,16/9)\\,ih\\,iw*9/16),scale=320:180"
        num_threads = str(multiprocessing.cpu_count())
        cmd = [
            FFMPEG_PATH, '-hide_banner', '-loglevel', 'error',
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
        return cmd, flag, out

    def _build_secondary_command(self, chemin_video: str, folder: str, dur: float, titre: str):
        flag = os.path.join(folder, ".done")
        progress = self.secondary_progress.get(titre, {"done": False, "last_index": -1})
        estimated_total = int(dur // 5) if dur > 0 else 100
        self._start_progress_timer(titre, estimated_total)
        last_index = progress.get("last_index", -1)
        start_number = last_index + 1 if last_index >= 0 else 0
        start_time = start_number * 5

        self.secondary_progress[titre] = {"done": False, "last_index": last_index}
        self._save_progress()

        filt2 = "fps=1/5,crop='if(gt(iw/ih\\,16/9)\\,ih*16/9\\,iw)':if(gt(iw/ih\\,16/9)\\,ih\\,iw*9/16),scale=320:180"
        num_threads = str(multiprocessing.cpu_count())
        cmd = [
            FFMPEG_PATH,
            '-hide_banner', '-loglevel', 'error',
            '-hwaccel', 'auto',
            '-ss', str(start_time),
            '-i', chemin_video,
            '-vf', filt2,
            '-vsync', 'vfr',
            '-qscale:v', '5',
            '-preset', 'fast',
            '-threads', num_threads,
            '-start_number', str(start_number),
            '-nostdin', '-y', os.path.join(folder, '%04d.jpg')
        ]
        return cmd, flag, progress

    def get_priority_thumbnail_path(self, titre: str) -> str:
        """
        Renvoie le chemin absolu vers la miniature prioritaire (thumb_15.jpg) pour un titre donné.
        """
        sanitized = self.sanitize_title(titre)
        return os.path.join(self.thumbnail_dir, sanitized, "thumb_15.jpg")

    def _run_thumbnail_generation(self, chemin_video: str, titre_video: str, task_type: str):
        if self._shutting_down or not os.path.exists(FFMPEG_PATH):
            self._process_next()
            return
        titre = self.sanitize_title(titre_video)
        folder = os.path.join(self.thumbnail_dir, titre)
        os.makedirs(folder, exist_ok=True)
        if titre in self.active_processes:
            self._process_next()
            return
        num_threads = str(multiprocessing.cpu_count())
        dur = 0.0
        try:
            result = subprocess.run(
                [FFPROBE_PATH, '-v', 'error', '-show_entries', 'format=duration',
                 '-of', 'default=noprint_wrappers=1:nokey=1', chemin_video],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True
            )
            try:
                dur = float(result.stdout.strip() or 0)
            except ValueError:
                dur = 0.0
        except Exception:
            pass

        if task_type == "priority":
            cmd, flag, out_path = self._build_priority_command(chemin_video, folder, dur)
            if os.path.exists(flag):
                self._process_next()
                return
        else:
            cmd, flag, progress = self._build_secondary_command(chemin_video, folder, dur, titre)
            if progress.get("done", False):
                self._process_next()
                return

            if os.path.exists(flag):
                self.secondary_progress[titre] = {"done": True, "last_index": progress.get("last_index", -1)}
                self._save_progress()
                self._process_next()
                return


        proc = QtCore.QProcess(self)
        proc.setProperty('flag', flag)
        proc.setProperty('type', task_type)
        proc.setProperty('titre', titre)
        proc.setProperty('path', chemin_video)
        self.active_processes[titre] = proc
        proc.finished.connect(lambda ec, es: self._on_process_finished(titre, proc, ec, es))
        proc.errorOccurred.connect(lambda e: self._handle_process_error(titre, proc, e))
        proc.start(cmd[0], cmd[1:])

    def _start_progress_timer(self, titre: str, total_estime: int):
        if titre in self._progress_timers:
            return
        timer = QtCore.QTimer(self)
        timer.setInterval(5000)
        timer.timeout.connect(lambda: self._save_secondary_progress(titre, total_estime))
        timer.start()
        self._progress_timers[titre] = timer

    def _stop_progress_timer(self, titre: str):
        timer = self._progress_timers.pop(titre, None)
        if timer:
            timer.stop()
            timer.deleteLater()

    def _save_secondary_progress(self, titre: str, total_estime: int):
        folder = os.path.join(self.thumbnail_dir, titre)
        if not os.path.isdir(folder):
            return

        images = [f for f in os.listdir(folder) if re.match(r'^\d{4}\.jpg$', f)]
        current_index = len(images) - 1
        if total_estime <= 0:
            return

        percent = min(int((current_index / total_estime) * 100), 100)
        print(f"[{titre}] Progression secondaire approximative : {percent}%")

        last_index = self.secondary_progress.get(titre, {}).get("last_index", -1)
        if current_index > last_index and (percent % 5 == 0 or percent == 100):
            self.secondary_progress[titre]["last_index"] = current_index
            self._save_progress()

    def _on_process_finished(self, titre: str, proc: QtCore.QProcess, code: int, status):
        if self._shutting_down or not proc:
            return
        with self._process_lock:
            self.active_processes.pop(titre, None)

        try:
            if code == 0:
                flag = proc.property('flag')
                with open(flag, 'w', encoding='utf-8') as f:
                    f.write('done')

                if proc.property('type') == 'priority':
                    path = self.get_priority_thumbnail_path(titre)
                    if os.path.exists(path):
                        pix = QtGui.QPixmap(path)
                        self.thumbnail_ready.emit(proc.property('path'), pix)
                    self.check_and_queue_thumbnail(proc.property('path'), titre)
                else:  # secondary
                    with self._progress_lock:
                        self.secondary_progress[titre]["done"] = True
                        self._save_progress()
                    self._stop_progress_timer(titre)
            else:
                print(f"[FFMPEG] Erreur code {code} pour {titre}")
        except Exception as e:
            print("Exception dans _on_process_finished:", e)
        finally:
            proc.deleteLater()
            self._process_next()

    def _handle_process_error(self, titre: str, proc: QtCore.QProcess, error):
        print(f"[ERROR] Process error pour {titre} : {error}")
        with self._process_lock:
            self.active_processes.pop(titre, None)
        proc.deleteLater()
        self._process_next()

    def get_thumbnail_pixmap(self, chemin_video: str, titre_video: str):
        titre = self.sanitize_title(titre_video)
        path = self.get_priority_thumbnail_path(titre)
        if os.path.exists(path):
            pix = QtGui.QPixmap(path)
            if not pix.isNull():
                self.cache.insert(chemin_video, pix, 1)
            return pix
        return None

    def get_cached_pixmap(self, chemin: str, titre_video: str):
        return self.get_thumbnail_pixmap(chemin, titre_video)
