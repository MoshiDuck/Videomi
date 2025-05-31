from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QPixmap, QPainter
from PyQt6.QtWidgets import QLabel, QVBoxLayout

from widgets.defilement_titre import DefilementTitre
from widgets.grid_list.abstract_item import AbstractItem
from config.colors import DARK_CONTAINER


class GridItem(AbstractItem):
    clicked = pyqtSignal(str)

    def __init__(self, title, duration, pixmap: QPixmap = None, chemin: str = None, ratio=16/9):
        self.chemin = chemin
        self._current_pixmap = pixmap
        self.ratio = ratio
        super().__init__(title, duration)

    def _init_ui(self, title, duration):
        layout = QVBoxLayout(self)
        layout.setSpacing(5)
        layout.setContentsMargins(0, 0, 0, 0)

        self.thumbnail = QLabel("Aperçu")
        self.thumbnail.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.thumbnail.setScaledContents(True)
        self.thumbnail.setStyleSheet(f"background-color: {DARK_CONTAINER}; color: #fff;")
        layout.addWidget(self.thumbnail)

        self.title = DefilementTitre(title)
        self.title.setFixedHeight(20)
        layout.addWidget(self.title)

        self.duration = QLabel(duration)
        self.duration.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        self.duration.setStyleSheet("color: gray; font-size: 11px;")
        layout.addWidget(self.duration)

        self._schedule_pixmap_update()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._update_thumbnail_size()
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

    def _update_thumbnail_size(self):
        width = self.thumbnail.width()
        self.thumbnail.setFixedHeight(int(width / self.ratio))

    def _apply_pixmap(self):
        if not self._current_pixmap or self.thumbnail.width() <= 0 or self.thumbnail.height() <= 0:
            return

        target_size = self.thumbnail.size()
        pixmap = self._current_pixmap

        # Ajuster le pixmap à la taille du QLabel tout en conservant le ratio
        scaled = pixmap.scaled(
            target_size,
            Qt.AspectRatioMode.KeepAspectRatio,
            Qt.TransformationMode.SmoothTransformation
        )

        # Créer un nouveau pixmap avec la taille cible et fond noir (ou transparent si tu veux)
        final_pixmap = QPixmap(target_size)
        final_pixmap.fill(Qt.GlobalColor.black)  # ou Qt.transparent

        # Peindre le pixmap centré dans le QLabel
        painter = QPainter(final_pixmap)
        x = (target_size.width() - scaled.width()) // 2
        y = (target_size.height() - scaled.height()) // 2
        painter.drawPixmap(x, y, scaled)
        painter.end()

        self.thumbnail.setPixmap(final_pixmap)
