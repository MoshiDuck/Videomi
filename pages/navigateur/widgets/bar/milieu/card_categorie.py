from PyQt6.QtCore import QSize, Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QWidget,
    QSizePolicy,
    QHBoxLayout,
    QVBoxLayout,
    QPushButton,
    QButtonGroup,
    QFrame,
    QLabel
)
import qtawesome as qta

from config.colors import DARK_ICON, DARK_BAR, PRIMARY_COLOR

class CardCategorie(QWidget):
    state_changed = pyqtSignal(bool)

    def __init__(self):
        super().__init__()
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        self.setFixedHeight(40)
        self.setStyleSheet(f"""
            background-color: {DARK_BAR};
            border-bottom-left-radius: 20px;
            border-bottom-right-radius: 20px;
        """)

        self.card_data = {
            True: self._create_card("mdi.filmstrip", "Vidéos"),
            False: self._create_card("fa5s.music", "Musiques")
        }

        self.button_group = QButtonGroup(self)
        self.button_group.setExclusive(True)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(50)

        for is_videos, card in self.card_data.items():
            layout.addWidget(card["container"])
            self.button_group.addButton(card["button"])

        self.card_data[True]["button"].setChecked(True)
        self._apply_style()

        self.button_group.buttonToggled.connect(self._on_button_toggled)

    def _create_card(self, icon_name: str, label: str) -> dict:
        container = QWidget()
        container.setFixedWidth(120)
        container.setSizePolicy(QSizePolicy.Fixed, QSizePolicy.Expanding)

        vbox = QVBoxLayout(container)
        vbox.setContentsMargins(0, 0, 0, 0)
        vbox.setSpacing(0)

        button = QPushButton()
        button.setCheckable(True)
        button.setFixedHeight(40)
        button.setStyleSheet("border: none;")
        button.setLayout(self._create_button_layout(icon_name, label))

        line = QFrame()
        line.setFixedHeight(2)
        line.setStyleSheet("background-color: orange;")
        line.setVisible(False)

        vbox.addWidget(button)
        vbox.addWidget(line)

        return {
            "container": container,
            "button": button,
            "line": line,
            "icon_label": button.layout().itemAt(0).widget(),
            "icon_name": icon_name
        }

    @staticmethod
    def _create_button_layout(icon_name: str, text: str) -> QHBoxLayout:
        hbox = QHBoxLayout()
        hbox.setContentsMargins(0, 0, 0, 0)
        hbox.setSpacing(8)
        hbox.setAlignment(Qt.AlignmentFlag.AlignCenter)

        icon_label = QLabel()
        icon_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_label.setPixmap(qta.icon(icon_name, color=DARK_ICON).pixmap(QSize(24, 24)))

        text_label = QLabel(text)
        text_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        text_label.setStyleSheet("color: white; font-size: 16px;")

        hbox.addWidget(icon_label)
        hbox.addWidget(text_label)
        return hbox

    def _on_button_toggled(self, button: QPushButton, checked: bool):
        if checked:
            self._apply_style()
            self.state_changed.emit(button == self.card_data[True]["button"])

    def _apply_style(self):
        for is_videos, card in self.card_data.items():
            active = card["button"].isChecked()
            card["line"].setVisible(active)
            color = PRIMARY_COLOR if active else DARK_ICON
            icon = qta.icon(card["icon_name"], color=color)
            card["icon_label"].setPixmap(icon.pixmap(QSize(24, 24)))
