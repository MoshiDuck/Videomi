from PyQt6.QtCore import pyqtSignal, Qt, QSize
from PyQt6.QtWidgets import QWidget, QHBoxLayout, QSlider
import qtawesome as qta
from Widgets.icon_perso import IconPerso

MAX_VOLUME = 200

class VolumeControlLect(QWidget):
    volume_changed = pyqtSignal(int)
    mute_toggled = pyqtSignal(bool)

    def __init__(self, parent=None, initial=100, slider_width: int = 120):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setAutoFillBackground(False)

        self._volume = max(0, min(MAX_VOLUME, int(initial)))
        self._previous_volume = self._volume if self._volume > 0 else 50
        self._muted = (self._volume == 0)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 20, 0)
        layout.setSpacing(6)

        self.icon = IconPerso(
            initial_state=not self._muted,
            icon_true_name=self._get_icon_name(self._volume),
            icon_false_name="mdi.volume-mute",
            icon_size=QSize(20, 20),
            flash_color=False
        )
        self.icon.setStyleSheet("background: transparent; border: none; padding: 0; margin: 0;")
        self.icon.setFixedSize(22, 22)

        self.slider = QSlider(Qt.Orientation.Horizontal, self)
        self.slider.setRange(0, MAX_VOLUME)
        self.slider.setValue(self._volume)
        self.slider.setFixedWidth(slider_width)
        self.slider.setFixedHeight(18)
        self.slider.setSingleStep(1)
        self.slider.setTracking(True)
        self.slider.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

        layout.addStretch(1)
        layout.addWidget(self.icon, 0, Qt.AlignmentFlag.AlignVCenter)
        layout.addWidget(self.slider, 0, Qt.AlignmentFlag.AlignVCenter)


        self.slider.valueChanged.connect(self._on_slider_changed)
        self.icon.state_changed.connect(self._on_icon_toggled)

        self._update_icon()

    @staticmethod
    def _get_icon_name(volume):
        if volume == 0:
            return "mdi.volume-mute"
        elif volume <= 50:
            return "mdi.volume-low"
        elif volume <= 100:
            return "mdi.volume-medium"
        else:
            return "mdi.volume-high"

    @staticmethod
    def _get_slider_color(volume):
        """
        Palette : muted grey (0) -> vert -> jaune -> orange -> rouge vif (>150)
        Paliers : 0 | <=50 | <=100 | <=150 | >150
        """
        if volume == 0:
            return "#c8c8c8"   # gris clair (muet)
        elif volume <= 50:
            return "#00cc44"   # vert
        elif volume <= 100:
            return "#ffd700"   # jaune (doré)
        elif volume <= 150:
            return "#ff9900"   # orange
        else:
            return "#ff0000"   # rouge vif (au-delà de 150%)

    def _update_icon(self):
        """
        Met à jour l'icône et le style du slider en utilisant la couleur
        déterminée par _get_slider_color(self._volume).
        """
        icon_name = "mdi.volume-mute" if self._muted or self._volume == 0 else self._get_icon_name(self._volume)
        # récupérer couleur selon volume (pour slider + icône)
        color = self._get_slider_color(self._volume)
        try:
            # appliquer cette couleur à l'icône si possible
            self.icon.icon_true = qta.icon(icon_name, color=color)
        except Exception:
            # fallback : tenter d'utiliser la couleur déjà définie sur l'icône
            try:
                self.icon.icon_true = qta.icon(icon_name, color=getattr(self.icon, "color", None))
            except Exception:
                pass
        self.icon.update_icon()

        border_color = self._darken_color(color, 0.8) if isinstance(color, str) and color.startswith("#") else color

        self.slider.setStyleSheet(f"""
            QSlider::groove:horizontal {{
                height: 6px;
                background: #2a2a2a;
                border-radius: 3px;
            }}
            QSlider::sub-page:horizontal {{
                background: {color};
                border-radius: 3px;
            }}
            QSlider::add-page:horizontal {{
                background: transparent;
            }}
            QSlider::handle:horizontal {{
                background: {color};
                border: 1px solid {border_color};
                width: 14px;
                height: 14px;
                margin: -4px 0;
                border-radius: 7px;
            }}
            QSlider::handle:horizontal:hover {{
                width: 16px;
                height: 16px;
                margin: -5px 0;
            }}
        """)

    @staticmethod
    def _darken_color(hex_color, factor):
        hex_color = hex_color.lstrip('#')
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        r = max(0, int(r * factor))
        g = max(0, int(g * factor))
        b = max(0, int(b * factor))
        return f"#{r:02x}{g:02x}{b:02x}"

    def _on_slider_changed(self, value):
        self._volume = value
        if value > 0:
            self._previous_volume = value
        self._muted = (value == 0)
        self.icon.set_state(not self._muted)
        self._update_icon()
        self.volume_changed.emit(value)

    def _on_icon_toggled(self, state):
        if state:  # Unmute
            self._muted = False
            self.slider.blockSignals(True)
            self.slider.setValue(self._previous_volume)
            self.slider.blockSignals(False)
            self._volume = self._previous_volume
            self.volume_changed.emit(self._previous_volume)
        else:  # Mute
            self._muted = True
            self._previous_volume = self._volume if self._volume > 0 else self._previous_volume
            self.slider.blockSignals(True)
            self.slider.setValue(0)
            self.slider.blockSignals(False)
            self._volume = 0
            self.volume_changed.emit(0)

        self._update_icon()
        self.mute_toggled.emit(self._muted)

    def _toggle_mute(self):
        self._on_icon_toggled(not self._muted)