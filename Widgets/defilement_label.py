from PyQt6 import QtWidgets, QtCore, QtGui
from PyQt6.QtCore import Qt, QTimer, QPoint
from PyQt6.QtGui import QFontMetrics, QPaintEvent, QPainter
from PyQt6.QtWidgets import QLabel


class DefilementLabel(QLabel):
    def __init__(self, text="", parent=None):
        super().__init__(parent)
        self.fullText = text
        self.offset = 0
        self.speed = 3
        self.timer_interval = 20

        self.setStyleSheet("background: transparent; color: white;")
        self.setSizePolicy(QtWidgets.QSizePolicy.Policy.Expanding, QtWidgets.QSizePolicy.Policy.Fixed)
        self.setAlignment(Qt.AlignmentFlag.AlignCenter | Qt.AlignmentFlag.AlignVCenter)

        self.animation_timer = QTimer(self)
        self.animation_timer.timeout.connect(self.animate_marquee)
        self.setMouseTracking(True)

        self.updateShortText()  # Mise à jour initiale

    def setText(self, text: str):
        self.fullText = text
        self.offset = 0
        self.updateShortText()

    def updateShortText(self):
        fm = QFontMetrics(self.font())
        elided = fm.elidedText(self.fullText, Qt.TextElideMode.ElideRight, self.width())
        super().setText(elided)

    def enterEvent(self, event):
        self.offset = 0
        self.animation_timer.start(self.timer_interval)
        super().enterEvent(event)

    def leaveEvent(self, event):
        self.animation_timer.stop()
        self.offset = 0
        self.updateShortText()
        super().leaveEvent(event)

    def animate_marquee(self):
        fm = QFontMetrics(self.font())
        text_width = fm.horizontalAdvance(self.fullText)

        if text_width <= self.width():
            self.animation_timer.stop()
            return

        self.offset -= self.speed
        if self.offset < -text_width:
            self.offset = self.width()

        self.update()  # repaint()

    def paintEvent(self, event: QPaintEvent):
        if not self.fullText:
            return

        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.TextAntialiasing)
        painter.setPen(self.palette().color(QtGui.QPalette.ColorRole.WindowText))
        fm = QFontMetrics(self.font())
        text_width = fm.horizontalAdvance(self.fullText)
        y = (self.height() + fm.ascent() - fm.descent()) // 2

        # Si le texte tient dans la largeur du widget → on le centre
        if text_width <= self.width():
            x = (self.width() - text_width) // 2
            painter.drawText(x, y, self.fullText)
        else:
            # Sinon, scroll horizontal depuis self.offset
            painter.drawText(self.offset, y, self.fullText)
            painter.drawText(self.offset + text_width + 50, y, self.fullText)

        painter.end()
