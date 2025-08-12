from PyQt6.QtCore import pyqtSignal, Qt, QPoint
from PyQt6.QtGui import QColor, QPainter, QBrush, QPen, QMouseEvent
from PyQt6.QtWidgets import QWidget, QHBoxLayout, QSizePolicy, QStyleOptionSlider, QStyle


class _Segment(QWidget):
    def __init__(self, parent=None, radius=4,
                 bg_color=QColor(200, 200, 200, 255),
                 fill_color=QColor(255, 165, 0)):
        super().__init__(parent)
        self._ratio = 0.0
        self._radius = radius
        self._bg_color = bg_color
        self._fill_color = fill_color
        self._handle_visible = False
        self._handle_position = 0
        self._handle_size = 14

        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.setMinimumHeight(20)

    def set_bg_color(self, color: QColor):
        self._bg_color = color
        self.update()

    def set_fill_ratio(self, r: float):
        self._ratio = max(0.0, min(1.0, r))
        self.update()

    def set_handle_visible(self, visible: bool):
        self._handle_visible = visible
        self.update()

    def set_handle_position(self, position: float):
        self._handle_position = position
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Dessiner le fond du segment
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QBrush(self._bg_color))
        painter.drawRoundedRect(0, (self.height() - 8) // 2, self.width(), 8, self._radius, self._radius)

        # Dessiner la partie remplie
        if self._ratio > 0:
            fill_width = int(self.width() * self._ratio)
            painter.setBrush(QBrush(self._fill_color))
            painter.drawRoundedRect(0, (self.height() - 8) // 2, fill_width, 8, self._radius, self._radius)

        # Dessiner le handle si visible
        if self._handle_visible:
            handle_x = round(self._handle_position * self.width())
            handle_y = self.height() // 2

            painter.setPen(QPen(self._fill_color, 2))
            painter.setBrush(QBrush(QColor(255, 255, 255)))
            painter.drawEllipse(
                QPoint(int(handle_x), int(handle_y)),
                self._handle_size // 2,
                self._handle_size // 2
            )


class ChapterSlider(QWidget):
    position_changed = pyqtSignal(int)
    position_released = pyqtSignal(int)
    chapter_clicked = pyqtSignal(float)

    def __init__(self, parent=None, divider_width: int = 6, debug: bool = False):
        super().__init__(parent)
        self._debug = debug

        self.duration = 0.0
        self.chapters = []
        self._raw_chapters = []

        self.divider_width = divider_width
        self.segment_radius = 4
        self._handle_size = 14

        self.segment_fill = QColor(255, 165, 0)
        self.segment_bg_unfilled = QColor(150, 150, 150, 255)
        self.segment_bg_filled = QColor(190, 190, 190, 140)

        # Conteneur des segments
        self._segments_container = QWidget(self)
        self._segments_layout = QHBoxLayout(self._segments_container)
        self._segments_layout.setContentsMargins(0, 0, 0, 0)
        self._segments_layout.setSpacing(self.divider_width)

        self.setMinimumHeight(40)
        self._mouse_pressed = False
        self._current_value = 0
        self._max_value = 1
        self._effective_width = 0  # Nouvelle variable pour largeur effective
        self._segments = []

    def setValue(self, v: int):
        try:
            v_int = int(v)
        except Exception as e:
            print(e)
            return
        v_int = min(max(0, v_int), self._max_value)
        self._current_value = v_int
        self._update_segments_fill_from_position(v_int)
        self._update_handle_position()

    def value(self):
        return self._current_value

    def setRange(self, a: int, b: int):
        self._max_value = max(1, int(b))
        self._current_value = min(max(0, int(a)), self._max_value)
        self._update_segments()

    def setMaximum(self, m: int):
        self._max_value = max(1, int(m))
        self._current_value = min(self._current_value, self._max_value)
        self._update_segments()

    def maximum(self):
        return self._max_value

    def set_duration(self, seconds):
        try:
            d = int(float(seconds)) if seconds is not None else 0
        except Exception as e:
            print(e)
            d = 0
        self.duration = max(0, d)
        self._update_segments()

    def set_chapters(self, chapters):
        parsed = []
        try:
            if chapters and isinstance(chapters[0], dict):
                for c in chapters:
                    val = c.get("start") or c.get("start_time") or c.get("time")
                    if val is not None:
                        parsed.append(float(val))
            else:
                parsed = [float(c) for c in (chapters or [])]
        except Exception as e:
            parsed = []
            if self._debug:
                print("set_chapters parse error", e)
        self._raw_chapters = sorted(list(dict.fromkeys(parsed)))
        self.chapters = self._raw_chapters[:]
        self._update_segments()

    def set_position(self, pos):
        self.setValue(pos)

    def resizeEvent(self, ev):
        super().resizeEvent(ev)
        total_h = self.height()
        seg_h = 20
        seg_y = (total_h - seg_h) // 2
        self._segments_container.setGeometry(0, seg_y, self.width(), seg_h)

        # Calculer la largeur effective des segments
        total_spacing = (len(self._segments) - 1) * self.divider_width if self._segments else 0
        self._effective_width = max(1, self.width() - total_spacing)
        self._update_handle_position()

    def mousePressEvent(self, event: QMouseEvent):
        if event.button() == Qt.MouseButton.LeftButton:
            self._mouse_pressed = True
            self._handle_drag(event.position().x())

    def mouseMoveEvent(self, event: QMouseEvent):
        if self._mouse_pressed:
            self._handle_drag(event.position().x())

    def mouseReleaseEvent(self, event: QMouseEvent):
        if self._mouse_pressed and event.button() == Qt.MouseButton.LeftButton:
            self._mouse_pressed = False
            self.position_released.emit(self._current_value)

    def _handle_drag(self, x_pos):
        # Calculer la position relative en tenant compte des espacements
        total_spacing = (len(self._segments) - 1) * self.divider_width if self._segments else 0
        effective_width = max(1, self.width() - total_spacing)

        if effective_width <= 0:
            return

        # Ajuster la position pour compenser les espacements
        segment_index = 0
        accumulated_width = 0
        for i, seg in enumerate(self._segments):
            seg_width = (seg["dur"] / self._effective_duration()) * effective_width
            if x_pos <= accumulated_width + seg_width:
                segment_index = i
                break
            accumulated_width += seg_width + (self.divider_width if i < len(self._segments) - 1 else 0)
        else:
            segment_index = len(self._segments) - 1

        # Calculer la position relative dans le segment
        seg = self._segments[segment_index]
        seg_width = (seg["dur"] / self._effective_duration()) * effective_width
        rel_x = max(0, min(x_pos - accumulated_width, seg_width))
        position_ratio = rel_x / seg_width if seg_width > 0 else 0

        # Calculer la position temporelle
        value = int(seg["start"] + position_ratio * (seg["end"] - seg["start"]))

        if value != self._current_value:
            self._current_value = value
            self.position_changed.emit(value)
            self._update_segments_fill_from_position(value)
            self._update_handle_position()

    def _check_chapter_click(self, x_pos):
        # Même calcul de position que dans _handle_drag
        total_spacing = (len(self._segments) - 1) * self.divider_width if self._segments else 0
        effective_width = max(1, self.width() - total_spacing)

        if effective_width <= 0:
            return

        eff_dur = self._effective_duration()
        tol = 8

        # Convertir la position du chapitre en coordonnées d'écran
        for ch in self.chapters:
            chap_x = (ch / eff_dur) * effective_width

            # Compenser les espacements entre segments
            accumulated = 0
            for seg in self._segments:
                seg_width = (seg["dur"] / eff_dur) * effective_width
                if ch >= seg["start"] and ch <= seg["end"]:
                    break
                accumulated += seg_width + self.divider_width
            chap_x += accumulated

            if abs(x_pos - chap_x) <= tol:
                self.chapter_clicked.emit(float(ch))
                return

    def _update_segments(self):
        for i in reversed(range(self._segments_layout.count())):
            w = self._segments_layout.itemAt(i).widget()
            if w:
                w.setParent(None)
        self._segments = []

        eff_dur = self._effective_duration()
        self._max_value = max(1, int(eff_dur))

        if not self.chapters:
            seg = _Segment(parent=self._segments_container, radius=self.segment_radius,
                           bg_color=self.segment_bg_unfilled, fill_color=self.segment_fill)
            self._segments_layout.addWidget(seg, 1)
            self._segments.append({"widget": seg, "start": 0.0, "end": eff_dur, "dur": eff_dur})
            self._update_segments_fill_from_position(self._current_value)
            return

        points = [0.0] + self.chapters + [eff_dur]
        durations = []
        for i in range(len(points) - 1):
            dur = max(1e-6, points[i + 1] - points[i])
            durations.append(dur)

        factor = 1000.0
        for i in range(len(durations)):
            seg = _Segment(parent=self._segments_container, radius=self.segment_radius,
                           bg_color=self.segment_bg_unfilled, fill_color=self.segment_fill)
            weight = max(1, int(durations[i] * factor))
            self._segments_layout.addWidget(seg, weight)
            self._segments.append({
                "widget": seg,
                "start": points[i],
                "end": points[i + 1],
                "dur": durations[i]
            })

        self._update_segments_fill_from_position(self._current_value)
        self._update_handle_position()

    def _update_handle_position(self):
        total_w = self._segments_container.width()
        if total_w <= 0 or self._max_value <= 0:
            return

        for seg in self._segments:
            seg["widget"].set_handle_visible(False)

        # Trouver le segment actif
        for seg in self._segments:
            start = seg["start"]
            end = seg["end"]
            if start <= self._current_value <= end:
                seg_width = seg["widget"].width()
                seg_handle_pos = (self._current_value - start) / (end - start)
                seg["widget"].set_handle_position(seg_handle_pos)
                seg["widget"].set_handle_visible(True)
                break

    def _effective_duration(self):
        if self.duration and self.duration > 0:
            return float(self.duration)
        if self.chapters:
            return float(max(self.chapters) + 1.0)
        return 1.0

    def _update_segments_fill_from_position(self, pos_seconds: float):
        eff = self._effective_duration()
        if pos_seconds is None:
            return

        for seginfo in self._segments:
            start = float(seginfo["start"])
            end = float(seginfo["end"])
            w = seginfo["widget"]

            if pos_seconds >= end:
                w.set_fill_ratio(1.0)
                w.set_bg_color(self.segment_bg_filled)
            elif pos_seconds <= start:
                w.set_fill_ratio(0.0)
                w.set_bg_color(self.segment_bg_unfilled)
            else:
                ratio = (pos_seconds - start) / max(1e-6, (end - start))
                w.set_fill_ratio(ratio)
                w.set_bg_color(self.segment_bg_unfilled)