from PyQt6.QtWidgets import QSizePolicy
from PyQt6.QtCore import Qt
from config.colors import DARK_BAR
from pages.navigateur.widgets.bar.droite.container_bar_droite_nav import ContainerBarDroiteNav
from pages.navigateur.widgets.bar.milieu.container_bar_milieu_nav import ContainerBarMilieuNav
from pages.navigateur.widgets.bar.gauche.container_bar_gauche_nav import ContainerBarGaucheNav
from widgets.row_widget import Row


class BarNav(Row):
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

        self.container_gauche = ContainerBarGaucheNav()
        self.container_milieu = ContainerBarMilieuNav()
        self.container_droite = ContainerBarDroiteNav()

        self.add_widget(self.container_gauche)
        self.add_widget(self.container_milieu)
        self.add_widget(self.container_droite)
