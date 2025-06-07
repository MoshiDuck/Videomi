from PyQt6.QtCore import Qt
from PyQt6 import QtWidgets, QtCore
from PyQt6.QtWidgets import QSizePolicy


class TimeSlider(QtWidgets.QSlider):
    def __init__(self, parent=None):
        super().__init__(Qt.Orientation.Horizontal, parent)
        self.setRange(0, 100)
        self.setValue(0)
        self.setSizePolicy(QtWidgets.QSizePolicy.Expanding, QtWidgets.QSizePolicy.Fixed)
        self.setMouseTracking(True)

        self._hover = False
        self._update_style()

    def enterEvent(self, event):
        self._hover = True
        self._update_style()
        super().enterEvent(event)

    def leaveEvent(self, event):
        self._hover = False
        self._update_style()
        super().leaveEvent(event)

    def _update_style(self):
        if self._hover:
            groove_height = 10
            sub_page_color = "#FFA500"  # orange clair
            add_page_color = "#555"     # gris clair
        else:
            groove_height = 4
            sub_page_color = "#cc7a00"  # orange foncé
            add_page_color = "#222"      # gris foncé

        radius = groove_height // 2

        self.setStyleSheet(f"""
            QSlider::groove:horizontal {{
                height: {groove_height}px;
                background: {add_page_color};
                border-radius: {radius}px;
            }}
            QSlider::sub-page:horizontal {{
                background: {sub_page_color};
                border-top-left-radius: {radius}px;
                border-bottom-left-radius: {radius}px;
                border-top-right-radius: 0;
                border-bottom-right-radius: 0;
            }}
            QSlider::add-page:horizontal {{
                background: {add_page_color};
                border-top-right-radius: {radius}px;
                border-bottom-right-radius: {radius}px;
                border-top-left-radius: 0;
                border-bottom-left-radius: 0;
            }}
            QSlider::handle:horizontal {{
                width: 0px;
                height: 0px;
                margin: 0px;
                border: none;
            }}
        """)

class BarSlideTimeLect(QtWidgets.QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        # 1) Autoriser la fenêtre translucide
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WA_StyledBackground, True)

        # 2) Style CSS : fond 100% transparent ou semi-transparent (ici 50%)
        self.setStyleSheet("""
            background-color: rgba(0, 0, 0, 0);  /* fully transparent */
            /* background-color: rgba(0, 0, 0, 128);  semi-transparent black */
            color: white;
        """)

        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setWindowFlags(
            QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Tool
        )
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents, False)

        self.control_layout = QtWidgets.QHBoxLayout(self)
        self.control_layout.setContentsMargins(10, 0, 10, 0)
        self.control_layout.setSpacing(0)

        self.slider = TimeSlider(self)
        self.control_layout.addWidget(self.slider)
