from PyQt6.QtWidgets import QSizePolicy
from PyQt6.QtCore import Qt
from pages.navigateur.widgets.sous_bar.sous_bar_droite.sous_bar_droite_widget_nav import SousBarDroiteWidgetNav
from pages.navigateur.widgets.sous_bar.sous_bar_gauche.sous_bar_gauche_widget_nav import SousBarGaucheWidgetNav
from widgets.row_widget import Row

class SousBarWidgetNav(Row):
    def __init__(self, parent=None):
        super().__init__(parent=parent)
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)  # largeur flexible, hauteur fixe
        self.setFixedHeight(40)

        self.sous_bar_gauche = SousBarGaucheWidgetNav()
        self.sous_bar_droite = SousBarDroiteWidgetNav()

        self.add_widget(self.sous_bar_gauche)
        self.add_widget(self.sous_bar_droite)

