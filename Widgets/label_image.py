#label_image.py

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import QLabel


class LabelImage(QLabel):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._pixmap = None
        self.current_url = None
        self.setAlignment(Qt.AlignmentFlag.AlignHCenter | Qt.AlignmentFlag.AlignTop)
        self.setScaledContents(False)

    def set_current_url(self, url):
        self.current_url = url
        if url:
            self.setText("Chargement...")
            self._pixmap = None
            super().setPixmap(QPixmap())  # Effacer l'image précédente
        else:
            self.setText("Aucune image")
            self._pixmap = None

    def setPixmap(self, pixmap: QPixmap):
        self._pixmap = pixmap
        self._update_pixmap()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._update_pixmap()

    def _update_pixmap(self):
        if self._pixmap and self.width() > 0:
            scaled = self._pixmap.scaledToWidth(
                self.width(),
                Qt.TransformationMode.SmoothTransformation
            )
            super().setPixmap(scaled)