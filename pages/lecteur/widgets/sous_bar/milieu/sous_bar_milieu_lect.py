from PyQt6 import QtWidgets, QtCore, QtGui
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QKeySequence, QCursor, QShortcut
from PyQt6.QtWidgets import QMessageBox, QSizePolicy
import qtawesome as qta

from widgets.row_widget import Row

STYLE_PLAY_BUTTON = """
    QPushButton {
        background-color: white;
        border-radius: 24px;
        padding: 8px;
    }
    QPushButton:hover {
        background-color: #dddddd;
    }
"""


class SousBarMilieuLect(QtWidgets.QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setFixedHeight(40)
        self.setWindowFlags(
            QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Tool
        )
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents)

        self.control_layout = QtWidgets.QHBoxLayout(self)
        self.control_layout.setContentsMargins(10, 0, 10, 0)
        self.control_layout.setSpacing(30)
        self.control_layout.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)

        # Bouton Reculer
        self.rewind_btn = QtWidgets.QPushButton(self)
        self.rewind_btn.setIcon(qta.icon('fa5s.backward', color='white'))  # fa5s = FontAwesome 5 solid
        self.rewind_btn.setToolTip("Reculer de 10 s")
        self.rewind_btn.setStyleSheet("""
            QPushButton {
                border: none;
                background: transparent;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 0.15);
            }
        """)
        self.control_layout.addWidget(self.rewind_btn)

        self.play_pause_btn = QtWidgets.QPushButton()
        # Bouton Play/Pause
        self.play_pause_btn.setIcon(qta.icon('fa5s.play', color='black'))
        self.play_pause_btn.setToolTip("Play/Pause")
        self.play_pause_btn.setFixedSize(38, 38)
        self.play_pause_btn.setStyleSheet(STYLE_PLAY_BUTTON)
        self.control_layout.addWidget(self.play_pause_btn)

        # Bouton Avancer
        self.forward_btn = QtWidgets.QPushButton(self)
        self.forward_btn.setIcon(qta.icon('fa5s.forward', color='white'))
        self.forward_btn.setToolTip("Avancer de 10 s")
        self.forward_btn.setStyleSheet("""
            QPushButton {
                border: none;
                background: transparent;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 0.15);
            }
        """)
        self.control_layout.addWidget(self.forward_btn)