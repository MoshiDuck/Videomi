# publication.py
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QWidget, QHBoxLayout, QLabel

class Publication(QWidget):
    def __init__(self):
        super().__init__()

        # Création du layout horizontal
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Ajout d'un texte explicatif
        label = QLabel("Bienvenue dans la publication !", self)
        label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(label)
