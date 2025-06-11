from PyQt6 import QtCore, QtWidgets
from PyQt6.QtWidgets import QSlider, QStyleOptionSlider, QStyle
from PyQt6.QtCore import Qt, pyqtSignal

class VolumeSlider(QSlider):
    volumeChanged = pyqtSignal(int)
    sliderReleasedValue = pyqtSignal(int)
    hoverValue = pyqtSignal(int)
    leaveHover = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(Qt.Orientation.Horizontal, parent)
        self.setRange(0, 150)
        self.setValue(100)
        self.setFixedWidth(200)
        self.setToolTip("Volume")
        self.valueChanged.connect(self._on_value_changed)
        self._update_style(self.value())

    def _on_value_changed(self, value: int):
        self._update_style(value)
        self.volumeChanged.emit(value)

    def _update_style(self, value: int):
        if value > 125:
            color = "#FF1E1E"  # rouge sévère
        elif value > 100:
            color = "#FF5C5C"  # rouge doux
        else:
            color = "#FFA500"  # orange
        self.setStyleSheet(f"""
            QSlider::groove:horizontal {{
                height: 6px;
                background: #444;
                border-radius: 3px;
            }}
            QSlider::handle:horizontal {{
                background: {color};
                border: 2px;
                width: 12px;
                height: 12px;
                margin: -4px 0px;  /* vertical: centre le cercle */
                border-radius: 6px;  /* cercle (rayon = moitié du côté) */
            }}
            QSlider::sub-page:horizontal {{
                background: {color};
                border-top-left-radius: 3px;
                border-bottom-left-radius: 3px;
            }}
            QSlider::add-page:horizontal {{
                background: #444;
                border-top-right-radius: 3px;
                border-bottom-right-radius: 3px;
            }}
        """)

    def mousePressEvent(self, event):
        if event.button() == QtCore.Qt.MouseButton.LeftButton:
            val = self.pickValue(int(event.position().x()))
            self.setValue(val)
            self.setSliderDown(True)
            self.sliderMoved.emit(val)
            super().mousePressEvent(event)  # ← important pour activer le drag natif
            event.accept()
        else:
            super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        val = self.pickValue(int(event.position().x()))
        if not self.isSliderDown():
            self.hoverValue.emit(val)
        super().mouseMoveEvent(event)  # ← toujours appeler pour le drag
        event.accept()

    def mouseReleaseEvent(self, event):
        if event.button() == QtCore.Qt.MouseButton.LeftButton and self.isSliderDown():
            val = self.value()
            self.setSliderDown(False)
            self.sliderReleasedValue.emit(val)
            event.accept()
        else:
            super().mouseReleaseEvent(event)

    def pickValue(self, x_pos: int) -> int:
        """Calcule la valeur du slider en fonction de l'abscisse du clic/déplacement."""
        opt = QStyleOptionSlider()
        self.initStyleOption(opt)
        style = self.style()
        groove = style.subControlRect(
            QtWidgets.QStyle.ComplexControl.CC_Slider, opt,
            QtWidgets.QStyle.SubControl.SC_SliderGroove, self
        )
        # Position relative dans le groove
        rel = x_pos - groove.x()
        # Conversion pixel → valeur
        return style.sliderValueFromPosition(
            self.minimum(), self.maximum(),
            rel, groove.width(), opt.upsideDown
        )



