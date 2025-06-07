import logging
import sys
import tempfile
from pathlib import Path

import qtawesome as qta
import vlc
from PyQt6 import QtWidgets, QtCore, QtGui
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QCursor
from PyQt6.QtWidgets import QMessageBox, QLabel

from config.colors import PRIMARY_COLOR
from config.config import SRT_DIR
from database.sous_titre_manager import SousTitreManager
from pages.lecteur.widgets.bar_slide_time.bar_slide_time_lect import BarSlideTimeLect
from pages.lecteur.widgets.sous_bar.sous_bar_lect import SousBarLect

# ======================= CONSTANTES =======================

CONTROL_BAR_HEIGHT = 40
HIDE_BAR_DELAY_MS = 3000
MOUSE_CHECK_INTERVAL_MS = 200
UI_REFRESH_INTERVAL_MS = 1000
SEEK_OFFSET_MS = 10_000
ASS_RES_X = 384
ASS_RES_Y = 288

ASS_HEADER = (
    "[Script Info]\n"
    "ScriptType: v4.00+\n"
    f"PlayResX: {ASS_RES_X}\n"
    f"PlayResY: {ASS_RES_Y}\n\n"
    "[V4+ Styles]\n"
    "Style: TopSub,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,"
    "0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,0\n"
    "Style: BottomSub,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,"
    "0,0,0,0,100,100,0,0,1,2,0,8,10,10,10,0\n\n"
    "[Events]\n"
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
)

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# ======================= CLASSE PRINCIPALE =======================

