
from pages.lecteur.widgets.bar.droite.container_bar_droite_lect import ContainerBarDroiteLect
from pages.lecteur.widgets.bar.gauche.container_bar_gauche_lect import ContainerBarGaucheLect
from pages.lecteur.widgets.bar.milieu.container_bar_milieu_lect import ContainerBarMilieuLect
from widgets.row_widget import Row
from PyQt6.QtCore import Qt
from PyQt6 import QtWidgets, QtCore
from PyQt6.QtWidgets import QSizePolicy


class BarLect(Row):
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
        self.setFixedHeight(40)
        self.setWindowFlags(
            QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Tool
        )
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents, False)

        self.control_layout = QtWidgets.QHBoxLayout(self)
        self.control_layout.setContentsMargins(10, 0, 10, 0)
        self.control_layout.setSpacing(0)

        self.container_gauche = ContainerBarGaucheLect()
        self.container_milieu = ContainerBarMilieuLect()
        self.container_droite = ContainerBarDroiteLect()

        self.add_widget(self.container_gauche)
        self.add_widget(self.container_milieu)
        self.add_widget(self.container_droite)
