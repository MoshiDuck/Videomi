from PyQt6.QtCore import QSize, Qt, pyqtSignal
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
        parent=None
    ):
        super().__init__(parent)
        self.icon_only = icon_only_name
        self.state = initial_state
        self.color = color
        self.color_2 = color_2
        self.icon_size = icon_size

        # Style et taille du bouton
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
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

        self.update_icon()
        self.clicked.connect(self.toggle_state)

    def get_icon(self, active: bool = False):
        color = self.color_2 if active else self.color
        return qta.icon(self.icon_name, color=color)

    def toggle_state(self):
        self.set_state(not self.state)

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
