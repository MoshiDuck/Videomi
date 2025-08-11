
from PyQt6.QtCore import pyqtSignal, Qt
from PyQt6.QtGui import QPainter, QColor
from PyQt6.QtWidgets import QSlider, QStyleOptionSlider, QStyle
import traceback


class ChapterSlider(QSlider):
    position_changed = pyqtSignal(int)
    position_released = pyqtSignal(int)
    chapter_clicked = pyqtSignal(float)

    def __init__(self, parent=None, debug=False):
        super().__init__(Qt.Orientation.Horizontal, parent)

        # Configuration par défaut
        self.setRange(0, 100)
        self.setMouseTracking(True)

        # Données
        self.duration = 0.0
        self.chapters = []
        self._raw_chapters = []

        # Apparence
        self.divider_width = 2
        self.divider_height = 14
        self._visible_color = QColor(255, 255, 0, 220)

        # Débogage
        self._debug = debug

        # Connexions signaux
        self.sliderMoved.connect(self.position_changed)
        self.sliderReleased.connect(lambda: self.position_released.emit(self.value()))

    def set_duration(self, seconds):
        """Définit la durée totale et ajuste les chapitres en conséquence."""
        self.duration = self._safe_float(seconds, default=0.0)
        self._update_maximum()
        self.chapters = self._filter_and_deduplicate(self._raw_chapters)
        self._log(f"Duration set: {self.duration}s, chapters={self.chapters}")
        self.update()

    def set_chapters(self, chapters):
        """Accepte une liste de temps (float) ou de dictionnaires avec 'start', 'start_time' ou 'time'."""
        self._raw_chapters = self._parse_chapters(chapters)
        self.chapters = self._filter_and_deduplicate(self._raw_chapters)
        self._log(f"Chapters updated: raw={self._raw_chapters}, usable={self.chapters}")
        self.update()

    def set_position(self, pos):
        """Déplace le curseur à la position spécifiée."""
        self.setValue(int(self._safe_float(pos, default=0)))
        self.update()

    def mousePressEvent(self, event):
        try:
            if event.button() == Qt.MouseButton.LeftButton:
                if self._handle_chapter_click(event.position().x()):
                    return
                self._jump_to_position(event.position().x())
        finally:
            super().mousePressEvent(event)

    def paintEvent(self, event):
        super().paintEvent(event)
        if not self.chapters:
            return

        try:
            painter = QPainter(self)
            painter.setRenderHint(QPainter.RenderHint.Antialiasing)

            total_h = self.height()
            bar_height = 4
            bar_y = (total_h - bar_height) // 2

            w = self.width()
            eff_dur = self._effective_duration()

            # Position du curseur (progression) en pixels
            slider_pos_x = (self.value() / self.maximum()) * w if self.maximum() > 0 else 0

            # Peindre la barre complète en gris transparent (reste)
            bg_color = QColor(200, 200, 200, 100)
            painter.fillRect(0, bar_y, w, bar_height, bg_color)

            # Peindre la partie jouée (avant curseur) en orange opaque
            filled_color = QColor(255, 165, 0, 255)  # orange plein
            painter.fillRect(0, bar_y, int(slider_pos_x), bar_height, filled_color)

            # Peindre les segments colorés orange entre chapitres, avec gaps transparents
            gap_px = self.divider_width if hasattr(self, 'divider_width') else 2

            chapter_points = [0.0] + self.chapters + [eff_dur]

            # Chaque segment est peint en orange seulement si il est avant la position du slider
            # On laisse les gaps (dividers) totalement transparents, créant une séparation visible car on voit "derrière"
            for i in range(len(chapter_points) - 1):
                start_time = chapter_points[i]
                end_time = chapter_points[i + 1]

                start_x = (start_time / eff_dur) * w
                end_x = (end_time / eff_dur) * w

                # Ajuster start_x et end_x pour laisser un gap transparent (divider)
                if i < len(chapter_points) - 2:
                    end_x -= gap_px / 2
                if i > 0:
                    start_x += gap_px / 2

                # Ne dessiner que si la zone est avant la progression actuelle (slider_pos_x)
                if end_x <= slider_pos_x and end_x > start_x:
                    painter.fillRect(int(start_x), bar_y, int(end_x - start_x), bar_height, filled_color)

            # Dessiner les dividers transparents en creusant la barre (effacer la bande à ces positions)
            painter.setCompositionMode(QPainter.CompositionMode_Clear)
            for chap_time in self.chapters:
                divider_x = int((chap_time / eff_dur) * w)
                painter.fillRect(divider_x - gap_px // 2, bar_y - (self.divider_height - bar_height) // 2,
                                 gap_px, self.divider_height, QColor(0, 0, 0, 0))
            painter.setCompositionMode(QPainter.CompositionMode_SourceOver)

            painter.end()

        except Exception as e:
            print(f"ChapterSlider.paintEvent error: {e}")
            traceback.print_exc()

    def _update_maximum(self):
        if self.duration > 0:
            self.setMaximum(max(1, int(self.duration)))
        elif self._raw_chapters:
            self.setMaximum(max(1, int(max(self._raw_chapters)) + 1))
        else:
            self.setMaximum(1)

    def _parse_chapters(self, chapters):
        result = []
        try:
            if chapters and isinstance(chapters[0], dict):
                for c in chapters:
                    val = c.get("start") or c.get("start_time") or c.get("time")
                    if val is not None:
                        result.append(float(val))
            else:
                result = [float(c) for c in chapters]
        except Exception as e:
            self._log(f"Error parsing chapters: {e}", error=True)
        return sorted(set(result))

    def _filter_and_deduplicate(self, values):
        if self.duration > 0:
            values = [v for v in values if 0.0 <= v <= self.duration]
        if not values:
            return []

        deduped = [values[0]]
        for v in values[1:]:
            if abs(v - deduped[-1]) >= 0.3:
                deduped.append(v)
        return deduped

    def _handle_chapter_click(self, click_x):
        if not self.chapters:
            return False
        w = self.width()
        eff_dur = self._effective_duration()
        for chap_time in self.chapters:
            chap_x = (chap_time / eff_dur) * w
            if abs(click_x - chap_x) <= 6:
                self.chapter_clicked.emit(chap_time)
                return True
        return False

    def _jump_to_position(self, click_x):
        pos_ratio = click_x / max(1, self.width())
        val = int(pos_ratio * self.maximum())
        self.setValue(val)
        self.position_changed.emit(val)

    def _effective_duration(self):
        return self.duration if self.duration > 0 else (max(self.chapters) + 1.0 if self.chapters else 1.0)

    def _get_groove_rect(self):
        opt = QStyleOptionSlider()
        self.initStyleOption(opt)
        groove_rect = self.style().subControlRect(QStyle.ComplexControl.CC_Slider, opt,
                                                  QStyle.SubControl.SC_SliderGroove, self)

        # Forcer la hauteur du groove à la hauteur du slider, en gardant la largeur inchangée
        groove_rect.setHeight(self.height())

        # Optionnel : ajuster la position Y pour rester centré verticalement (ici on met à 0)
        groove_rect.moveTop(0)

        return groove_rect

    @staticmethod
    def _safe_float(value, default=0.0):
        try:
            return float(value)
        except (ValueError, TypeError):
            return default

    def _log(self, msg, error=False):
        if self._debug:
            prefix = "[ERROR]" if error else "[DEBUG]"
            print(f"{prefix} {msg}")
