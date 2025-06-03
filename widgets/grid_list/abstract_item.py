import os

from PyQt6.QtGui import QPixmap, QPixmapCache
from PyQt6.QtWidgets import QWidget, QSizePolicy


class AbstractItem(QWidget):
    def __init__(self, title: str, duration: str = "00:00:00", thumbnail_path: str = None, ratio=16/9, parent=None):
        super().__init__(parent)
        self.title_text = title.lower()
        self.ratio = ratio
        self._thumbnail_path = thumbnail_path
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

        self._init_ui(title, duration)
        self.set_thumbnail(thumbnail_path)

    def _init_ui(self, title, duration):
        # Do nothing here, must be implemented in subclass
        raise NotImplementedError

    def set_thumbnail(self, path: str):
        if not path or not os.path.exists(path):
            self.thumbnail.setPixmap(QPixmap())
            self.thumbnail.setText("Aperçu")
            return

        cached_pixmap = QPixmapCache.find(path)
        if cached_pixmap:
            self.thumbnail.setPixmap(cached_pixmap)
            self.thumbnail.setText("")
        else:
            pixmap = QPixmap(path)
            if not pixmap.isNull():
                QPixmapCache.insert(path, pixmap)
                self.thumbnail.setPixmap(pixmap)
                self.thumbnail.setText("")

    def matches_filter(self, text: str) -> bool:
        return text in self.title_text