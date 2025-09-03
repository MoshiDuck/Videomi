# Todo : slide_temps.py
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import QWidget, QHBoxLayout, QSlider, QLabel

def seconds_to_hms(seconds: int) -> str:
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    return f"{h:02}:{m:02}:{s:02}"

class SlideTemps(QWidget):
    valueChanged = pyqtSignal(int)
    def __init__(self, minimum=0, maximum=3600, parent=None):
        super().__init__(parent)
        self.setFixedHeight(32)

        self.slider = QSlider(Qt.Orientation.Horizontal)
        self.slider.setRange(minimum, maximum)
        self.label = QLabel(seconds_to_hms(self.slider.value()))
        self.label.setObjectName("time_label")
        self.label.setMinimumWidth(70)
        self.label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)
        layout.addWidget(self.label)
        layout.addWidget(self.slider)
        self.slider.valueChanged.connect(self.update_label)
        self.slider.valueChanged.connect(self.valueChanged.emit)

    def update_label(self, value):
        self.label.setText(seconds_to_hms(value))

    def value(self):
        return self.slider.value()

    def set_value(self, value):
        self.slider.setValue(value)

    def set_range(self, minimum, maximum):
        self.slider.setRange(minimum, maximum)

