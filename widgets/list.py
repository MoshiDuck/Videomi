import os
from PySide6.QtWidgets import (
    QWidget, QLabel, QVBoxLayout, QHBoxLayout, QSizePolicy, QScrollArea
)
from PySide6.QtGui import QPixmap, QPixmapCache
from PySide6.QtCore import Qt, QSize
from config.colors import DARK_CONTAINER


class ListItem(QWidget):
    def __init__(self, title: str, duration: str = "00:00:00", thumbnail_path: str = None, ratio=16 / 9):
        super().__init__()
        self._current_width = None
        self.ratio = ratio

        self.setFixedHeight(64)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

        layout = QHBoxLayout(self)
        layout.setSpacing(5)
        layout.setContentsMargins(0, 0, 0, 0)

        # Thumbnail
        self.thumbnail = QLabel("♪")
        self.thumbnail.setAlignment(Qt.AlignCenter)
        self.thumbnail.setStyleSheet(f"background-color: {DARK_CONTAINER}; color: #fff;")
        self.thumbnail.setScaledContents(True)

        thumb_width = int(64 * ratio)
        self.thumbnail.setFixedSize(thumb_width, 64)
        layout.addWidget(self.thumbnail)

        # Title
        self.title = QLabel(title)
        self.title.setAlignment(Qt.AlignVCenter | Qt.AlignLeft)
        self.title.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        layout.addWidget(self.title)

        # Duration
        self.duration = QLabel(duration)
        self.duration.setAlignment(Qt.AlignVCenter | Qt.AlignRight)
        self.duration.setStyleSheet("color: gray; font-size: 11px;")
        layout.addWidget(self.duration)

        self.set_thumbnail(thumbnail_path)

    def set_thumbnail(self, path: str):
        if not path or not os.path.exists(path):
            self.thumbnail.setPixmap(QPixmap())
            self.thumbnail.setText("♪")
            return

        cached = QPixmapCache.find(path)
        if cached:
            self.thumbnail.setPixmap(cached)
            self.thumbnail.setText("")
        else:
            pixmap = QPixmap(path)
            if not pixmap.isNull():
                QPixmapCache.insert(path, pixmap)
                self.thumbnail.setPixmap(pixmap)
                self.thumbnail.setText("")
            else:
                self.thumbnail.setPixmap(QPixmap())
                self.thumbnail.setText("♪")


class List(QScrollArea):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWidgetResizable(True)
        self.items = []

        self.container = QWidget()
        self.layout = QVBoxLayout(self.container)
        self.layout.setSpacing(10)
        self.layout.setContentsMargins(0, 0, 10, 0)
        self.setWidget(self.container)

        self._changed = False

    def add_item(self, widget: QWidget):
        self.items.append(widget)
        self.layout.addWidget(widget)
        self._changed = True
        self._arranger()

    def clear_items(self):
        if not self.items:
            return

        while self.layout.count():
            item = self.layout.takeAt(0)
            widget = item.widget()
            if widget:
                widget.setParent(None)
        self.items.clear()
        self._changed = True
        self._arranger()

    def _arranger(self):
        if not self._changed:
            return
        self.container.adjustSize()
        self._changed = False

    def rearrange(self):
        self._changed = True
        self._arranger()
