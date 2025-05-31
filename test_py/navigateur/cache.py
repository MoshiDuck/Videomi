import os
import re

from PyQt6 import QtCore
import sys

from PyQt6.uic.properties import QtGui


class VideoCache:
    _instance = None
    _thumbnail_dir = None  # Chemin configurable

    def __new__(cls):
        if not cls._instance:
            cls._instance = super().__new__(cls)
            cls._cache = {}
            cls._max_size = 1024 * 1024 * 500  # 500MB
            cls._current_size = 0
            cls._lock = QtCore.QMutex()
            cls._generation_callback = None
        return cls._instance

    @classmethod
    def configurer(cls, thumbnail_dir, generation_callback):
        cls._thumbnail_dir = thumbnail_dir
        cls._generation_callback = generation_callback

    def _sanitize_title(self, title):
        return re.sub(r'[\\/*?:"<>|]', '-', title)

    def _get_thumbnail_folder(self, chemin_video):
        titre_video = os.path.splitext(os.path.basename(chemin_video))[0]
        titre_nettoye = self._sanitize_title(titre_video)
        return os.path.join(self._thumbnail_dir, titre_nettoye)

    def obtenir_pixmap(self, chemin):
        locker = QtCore.QMutexLocker(self._lock)
        
        # 1. Vérifier le cache mémoire
        if pixmap := self._cache.get(chemin):
            return pixmap
            
        # 2. Vérifier le cache disque
        dossier = self._get_thumbnail_folder(chemin)
        first_thumb = os.path.join(dossier, "0001.jpg")

        if os.path.exists(first_thumb):
            pixmap = QtGui.QPixmap(first_thumb)
            if not pixmap.isNull():
                cost = pixmap.width() * pixmap.height() * pixmap.depth() // 8
                self.insert(chemin, pixmap, cost)
                return pixmap

        # 3. Lancer la génération asynchrone
        if self._generation_callback:
            self._lancer_generation_async(chemin)
            
        # 4. Retourner une image vide temporaire
        return self._creer_pixmap_vide()

    def _lancer_generation_async(self, chemin):
        thread = QtCore.QThread()
        worker = GenerationWorker(chemin, self._generation_callback)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.finished.connect(thread.quit)
        worker.finished.connect(worker.deleteLater)
        thread.finished.connect(thread.deleteLater)
        thread.start()

    def _creer_pixmap_vide(self):
        pixmap = QtGui.QPixmap(300, 200)
        pixmap.fill(QtGui.QColor(40, 40, 40))
        painter = QtGui.QPainter(pixmap)
        painter.setPen(QtGui.QColor(120, 120, 120))
        painter.drawText(pixmap.rect(), QtCore.Qt.AlignCenter, "Chargement...")
        painter.end()
        return pixmap


    def insert(self, key, value, cost):
        locker = QtCore.QMutexLocker(self._lock)
        if cost > self._max_size:
            # On n'insère pas un objet dont le coût dépasse la taille maximum autorisée
            return
        # Libération d'espace si nécessaire
        while self._current_size + cost > self._max_size and self._cache:
            oldest = next(iter(self._cache))
            self._current_size -= sys.getsizeof(self._cache.pop(oldest))
        if self._current_size + cost <= self._max_size:
            self._cache[key] = value
            self._current_size += cost

    def object(self, key):
        locker = QtCore.QMutexLocker(self._lock)
        return self._cache.get(key)

    def clear(self):
        locker = QtCore.QMutexLocker(self._lock)
        self._cache.clear()
        self._current_size = 0

class GenerationWorker(QtCore.QObject):
    finished = QtCore.pyqtSignal()

    def __init__(self, chemin, callback):
        super().__init__()
        self.chemin = chemin
        self.callback = callback

    def run(self):
        try:
            self.callback(self.chemin)
        finally:
            self.finished.emit()


class ThumbnailCache(VideoCache):
    _instance = None

    def __new__(cls):
        if not cls._instance:
            cls._instance = super().__new__(cls)
            cls._cache = {}
            cls._max_size = 1024 * 1024 * 200  # 200MB
            cls._current_size = 0
            cls._lock = QtCore.QMutex()
        return cls._instance



class SortCache:
    _instance = None

    def __new__(cls):
        if not cls._instance:
            cls._instance = super().__new__(cls)
            cls._cache = {}
            cls._lock = QtCore.QMutex()
        return cls._instance

    def insert(self, key, value):
        locker = QtCore.QMutexLocker(self._lock)
        self._cache[key] = value

    def object(self, key):
        locker = QtCore.QMutexLocker(self._lock)
        return self._cache.get(key)

    def clear(self):
        locker = QtCore.QMutexLocker(self._lock)
        self._cache.clear()


class SearchCache:
    _instance = None

    def __new__(cls):
        if not cls._instance:
            cls._instance = super().__new__(cls)
            cls._cache = {}
            cls._lock = QtCore.QMutex()
        return cls._instance

    def insert(self, key, value):
        locker = QtCore.QMutexLocker(self._lock)
        self._cache[key] = value

    def object(self, key):
        locker = QtCore.QMutexLocker(self._lock)
        return self._cache.get(key)

    def clear(self):
        locker = QtCore.QMutexLocker(self._lock)
        self._cache.clear()
