import os

from PySide6 import QtWidgets
from PySide6.QtWidgets import QWidget, QLabel, QVBoxLayout, QSizePolicy, QGridLayout
from PySide6.QtCore import Qt, QSize
from PySide6.QtGui import QPixmap
from config.colors import DARK_CONTAINER

class AspectRatioWidget(QWidget):
    def __init__(self, ratio=16/9, parent=None):
        super().__init__(parent)
        self.ratio = ratio
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)

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

class GridItem(QWidget):
    def __init__(self, title: str, duration: str = "00:00:00", thumbnail_path: str = None, ratio=16/9):
        super().__init__()
        layout = QVBoxLayout()
        layout.setSpacing(5)
        layout.setContentsMargins(0, 0, 0, 0)

        # Thumbnail
        self.thumbnail = QLabel()
        self.thumbnail.setAlignment(Qt.AlignCenter)
        self.thumbnail.setStyleSheet(f"background-color: {DARK_CONTAINER}; color: #fff;")
        self.thumbnail.setScaledContents(True)

        self._current_thumbnail = None
        self.set_thumbnail(thumbnail_path)

        # Wrapper to enforce 16:9
        self.aspect_wrapper = AspectRatioWidget(ratio)
        wrapper_layout = QVBoxLayout(self.aspect_wrapper)
        wrapper_layout.setContentsMargins(0, 0, 0, 0)
        wrapper_layout.addWidget(self.thumbnail)

        layout.addWidget(self.aspect_wrapper)

        # Title
        title_label = QLabel(str(title))
        title_label.setAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        layout.addWidget(title_label)

        # Duration
        duration_label = QLabel(str(duration))
        duration_label.setAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        duration_label.setStyleSheet("color: gray; font-size: 11px;")
        layout.addWidget(duration_label)

        self.setLayout(layout)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

    def set_thumbnail(self, thumbnail_path: str):
        """Met à jour l'image de la vignette."""
        self._current_thumbnail = thumbnail_path
        if thumbnail_path and os.path.exists(thumbnail_path):
            pixmap = QPixmap(thumbnail_path)
            if not pixmap.isNull():
                self.thumbnail.setPixmap(pixmap)
                return
        self.thumbnail.clear()
        self.thumbnail.setText("Aperçu")

class Grid(QtWidgets.QScrollArea):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWidgetResizable(True)

        self.conteneur = QtWidgets.QWidget()
        self.setWidget(self.conteneur)

        self.layout = QGridLayout()
        self.layout.setSpacing(10)
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.conteneur.setLayout(self.layout)

        self.items = []  # list of GridItem
        self.min_largeur = 300

    def add_item(self, widget: QWidget):
        """Ajoute un GridItem puis réarrange."""
        self.items.append(widget)
        self._arranger()

    def _arranger(self):
        # Nettoyage de la grille
        for i in reversed(range(self.layout.count())):
            w = self.layout.itemAt(i).widget()
            if w:
                self.layout.removeWidget(w)
        # Calcul des colonnes
        largeur = self.viewport().width()
        spacing = self.layout.spacing()
        cols = max(1, int((largeur + spacing) // (self.min_largeur + spacing)))
        item_width = (largeur - (cols - 1) * spacing) / cols
        # Ajout des widgets
        for idx, widget in enumerate(self.items):
            widget.setParent(self.conteneur)
            widget.setFixedWidth(int(item_width))
            widget.setMaximumHeight(16777215)
            row = idx // cols
            col = idx % cols
            self.layout.addWidget(widget, row, col)
        self.layout.setRowStretch(self.layout.rowCount(), 1)
        self.layout.setColumnStretch(cols, 1)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._arranger()
