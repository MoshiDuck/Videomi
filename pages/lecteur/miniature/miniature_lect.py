import os
from PyQt6.QtCore import Qt, QSize
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import QWidget, QLabel, QVBoxLayout

class MiniatureLect(QWidget):
    def __init__(self, width=300, parent=None):
        super().__init__(parent)

        # Petite fenêtre sans bord, en mode Tool, fond transparent
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WidgetAttribute.WA_NoSystemBackground, True)

        # Dimensions image + zone texte
        self.width_ = int(width)
        self.height_ = int((9 / 16) * self.width_)
        # On ajoute 20px pour le label de temps
        self.setFixedSize(self.width_, self.height_ + 20)

        # Disposition verticale : image puis le temps
        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(2)

        # Label pour la miniature
        self.label = QLabel(self)
        self.label.setFixedSize(self.width_, self.height_)
        self.label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.label.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.layout.addWidget(self.label)

        # Label pour le temps sous la miniature
        self.time_label = QLabel(self)
        self.time_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.time_label.setFixedHeight(18)
        self.time_label.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.time_label.setStyleSheet("color: white; background: transparent;")
        self.layout.addWidget(self.time_label)

        self._current_pixmap = None

    def set_image_path(self, path: str):
        """Définit la miniature à partir d'un fichier image."""
        if path and os.path.exists(path):
            pixmap = QPixmap(path)
            self._current_pixmap = pixmap if not pixmap.isNull() else None
        else:
            self._current_pixmap = None
        self._apply_pixmap()

    def set_time(self, time_str: str):
        """Affiche le temps sous la miniature."""
        self.time_label.setText(time_str)

    def _apply_pixmap(self):
        """Redimensionne et centre le pixmap dans le label."""
        if not self._current_pixmap:
            self.label.clear()
            return

        target_size = self.label.size()
        scaled = self._current_pixmap.scaled(
            target_size,
            Qt.AspectRatioMode.KeepAspectRatioByExpanding,
            Qt.TransformationMode.SmoothTransformation
        )
        x = (scaled.width() - target_size.width()) // 2
        y = (scaled.height() - target_size.height()) // 2
        cropped = scaled.copy(x, y, target_size.width(), target_size.height())
        self.label.setPixmap(cropped)
