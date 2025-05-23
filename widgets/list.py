import os

from PySide6.QtWidgets import (
    QWidget, QLabel, QVBoxLayout, QHBoxLayout, QSizePolicy, QScrollArea
)
from PySide6.QtGui import QPixmap
from PySide6.QtCore import Qt, QSize
from config.colors import DARK_CONTAINER


class AspectRatioWidget(QWidget):
    def __init__(self, ratio=16 / 9, parent=None):
        super().__init__(parent)
        self.ratio = ratio
        self.setSizePolicy(QSizePolicy.Fixed, QSizePolicy.Fixed)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        w = self.width()
        h = int(w / self.ratio)
        self.setMinimumHeight(h)
        self.setMaximumHeight(h)

    def sizeHint(self):
        w = self.width()
        h = int(w / self.ratio)
        return QSize(w, h)


class ListItem(QWidget):
    def __init__(self, title: str, duration: str = "00:00:00", thumbnail_path: str = None, ratio=16 / 9):
        super().__init__()

        layout = QHBoxLayout()
        layout.setSpacing(10)
        layout.setContentsMargins(10, 5, 10, 5)

        # AspectRatio wrapper
        self.aspect_wrapper = AspectRatioWidget(ratio)
        self.aspect_wrapper.setFixedHeight(64)
        self.thumbnail = QLabel()
        self.thumbnail.setAlignment(Qt.AlignCenter)
        self.thumbnail.setStyleSheet(f"background-color: {DARK_CONTAINER}; color: #fff;")
        self.thumbnail.setScaledContents(True)

        thumb_layout = QVBoxLayout(self.aspect_wrapper)
        thumb_layout.setContentsMargins(0, 0, 0, 0)
        thumb_layout.addWidget(self.thumbnail)

        self.set_thumbnail(thumbnail_path)
        layout.addWidget(self.aspect_wrapper)

        # Titre (au centre, extensible)
        self.title_label = QLabel(title)
        self.title_label.setAlignment(Qt.AlignVCenter | Qt.AlignLeft)
        self.title_label.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        layout.addWidget(self.title_label)

        # Durée (à droite)
        self.duration_label = QLabel(duration)
        self.duration_label.setAlignment(Qt.AlignVCenter | Qt.AlignRight)
        self.duration_label.setStyleSheet("color: gray; font-size: 11px;")
        layout.addWidget(self.duration_label)

        self.setLayout(layout)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

    def set_thumbnail(self, thumbnail_path: str):
        if thumbnail_path and os.path.exists(thumbnail_path):
            pixmap = QPixmap(thumbnail_path)
            if not pixmap.isNull():
                self.thumbnail.setPixmap(pixmap)
                return
        self.thumbnail.clear()
        self.thumbnail.setText("♪")


class List(QScrollArea):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWidgetResizable(True)

        self.container = QWidget()
        self.setWidget(self.container)

        self.layout = QVBoxLayout()
        self.layout.setSpacing(5)
        self.layout.setContentsMargins(5, 5, 5, 5)
        self.container.setLayout(self.layout)

        self.items = []

    def add_item(self, widget: QWidget):
        self.items.append(widget)
        self.layout.addWidget(widget)

    def clear_items(self):
        while self.layout.count():
            item = self.layout.takeAt(0)
            widget = item.widget()
            if widget:
                widget.setParent(None)
        self.items.clear()
