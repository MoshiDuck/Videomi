from PyQt6.QtCore import QSize, Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QFrame, QVBoxLayout
)
from PyQt6.QtWidgets import QWidget, QHBoxLayout, QSlider, QLabel
from PyQt6.QtGui import QFont

from Pages.Lecteur.chapter_slider import ChapterSlider
from Pages.Navigateur.Widgets.triple_container import TripleContainer
from Widgets.icon_perso import IconPerso
from Widgets.volume_control_lect import VolumeControlLect


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
    volume_changed = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(100)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setStyleSheet("background: transparent;")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.slider = ChapterSlider(self)
        self.slider.setStyleSheet("background: transparent;")

        self.triple = TripleContainer(self)

        time_row = QHBoxLayout()
        time_row.setContentsMargins(6, 4, 6, 0)
        time_row.setSpacing(4)

        self.current_time_label = QLabel("0:00", self)
        f = QFont()
        f.setPointSize(9)
        self.current_time_label.setFont(f)
        self.current_time_label.setStyleSheet("color: white; background: transparent;")
        self.current_time_label.setFixedHeight(16)

        self.total_time_label = QLabel("—", self)
        self.total_time_label.setFont(f)
        self.total_time_label.setStyleSheet("color: white; background: transparent;")
        self.total_time_label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        self.total_time_label.setFixedHeight(16)

        time_row.addWidget(self.current_time_label, 0, Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft)
        time_row.addStretch(1)
        time_row.addWidget(self.total_time_label, 0, Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignRight)

        layout.addLayout(time_row)   # insérer la ligne de temps au-dessus du slider
        layout.addWidget(self.slider)
        layout.addWidget(self.triple)

        # --- Zone gauche ---
        gauche_layout = QHBoxLayout(self.triple.pan1)
        gauche_layout.setContentsMargins(0, 0, 0, 0)
        gauche_layout.setSpacing(5)

        # --- Zone centre ---
        milieu_layout = QHBoxLayout(self.triple.pan2)
        milieu_layout.setContentsMargins(0, 0, 0, 0)
        milieu_layout.setSpacing(0)

        self.triple.pan2.setLayout(milieu_layout)

        self.moins_10_btn = IconPerso(flash_color=True, icon_only_name="mdi.rewind-10", icon_size=QSize(28, 28))
        self._make_widget_transparent(self.moins_10_btn)

        self.chapter_prev_btn = IconPerso(flash_color=True, icon_only_name="mdi.skip-backward", icon_size=QSize(28, 28))
        self._make_widget_transparent(self.chapter_prev_btn)

        self.prev_btn = IconPerso(flash_color=True, icon_only_name="mdi.skip-previous", icon_size=QSize(30, 30))
        self._make_widget_transparent(self.prev_btn)

        self.play_pause_btn = IconPerso(initial_state=True,
                                        icon_true_name="mdi.pause-circle",
                                        icon_false_name="mdi.play-circle",
                                        icon_size=QSize(42, 42))
        self._make_widget_transparent(self.play_pause_btn)

        self.next_btn = IconPerso(flash_color=True, icon_only_name="mdi.skip-next", icon_size=QSize(30, 30))
        self._make_widget_transparent(self.next_btn)

        self.chapter_next_btn = IconPerso(flash_color=True, icon_only_name="mdi.skip-forward", icon_size=QSize(28, 28))
        self._make_widget_transparent(self.chapter_next_btn)

        self.plus_10_btn = IconPerso(flash_color=True, icon_only_name="mdi.fast-forward-10", icon_size=QSize(28, 28))
        self._make_widget_transparent(self.plus_10_btn)

        milieu_layout.addWidget(self.moins_10_btn)
        milieu_layout.addWidget(self.chapter_prev_btn)
        milieu_layout.addWidget(self.prev_btn)
        milieu_layout.addWidget(self.play_pause_btn)
        milieu_layout.addWidget(self.next_btn)
        milieu_layout.addWidget(self.chapter_next_btn)
        milieu_layout.addWidget(self.plus_10_btn)

        # --- Zone droite ---
        droite_layout = QHBoxLayout(self.triple.pan3)
        droite_layout.setContentsMargins(0, 0, 0, 0)
        droite_layout.setSpacing(0)
        self.triple.pan3.setLayout(droite_layout)

        self.volume_control = VolumeControlLect(self)

        droite_layout.addWidget(self.volume_control)

        # --- Connexions ---
        self.play_pause_btn.state_changed.connect(self._on_play_pause_toggled)
        self.prev_btn.clicked.connect(self.prev_clicked.emit)
        self.next_btn.clicked.connect(self.next_clicked.emit)
        self.chapter_prev_btn.clicked.connect(self.chapter_prev_clicked.emit)
        self.chapter_next_btn.clicked.connect(self.chapter_next_clicked.emit)
        self.plus_10_btn.clicked.connect(self.plus_10_clicked.emit)
        self.moins_10_btn.clicked.connect(self.moins_10_clicked.emit)

        # connections slider -> signals publiques
        self.slider.position_changed.connect(self.position_changed.emit)
        self.slider.position_released.connect(self.position_changed.emit)
        self.slider.chapter_clicked.connect(self.chapter_selected.emit)

        # update labels when user moves slider
        try:
            self.slider.position_changed.connect(self._on_slider_position_changed_internal)
            self.slider.position_released.connect(self._on_slider_position_changed_internal)
        except Exception:
            pass

        # forward volume events
        try:
            self.volume_control.volume_changed.connect(self.volume_changed.emit)
            self.volume_control.mute_toggled.connect(lambda m: None)
        except Exception:
            pass

    @staticmethod
    def _make_widget_transparent(widget):
        try:
            widget.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
            widget.setAttribute(Qt.WidgetAttribute.WA_NoSystemBackground, True)
        except Exception as e:
            print(e)
            pass
        widget.setAutoFillBackground(False)
        widget.setStyleSheet("background: transparent; border: none;")

    def paintEvent(self, event):
        return

    def _on_play_pause_toggled(self, is_playing):
        self.play_pause_clicked.emit(is_playing)

    def _format_time_simple(self, seconds):
        """Format dynamique :
        - < 60s  -> "SS" (deux chiffres)
        - >=60   -> "MM:SS" (deux chiffres pour les minutes)
        - >=3600 -> "HH:MM:SS" (deux chiffres pour chaque champ)
        Retourne "—" si inconnu.
        """
        try:
            if seconds is None:
                return "—"
            s = int(round(float(seconds)))
            # moins d'une minute : afficher seulement les secondes sur 2 chiffres
            if s < 60:
                return f"{s:02d}"
            # une heure ou plus : HH:MM:SS
            if s >= 3600:
                h = s // 3600
                m = (s % 3600) // 60
                sec = s % 60
                return f"{h:02d}:{m:02d}:{sec:02d}"
            # sinon : MM:SS
            m = s // 60
            sec = s % 60
            return f"{m:02d}:{sec:02d}"
        except Exception:
            return "—"

    def set_current_time(self, seconds):
        """
        Met à jour le label temps courant (formaté).
        Appelable depuis l'extérieur (par ex. Lecteur._update_position).
        """
        try:
            txt = self._format_time_simple(seconds)
            self.current_time_label.setText(txt)
        except Exception:
            pass

    def set_duration(self, seconds):
        """
        Remplace la méthode existante pour mettre à jour aussi le label total.
        """
        try:
            # Mettre la durée dans le slider si la slider expose déjà set_duration
            try:
                self.slider.set_duration(seconds)
            except Exception:
                pass
            # Mettre à jour le label total
            if seconds is None:
                self.total_time_label.setText("—")
            else:
                self.total_time_label.setText(self._format_time_simple(seconds))
        except Exception as e:
            print(f"BarSecLect.set_duration erreur: {e}")

    def set_chapters(self, chapters):
        normalized = []
        for c in chapters:
            if isinstance(c, dict):
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

    # watcher interne du slider (quand l'utilisateur le bouge)
    def _on_slider_position_changed_internal(self, pos):
        try:
            # pos attendu en secondes (int)
            self.set_current_time(pos)
        except Exception:
            pass
