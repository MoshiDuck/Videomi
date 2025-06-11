from PyQt6 import QtWidgets, QtCore
from PyQt6.QtCore import Qt, QSize
from PyQt6.QtWidgets import QSizePolicy, QLabel

from pages.lecteur.widgets.sous_bar.droite.volume_slider import VolumeSlider
from widgets.icon_perso import IconPerso


class SousBarDroiteLect(QtWidgets.QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setFixedHeight(40)
        self.setWindowFlags(QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Tool)
        self.control_layout = QtWidgets.QHBoxLayout(self)
        self.control_layout.setContentsMargins(0, 0, 0, 0)
        self.control_layout.setSpacing(10)

        height = self.height()
        middle_size = QSize(int(height * 0.7), int(height * 0.7))

        self.volume = IconPerso(
            initial_state=True,
            icon_true_name='mdi.volume-high',
            icon_false_name='mdi.volume-mute',
            icon_size=middle_size,
        )
        self.volume_slider = VolumeSlider(self)
        self.volume_label = QLabel("100%")  # Valeur initiale
        self.volume_label.setFixedWidth(50)
        self.volume_label.setStyleSheet("color: white; font-size: 18px;")

        self.control_layout.addWidget(self.volume)
        self.control_layout.addWidget(self.volume_slider)
        self.control_layout.addWidget(self.volume_label)
