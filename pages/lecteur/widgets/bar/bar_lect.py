from PyQt6.QtWidgets import QSizePolicy
from PyQt6.QtCore import Qt
from config.colors import DARK_BAR
from pages.lecteur.widgets.bar.droite.container_bar_droite_lect import ContainerBarDroiteLect
from pages.lecteur.widgets.bar.gauche.container_bar_gauche_lect import ContainerBarGaucheLect
from pages.lecteur.widgets.bar.milieu.container_bar_milieu_lect import ContainerBarMilieuLect
from widgets.row_widget import Row


class BarLect(Row):
    def __init__(self, parent=None):
        super().__init__(parent=parent, space_between=True, margins=(10, 0, 10, 0))
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        self.setStyleSheet(f"""
            background-color: {DARK_BAR};
            border-bottom-left-radius: 20px;
            border-bottom-right-radius: 20px;
        """)
        self.setFixedHeight(40)

        self.container_gauche = ContainerBarGaucheLect()
        self.container_milieu = ContainerBarMilieuLect()
        self.container_droite = ContainerBarDroiteLect()

        self.add_widget(self.container_gauche)
        self.add_widget(self.container_milieu)
        self.add_widget(self.container_droite)
