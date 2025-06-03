from PyQt6.QtWidgets import QSizePolicy
from PyQt6.QtCore import Qt
from config.colors import DARK_BAR
from pages.navigateur.widgets.sous_bar.sous_bar_gauche.search_bar_widget import SearchBarWidget
from widgets.row_widget import Row

class SousBarGaucheWidgetNav(Row):
    def __init__(self, parent=None):
        super().__init__(parent=parent)
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setStyleSheet(f"""
            background-color: {DARK_BAR};
            border-radius: 6px;
        """)
        self.setFixedHeight(40)

        self.bar_search = SearchBarWidget(self)
        self.add_widget(self.bar_search)

