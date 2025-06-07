from PyQt6 import QtWidgets, QtCore
from PyQt6.QtCore import Qt, QSize
from PyQt6.QtWidgets import QSizePolicy

from config.colors import WHITE_ICON, DARK_ICON
from widgets.icon_perso import IconPerso

class SousBarMilieuLect(QtWidgets.QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setFixedHeight(60)
        self.setWindowFlags(QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Tool)
        self.control_layout = QtWidgets.QHBoxLayout(self)
        self.control_layout.setContentsMargins(0, 0, 0, 0)
        self.control_layout.setSpacing(30)

        height = self.height()

        small_size = QSize(int(height * 0.5), int(height * 0.5))
        large_size = QSize(int(height * 1), int(height * 1))

        self.rewind_icon = IconPerso(
            icon_only_name='mdi.rewind-10',
            icon_size=small_size,
            color_2=DARK_ICON,
        )
        self.play_pause_icon = IconPerso(
            icon_true_name='fa5s.play-circle',
            icon_false_name='fa5s.pause-circle',
            icon_size=large_size,
        )
        self.forward_icon = IconPerso(
            icon_only_name='mdi.fast-forward-10',
            icon_size=small_size,
            color_2=DARK_ICON,
        )

        self.control_layout.addWidget(self.rewind_icon)
        self.control_layout.addWidget(self.play_pause_icon)
        self.control_layout.addWidget(self.forward_icon)