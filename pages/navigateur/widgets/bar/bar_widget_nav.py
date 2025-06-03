from PyQt6.QtWidgets import QSizePolicy
from PyQt6.QtCore import Qt
from config.colors import DARK_BAR
from pages.navigateur.widgets.bar.droite.container_bar_droite import ContainerBarDroite
from pages.navigateur.widgets.bar.milieu.container_bar_milieu import ContainerBarMilieu

#Spacer
from pages.navigateur.widgets.bar.gauche.container_bar_gauche import ContainerBarGauche
from widgets.row_widget import Row


class BarWidgetNav(Row):
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

        self.container_gauche = ContainerBarGauche()
        self.container_milieu = ContainerBarMilieu()
        self.container_droite = ContainerBarDroite()

        self.add_widget(self.container_gauche)
        self.add_widget(self.container_milieu)
        self.add_widget(self.container_droite)
