# ---------- FILE: bar_sec_lect.py ----------
from PyQt6.QtCore import pyqtSignal, QSize
from PyQt6.QtWidgets import QFrame, QHBoxLayout, QVBoxLayout

from Pages.Lecteur.chapter_slider import ChapterSlider
from Widgets.icon_perso import IconPerso


class BarSecLect(QFrame):
    play_pause_clicked = pyqtSignal(bool)
    prev_clicked = pyqtSignal()
    next_clicked = pyqtSignal()
    chapter_prev_clicked = pyqtSignal()
    chapter_next_clicked = pyqtSignal()
    plus_10_clicked = pyqtSignal()
    moins_10_clicked = pyqtSignal()

    position_changed = pyqtSignal(int)
    chapter_selected = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(100)

        self.main_layout = QVBoxLayout(self)
        self.main_layout.setContentsMargins(5, 5, 5, 5)
        self.main_layout.setSpacing(10)

        # ---- Slider avec chapitres ----
        self.slider = ChapterSlider(self)
        self.main_layout.addWidget(self.slider)

        # ---- Boutons ----
        self.button_layout = QHBoxLayout()
        self.button_layout.setContentsMargins(0, 0, 0, 0)
        self.button_layout.setSpacing(20)
        self.button_layout.addStretch()

        self.moins_10_btn = IconPerso(flash_color=True, icon_only_name="mdi.rewind-10", icon_size=QSize(28, 28))
        self.button_layout.addWidget(self.moins_10_btn)

        self.chapter_prev_btn = IconPerso(flash_color=True, icon_only_name="mdi.skip-backward", icon_size=QSize(28, 28))
        self.button_layout.addWidget(self.chapter_prev_btn)

        self.prev_btn = IconPerso(flash_color=True, icon_only_name="mdi.skip-previous", icon_size=QSize(30, 30))
        self.button_layout.addWidget(self.prev_btn)

        self.play_pause_btn = IconPerso(initial_state=True, icon_true_name="mdi.pause-circle", icon_false_name="mdi.play-circle", icon_size=QSize(42, 42))
        self.button_layout.addWidget(self.play_pause_btn)

        self.next_btn = IconPerso(flash_color=True, icon_only_name="mdi.skip-next", icon_size=QSize(30, 30))
        self.button_layout.addWidget(self.next_btn)

        self.chapter_next_btn = IconPerso(flash_color=True, icon_only_name="mdi.skip-forward", icon_size=QSize(28, 28))
        self.button_layout.addWidget(self.chapter_next_btn)

        self.plus_10_btn = IconPerso(flash_color=True, icon_only_name="mdi.fast-forward-10", icon_size=QSize(28, 28))
        self.button_layout.addWidget(self.plus_10_btn)

        self.button_layout.addStretch()
        self.main_layout.addLayout(self.button_layout)

        # Connexions
        self.play_pause_btn.state_changed.connect(self._on_play_pause_toggled)
        self.prev_btn.clicked.connect(self.prev_clicked.emit)
        self.next_btn.clicked.connect(self.next_clicked.emit)
        self.chapter_prev_btn.clicked.connect(self.chapter_prev_clicked.emit)
        self.chapter_next_btn.clicked.connect(self.chapter_next_clicked.emit)
        self.plus_10_btn.clicked.connect(self.plus_10_clicked.emit)
        self.moins_10_btn.clicked.connect(self.moins_10_clicked.emit)

        self.slider.position_changed.connect(self.position_changed.emit)
        self.slider.position_released.connect(self.position_changed.emit)
        self.slider.chapter_clicked.connect(self.chapter_selected.emit)

    def _on_play_pause_toggled(self, is_playing):
        self.play_pause_clicked.emit(is_playing)

    def set_duration(self, seconds):
        self.slider.set_duration(seconds)

    def set_chapters(self, chapters):
        """
        Extrait les positions de départ des chapitres
        """
        normalized = []
        for c in chapters:
            if isinstance(c, dict):
                # Extraire le temps de début des dictionnaires
                start = c.get("start") or c.get("start_time") or c.get("time")
                if start is not None:
                    try:
                        normalized.append(float(start))
                    except Exception as e:
                        print(e)
                        pass
            else:
                try:
                    normalized.append(float(c))
                except Exception as e:
                    print(e)
                    pass
        self.slider.set_chapters(normalized)