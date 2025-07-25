# lecteur.py
import subprocess
from pathlib import Path

from PyQt6.QtCore import QTimer

from Widgets.base_fenetre import BaseFenetre

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MPV_PATH = PROJECT_ROOT / "Ressource" / "mpv" / "mpv.exe"

if not MPV_PATH.exists():
    raise FileNotFoundError(f"mpv non trouvé à {MPV_PATH}")

class Lecteur(BaseFenetre):
    def __init__(self, stream_url: str, on_finished=None):
        super().__init__()
        self.url = stream_url
        self.on_finished = on_finished
        self.lancer(self.url)

    def lancer(self, stream_url: str):
        print(f"\n🎬 Lecture avec mpv : {stream_url}")
        cmd = [str(MPV_PATH), stream_url]
        subprocess.run(cmd)

        if self.on_finished:
            from PyQt6.QtCore import QTimer
            QTimer.singleShot(100, self.on_finished)
        self.close()
