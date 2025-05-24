import os
from PySide6.QtWidgets import (
    QWidget, QLabel, QVBoxLayout, QSizePolicy, QGridLayout, QScrollArea
)
from PySide6.QtCore import Qt, QSize, Slot
from PySide6.QtGui import QPixmap, QPixmapCache
from config.colors import DARK_CONTAINER


class GridItem(QWidget):
    def __init__(self, title: str, duration: str = "00:00:00", thumbnail_path: str = None, ratio=16 / 9, parent=None):
        super().__init__(parent)

        self.title_text = title.lower()
        self.ratio = ratio
        self._thumbnail_path = thumbnail_path
        self._current_width = None

        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

        layout = QVBoxLayout(self)
        layout.setSpacing(5)
        layout.setContentsMargins(0, 0, 0, 0)

        # Thumbnail
        self.thumbnail = QLabel("Aperçu")
        self.thumbnail.setAlignment(Qt.AlignCenter)
        self.thumbnail.setStyleSheet(f"background-color: {DARK_CONTAINER}; color: #fff;")
        self.thumbnail.setScaledContents(True)
        layout.addWidget(self.thumbnail)

        # Title
        self.title = QLabel(title)
        self.title.setAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        layout.addWidget(self.title)

        # Duration
        self.duration = QLabel(duration)
        self.duration.setAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        self.duration.setStyleSheet("color: gray; font-size: 11px;")
        layout.addWidget(self.duration)

        self.set_thumbnail(thumbnail_path)

    def set_thumbnail(self, path: str):
        if not path or not os.path.exists(path):
            self.thumbnail.setPixmap(QPixmap())  # Clear
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

    def resizeEvent(self, event):
        super().resizeEvent(event)
        width = self.width()
        height = int(width / self.ratio)
        self.thumbnail.setFixedHeight(height)


class Grid(QWidget):
    def __init__(self, parent=None, min_width=300):
        super().__init__(parent)
        self.min_width = min_width
        self.items = []

        self.main_layout = QVBoxLayout(self)
        self.main_layout.setContentsMargins(0, 0, 0, 0)
        self.main_layout.setSpacing(5)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.container = QWidget()
        self.scroll.setWidget(self.container)
        self.main_layout.addWidget(self.scroll)

        self.layout = QGridLayout(self.container)
        self.layout.setSpacing(10)
        self.layout.setContentsMargins(5, 0, 5, 5)

        self._last_col_count = -1
        self._last_visible_count = -1

    @Slot(str)
    def apply_filter(self, text: str):
        query = text.strip().lower()
        changed = False

        for item in self.items:
            visible = not query or item.matches_filter(query)
            if item.isVisible() != visible:
                item.setVisible(visible)
                changed = True

        if changed:
            self.arrange()

    def add_item(self, widget: QWidget):
        self.items.append(widget)
        widget.setParent(self.container)
        widget.setVisible(True)
        self.arrange()

    def arrange(self):
        visible_items = [w for w in self.items if w.isVisible()]
        visible_count = len(visible_items)
        if visible_count == 0:
            return

        viewport_width = self.scroll.viewport().width()
        spacing = self.layout.spacing()
        col_count = max(1, viewport_width // (self.min_width + spacing))

        if col_count == self._last_col_count and visible_count == self._last_visible_count:
            return  # Skip unnecessary rearrangement

        self._last_col_count = col_count
        self._last_visible_count = visible_count

        for i in reversed(range(self.layout.count())):
            widget = self.layout.itemAt(i).widget()
            if widget:
                self.layout.removeWidget(widget)

        item_width = (viewport_width - spacing * (col_count - 1)) / col_count

        for idx, widget in enumerate(visible_items):
            if widget.width() != int(item_width):
                widget.setFixedWidth(int(item_width))
            row, col = divmod(idx, col_count)
            self.layout.addWidget(widget, row, col)

        self.layout.setRowStretch(self.layout.rowCount(), 1)
        self.layout.setColumnStretch(col_count, 1)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.arrange()
