from PyQt6.QtWidgets import QSizePolicy
from PyQt6.QtCore import Qt
from pages.navigateur.widgets.sous_bar.droite.sous_bar_droite_nav import SousBarDroiteNav
from pages.navigateur.widgets.sous_bar.gauche.sous_bar_gauche_nav import SousBarGaucheNav
from widgets.row_widget import Row

class SousBarNav(Row):
    def __init__(self, parent=None):
        super().__init__(parent=parent)
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)  # largeur flexible, hauteur fixe
        self.setFixedHeight(40)

        self.sous_bar_gauche = SousBarGaucheNav()
        self.sous_bar_droite = SousBarDroiteNav()

        self.add_widget(self.sous_bar_gauche)
        self.add_widget(self.sous_bar_droite)

