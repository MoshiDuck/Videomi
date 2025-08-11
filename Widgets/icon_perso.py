from PyQt6.QtCore import QSize, Qt, pyqtSignal, QTimer
from PyQt6.QtWidgets import QPushButton, QHBoxLayout, QLabel
import qtawesome as qta


class IconPerso(QPushButton):
    state_changed = pyqtSignal(bool)

    def __init__(
        self,
        initial_state: bool = False,
        icon_only_name: str = "",
        icon_true_name: str = "",
        icon_false_name: str = "",
        color = "white",
        color_2 = "orange",
        icon_size: QSize = QSize(32, 32),
        parent=None,
        flash_color: bool = False,
        flash_duration_ms: int = 200
    ):
        super().__init__(parent)
        self.icon_only = icon_only_name
        self.state = initial_state
        self.color = color
        self.color_2 = color_2
        self.icon_size = icon_size
        self.flash_color = flash_color
        self.flash_duration_ms = flash_duration_ms

        self.setStyleSheet("background-color: transparent; border: none;")
        self.setFixedSize(self.icon_size)
        self.setCheckable(True)
        self.setChecked(self.state)
        self.setIconSize(self.icon_size)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        self.icon_label = QLabel(self)
        layout.addWidget(self.icon_label)

        if self.icon_only:
            self.icon_name = self.icon_only
        else:
            self.icon_name = ""
            self.icon_true = qta.icon(icon_true_name, color=self.color)
            self.icon_false = qta.icon(icon_false_name, color=self.color)

        # Timer pour remettre la couleur initiale après flash
        self._flash_timer = QTimer(self)
        self._flash_timer.setSingleShot(True)
        self._flash_timer.timeout.connect(self._end_flash)

        self.update_icon()
        self.clicked.connect(self.toggle_state)

    def get_icon(self, active: bool = False):
        color = self.color_2 if active else self.color
        return qta.icon(self.icon_name, color=color)

    def toggle_state(self):
        # Si flash_color activé et icone only, flash la couleur 2 puis revient à la 1
        if self.flash_color and self.icon_only:
            self._flash_timer.start(self.flash_duration_ms)
            # On affiche la couleur 2 immédiatement
            icon = qta.icon(self.icon_name, color=self.color_2)
            self.icon_label.setPixmap(icon.pixmap(self.icon_size))
            # Ne change pas l'état tout de suite (tu peux adapter selon ton besoin)
        else:
            self.set_state(not self.state)

    def _end_flash(self):
        # Remet la couleur initiale (couleur 1) après flash
        icon = qta.icon(self.icon_name, color=self.color)
        self.icon_label.setPixmap(icon.pixmap(self.icon_size))

    def update_icon(self):
        if self.icon_only:
            color_choose = self.color_2 if self.state else self.color
            icon = qta.icon(self.icon_name, color=color_choose)
        else:
            icon = self.icon_true if self.state else self.icon_false

        self.icon_label.setPixmap(icon.pixmap(self.icon_size))

    def get_state(self) -> bool:
        return self.state

    def set_state(self, state: bool):
        self.state = state
        self.setChecked(state)
        self.update_icon()
        self.state_changed.emit(state)
