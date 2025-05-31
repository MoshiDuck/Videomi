# icon_perso.py

from PyQt6.QtCore import QSize, Qt, pyqtSignal
from PyQt6.QtWidgets import QPushButton, QHBoxLayout, QLabel
import qtawesome as qta

from config.colors import DARK_ICON, PRIMARY_COLOR

class IconPerso(QPushButton):
    """
    Un QPushButton personnalisable qui émet un signal booléen à chaque changement d’état.
    """
    state_changed = pyqtSignal(bool)

    def __init__(
        self,
        initial_state: bool = False,
        icon_only_name: str = "",
        icon_true_name: str = "",
        icon_false_name: str = "",
        parent=None
    ):
        super().__init__(parent)
        self.icon_only = icon_only_name
        self.state = initial_state

        # Style et taille du bouton
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.setStyleSheet("border: none;")
        self.setFixedSize(32, 32)
        self.setCheckable(True)
        self.setChecked(self.state)
        self.setIconSize(QSize(32, 32))

        # Conteneur pour l’icône
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        self.icon_label = QLabel(self)
        layout.addWidget(self.icon_label)

        # Préparation des icônes selon le mode
        if self.icon_only:
            self.icon_name = self.icon_only
        else:
            self.icon_true = qta.icon(icon_true_name, color=DARK_ICON)
            self.icon_false = qta.icon(icon_false_name, color=DARK_ICON)

        # Initialisation de l’affichage
        self.update_icon()
        self.clicked.connect(self.toggle_state)

    def toggle_state(self):
        """Inverse l’état et notifie les abonnés."""
        self.set_state(not self.state)

    def update_icon(self):
        """Affiche l’icône correspondant à l’état courant."""
        if self.icon_only:
            color = PRIMARY_COLOR if self.state else DARK_ICON
            icon = qta.icon(self.icon_name, color=color)
        else:
            icon = self.icon_true if self.state else self.icon_false

        self.icon_label.setPixmap(icon.pixmap(self.iconSize()))

    def get_state(self) -> bool:
        return self.state

    def set_state(self, state: bool):
        """
        Met à jour l’état interne, l’aspect du bouton, puis émet le signal.
        """
        self.state = state
        self.setChecked(state)
        self.update_icon()
        self.state_changed.emit(state)
