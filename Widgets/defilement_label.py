from PyQt6 import QtWidgets, QtCore, QtGui
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QFontMetrics, QPaintEvent, QPainter
from PyQt6.QtWidgets import QLabel

class DefilementLabel(QLabel):
    def __init__(self, text="", parent=None):
        super().__init__(parent)
        self.fullText = text
        self.offset = 0
        self.speed = 2  # Vitesse de défilement (ajuste si besoin)
        self.timer_interval = 20  # Intervalle timer en ms

        self.setStyleSheet("background: transparent; color: white;")
        self.setSizePolicy(QtWidgets.QSizePolicy.Policy.Expanding, QtWidgets.QSizePolicy.Policy.Fixed)
        self.setAlignment(Qt.AlignmentFlag.AlignCenter | Qt.AlignmentFlag.AlignVCenter)

        self.animation_timer = QTimer(self)
        self.animation_timer.timeout.connect(self.animate_marquee)
        self.setMouseTracking(True)

        self.updateTextMetrics()

    def setText(self, text: str):
        self.fullText = text
        self.updateTextMetrics()
        self.offset = 0
        super().setText(text)

    def updateTextMetrics(self):
        fm = QFontMetrics(self.font())
        self.text_width = fm.horizontalAdvance(self.fullText)
        self.widget_width = self.width()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.widget_width = self.width()
        self.updateTextMetrics()

    def enterEvent(self, event):
        if self.text_width > self.widget_width:
            self.animation_timer.start(self.timer_interval)
        super().enterEvent(event)

    def leaveEvent(self, event):
        self.animation_timer.stop()
        self.offset = 0
        self.update()
        super().leaveEvent(event)

    def animate_marquee(self):
        cycle_length = self.text_width + 50
        self.offset -= self.speed
        if self.offset <= -cycle_length:
            self.offset = 0
        self.update()

    def paintEvent(self, event: QPaintEvent):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.TextAntialiasing)
        painter.setPen(self.palette().color(QtGui.QPalette.ColorRole.WindowText))

        fm = QFontMetrics(self.font())
        y = (self.height() + fm.ascent() - fm.descent()) // 2

        if self.text_width <= self.widget_width:
            # Texte court, on centre normalement
            x = (self.widget_width - self.text_width) // 2
            painter.drawText(x, y, self.fullText)
        else:
            if not self.animation_timer.isActive():
                # Pas en défilement => on tronque avec ellipse et centre
                elided = fm.elidedText(self.fullText, Qt.TextElideMode.ElideRight, self.widget_width)
                text_width = fm.horizontalAdvance(elided)
                x = (self.widget_width - text_width) // 2
                painter.drawText(x, y, elided)
            else:
                # En défilement => texte défilant centré en boucle
                cycle_length = self.text_width + 50
                x_start = (self.widget_width - self.text_width) // 2

                painter.drawText(x_start + self.offset, y, self.fullText)
                painter.drawText(x_start + self.offset + cycle_length, y, self.fullText)

        painter.end()
