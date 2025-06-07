import os
from PyQt6.QtCore import QSize, Qt
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import QWidget, QLabel


class MiniatureLect(QWidget):
    def __init__(self, width=300, parent=None):
        super().__init__(parent)
        # Assurer que width est un entier
        self.width_ = int(width)
        # Calculer la hauteur pour ratio 16:9
        self.height_ = int((9 / 16) * self.width_)
        self.image_path = None

        # Fixer la taille avec des entiers
        self.setFixedSize(self.width_, self.height_)

        # Label pour afficher la miniature
        self.label = QLabel(self)
        self.label.setFixedSize(self.width_, self.height_)
        self.label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self._current_pixmap = None
        self._apply_pixmap()

    def set_image_path(self, path):
        self.image_path = path
        if path and os.path.exists(path):
            pixmap = QPixmap(path)
            self._current_pixmap = pixmap if not pixmap.isNull() else None
        else:
            self._current_pixmap = None
        self._apply_pixmap()

    def _apply_pixmap(self):
        if not self._current_pixmap:
            return

        target_size = self.label.size()
        pixmap = self._current_pixmap

        # Scale en remplissant la zone (garantir ratio 16:9)
        scaled = pixmap.scaled(
            target_size,
            Qt.AspectRatioMode.KeepAspectRatioByExpanding,
            Qt.TransformationMode.SmoothTransformation
        )

        # Découper le pixmap centrée
        x = (scaled.width() - target_size.width()) // 2
        y = (scaled.height() - target_size.height()) // 2
        cropped = scaled.copy(x, y, target_size.width(), target_size.height())

        self.label.setPixmap(cropped)
