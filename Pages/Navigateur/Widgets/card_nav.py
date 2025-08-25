from PyQt6.QtGui import QFontMetrics
from PyQt6.QtWidgets import QWidget, QHBoxLayout, QPushButton, QSizePolicy
from PyQt6.QtCore import Qt, QSize, pyqtSignal

from Widgets.icon_perso import IconPerso

class CardNav(QWidget):
    selection_changed = pyqtSignal(str)
    def __init__(self, items: list[tuple[str, str]], bool_sec = False, parent=None):
        super().__init__(parent)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

        self.bool_sec = bool_sec

        self.layout = QHBoxLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(0)
        self.layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self._buttons: dict[str, QPushButton] = {}
        self._icons: dict[str, IconPerso] = {}
        self.set_items(items)

    def set_items(self, items: list[tuple[str, str]]):
        for i in reversed(range(self.layout.count())):
            w = self.layout.itemAt(i).widget()
            if w:
                w.setParent(None)
        self._buttons.clear()
        self._icons.clear()

        font_metrics = QFontMetrics(self.font())
        max_width = 0
        for label, _ in items:
            text_width = font_metrics.horizontalAdvance(label)
            max_width = max(max_width, text_width)

        total_width = max_width + 80

        for idx, (label, icon_name) in enumerate(items):
            if self.bool_sec is False:
                icon = IconPerso(icon_only_name=icon_name)
            else:
                icon = IconPerso(icon_only_name=icon_name, color_2="#ffdd57")

            btn = QPushButton(label)
            if self.bool_sec is False :
                btn.setObjectName("card_nav_btn")
            else :
                btn.setObjectName("card_sec_nav_btn")
            btn.setCheckable(True)
            btn.clicked.connect(self._on_button_clicked)

            btn.setIcon(icon.get_icon(active=(idx == 0)))
            btn.setIconSize(QSize(32, 32))
            btn.setFixedWidth(total_width)

            if idx == 0:
                btn.setChecked(True)

            self.layout.addWidget(btn)
            self._buttons[label] = btn
            self._icons[label] = icon

    def _on_button_clicked(self):
        sender = self.sender()
        for label, btn in self._buttons.items():
            is_active = (btn is sender)
            btn.setChecked(is_active)
            icon = self._icons[label]
            btn.setIcon(icon.get_icon(active=is_active))

        self.selection_changed.emit(self.selected())

    def selected(self) -> str | None:
        for label, btn in self._buttons.items():
            if btn.isChecked():
                return label
        return None
