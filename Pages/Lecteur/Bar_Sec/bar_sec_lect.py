from PyQt6.QtCore import pyqtSignal, QSize, Qt
from PyQt6.QtWidgets import QFrame, QHBoxLayout, QSizePolicy

from Widgets.icon_perso import IconPerso


class BarSecLect(QFrame):
    play_pause_clicked = pyqtSignal(bool)  # Émet true si play, false si pause
    prev_clicked = pyqtSignal()
    next_clicked = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)

        self.setStyleSheet("""
            background-color: rgba(30, 30, 30, 180);
        """)

        self.setFixedHeight(60)

        # Layout horizontal global
        self.layout = QHBoxLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(20)  # un peu d'espace entre boutons
        self.layout.addStretch()

        # Bouton Précédent
        self.prev_btn = IconPerso(
            flash_color=True,
            icon_only_name="mdi.skip-previous",
            icon_size=QSize(30, 30),
            parent=self
        )
        self.prev_btn.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.layout.addWidget(self.prev_btn, alignment=Qt.AlignmentFlag.AlignVCenter)

        # Bouton Play/Pause
        self.play_pause_btn = IconPerso(
            initial_state=True,
            icon_true_name="mdi.pause-circle",
            icon_false_name="mdi.play-circle",
            icon_size=QSize(36, 36),
            parent=self
        )
        self.play_pause_btn.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.layout.addWidget(self.play_pause_btn, alignment=Qt.AlignmentFlag.AlignVCenter)

        # Bouton Suivant
        self.next_btn = IconPerso(
            flash_color=True,
            icon_only_name="mdi.skip-next",
            icon_size=QSize(30, 30),
            parent=self
        )
        self.next_btn.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.layout.addWidget(self.next_btn, alignment=Qt.AlignmentFlag.AlignVCenter)

        self.layout.addStretch()

        # Connexions des signaux
        self.play_pause_btn.state_changed.connect(self._on_play_pause_toggled)
        self.prev_btn.clicked.connect(lambda: self.prev_clicked.emit())
        self.next_btn.clicked.connect(lambda: self.next_clicked.emit())

    def _on_play_pause_toggled(self, is_playing: bool):
        self.play_pause_clicked.emit(is_playing)