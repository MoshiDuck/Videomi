from PyQt6.QtCore import Qt
from PyQt6 import QtWidgets, QtCore
from PyQt6.QtWidgets import QSizePolicy
from pages.lecteur.widgets.sous_bar.droite.sous_bar_droite_lect import SousBarDroiteLect
from pages.lecteur.widgets.sous_bar.milieu.sous_bar_milieu_lect import SousBarMilieuLect
from pages.lecteur.widgets.sous_bar.gauche.sous_bar_gauche_lect import SousBarGaucheLect

class SousBarLect(QtWidgets.QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        # 1) Autoriser la fenêtre translucide
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WA_StyledBackground, True)

        # 2) Style CSS : fond 100% transparent ou semi-transparent (ici 50%)
        self.setStyleSheet("""
            background-color: rgba(0, 0, 0, 0);  /* fully transparent */
            /* background-color: rgba(0, 0, 0, 128);  semi-transparent black */
            color: white;
        """)

        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setWindowFlags(
            QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Tool
        )
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents, False)

        self.control_layout = QtWidgets.QHBoxLayout(self)
        self.control_layout.setContentsMargins(10, 0, 10, 0)
        self.control_layout.setSpacing(0)

        # Tes widgets inchangés
        self.sous_bar_gauche = SousBarGaucheLect()
        self.sous_bar_milieu = SousBarMilieuLect()
        self.sous_bar_droite = SousBarDroiteLect()

        # Création de conteneurs temporaires pour gérer la largeur 1/3
        container_gauche = QtWidgets.QWidget()
        layout_gauche = QtWidgets.QHBoxLayout(container_gauche)
        layout_gauche.setContentsMargins(0, 0, 0, 0)
        layout_gauche.addWidget(self.sous_bar_gauche, alignment=Qt.AlignmentFlag.AlignLeft)

        container_milieu = QtWidgets.QWidget()
        layout_milieu = QtWidgets.QHBoxLayout(container_milieu)
        layout_milieu.setContentsMargins(0, 0, 0, 0)
        layout_milieu.addWidget(self.sous_bar_milieu, alignment=Qt.AlignmentFlag.AlignCenter)

        container_droite = QtWidgets.QWidget()
        layout_droite = QtWidgets.QHBoxLayout(container_droite)
        layout_droite.setContentsMargins(0, 0, 0, 0)
        layout_droite.addWidget(self.sous_bar_droite, alignment=Qt.AlignmentFlag.AlignRight)

        # Ajout des containers avec stretch = 1 pour un tiers de largeur chacun
        self.control_layout.addWidget(container_gauche, 1)
        self.control_layout.addWidget(container_milieu, 1)
        self.control_layout.addWidget(container_droite, 1)
