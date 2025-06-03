import os
import sys
import json
import logging
import tempfile
import subprocess

from PyQt6 import QtWidgets, QtCore
from PyQt6.QtGui import QShortcut, QKeySequence

import vlc
from config.config import FFPROBE_PATH, FFMPEG_PATH

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s - %(levelname)s - %(message)s")

class Lecteur(QtWidgets.QMainWindow):
    def __init__(self, video_path=None):
        super().__init__()
        self.video_path = video_path
        self.subs = []
        self.vlc_instance = None
        self.player = None
        self.merged_ass_path = None
        self.td = None

        self.setWindowTitle("Lecteur vidéo VLC intégré PyQt6")
        self.resize(960, 540)
        self.showFullScreen()

        self.videoframe = QtWidgets.QFrame(self)
        self.setCentralWidget(self.videoframe)

        self.setup_shortcuts()

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
            output = subprocess.check_output(cmd, text=True)
            data = json.loads(output)
            self.subs = [
                {
                    "index": s["index"],
                    "codec": s.get("codec_name"),
                    "language": s.get("tags", {}).get("language", "inconnu")
                }
                for s in data.get("streams", [])
                if s.get("codec_type") == "subtitle"
            ]
        except subprocess.CalledProcessError as e:
            logging.error("Erreur ffprobe: %s", e)
            raise

        if not self.subs:
            raise ValueError("Aucun sous-titre trouvé")
        return self.subs

    def extract_srt(self, stream_index, out_path):
        cmd = [FFMPEG_PATH, "-y", "-i", self.video_path, "-map", f"0:{stream_index}", "-c:s", "srt", out_path]
        subprocess.run(cmd, check=True)

    @staticmethod
    def parse_srt_time(ts):
        h, m, rest = ts.strip().split(":")
        s, ms = rest.split(",")
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

    @staticmethod
    def format_ass_time(sec):
        h, m = divmod(int(sec), 3600)
        m, s = divmod(m, 60)
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

                ass_lines.append(f"Dialogue: 0,{a_start},{a_end},{style},,0,0,0,,{'\\N'.join(text_lines)}")
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

    def setup_shortcuts(self):
        QShortcut(QKeySequence("+"), self, activated=lambda: self.adjust_delay(100))
        QShortcut(QKeySequence("-"), self, activated=lambda: self.adjust_delay(-100))
        QShortcut(QKeySequence("R"), self, activated=lambda: self.player.video_set_spu_delay(0))
        QShortcut(QKeySequence("Q"), self, activated=self.close)

    def adjust_delay(self, delta):
        cur = self.player.video_get_spu_delay()
        self.player.video_set_spu_delay(cur + delta)
        print(f"Délai actuel: {self.player.video_get_spu_delay() // 1000} ms")

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

            self.get_subtitle_streams()
            if len(self.subs) < 2:
                QtWidgets.QMessageBox.critical(self, "Erreur", "Moins de deux sous-titres trouvés.")
                return

            choices = [f"{i}: {s['language']} • {s['codec']}" for i, s in enumerate(self.subs)]
            c1, ok1 = QtWidgets.QInputDialog.getInt(self, "Sous-titre 1", "\n".join(choices))
            if not ok1: return
            c2, ok2 = QtWidgets.QInputDialog.getInt(self, "Sous-titre 2", "\n".join(choices))
            if not ok2: return

            self.td = tempfile.TemporaryDirectory()
            td_path = self.td.name
            srt_paths = [os.path.join(td_path, name) for name in ("s1.srt", "s2.srt")]
            self.extract_srt(self.subs[c1]["index"], srt_paths[0])
            self.extract_srt(self.subs[c2]["index"], srt_paths[1])

            self.merged_ass_path = os.path.join(td_path, "merged.ass")
            with open(self.merged_ass_path, "w", encoding="utf-8") as f:
                f.write(self.create_ass_header())
                f.write(self.srt_to_ass(srt_paths[0], "TopSub") + "\n")
                f.write(self.srt_to_ass(srt_paths[1], "BottomSub"))

            self.init_vlc()
            self.show()

        except Exception as e:
            logging.error("Erreur : %s", e)
            QtWidgets.QMessageBox.critical(self, "Erreur", str(e))

    def closeEvent(self, event):
        if self.td:
            self.td.cleanup()
        event.accept()

