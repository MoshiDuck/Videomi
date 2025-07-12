#bar_sec_nav.py
from PyQt6.QtWidgets import QWidget, QHBoxLayout

from Pages.Navigateur.Widgets.card_nav import CardNav
from Pages.Navigateur.Widgets.combo_box import ComboBox
from Pages.Navigateur.Widgets.recherche_bar_nav import RechercheBarNav
from Pages.Navigateur.Widgets.slide_temps import SlideTemps
from Pages.Navigateur.Widgets.triple_container import TripleContainer
from Widgets.icon_perso import IconPerso


class BarSecNav(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(40)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.triple = TripleContainer(self)
        layout.addWidget(self.triple)

        gauche_layout = QHBoxLayout(self.triple.pan1)
        gauche_layout.setContentsMargins(0, 0, 0, 0)
        gauche_layout.setSpacing(0)
        milieu_layout = QHBoxLayout(self.triple.pan2)
        milieu_layout.setContentsMargins(0, 0, 0, 0)
        milieu_layout.setSpacing(0)
        droite_layout = QHBoxLayout(self.triple.pan3)
        droite_layout.setContentsMargins(0, 0, 0, 0)
        droite_layout.setSpacing(10)

        self.recherche_bar = RechercheBarNav()

        self.card = CardNav(items=[
            ("Videos", "mdi.video-outline"),
            ("Musiques", "mdi.music-note-outline"),
            ("Images", "mdi.image-outline"),
            ("Documents", "mdi.file-document-outline"),
            ("Archives", "mdi.zip-box-outline"),
            ("Executables", "mdi.cog-outline"),
        ], bool_sec=True)

        self.slide = SlideTemps()
        self.icon1 = IconPerso(icon_only_name="mdi.translate", initial_state=True, color_2="#ffdd57")
        self.box1 = ComboBox()
        self.icon2 = IconPerso(icon_only_name="mdi.subtitles-outline", initial_state=True, color_2="#ffdd57")
        self.box2 = ComboBox()

        gauche_layout.addWidget(self.recherche_bar)

        milieu_layout.addWidget(self.card)
        droite_layout.addWidget(self.slide)
        droite_layout.addWidget(self.icon1)
        droite_layout.addWidget(self.box1)
        droite_layout.addWidget(self.icon2)
        droite_layout.addWidget(self.box2)

        self.triple.pan1.setLayout(gauche_layout)
        self.triple.pan2.setLayout(milieu_layout)
        self.triple.pan3.setLayout(droite_layout)
        self.triple.pan3.setFixedHeight(40)