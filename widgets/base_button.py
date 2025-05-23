from PySide6.QtWidgets import QPushButton
from config.colors import PRIMARY_COLOR, PRIMARY_HOVER, PRIMARY_ACTIVE, TEXT_COLOR_DARK

class BaseButton(QPushButton):
    def __init__(self, label, parent=None):
        super().__init__(label, parent)
        self.setStyleSheet(self.style_sheet())

    @staticmethod
    def style_sheet():
        return f"""
        QPushButton {{
            background-color: {PRIMARY_COLOR};
            color: {TEXT_COLOR_DARK};
            border: none;
            padding: 8px 16px;
            font-size: 14px;
            border-radius: 4px;
        }}
        QPushButton:hover {{
            background-color: {PRIMARY_HOVER};
        }}
        QPushButton:pressed {{
            background-color: {PRIMARY_ACTIVE};
        }}
        """