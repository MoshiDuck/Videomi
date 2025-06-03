from PyQt6.QtWidgets import QWidget, QHBoxLayout, QSizePolicy
from PyQt6.QtCore import Qt
from widgets.icon_perso import IconPerso


class ContainerBarDroite(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)

        # Forcer hauteur similaire à la barre nav principale
        self.setFixedHeight(40)
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Expanding)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(5)
        layout.setAlignment(Qt.AlignVCenter)

        self.icon_search = IconPerso(icon_only_name='mdi.magnify')

        layout.addWidget(self.icon_search)

