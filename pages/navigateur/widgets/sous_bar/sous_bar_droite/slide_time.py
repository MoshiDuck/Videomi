from PySide6.QtWidgets import QWidget, QLabel, QHBoxLayout, QSlider, QSizePolicy
from PySide6.QtCore import Qt, Signal

from config.colors import PRIMARY_COLOR, TEXT_COLOR_LIGHT

class SlideTime(QWidget):
    valueChanged = Signal(int)
    def __init__(self, max_hours=2):
        super().__init__()
        self.step_minutes = 30
        self.max_minutes = max_hours * 60
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.label = QLabel("00:00")
        self.label.setFixedWidth(50)
        self.label.setAlignment(Qt.AlignRight | Qt.AlignVCenter)

        self.slider = QSlider(Qt.Orientation.Horizontal)
        self.slider.setMinimum(0)
        self.slider.setMaximum(self.max_minutes)
        self.slider.setTickInterval(self.step_minutes)
        self.slider.setSingleStep(self.step_minutes)
        self.slider.setPageStep(self.step_minutes)
        self.slider.setTickPosition(QSlider.TicksBelow)

        self.slider.setValue(self.max_minutes)  # Valeur initiale au maximum
        self.update_label(self.max_minutes)

        # Style
        self.slider.setStyleSheet(f"""
            QSlider::handle:horizontal {{
                background: {PRIMARY_COLOR};
                border-radius: 10px;
                width: 20px;
                height: 20px;
                margin: -7px 0;
            }}
            QSlider::groove:horizontal {{
                height: 6px;
                background: {TEXT_COLOR_LIGHT};
                border-radius: 3px;
            }}
            QSlider::sub-page:horizontal {{
                background: {PRIMARY_COLOR};
                border-radius: 3px;
            }}
        """)

        self.slider.valueChanged.connect(self.align_to_step)

        layout = QHBoxLayout()
        layout.addWidget(self.label)
        layout.addWidget(self.slider)
        self.setLayout(layout)
        self.slider.valueChanged.connect(self.on_slider_value_changed)

    def align_to_step(self, value):
        nearest_step = round(value / self.step_minutes) * self.step_minutes
        if nearest_step != value:
            self.slider.blockSignals(True)
            self.slider.setValue(nearest_step)
            self.slider.blockSignals(False)
        self.update_label(nearest_step)

    def update_label(self, value):
        h = value // 60
        m = value % 60
        s = 0
        self.label.setText(f"{h:02d}:{m:02d}:{s:02d}")

    def on_slider_value_changed(self, value):
        self.align_to_step(value)
        self.valueChanged.emit(value)

