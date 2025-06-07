# widgets/volume_slider.py
from PyQt6.QtWidgets import QSlider
from PyQt6.QtCore import Qt, pyqtSignal

class VolumeSlider(QSlider):
    """
    QSlider horizontal avec plage 0–150 et style dynamique :
    - Orange de 0 à 100
    - Rouge pastel plus voyant de 101 à 150
    Permet de personnaliser la largeur via le paramètre `width`.
    Émet un signal volumeChanged(int) à chaque modification.
    """
    volumeChanged = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(Qt.Orientation.Horizontal, parent)
        # Plage de volume 0–150
        self.setRange(0, 150)
        self.setValue(100)
        # Largeur paramétrable
        self.setFixedWidth(200)
        self.setToolTip("Volume")
        # Connexion interne
        self.valueChanged.connect(self._on_value_changed)
        # Appliquer le style initial
        self._update_style(self.value())

    def _on_value_changed(self, value: int):
        # Mise à jour du style
        self._update_style(value)
        # Réémission du signal
        self.volumeChanged.emit(value)

    def _update_style(self, value: int):
        # Choix de couleur : orange jusqu'à 100, rouge pastel au-delà
        color = "#FFA500" if value <= 100 else "#FF5C5C"
        self.setStyleSheet(f"""
            QSlider::groove:horizontal {{
                height: 6px;
                background: #ccc;
                border-radius: 3px;
            }}
            QSlider::handle:horizontal {{
                background: white;
                border: 1px solid #999;
                width: 12px;
                margin: -3px 0;
                border-radius: 6px;
            }}
            QSlider::sub-page:horizontal {{
                background: {color};
                border-radius: 3px;
            }}
            QSlider::add-page:horizontal {{
                background: #444;
                border-radius: 3px;
            }}
        """)
