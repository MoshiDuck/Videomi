from PyQt6.QtCore import QSize, pyqtSignal, QTimer
from PyQt6.QtGui import QIcon
from PyQt6.QtWidgets import QPushButton, QHBoxLayout, QLabel
import qtawesome as qta
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

class IconPerso(QPushButton):
    state_changed = pyqtSignal(bool)

    def __init__(
        self,
        initial_state: bool = False,
        icon_only_name: str = "",
        icon_true_name: str = "",
        icon_false_name: str = "",
        color="white",
        color_2="orange",
        icon_size: QSize = QSize(32, 32),
        parent=None,
        flash_color: bool = False,
        flash_duration_ms: int = 200
    ):
        super().__init__(parent)
        self.icon_only_name = icon_only_name
        self.icon_true_name = icon_true_name
        self.icon_false_name = icon_false_name
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

        self._flash_timer = QTimer(self)
        self._flash_timer.setSingleShot(True)
        self._flash_timer.timeout.connect(self._end_flash)

        # Création sécurisée des icônes après init complet
        QTimer.singleShot(0, self._create_icons)

        self.clicked.connect(self.toggle_state)

    def get_icon(self, active: bool = False):
        if self.icon_only_name:  # <- utiliser le bon attribut
            color = self.color_2 if active else self.color
            return qta.icon(self.icon_only_name, color=color)
        elif hasattr(self, "icon_true") and hasattr(self, "icon_false"):
            return self.icon_true if active else self.icon_false
        else:
            return QIcon()

    def _create_icons(self):
        try:
            if self.icon_only_name:
                self.icon_name = self.icon_only_name
            else:
                self.icon_true = qta.icon(self.icon_true_name, color=self.color) if self.icon_true_name else None
                self.icon_false = qta.icon(self.icon_false_name, color=self.color) if self.icon_false_name else None
            self.update_icon()
        except Exception as e:
            logger.error(f"Erreur création icône qtawesome : {e}")

    def toggle_state(self):
        if self.flash_color and self.icon_only_name:
            self._flash_timer.start(self.flash_duration_ms)
            try:
                icon = qta.icon(self.icon_name, color=self.color_2)
                self.icon_label.setPixmap(icon.pixmap(self.icon_size))
            except Exception as e:
                logger.error(f"Erreur flash icon_only: {e}")
        else:
            self.set_state(not self.state)

    def _end_flash(self):
        try:
            icon = qta.icon(self.icon_name, color=self.color)
            self.icon_label.setPixmap(icon.pixmap(self.icon_size))
        except Exception as e:
            logger.error(f"Erreur fin flash icon_only: {e}")

    def update_icon(self):
        try:
            if hasattr(self, "icon_name") and self.icon_only_name:
                color_choose = self.color_2 if self.state else self.color
                icon = qta.icon(self.icon_name, color=color_choose)
            else:
                icon = self.icon_true if self.state else self.icon_false
            if icon:
                self.icon_label.setPixmap(icon.pixmap(self.icon_size))
        except Exception as e:
            logger.error(f"Erreur update_icon: {e}")

    def get_state(self) -> bool:
        return self.state


    def set_state(self, state: bool):
        self.state = state
        self.setChecked(state)
        self.update_icon()
        self.state_changed.emit(state)
