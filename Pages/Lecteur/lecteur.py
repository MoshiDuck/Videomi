import json
import os
import platform
import socket
import subprocess
import sys
import time
from pathlib import Path

import pywintypes
import win32file
from PyQt6.QtCore import QTimer, QSize, pyqtSignal, Qt
from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QFrame,
    QSizePolicy, QApplication, QHBoxLayout
)

from Pages.Lecteur.Bar_Sec.bar_sec_lect import BarSecLect
from Widgets.bar_fenetre import BarFenetre
from Widgets.icon_perso import IconPerso

# Constantes de chemins
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MPV_DIR = PROJECT_ROOT / "Ressource" / "mpv"
MPV_EXE = MPV_DIR / "mpv.exe"

# Ajouter MPV_DIR au PATH
os.environ["PATH"] = f"{MPV_DIR}{os.pathsep}{os.environ.get('PATH', '')}"

class Lecteur(QMainWindow):
    def __init__(self, stream_urls: list[str], taille_ecran: QSize | None = None):
        super().__init__()

        self.stream_urls = stream_urls.copy()
        self.current_index = 0
        self.process = None

        self.resize(taille_ecran if taille_ecran else QSize(800, 600))

        self._setup_ui()

        QTimer.singleShot(200, self.lancer_video)

    def _setup_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        self.central_layout = QVBoxLayout(central_widget)
        self.central_layout.setContentsMargins(0, 0, 0, 0)
        self.central_layout.setSpacing(0)

        self.video_frame = QFrame()
        self.video_frame.setStyleSheet("background-color: black;")
        self.video_frame.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.central_layout.addWidget(self.video_frame, 1)

        self.top_bar = BarFenetre(parent=self)
        self.top_bar.setVisible(False)
        self.top_bar.setGeometry(0, 0, self.width(), 30)
        self.top_bar.raise_()

        # Utilisation de la classe BottomBar
        self.bottom_bar = BarSecLect(parent=self)
        self.bottom_bar.setVisible(False)
        self.bottom_bar.setGeometry(0, self.height() - self.bottom_bar.height(), self.width(), self.bottom_bar.height())

        self.bottom_bar.raise_()

        # Timer pour cacher la barre après inactivity souris
        self.hide_bar_timer = QTimer(self)
        self.hide_bar_timer.setInterval(1500)
        self.hide_bar_timer.timeout.connect(self.cacher_barre)
        self.bottom_bar.play_pause_clicked.connect(self.toggle_play_pause)
        self.bottom_bar.prev_clicked.connect(self.video_precedente)
        self.bottom_bar.next_clicked.connect(self.video_suivante)

        # Activer suivi souris partout où nécessaire
        self.setMouseTracking(True)
        self.centralWidget().setMouseTracking(True)
        self.video_frame.setMouseTracking(True)
        self.top_bar.setMouseTracking(True)
        self.bottom_bar.setMouseTracking(True)
        self.showFullScreen()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.top_bar.setGeometry(0, 0, self.width(), 30)
        self.bottom_bar.setGeometry(0, self.height() - self.bottom_bar.height(), self.width(), self.bottom_bar.height())

    def video_precedente(self):
        if not self.stream_urls:
            return
        self.current_index = (self.current_index - 1) % len(self.stream_urls)
        self._restart_video()

    def video_suivante(self):
        if not self.stream_urls:
            return
        self.current_index = (self.current_index + 1) % len(self.stream_urls)
        self._restart_video()

    def _restart_video(self):
        # Termine proprement le process en cours
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except Exception as e:
                print(f"Erreur arrêt mpv : {e}")
                self.process.kill()
            self.process = None
        self.lancer_video()

    def lancer_video(self):
        if not self.stream_urls:
            print("Aucune URL fournie")
            return

        url = self.stream_urls[self.current_index]
        window_id = str(int(self.video_frame.winId()))

        system = platform.system()
        if system == "Windows":
            ipc_path = r"\\.\pipe\mpvsocket"
        else:
            ipc_path = "/tmp/mpvsocket"

        self.ipc_path = ipc_path  # sauvegarde pour la suite

        print("=== LANCEMENT MPV DANS QFRAME (PLEIN ÉCRAN) ===")
        print(f"MPV : {MPV_EXE}")
        print(f"URL : {url}")
        print(f"Window ID : {window_id}")
        print(f"IPC PATH : {ipc_path}")

        try:
            self.process = subprocess.Popen(
                [
                    str(MPV_EXE),
                    url,
                    f"--wid={window_id}",
                    "--no-terminal",
                    f"--input-ipc-server={ipc_path}"
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
        except Exception as e:
            print(f"Erreur lancement MPV : {e}")

    def mouseMoveEvent(self, event):
        pos = event.pos()
        height = self.height()

        if pos.y() <= 30:
            if not self.top_bar.isVisible():
                self.top_bar.setVisible(True)
            self.hide_bar_timer.start()
        elif pos.y() >= height - 30:
            if not self.bottom_bar.isVisible():
                self.bottom_bar.setVisible(True)
            self.hide_bar_timer.start()
        else:
            if not self.top_bar.underMouse() and not self.bottom_bar.underMouse():
                if not self.hide_bar_timer.isActive():
                    self.hide_bar_timer.start()
            else:
                self.hide_bar_timer.stop()

        super().mouseMoveEvent(event)

    def toggle_play_pause(self, is_playing):
        system = platform.system()
        delay = 100
        if system == "Windows":
            QTimer.singleShot(delay, self._toggle_play_pause_windows)
        else:
            QTimer.singleShot(delay, self._toggle_play_pause_unix)

    def _toggle_play_pause_unix(self):
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
                client.connect(self.ipc_path)
                cmd = {"command": ["cycle", "pause"]}
                client.send((json.dumps(cmd) + "\n").encode())
        except Exception as e:
            print(f"Erreur envoi commande pause Unix: {e}")

    def _toggle_play_pause_ipc(self):
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
                client.connect(self.ipc_path)
                cmd = {"command": ["cycle", "pause"]}
                client.send((json.dumps(cmd) + "\n").encode())
        except Exception as e:
            print(f"Erreur envoi commande pause via IPC: {e}")

    def _toggle_play_pause_windows(self):
        max_tries = 5
        for attempt in range(max_tries):
            try:
                handle = win32file.CreateFile(
                    self.ipc_path,
                    win32file.GENERIC_READ | win32file.GENERIC_WRITE,
                    0, None,
                    win32file.OPEN_EXISTING,
                    0, None
                )
                break
            except pywintypes.error as e:
                if e.winerror == 2:  # ERROR_FILE_NOT_FOUND
                    time.sleep(0.2)
                else:
                    print(f"Erreur pipe mpv: {e}")
                    return
        else:
            print("Impossible d'ouvrir le pipe mpv après plusieurs tentatives")
            return

        cmd = {"command": ["cycle", "pause"]}
        data = (json.dumps(cmd) + "\n").encode('utf-8')
        try:
            win32file.WriteFile(handle, data)
        except Exception as e:
            print(f"Erreur écriture pipe mpv: {e}")
        finally:
            win32file.CloseHandle(handle)

    def cacher_barre(self):
        if not self.top_bar.underMouse() and not self.bottom_bar.underMouse():
            self.top_bar.setVisible(False)
            self.bottom_bar.setVisible(False)
            self.hide_bar_timer.stop()

    def closeEvent(self, event):
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except Exception as e:
                print(f"Erreur : {e}")
                self.process.kill()
            self.process = None
        super().closeEvent(event)


def main():
    app = QApplication(sys.argv)
    dossier_script = Path(__file__).parent
    dossier_projet = dossier_script.parent.parent

    chemin_style = dossier_projet / "Config" / "style.qss"

    with open(chemin_style, "r", encoding="utf-8") as f:
        app.setStyleSheet(f.read())

    taille_ecran = QSize(1280, 720)
    urls_test = [
        "https://www.youtube.com/watch?v=GCW1cWMlrDA",
        "https://www.youtube.com/watch?v=GoN0-7z6NZk"
    ]

    lecteur = Lecteur(stream_urls=urls_test, taille_ecran=taille_ecran)
    lecteur.show()

    sys.exit(app.exec())


if __name__ == "__main__":

    main()