class Lecteur(QtWidgets.QMainWindow):
    def __init__(self, video_path, video_info):
        super().__init__()
        # log uncaught
        sys.excepthook = lambda ex, val, tb: logging.critical("Uncaught", exc_info=(ex,val,tb))
        self._last_volume = 100

        self.video_path = Path(video_path) if video_path else None
        self.video_info = video_info
        self.chapitres = video_info.get('chapitres', [])
        self.vlc_instance = None
        self.player = None
        self.tmp_dir = None
        self.merged_ass_path = None

        # UI
        self.central_widget = QtWidgets.QWidget(self)
        self.videoframe = QtWidgets.QFrame(self.central_widget)
        self.bar_slide = BarSlideTimeLect(self.central_widget)
        self.sous_bar = SousBarLect(self.central_widget)
        self.sous_milieu = self.sous_bar.sous_bar_milieu
        self.sous_droite = self.sous_bar.sous_bar_droite

        # Overlays : volume + time
        self.volume_display = self._create_overlay_label()
        self.time_display = self._create_overlay_label()

        # Timers
        self._hide_volume_timer = QtCore.QTimer(self, singleShot=True, interval=1500)
        self._hide_volume_timer.timeout.connect(self.volume_display.hide)

        self._hide_time_display_timer = QtCore.QTimer(self, singleShot=True, interval=1500)
        self._hide_time_display_timer.timeout.connect(self.time_display.hide)

        self.hide_bar_timer = QtCore.QTimer(self)
        self.cursor_monitor = QtCore.QTimer(self)
        self.ui_timer = QtCore.QTimer(self)

        self._setup_ui()
        self._setup_timers()

        self.setWindowTitle("Lecteur")
        self.showFullScreen()

        self.print_chapters()

    # ----------------------- INITIALISATION UI -----------------------

    def _setup_ui(self) -> None:
        """Crée et dispose les éléments de l'interface."""
        self.setCentralWidget(self.central_widget)
        layout = QtWidgets.QVBoxLayout(self.central_widget)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Video frame
        self.videoframe.setStyleSheet("background-color: black;")
        layout.addWidget(self.videoframe)

        # Barre de contrôle (overlay)
        self.bar_slide.setFixedHeight(10)
        self.bar_slide.setStyleSheet("background-color: transparent; color: white;")
        self.bar_slide.setWindowFlags(
            QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Tool
        )
        self.bar_slide.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents)

        # Barre de contrôle (overlay)
        self.sous_bar.setFixedHeight(CONTROL_BAR_HEIGHT)
        self.sous_bar.setStyleSheet("background-color: transparent; color: white;")
        self.sous_bar.setWindowFlags(
            QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Tool
        )
        self.sous_bar.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents)


        control_layout = QtWidgets.QHBoxLayout(self.sous_bar)
        control_layout.setContentsMargins(0, 0, 0, 0)
        control_layout.setSpacing(30)
        control_layout.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)

        self.sous_milieu.rewind_icon.clicked.connect(self.seek_backward)
        self.sous_milieu.play_pause_icon.clicked.connect(self.toggle_play_pause)
        self.sous_milieu.forward_icon.clicked.connect(self.seek_forward)

        # Utilisation :
        self.sous_droite.volume.clicked.connect(self.toggle_mute)
        self.sous_droite.volume.setEnabled(False)
        self.sous_droite.volume_slider.volumeChanged.connect(self.set_volume)
        self.sous_droite.volume_slider.setEnabled(False)

        # Positionnement initial de la barre (cachée)
        self.bar_slide.hide()
        self.sous_bar.hide()
        self.videoframe.installEventFilter(self)

    def print_chapters(self):
        if not self.chapitres:
            print("Pas de chapitres disponibles pour cette vidéo.")
            return
        print(f"Chapitres pour {self.video_path} :")
        for i, ch in enumerate(self.chapitres):
            start = self._format_time(ch['start'])
            end = self._format_time(ch['end'])
            titre = ch.get('titre', '')
            print(f"  Chapitre {i} : '{titre}' de {start} à {end}")

    def _create_overlay_label(self, font_size: int = 60) -> QLabel:
        label = QLabel(self.central_widget)
        label.setAttribute(Qt.WidgetAttribute.WA_AlwaysStackOnTop)
        label.setStyleSheet(f"""
            color: white;
            font-size: {font_size}px;
            background-color: transparent;
        """)
        label.adjustSize()
        label.hide()
        return label

    def toggle_mute(self):
        """Mute / Unmute en restaurant le dernier volume non nul."""
        if not self.player:
            return

        current = self.player.audio_get_volume()
        if current > 0:
            # on mute : sauvegarde le volume avant de couper
            self._last_volume = current
            self.player.audio_set_volume(0)
            self.sous_droite.volume_slider.setValue(0)
        else:
            # on unmute : on remet au volume précédent
            restore = max(1, min(self._last_volume, 150))
            self.player.audio_set_volume(restore)
            self.sous_droite.volume_slider.setValue(restore)

    @staticmethod
    def _position_label_top_right(label: QtWidgets.QLabel, parent_rect: QtCore.QRect, margin: int = 10) -> None:
        label_size = label.sizeHint()
        label.move(
            parent_rect.x() + parent_rect.width() - label_size.width() - margin,
            parent_rect.y() + margin
        )

    def set_volume(self, value: int) -> None:
        """Met à jour le volume et l'affichage associé."""
        if not self.player:
            logging.warning("Player non initialisé lors du changement de volume.")
            return

        clamped = min(value, 150)
        self.player.audio_set_volume(clamped)

        if clamped > 0:
            self._last_volume = clamped
        self.sous_droite.volume.set_state(clamped > 0)

        self.volume_display.setText(f"{clamped}%")
        self.volume_display.adjustSize()

        self._position_label_top_right(self.volume_display, self.videoframe.geometry())
        self.time_display.hide()
        self.volume_display.raise_()
        self.volume_display.show()
        self._hide_volume_timer.stop()
        self._hide_volume_timer.start()

    def update_ui(self) -> None:
        """Met à jour le label de temps toutes les secondes."""
        if not self.player:
            return

        current_time = self.player.get_time()  # en ms
        total_time = self.player.get_length()  # en ms
        if current_time != -1 and total_time > 0:
            current_str = self._format_time(current_time)
            total_str = self._format_time(total_time)
            self.time_display.setText(f"{current_str} / {total_str}")
            self.time_display.adjustSize()

            self._position_label_top_right(self.time_display, self.videoframe.geometry())

    def resizeEvent(self, event: QtGui.QResizeEvent) -> None:
        super().resizeEvent(event)

        margin = 20
        if self.volume_display.isVisible():
            self._position_label_top_right(self.volume_display, self.rect(), margin)
        if self.time_display.isVisible():
            self._position_label_top_right(self.time_display, self.rect(), margin)

    def _setup_timers(self) -> None:
        """Initialise les timers pour le suivi souris, cache de barre et UI VLC."""
        # Timer pour masquer la barre après inactivité
        self.hide_bar_timer.setInterval(HIDE_BAR_DELAY_MS)
        self.hide_bar_timer.timeout.connect(self.sous_bar.hide)
        self.hide_bar_timer.timeout.connect(self.bar_slide.hide)

        # Timer pour vérifier la position de la souris
        self.cursor_monitor.setInterval(MOUSE_CHECK_INTERVAL_MS)
        self.cursor_monitor.timeout.connect(self._check_mouse_position)
        self.cursor_monitor.start()

        # Timer pour mettre à jour l'UI (icône Play/Pause) toutes les secondes
        self.ui_timer.setInterval(UI_REFRESH_INTERVAL_MS)
        self.ui_timer.timeout.connect(self.update_ui)

    @staticmethod
    def _format_time(ms: int) -> str:
        """Convertit les millisecondes en format HH:MM:SS."""
        seconds = ms // 1000
        h = seconds // 3600
        m = (seconds % 3600) // 60
        s = seconds % 60
        return f"{h:02d}:{m:02d}:{s:02d}"
    # ----------------------- MÉTHODES VLC -----------------------

    def _init_vlc_player(self) -> None:
        """Configure l'instance VLC et le lecteur, puis lance la vidéo."""
        assert self.video_path is not None and self.merged_ass_path is not None

        args = [
            f"--sub-file={str(self.merged_ass_path)}",
            "--file-caching=200",  # plus aucun buffering côté fichier
            "--network-caching=200",  # plus aucun buffering côté réseau
            "--avcodec-hw=none",
            "--audio-time-stretch"
        ]
        self.vlc_instance = vlc.Instance(args)
        self.player = self.vlc_instance.media_player_new()
        media = self.vlc_instance.media_new(str(self.video_path))
        self.player.set_media(media)

        # Affectation de l'ID de fenêtre selon la plateforme
        win_id = int(self.videoframe.winId())
        if sys.platform.startswith("linux"):
            self.player.set_xwindow(win_id)
        elif sys.platform == "win32":
            self.player.set_hwnd(win_id)
        elif sys.platform == "darwin":
            self.player.set_nsobject(win_id)

        self.videoframe.show()
        # Lecture différée pour que le widget soit bien affiché
        QtCore.QTimer.singleShot(100, self.player.play)
        self.player.audio_set_track(0)
        self.ui_timer.start()
        self.sous_droite.volume.setEnabled(True)
        self.sous_droite.volume_slider.setEnabled(True)

    def toggle_play_pause(self) -> None:
        """Met en pause ou relance la lecture sans latence."""
        if not self.player:
            return

        if self.player.is_playing():
            # Met en pause immédiatement
            self.player.set_pause(True)
            self.sous_milieu.play_pause_icon.setIcon(qta.icon('fa5s.play', color='black'))
        else:
            # Reprend la lecture immédiatement
            self.player.set_pause(False)
            self.sous_milieu.play_pause_icon.setIcon(qta.icon('fa5s.pause', color='black'))

    def seek_forward(self) -> None:
        if self.player:
            new_time = self.player.get_time() + SEEK_OFFSET_MS
            self.player.set_time(new_time)

            # Afficher temporairement le temps
            self.update_ui()
            self.volume_display.hide()
            self.time_display.raise_()
            self.time_display.show()
            self._hide_time_display_timer.stop()
            self._hide_time_display_timer.start()

    def seek_backward(self) -> None:
        if self.player:
            new_time = max(0, self.player.get_time() - SEEK_OFFSET_MS)
            self.player.set_time(new_time)

            # Afficher temporairement le temps
            self.update_ui()
            self.volume_display.hide()
            self.time_display.raise_()
            self.time_display.show()
            self._hide_time_display_timer.stop()
            self._hide_time_display_timer.start()

    def adjust_delay(self, delta_ms: int) -> None:
        """Ajuste le délai des sous-titres en ajoutant delta_ms (en ms)."""
        if self.player:
            current_delay = self.player.video_get_spu_delay() or 0
            new_delay = current_delay + delta_ms
            self.player.video_set_spu_delay(new_delay)
            logging.info(f"Délai SPU ajusté : {new_delay} μs ({new_delay // 1000} ms)")

    def reset_delay(self) -> None:
        """Réinitialise le délai des sous-titres à zéro."""
        if self.player:
            self.player.video_set_spu_delay(0)
            logging.info("Délai SPU réinitialisé à 0")

    # ----------------------- GESTION DE LA BARRE -----------------------

    def eventFilter(self, watched: QtCore.QObject, event: QtCore.QEvent) -> bool:
        """Intercepte l'événement de redimensionnement du videoframe pour repositionner la barre."""
        if watched == self.videoframe and event.type() == QtCore.QEvent.Type.Resize:
            self._position_control_bar()
        return super().eventFilter(watched, event)

    def mouseMoveEvent(self, event: QtGui.QMouseEvent) -> None:
        """Réactive le timer de masquage dès que la souris bouge."""
        if event.position().y() > self.height() - (CONTROL_BAR_HEIGHT + 10):
            self._show_control_bar()
        self.hide_bar_timer.start()
        super().mouseMoveEvent(event)

    def enterEvent(self, event: QtCore.QEvent) -> None:
        """Affiche la barre de contrôle quand la souris entre dans la fenêtre."""
        self._show_control_bar()
        super().enterEvent(event)

    def _check_mouse_position(self) -> None:
        """Vérifie si la souris est proche du bas de la vidéo pour afficher la barre."""
        local_pos = self.videoframe.mapFromGlobal(QCursor.pos())
        if (self.videoframe.height() - (CONTROL_BAR_HEIGHT + 30)) <= local_pos.y() <= self.videoframe.height():
            self._show_control_bar()

    def _show_control_bar(self) -> None:
        """Affiche et repositionne la barre de contrôle, puis relance le timer de masquage."""
        if not self.sous_bar.isVisible():
            self.sous_bar.show()
        if not self.bar_slide.isVisible():
            self.bar_slide.show()
        self._position_control_bar()
        self.hide_bar_timer.start()

    def _position_control_bar(self) -> None:
        vf_width = self.videoframe.width()
        vf_height = self.videoframe.height()

        # Position sous_bar en bas
        self.sous_bar.setGeometry(
            0,
            vf_height - CONTROL_BAR_HEIGHT,
            vf_width,
            CONTROL_BAR_HEIGHT
        )
        self.sous_bar.raise_()

        # Position bar_slide juste au-dessus de sous_bar avec un léger chevauchement
        overlap = -5  # nombre de pixels de recouvrement ou d'espacement négatif
        y_slide = vf_height - CONTROL_BAR_HEIGHT - self.bar_slide.height() + overlap
        self.bar_slide.setGeometry(
            0,
            y_slide,
            vf_width,
            CONTROL_BAR_HEIGHT
        )
        self.bar_slide.raise_()

    # ----------------------- CONVERSION SRT → ASS -----------------------

    @staticmethod
    def parse_srt_time(timestamp: str) -> float:
        """
        Convertit une durée SRT (HH:MM:SS,ms) en secondes flottantes.
        Exemple : "00:01:23,456" → 83.456
        """
        h, m, rest = timestamp.strip().split(":")
        s, ms = rest.split(",")
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

    @staticmethod
    def format_ass_time(seconds: float) -> str:
        """
        Convertit un temps en secondes (float) en format ASS (H : MM : SS.CC).
        Les centièmes (CC) sont déduits des parties décimales des secondes.
        """
        total_cs = int(round(seconds * 100))
        h = total_cs // 360_000
        m = (total_cs % 360_000) // 6000
        s = (total_cs % 6000) // 100
        cs = total_cs % 100
        return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

    def srt_to_ass(self, srt_path: Path, style_name: str) -> list[str]:
        """
        Lit un fichier .srt et retourne une liste de lignes ASS (Dialogue : ...).
        Chaque bloc SRT "start → end" est converti en "Dialogue: ..."
        """
        ass_lines: list[str] = []
        with srt_path.open(encoding="utf-8") as f:
            raw_lines = [line.strip() for line in f if line.strip()]

        idx = 0
        while idx < len(raw_lines):
            if "-->" in raw_lines[idx]:
                start_ts, end_ts = map(str.strip, raw_lines[idx].split("-->"))
                a_start = self.format_ass_time(self.parse_srt_time(start_ts))
                a_end = self.format_ass_time(self.parse_srt_time(end_ts))
                idx += 1
                text_lines: list[str] = []
                # Collecter toutes les lignes de texte jusqu'au prochain index où timestamp
                while idx < len(raw_lines) and "-->" not in raw_lines[idx] and not raw_lines[idx].isdigit():
                    text_lines.append(raw_lines[idx])
                    idx += 1
                dialogue = (
                    f"Dialogue: 0,{a_start},{a_end},{style_name},,0,0,0,," 
                    f"{'\\N'.join(text_lines)}"
                )
                ass_lines.append(dialogue)
            else:
                idx += 1
        return ass_lines

    # ----------------------- FONCTION PRINCIPALE (RUN) -----------------------

    def run(self) -> None:
        """
        Lance la procédure :
        1. Vérifie le chemin vidéo
        2. Liste les fichiers .srt du dossier correspondant (fallback extraction pour cette vidéo)
        3. Demande à l'utilisateur de choisir deux langues
        4. Génère le fichier merged.ass et lance VLC
        """
        try:
            if not self.video_path or not self.video_path.exists():
                raise FileNotFoundError("Chemin vidéo non valide ou inexistant.")

            video_stem = self.video_path.stem
            srt_root = Path(SRT_DIR) / video_stem

            # ─── Si pas de dossier SRT ou aucun .srt, on extrait uniquement pour cette vidéo ───
            if not srt_root.exists() or not any(srt_root.glob("**/*.srt")):
                logging.info(f"Sous-titres manquants pour {self.video_path}, extraction pour cette vidéo.")
                stm = SousTitreManager()
                stm.extract_subtitle_from_video(str(self.video_path))

                # on retente la détection
                srt_root = Path(SRT_DIR) / video_stem
                if not srt_root.exists() or not any(srt_root.glob("**/*.srt")):
                    QMessageBox.critical(
                        self, "Erreur",
                        f"Aucun sous-titre trouvé ou extrait pour : {video_stem}"
                    )
                    return
            # ────────────────────────────────────────────────────────────────────────────────

            # Récupérer tous les .srt et grouper par nom de dossier (langue)
            srt_files = sorted(srt_root.glob("**/*.srt"))
            if len(srt_files) < 2:
                QMessageBox.critical(
                    self, "Erreur",
                    "Moins de deux fichiers .srt trouvés dans le dossier."
                )
                return

            # Mapping langue → chemin complet du .srt
            lang_to_path: dict[str, Path] = {}
            for path in srt_files:
                lang = path.parent.name
                if lang not in lang_to_path:
                    lang_to_path[lang] = path

            languages = sorted(lang_to_path.keys())
            if len(languages) < 2:
                QMessageBox.critical(
                    self, "Erreur",
                    "Moins de deux langues de sous-titres disponibles."
                )
                return

            # Préparation du choix de langues
            choices = [f"{i}: {lang}" for i, lang in enumerate(languages)]
            prompt = "\n".join(choices)

            c1, ok1 = QtWidgets.QInputDialog.getInt(
                self, "Choix de la Langue 1", prompt, value=0, min=0, max=len(languages) - 1
            )
            if not ok1:
                return

            c2, ok2 = QtWidgets.QInputDialog.getInt(
                self, "Choix de la Langue 2", prompt, value=1, min=0, max=len(languages) - 1
            )
            if not ok2:
                return

            path1 = lang_to_path[languages[c1]]
            path2 = lang_to_path[languages[c2]]

            # Création du dossier temporaire pour merged.ass
            self.tmp_dir = tempfile.TemporaryDirectory()
            self.merged_ass_path = Path(self.tmp_dir.name) / "merged.ass"

            # Écriture du fichier ASS
            with self.merged_ass_path.open("w", encoding="utf-8") as ass_file:
                ass_file.write(ASS_HEADER)
                for style, srt_path in [("TopSub", path1), ("BottomSub", path2)]:
                    lines = self.srt_to_ass(srt_path, style)
                    ass_file.write("\n".join(lines) + "\n")

            # Initialisation et lancement de VLC
            self._init_vlc_player()
            self.show()

        except Exception as e:
            logging.error(f"Erreur lors de l'exécution : {e}", exc_info=True)
            QMessageBox.critical(self, "Erreur", str(e))

    def closeEvent(self, event: QtGui.QCloseEvent) -> None:
        if self.tmp_dir:
            self.tmp_dir.cleanup()
        if self.player:
            self.player.stop()
        event.accept()
