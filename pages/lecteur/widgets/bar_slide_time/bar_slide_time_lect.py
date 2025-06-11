import os

from PyQt6.QtCore import Qt, QSize
from PyQt6 import QtWidgets, QtCore
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import QSizePolicy, QWidget, QLabel

from database.video_thumbnail_manager import VideoThumbnailManager
from pages.lecteur.widgets.bar_slide_time.time_slider_lect import TimeSliderLect


class BarSlideTimeLect(QtWidgets.QWidget):
    def __init__(self, parent=None, chapitres=None, duree_totale=3000, titre_video=None):
        super().__init__(parent)

        self.thumbnail_manager = VideoThumbnailManager()
        self.titre_video = titre_video

        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setStyleSheet("""
            background-color: rgba(0, 0, 0, 0);
            color: white;
        """)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        self.setWindowFlags(
            QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Tool
        )
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents, False)

        self.control_layout = QtWidgets.QVBoxLayout(self)
        self.control_layout.setContentsMargins(10, 0, 10, 0)
        self.control_layout.setSpacing(5)

        if chapitres is None or len(chapitres) == 0:
            chapitres = [{'titre': 'Unique', 'start': 0.0, 'end': duree_totale}]
        duree_totale = chapitres[-1]['end'] if chapitres else duree_totale

        self.slider = TimeSliderLect(self)
        self.slider.setChapitres(chapitres, duree_totale)
        self.control_layout.addWidget(self.slider)

        self.slider.setMouseTracking(True)
        self.slider.mouseMoveEvent = self._slider_mouse_move
        self.slider.leaveEvent = self._slider_leave

    def sizeHint(self) -> QtCore.QSize:
        slider_h = self.slider.sizeHint().height()
        total_h  = slider_h
        return QtCore.QSize(200, total_h)



    def _slider_mouse_move(self, event):
        val = self.slider.pickValue(int(event.position().x()))
        self.slider.setValue(val)
        self.slider.sliderMoved.emit(val)
        event.accept()



    def _slider_leave(self, event):
     parent = self.parent()
     if hasattr(parent, 'miniature'):
         parent.miniature.hide()
         event.accept()
