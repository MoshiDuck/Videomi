from PyQt6 import QtWidgets, QtCore
from PyQt6.QtCore import Qt, QSize
from PyQt6.QtWidgets import QSizePolicy
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
        self.control_layout.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)

        height = self.height()
        middle_size = QSize(int(height * 0.7), int(height * 0.7))

        self.volume = IconPerso(
            initial_state=True,
            icon_true_name='mdi.volume-high',
            icon_false_name='mdi.volume-mute',
            icon_size=middle_size,
        )
        self.control_layout.addWidget(self.volume)

        # === SLIDER DE VOLUME ===
        self.volume_slider = QtWidgets.QSlider(Qt.Orientation.Horizontal)
        self.volume_slider.setRange(0, 150)
        self.volume_slider.setValue(100)
        self.volume_slider.setFixedWidth(100)
        self.volume_slider.setToolTip("Volume")
        self.control_layout.addWidget(self.volume_slider)
