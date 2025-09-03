from PyQt6.QtWidgets import QWidget, QHBoxLayout, QLineEdit, QSizePolicy
from Core.Language.i18n import get_text  # Nouvel import


class RechercheBarNav(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self.line_edit = QLineEdit()
        self.line_edit.setObjectName("recherche_bar_nav")
        self.line_edit.setPlaceholderText(get_text("nav_labels.search_texts.placeholder"))
        self.line_edit.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        layout.addWidget(self.line_edit)

    @property
    def on_text_changed(self):
        return self.line_edit.textChanged

    def text(self):
        return self.line_edit.text()

    def set_text(self, value):
        self.line_edit.setText(value)