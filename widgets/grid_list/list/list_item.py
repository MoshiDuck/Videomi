# widgets/grid_list/list/list_item.py
# -*- coding: utf-8 -*-
from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QPixmap, QPainter
from PyQt6.QtWidgets import QWidget, QHBoxLayout, QLabel, QSizePolicy

from config.colors import DARK_CONTAINER


class ListItem(QWidget):
    """
    Un ListItem simple :
    - Vignette 16:9 fixe (160×90) à gauche
    - Titre au centre (expand pour prendre l’espace disponible)
    - Durée toujours collée au bord droit
    Le ListItem lui-même est en QSizePolicy.Expanding horizontalement,
    pour occuper toute la largeur parent.
    """
    clicked = pyqtSignal(str)

    def __init__(
        self,
        title: str,
        duration: str,
        pixmap: QPixmap = None,
        chemin: str = None,
        ratio: float = 16 / 9
    ):
        super().__init__()
        self.chemin = chemin
        self._current_pixmap = pixmap
        self.ratio = ratio

        # → Modifier la QSizePolicy : Expanding horizontal, Fixed vertical
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

        # Construire la disposition interne (vignette | titre | durée)
        self._init_ui(title, duration)

    def _init_ui(self, title: str, duration: str):
        layout = QHBoxLayout(self)
        layout.setSpacing(15)
        layout.setContentsMargins(5, 5, 5, 5)

        # 1) Vignette fixe 160×(160/ratio)
        self.thumbnail = QLabel()
        self.thumbnail.setFixedSize(160, int(160 / self.ratio))
        self.thumbnail.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.thumbnail.setStyleSheet(f"background-color: {DARK_CONTAINER}; color: #fff;")
        self.thumbnail.setScaledContents(True)
        layout.addWidget(self.thumbnail)

        # 2) Titre (Expanding pour prendre l’espace restant)
        self.title = QLabel(title)
        self.title.setStyleSheet("font-size: 16px;")
        self.title.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        self.title.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        layout.addWidget(self.title, 1)

        # 3) Durée (Minimum pour rester juste à droite)
        self.duration = QLabel(duration)
        self.duration.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        self.duration.setStyleSheet("color: gray; font-size: 11px;")
        self.duration.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        layout.addWidget(self.duration)

        self._schedule_pixmap_update()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        # On ne redimensionne pas la vignette (elle reste fixe 160×90),
        # mais on rafraîchit le pixmap pour garder KeepAspectRatio.
        self._schedule_pixmap_update()

    def showEvent(self, event):
        super().showEvent(event)
        self._schedule_pixmap_update()

    def mousePressEvent(self, ev):
        if self.chemin:
            self.clicked.emit(self.chemin)
        super().mousePressEvent(ev)

    def setThumbnailPixmap(self, pixmap: QPixmap):
        self._current_pixmap = pixmap
        self._schedule_pixmap_update()

    def _schedule_pixmap_update(self):
        if self._current_pixmap:
            QTimer.singleShot(0, self._apply_pixmap)

    def _apply_pixmap(self):
        if not self._current_pixmap:
            return

        target_size = self.thumbnail.size()
        pixmap = self._current_pixmap

        scaled = pixmap.scaled(
            target_size,
            Qt.AspectRatioMode.KeepAspectRatio,
            Qt.TransformationMode.SmoothTransformation
        )

        final_pixmap = QPixmap(target_size)
        final_pixmap.fill(Qt.GlobalColor.black)

        painter = QPainter(final_pixmap)
        x = (target_size.width() - scaled.width()) // 2
        y = (target_size.height() - scaled.height()) // 2
        painter.drawPixmap(x, y, scaled)
        painter.end()

        self.thumbnail.setPixmap(final_pixmap)
