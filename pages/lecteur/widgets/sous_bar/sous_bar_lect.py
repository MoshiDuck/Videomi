from PyQt6.QtCore import Qt
from PyQt6 import QtWidgets, QtCore
from PyQt6.QtWidgets import QSizePolicy
from pages.lecteur.widgets.sous_bar.droite.sous_bar_droite_lect import SousBarDroiteLect
from pages.lecteur.widgets.sous_bar.milieu.sous_bar_milieu_lect import SousBarMilieuLect
from pages.lecteur.widgets.sous_bar.gauche.sous_bar_gauche_lect import SousBarGaucheLect

class SousBarLect(QtWidgets.QWidget):
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

        self.sous_bar_gauche = SousBarGaucheLect()
        self.sous_bar_milieu = SousBarMilieuLect()
        self.sous_bar_droite = SousBarDroiteLect()

        self.control_layout.addWidget(self.sous_bar_gauche)
        self.control_layout.addWidget(self.sous_bar_milieu)
        self.control_layout.addWidget(self.sous_bar_droite)
