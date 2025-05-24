from PySide6.QtWidgets import QWidget, QHBoxLayout, QLineEdit, QSizePolicy
from PySide6.QtCore import Qt
from config.colors import PRIMARY_COLOR

class SearchBarWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)

        self.setObjectName("SearchBar")
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setAttribute(Qt.WA_StyledBackground, True)

        self.setStyleSheet(f"""
            #SearchBar {{
                border-radius: 6px;
                padding: 4px;
            }}
            QLineEdit {{
                border: 1.5px solid {PRIMARY_COLOR};
                border-radius: 6px;
                padding-left: 8px;
                font-size: 16px;
                background-color: transparent;
            }}
            QLineEdit:focus {{
                border-color: {PRIMARY_COLOR};
                box-shadow: 0 0 5px {PRIMARY_COLOR};
            }}
        """)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self.line_edit = QLineEdit()
        self.line_edit.setPlaceholderText("Rechercher...")
        self.line_edit.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)

        layout.addWidget(self.line_edit)

    @property
    def textChanged(self):
        return self.line_edit.textChanged

    def text(self):
        return self.line_edit.text()

    def setText(self, value):
        self.line_edit.setText(value)
