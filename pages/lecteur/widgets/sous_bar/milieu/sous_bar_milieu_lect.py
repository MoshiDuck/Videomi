from PyQt6 import QtWidgets, QtCore
from PyQt6.QtCore import Qt, QSize
from PyQt6.QtWidgets import QSizePolicy
from widgets.icon_perso import IconPerso


class SousBarMilieuLect(QtWidgets.QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setFixedHeight(40)
        self.setWindowFlags(
            QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Tool
        )

        self.control_layout = QtWidgets.QHBoxLayout(self)
        self.control_layout.setContentsMargins(0, 0, 0, 0)
        self.control_layout.setSpacing(30)
        self.control_layout.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)

        bar_height = self.height()
        # Icônes petites pour rewind/forward
        small_icon_size = QSize(int(bar_height * 0.5), int(bar_height * 0.5))
        # Icône grande pour play/pause
        large_icon_size = QSize(int(bar_height * 1), int(bar_height * 1))

        self.rewind_icon = IconPerso(icon_only_name='mdi.rewind-10', icon_size=small_icon_size)
        self.control_layout.addWidget(self.rewind_icon)

        self.play_pause_icon = IconPerso(icon_true_name='fa5s.play-circle', icon_false_name='fa5s.pause-circle',
                                         icon_size=large_icon_size)
        self.control_layout.addWidget(self.play_pause_icon)

        self.forward_icon = IconPerso(icon_only_name='mdi.fast-forward-10', icon_size=small_icon_size)
        self.control_layout.addWidget(self.forward_icon)