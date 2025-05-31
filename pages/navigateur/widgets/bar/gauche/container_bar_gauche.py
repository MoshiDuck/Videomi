from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QWidget, QHBoxLayout, QSizePolicy
from widgets.icon_perso import IconPerso

class ContainerBarGauche(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Expanding)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        self.icon_toggle = IconPerso(icon_true_name='mdi.view-grid-outline', icon_false_name='mdi.format-list-bulleted')
        self.sortAZ_toggle = IconPerso(icon_true_name='mdi.sort-alphabetical-ascending', icon_false_name='mdi.sort-alphabetical-descending')
        self.sortTime_toggle = IconPerso(icon_true_name='mdi.sort-clock-ascending', icon_false_name='mdi.sort-clock-descending')

        # Ajoute les boutons au layout
        layout.addWidget(self.icon_toggle)
        layout.addWidget(self.sortAZ_toggle)
        layout.addWidget(self.sortTime_toggle)
