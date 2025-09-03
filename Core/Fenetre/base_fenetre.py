from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLabel
from Core.Fenetre.bar_fenetre import BarFenetre

class BaseFenetre(QWidget):
    def __init__(self, largeur=None, hauteur=None, widget=None, bar=True):
        super().__init__()
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        if hauteur is not None and largeur is not None:
            self.resize(int(largeur), int(hauteur))

        self.central_layout = QVBoxLayout(self)
        self.central_layout.setContentsMargins(0, 0, 0, 0)

        if bar:
            self.bar = BarFenetre(parent=self, widget=widget if widget else QLabel(""))
        if bar:
            self.central_layout.addWidget(self.bar, alignment=Qt.AlignmentFlag.AlignTop)

        if widget:
            self.central_layout.addWidget(widget)

        self.central_layout.setStretch(1, 1)