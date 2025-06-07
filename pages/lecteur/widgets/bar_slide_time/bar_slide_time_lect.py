from PyQt6.QtCore import Qt, QRect, QPoint
from PyQt6 import QtWidgets, QtCore
from PyQt6.QtGui import QColor, QPainter
from PyQt6.QtWidgets import QSizePolicy, QSlider, QStyleOptionSlider


class TimeSlider(QSlider):
    def __init__(self, parent=None):
        super().__init__(Qt.Orientation.Horizontal, parent)
        self.setMouseTracking(True)
        self.chapitres = []
        self.duree_totale = 1
        self._hover = False

    def setChapitres(self, chapitres, duree_totale):
        self.chapitres = chapitres
        self.duree_totale = max(1, duree_totale)
        self.setRange(0, int(self.duree_totale))
        self.update()

    def _pickValue(self, x_pos: int) -> int:
        """Calcule la valeur du slider en secondes depuis l'abscisse du clic/déplacement."""
        opt = QStyleOptionSlider()
        self.initStyleOption(opt)
        style = self.style()
        groove = style.subControlRect(
            QtWidgets.QStyle.ComplexControl.CC_Slider, opt,
            QtWidgets.QStyle.SubControl.SC_SliderGroove, self
        )
        rel = x_pos - groove.x()
        return style.sliderValueFromPosition(
            self.minimum(), self.maximum(), rel, groove.width(), opt.upsideDown
        )

    def enterEvent(self, event):
        self._hover = True
        self.update()
        super().enterEvent(event)

    def leaveEvent(self, event):
        self._hover = False
        self.update()
        super().leaveEvent(event)

    def paintEvent(self, event):
        painter = QPainter(self)
        rect = self.rect()

        groove_height = 10 if self._hover else 6
        groove_y = rect.center().y() - groove_height // 2
        total_width = rect.width() - 20
        groove_left = rect.left() + 10
        groove_top = groove_y

        progress_color = QColor("#cc7a00") if not self._hover else QColor("#FFA500")
        base_color = QColor("#222") if not self._hover else QColor("#555")

        value_frac = self.value() / self.duree_totale
        progress_x = groove_left + value_frac * total_width

        espace_sep = 5  # espace transparent entre chapitres

        for i, ch in enumerate(self.chapitres):
            start_frac = ch['start'] / self.duree_totale
            end_frac = ch['end'] / self.duree_totale

            start_x = groove_left + int(start_frac * total_width)
            end_x = groove_left + int(end_frac * total_width)

            # Réduire la fin pour faire un espace transparent sauf dernier chapitre
            if i < len(self.chapitres) - 1:
                end_x -= espace_sep

            width_chap = end_x - start_x
            if width_chap <= 0:
                continue

            # Partie non lue du chapitre
            rect_base = QRect(start_x, groove_top, width_chap, groove_height)
            painter.fillRect(rect_base, base_color)

            # Partie lue (progression)
            if progress_x > start_x:
                progress_width = min(progress_x, end_x) - start_x
                if progress_width > 0:
                    rect_progress = QRect(start_x, groove_top, int(progress_width), groove_height)
                    painter.fillRect(rect_progress, progress_color)

        painter.end()
    def mousePressEvent(self, event):
        if event.button() == QtCore.Qt.MouseButton.LeftButton:
            val = self._pickValue(int(event.position().x()))
            self.setValue(val)
            self.setSliderDown(True)
            self.sliderMoved.emit(val)
            event.accept()
        else:
            super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        # Quand on glisse avec le bouton enfoncé, on continue à mettre à jour
        if self.isSliderDown():
            val = self._pickValue(int(event.position().x()))
            self.setValue(val)
            self.sliderMoved.emit(val)
            event.accept()
        else:
            super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if event.button() == QtCore.Qt.MouseButton.LeftButton and self.isSliderDown():
            self.setSliderDown(False)
            event.accept()
        else:
            super().mouseReleaseEvent(event)

class BarSlideTimeLect(QtWidgets.QWidget):
    def __init__(self,parent=None, chapitres=None, duree_totale=3000 ):
        super().__init__(parent)
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setStyleSheet("""
            background-color: rgba(0, 0, 0, 0);
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

        if chapitres is None or len(chapitres) == 0:
            chapitres = [{'titre':'Unique','start':0.0,'end':duree_totale}]
        duree_totale = chapitres[-1]['end'] if chapitres else duree_totale

        self.slider = TimeSlider(self)
        self.slider.setChapitres(chapitres, duree_totale)
        self.control_layout.addWidget(self.slider)

