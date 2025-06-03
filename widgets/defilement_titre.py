from PyQt6 import QtWidgets, QtCore, QtGui

class DefilementTitre(QtWidgets.QLabel):
    def __init__(self, text, parent=None):
        super().__init__(parent)
        self.fullText = text
        self.setText(text)
        self.setStyleSheet("background: transparent; color: white;")
        self.setSizePolicy(QtWidgets.QSizePolicy.Expanding, QtWidgets.QSizePolicy.Fixed)
        self.setFixedHeight(20)
        self.setAlignment(QtCore.Qt.AlignLeft | QtCore.Qt.AlignVCenter)

        self.offset = 0
        self.speed = 2  # ← vitesse plus élevée (pixels par tick)
        self.animation_timer = QtCore.QTimer(self)
        self.animation_timer.timeout.connect(self.animate_marquee)
        self.animation_timer.setInterval(20)  # ← plus fréquent = plus fluide

        self.setMouseTracking(True)

    def updateShortText(self):
        fm = QtGui.QFontMetrics(self.font())
        elided = fm.elidedText(self.fullText, QtCore.Qt.ElideRight, self.width())
        self.setText(elided)

    def enterEvent(self, event):
        self.setText(self.fullText)
        self.offset = 0
        self.animation_timer.start()
        super().enterEvent(event)

    def leaveEvent(self, event):
        self.animation_timer.stop()
        self.offset = 0
        self.updateShortText()
        super().leaveEvent(event)

    def animate_marquee(self):
        fm = QtGui.QFontMetrics(self.font())
        text_width = fm.horizontalAdvance(self.fullText)
        if text_width <= self.width():
            return

        self.offset -= self.speed
        if self.offset < -text_width:
            self.offset = self.width()

        self.repaint()

    def paintEvent(self, event):
        painter = QtGui.QPainter(self)
        painter.setPen(self.palette().color(QtGui.QPalette.WindowText))
        fm = QtGui.QFontMetrics(self.font())
        y = (self.height() + fm.ascent() - fm.descent()) // 2

        painter.drawText(self.offset, y, self.fullText)
