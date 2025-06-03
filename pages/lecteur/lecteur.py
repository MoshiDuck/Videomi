import logging
import os
import sys
import tempfile

import vlc
from PyQt6 import QtWidgets, QtCore
from PyQt6.QtGui import QShortcut, QKeySequence, QCursor

from config.config import SRT_DIR
from database.sous_titre_manager import SousTitreManager

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(levelname)s - %(message)s")


class Lecteur(QtWidgets.QMainWindow):
    def __init__(self, video_path=None):
        super().__init__()
        self.st_manager = SousTitreManager()
        self.st_manager.extract_subtitle_from_video(video_path)
        self.st_manager.close()
        self.video_path = video_path
        self.subs = []

        self.vlc_instance = None
        self.player = None
        self.merged_ass_path = None
        self.td = None

        self.timer = QtCore.QTimer(self)
        self.timer.setInterval(1000)  # 1 second interval, adjust if needed
        self.timer.timeout.connect(self.update_ui)

        self.setWindowTitle("Lecteur")

        # --- central widget unique et layout ---
        self.central_widget = QtWidgets.QWidget(self)
        self.setCentralWidget(self.central_widget)

        self.layout = QtWidgets.QVBoxLayout(self.central_widget)
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(0)

        # --- cadre vidéo ---
        self.videoframe = QtWidgets.QFrame(self.central_widget)
        self.videoframe.setStyleSheet("background-color: black;")
        self.layout.addWidget(self.videoframe)

        # --- barre de contrôle ---
        self.control_bar = QtWidgets.QWidget(self.central_widget)
        self.control_bar.setParent(self.central_widget)
        self.control_bar.setWindowFlags(QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Tool)
        self.control_bar.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents)

        self.control_bar.setFixedHeight(50)
        self.control_bar.setStyleSheet("background-color: rgba(0, 0, 0, 180); color: white;")
        control_layout = QtWidgets.QHBoxLayout(self.control_bar)
        control_layout.setContentsMargins(10, 0, 10, 0)

        play_btn = QtWidgets.QPushButton("Play")
        play_btn.clicked.connect(lambda: self.player.play() if self.player else None)
        control_layout.addWidget(play_btn)

        pause_btn = QtWidgets.QPushButton("Pause")
        pause_btn.clicked.connect(lambda: self.player.pause() if self.player else None)
        control_layout.addWidget(pause_btn)

        # Position initiale et visibilité
        self.control_bar.setGeometry(0, self.videoframe.height() - self.control_bar.height(),
                                     self.videoframe.width(), self.control_bar.height())
        self.control_bar.hide()

        # Gestion du resize pour repositionner la barre
        self.videoframe.resizeEvent = self.resize_overlay

        # Timer pour cacher la barre après 3 secondes d'inactivité
        self.hide_bar_timer = QtCore.QTimer(self)
        self.hide_bar_timer.setInterval(3000)
        self.hide_bar_timer.timeout.connect(self.control_bar.hide)

        # Timer pour vérifier la position de la souris
        self.cursor_monitor = QtCore.QTimer(self)
        self.cursor_monitor.setInterval(200)
        self.cursor_monitor.timeout.connect(self.check_mouse_position)
        self.cursor_monitor.start()

        # Mode plein écran
        self.showFullScreen()

        self.setup_shortcuts()

        # Init VLC player (à appeler dans run)
        self.vlc_instance = None
        self.player = None

    def resize_overlay(self, event):
        pos = self.videoframe.pos()
        self.control_bar.setGeometry(
            pos.x(),
            pos.y() + self.videoframe.height() - self.control_bar.height(),
            self.videoframe.width(),
            self.control_bar.height()
        )
        self.control_bar.raise_()
        self.control_bar.show()

        event.accept()

    def check_mouse_position(self):
        global_pos = QCursor.pos()
        local_pos = self.videoframe.mapFromGlobal(global_pos)

        logging.debug(f"check_mouse_position appelé - position souris locale : {local_pos.x()}, {local_pos.y()}")

        if 0 <= local_pos.y() <= self.videoframe.height() and local_pos.y() > self.videoframe.height() - 80:
            logging.debug("Souris en bas : affichage de la barre.")
            self.show_control_bar()
        else:
            # On ne cache pas tout de suite la barre ici, c'est géré par le timer
            pass

    def show_control_bar(self):
        logging.debug(f"show_control_bar appelé - visible avant: {self.control_bar.isVisible()}")
        if not self.control_bar.isVisible():
            self.control_bar.show()
            logging.info("control_bar.show() appelé")
        else:
            logging.debug("control_bar déjà visible")

        # Repositionne la barre pour être sûr qu'elle soit visible
        geom = (
            0,
            self.videoframe.height() - self.control_bar.height(),
            self.videoframe.width(),
            self.control_bar.height()
        )
        self.control_bar.setGeometry(*geom)
        logging.debug(f"control_bar position et taille mises à jour : {geom}")

        self.control_bar.raise_()
        logging.debug("control_bar.raise_() appelé")

        self.control_bar.repaint()
        logging.debug("control_bar.repaint() appelé")

        self.hide_bar_timer.start()
        logging.debug("hide_bar_timer démarré")

    def setup_shortcuts(self):
        QShortcut(QKeySequence("+"), self, activated=lambda: self.adjust_delay(100))
        QShortcut(QKeySequence("-"), self, activated=lambda: self.adjust_delay(-100))
        QShortcut(QKeySequence("R"), self, activated=lambda: self.player.video_set_spu_delay(0) if self.player else None)
        QShortcut(QKeySequence("Q"), self, activated=self.close)

    def adjust_delay(self, delta):
        if self.player:
            cur = self.player.video_get_spu_delay()
            self.player.video_set_spu_delay(cur + delta)
            logging.info(f"Délai actuel : {self.player.video_get_spu_delay() // 1000} ms")

    def eventFilter(self, source, event):
        if event.type() == QtCore.QEvent.Type.MouseMove:
            global_pos = QCursor.pos()
            local_pos = self.videoframe.mapFromGlobal(global_pos)

            if 0 <= local_pos.y() <= self.videoframe.height() and local_pos.y() > self.videoframe.height() - 80:
                logging.debug("eventFilter : souris en bas")
                self.show_control_bar()

            self.hide_bar_timer.start()
        return False

    def hide_control_bar(self):
        logging.debug(f"hide_control_bar appelé - visible avant: {self.control_bar.isVisible()}")
        self.control_bar.hide()
        logging.info("control_bar.hide() appelé")

    def mouseMoveEvent(self, event):
        cursor_y = event.position().y()
        screen_height = self.height()
        if cursor_y > screen_height - 80:  # Si la souris est dans les 80 derniers pixels
            self.show_control_bar()
        self.hide_bar_timer.start()

    def enterEvent(self, event):
        self.show_control_bar()

    @staticmethod
    def parse_srt_time(ts):
        # Format attendu : "HH:MM:SS,mmm"
        h, m, rest = ts.strip().split(":")
        s, ms = rest.split(",")
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

    @staticmethod
    def format_ass_time(sec):
        h, rem = divmod(int(sec), 3600)
        m, s = divmod(rem, 60)
        cs = int((sec - int(sec)) * 100)
        return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

    def srt_to_ass(self, srt_path, style):
        ass_lines = []
        with open(srt_path, encoding="utf-8") as f:
            lines = [l.strip() for l in f if l.strip()]

        i = 0
        while i < len(lines):
            if "-->" in lines[i]:
                start, end = map(str.strip, lines[i].split("-->"))
                a_start = self.format_ass_time(self.parse_srt_time(start))
                a_end = self.format_ass_time(self.parse_srt_time(end))

                text_lines = []
                i += 1
                while i < len(lines) and not lines[i].isdigit() and "-->" not in lines[i]:
                    text_lines.append(lines[i])
                    i += 1

                # Escape ligne multiple avec \N (ASS format)
                ass_lines.append(
                    f"Dialogue: 0,{a_start},{a_end},{style},,0,0,0,,{'\\N'.join(text_lines)}"
                )
            else:
                i += 1

        return "\n".join(ass_lines)

    @staticmethod
    def create_ass_header():
        return (
            "[Script Info]\n"
            "ScriptType: v4.00+\n"
            "PlayResX: 384\n"
            "PlayResY: 288\n\n"
            "[V4+ Styles]\n"
            "Style: TopSub,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,"
            "0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,0\n"
            "Style: BottomSub,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,"
            "0,0,0,0,100,100,0,0,1,2,0,8,10,10,10,0\n\n"
            "[Events]\n"
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )

    def init_vlc(self):
        self.vlc_instance = vlc.Instance([
            f"--sub-file={self.merged_ass_path}",
            "--file-caching=3000",
            "--network-caching=3000",
            "--avcodec-hw=none",
            "--audio-time-stretch"
        ])
        self.player = self.vlc_instance.media_player_new()
        self.player.set_media(self.vlc_instance.media_new(self.video_path))

        if sys.platform.startswith("linux"):
            self.player.set_xwindow(self.videoframe.winId())
        elif sys.platform == "win32":
            self.player.set_hwnd(int(self.videoframe.winId()))
        elif sys.platform == "darwin":
            self.player.set_nsobject(int(self.videoframe.winId()))

        self.videoframe.show()
        QtCore.QTimer.singleShot(100, self.player.play)
        self.player.audio_set_track(0)
        self.timer.start()

    def update_ui(self):
        if self.player and self.player.get_state() == vlc.State.Ended:
            logging.info("La vidéo est terminée.")

    def run(self):
        try:
            if not self.video_path:
                raise ValueError("Aucun chemin vidéo fourni.")

            # Lister tous les .srt du dossier
            # Chercher tous les .srt dans les sous-dossiers du dossier SRT correspondant
            video_title = os.path.splitext(os.path.basename(self.video_path))[0]
            srt_root = os.path.join(SRT_DIR, video_title)

            srt_files = []
            for root, _, files in os.walk(srt_root):
                for f in files:
                    if f.lower().endswith(".srt"):
                        srt_files.append(os.path.join(root, f))

            if len(srt_files) < 2:
                QtWidgets.QMessageBox.critical(self, "Erreur", "Moins de deux fichiers .srt trouvés dans le dossier.")
                return

            # Afficher la liste et demander à l'utilisateur de choisir 2 fichiers
            choices = []
            for i, path in enumerate(srt_files):
                # Extraire la langue : dossier parent direct du fichier .srt
                langue = os.path.basename(os.path.dirname(path))
                choices.append(f"{i}: {langue}")
            c1, ok1 = QtWidgets.QInputDialog.getInt(self, "Sous-titre 1", "\n".join(choices))
            if not ok1:
                return
            c2, ok2 = QtWidgets.QInputDialog.getInt(self, "Sous-titre 2", "\n".join(choices))
            if not ok2:
                return

            # Chemins absolus vers les deux fichiers .srt sélectionnés
            srt_paths = [
                srt_files[c1],
                srt_files[c2]
            ]

            # Créer le fichier .ass fusionné temporaire
            self.td = tempfile.TemporaryDirectory()
            self.merged_ass_path = os.path.join(self.td.name, "merged.ass")

            with open(self.merged_ass_path, "w", encoding="utf-8") as f:
                f.write(self.create_ass_header())
                f.write(self.srt_to_ass(srt_paths[0], "TopSub") + "\n")
                f.write(self.srt_to_ass(srt_paths[1], "BottomSub"))

            # Lancer VLC
            self.init_vlc()
            self.show()

        except Exception as e:
            logging.error(f"Erreur : {e}")
            QtWidgets.QMessageBox.critical(self, "Erreur", str(e))

    def closeEvent(self, event):
        if self.td:
            self.td.cleanup()
        event.accept()

