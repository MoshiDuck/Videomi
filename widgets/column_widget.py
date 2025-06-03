from PyQt6.QtCore import QSize
from PyQt6.QtWidgets import QWidget, QVBoxLayout

class Column(QWidget):
    def __init__(self, parent=None, spacing=0, margins=(0, 0, 0, 0)):
        super().__init__(parent)
        self.layout = QVBoxLayout(self)
        self.layout.setSpacing(spacing)
        self.layout.setContentsMargins(*margins)

    def add_widget(self, widget, stretch=0):
        self.layout.addWidget(widget, stretch)

    def sizeHint(self):
        return QSize(600, 400)