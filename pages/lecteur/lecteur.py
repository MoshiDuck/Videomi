import os
import subprocess
import tempfile
import json
import logging
import sys

from PyQt6.QtGui import QShortcut, QKeySequence

from config.config import FFPROBE_PATH, FFMPEG_PATH

import vlc
from PyQt6 import QtWidgets, QtCore

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

class Lecteur(QtWidgets.QMainWindow):
    def __init__(self, video_path=None):
        super().__init__()
        self.video_path = video_path
        self.subs = []
        self.vlc_instance = None
        self.player = None
        self.merged_ass_path = None
        self.setup_shortcuts()
        self.setWindowTitle("Lecteur vidéo VLC intégré PyQt6")
        self.resize(960, 540)

        # Widget pour afficher la vidéo VLC
        self.videoframe = QtWidgets.QFrame(self)
        self.setCentralWidget(self.videoframe)

        # Timer pour gérer l'interface (ex: fin vidéo)
        self.timer = QtCore.QTimer(self)
        self.timer.setInterval(200)
        self.timer.timeout.connect(self.update_ui)

    def get_subtitle_streams(self):
        cmd = [
            FFPROBE_PATH, "-v", "error",
            "-show_entries", "stream=index,codec_type,codec_name:stream_tags=language",
            "-select_streams", "s", "-of", "json", self.video_path
        ]
        try:
            out = subprocess.check_output(cmd, text=True)
        except subprocess.CalledProcessError as e:
            logging.error("Erreur lors de l'exécution de ffprobe: %s", e)
            raise

        data = json.loads(out)
        subs = []
        for st in data.get("streams", []):
            if st.get("codec_type") == "subtitle":
                subs.append({
                    "index": st["index"],
                    "codec": st.get("codec_name"),
                    "language": st.get("tags", {}).get("language", "inconnu")
                })
        if not subs:
            raise ValueError("Aucun sous-titre trouvé")
        self.subs = subs
        return subs

    def extract_srt(self, stream_index, out_srt):
        cmd = [
            FFMPEG_PATH, "-y",
            "-i", self.video_path,
            "-map", f"0:{stream_index}",
            "-c:s", "srt",
            out_srt
        ]
        try:
            subprocess.run(cmd, check=True)
        except subprocess.CalledProcessError as e:
            logging.error("Erreur lors de l'extraction des sous-titres: %s", e)
            raise

    @staticmethod
    def format_ass_time(sec_float):
        h = int(sec_float // 3600)
        m = int((sec_float % 3600) // 60)
        s = int(sec_float % 60)
        cs = int((sec_float - int(sec_float)) * 100)
        return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

    @staticmethod
    def parse_srt_time(ts):
        h, m, rest = ts.strip().split(":")
        s, ms = rest.split(",")
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

    def srt_to_ass(self, srt_path, style):
        ass_lines = []
        with open(srt_path, encoding="utf-8") as f:
            lines = [l.rstrip("\n") for l in f]

        i = 0
        while i < len(lines):
            line = lines[i]
            if "-->" in line:
                start_ts, end_ts = [x.strip() for x in line.split("-->")]
                start_s = self.parse_srt_time(start_ts)
                end_s = self.parse_srt_time(end_ts)
                a_start = self.format_ass_time(start_s)
                a_end = self.format_ass_time(end_s)
                txt_buf = []
                j = i + 1
                while j < len(lines) and lines[j].strip() != "" and not lines[j].isdigit():
                    txt_buf.append(lines[j].strip())
                    j += 1
                txt = r"\N".join(txt_buf)
                ass_lines.append(
                    f"Dialogue: 0,{a_start},{a_end},{style},,0,0,0,,{txt}"
                )
                i = j
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
            "Style: TopSub,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,0\n"
            "Style: BottomSub,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,8,10,10,10,0\n\n"
            "[Events]\n"
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )

    def setup_shortcuts(self):
        QShortcut(QKeySequence("+"), self, activated=lambda: self.adjust_delay(100))
        QShortcut(QKeySequence("-"), self, activated=lambda: self.adjust_delay(-100))
        QShortcut(QKeySequence("R"), self, activated=lambda: self.player.video_set_spu_delay(0))
        QShortcut(QKeySequence("Q"), self, activated=self.close)

    def adjust_delay(self, delta_ms):
        cur = self.player.video_get_spu_delay()
        self.player.video_set_spu_delay(cur + delta_ms)
        print(f"Délai actuel: {self.player.video_get_spu_delay() / 1000:.0f} ms")

    def init_vlc(self):
        vlc_args = [
            f"--sub-file={self.merged_ass_path}",
            "--file-caching=3000",
            "--network-caching=3000",
            "--avcodec-hw=none",
            "--audio-time-stretch"
        ]
        self.vlc_instance = vlc.Instance(vlc_args)
        self.player = self.vlc_instance.media_player_new()
        media = self.vlc_instance.media_new(self.video_path)
        self.player.set_media(media)

        self.videoframe.show()  # Important

        if sys.platform.startswith("linux"):
            self.player.set_xwindow(self.videoframe.winId())
        elif sys.platform == "win32":
            self.player.set_hwnd(int(self.videoframe.winId()))
        elif sys.platform == "darwin":
            self.player.set_nsobject(int(self.videoframe.winId()))

        # petit délai avant play, ou connecte à Qt event loop
        QtCore.QTimer.singleShot(100, self.player.play)

        self.player.audio_set_track(0)
        self.timer.start()

    def update_ui(self):
        # Arrêter l'appli quand la vidéo est finie
        if not self.player.is_playing():
            self.timer.stop()
            self.close()

    def run(self):
        try:
            if not self.video_path:
                raise ValueError("Aucun chemin vidéo fourni.")

            subs = self.get_subtitle_streams()
            if len(subs) < 2:
                QtWidgets.QMessageBox.critical(self, "Erreur", "Moins de deux sous-titres trouvés dans la vidéo.")
                return

            langues = [f"{i}: {s['language']} • {s['codec']}" for i, s in enumerate(subs)]
            choice1, ok1 = QtWidgets.QInputDialog.getInt(self, "Choix sous-titre 1",
                                                         "Choisissez le premier sous-titre (numéro):\n" + "\n".join(
                                                             langues))
            if not ok1:
                return
            choice2, ok2 = QtWidgets.QInputDialog.getInt(self, "Choix sous-titre 2",
                                                         "Choisissez le deuxième sous-titre (numéro):\n" + "\n".join(
                                                             langues))
            if not ok2:
                return

            self.td = tempfile.TemporaryDirectory()  # <== stocke ici
            td = self.td.name

            s1 = os.path.join(td, "one.srt")
            s2 = os.path.join(td, "two.srt")
            self.extract_srt(self.subs[choice1]["index"], s1)
            self.extract_srt(self.subs[choice2]["index"], s2)

            self.merged_ass_path = os.path.join(td, "merged.ass")
            with open(self.merged_ass_path, "w", encoding="utf-8") as f:
                f.write(self.create_ass_header())
                f.write(self.srt_to_ass(s1, "TopSub"))
                f.write("\n")
                f.write(self.srt_to_ass(s2, "BottomSub"))

            self.init_vlc()
            self.show()

        except Exception as e:
            logging.error("Une erreur est survenue : %s", e)
            QtWidgets.QMessageBox.critical(self, "Erreur", str(e))

    def closeEvent(self, event):
        if hasattr(self, 'td'):
            self.td.cleanup()
        event.accept()


if __name__ == "__main__":
    app = QtWidgets.QApplication(sys.argv)
    video_path = "chemin/vers/ta/video.mp4"  # Change ce chemin
    lecteur = Lecteur(video_path)
    lecteur.run()
    sys.exit(app.exec())
