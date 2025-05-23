from PySide6.QtWidgets import QWidget, QHBoxLayout, QLineEdit, QSizePolicy
from PySide6.QtCore import Qt
from config.colors import PRIMARY_COLOR

class SearchBarWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)

        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setStyleSheet("""
            QWidget {
                border-radius: 6px;
                padding: 4px;
            }
        """)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)  # Petit padding intérieur
        layout.setSpacing(0)

        self.line_edit = QLineEdit()
        self.line_edit.setPlaceholderText("Rechercher...")
        self.line_edit.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.line_edit.setStyleSheet(f"""
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

        layout.addWidget(self.line_edit)