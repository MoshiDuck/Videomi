from PyQt6.QtWidgets import QSlider
from PyQt6.QtCore import Qt, pyqtSignal

class VolumeSlider(QSlider):
    volumeChanged = pyqtSignal(int)

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
        color = "#FFA500" if value <= 100 else "#FF5C5C"
        self.setStyleSheet(f"""
            QSlider::groove:horizontal {{
                height: 6px;
                background: #444;  /* fond gris foncé */
                border-radius: 3px;
            }}
            QSlider::handle:horizontal {{
                width: 0px;
                height: 0px;
                margin: 0px;
                border: none;
            }}
            QSlider::sub-page:horizontal {{
                background: {color};
                border-top-left-radius: 3px;
                border-bottom-left-radius: 3px;
                border-top-right-radius: 0;
                border-bottom-right-radius: 0;
            }}
            QSlider::add-page:horizontal {{
                background: #444;
                border-top-right-radius: 3px;
                border-bottom-right-radius: 3px;
                border-top-left-radius: 0;
                border-bottom-left-radius: 0;
            }}
        """)
