from PySide6.QtWidgets import QSizePolicy
from PySide6.QtCore import Qt
from config.colors import DARK_BAR
from pages.navigateur.widgets.sous_bar.sous_bar_droite.box_choix import BoxChoix
from pages.navigateur.widgets.sous_bar.sous_bar_droite.slide_time import SlideTime
from widgets.row_widget import Row

class SousBarDroiteWidgetNav(Row):
    def __init__(self, parent=None):
        super().__init__(parent=parent)
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setStyleSheet(f"""
            background-color: {DARK_BAR};
            border-radius: 6px;
        """)
        self.setFixedHeight(40)

        self.slide = SlideTime()
        self.box_audio = BoxChoix(icon_text="mdi.volume-high")
        self.box_sub = BoxChoix(icon_text="mdi.closed-caption")

        self.add_widget(self.slide)
        self.add_widget(self.box_audio)
        self.add_widget(self.box_sub)


