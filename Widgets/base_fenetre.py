from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLabel
from Widgets.bar_fenetre import BarFenetre

class BaseFenetre(QWidget):
    def __init__(self, largeur=None, hauteur=None, widget=None):
        super().__init__()
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        if hauteur is not None and largeur is not None:
            self.resize(int(largeur), int(hauteur))

        self.central_layout = QVBoxLayout(self)
        self.central_layout.setContentsMargins(0, 0, 0, 0)

        self.bar = BarFenetre(parent=self, widget=widget if widget else QLabel(""))
        self.central_layout.addWidget(self.bar, alignment=Qt.AlignmentFlag.AlignTop)

        if widget:
            self.central_layout.addWidget(widget)

        self.central_layout.setStretch(1, 1)

    @staticmethod
    def find_ancestor(widget, cls):
        parent = widget.parent()
        while parent:
            if isinstance(parent, cls):
                return parent
            parent = parent.parent()
        return None