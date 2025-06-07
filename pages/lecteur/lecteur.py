import logging
import sys
import tempfile
from pathlib import Path
from typing import Union

import qtawesome as qta
import vlc
from PyQt6 import QtWidgets, QtCore, QtGui
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QCursor
from PyQt6.QtWidgets import QMessageBox, QLabel

from config.config import SRT_DIR
from database.sous_titre_converter import SousTitreConverter
from database.sous_titre_manager import SousTitreManager
from database.video_manager import VideoManager
from database.video_thumbnail_manager import VideoThumbnailManager
from pages.lecteur.miniature.miniature_lect import MiniatureLect
from pages.lecteur.widgets.bar_slide_time.bar_slide_time_lect import BarSlideTimeLect
from pages.lecteur.widgets.sous_bar.sous_bar_lect import SousBarLect
from utils.formater_duree import formater_duree

# ======================= CONSTANTES =======================
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
    def __init__(self, video_path, vm: VideoManager):
        super().__init__()
        sys.excepthook = lambda ex, val, tb: logging.critical("Uncaught", exc_info=(ex, val, tb))
        self._last_volume = 100

        # Chemin vidéo
        self.video_path = Path(video_path) if video_path else None

        # Récupère les infos depuis la DB
        vm.load_video_info()
        media = vm.video_info.get(str(self.video_path), {})

        # Durée en secondes pour le slider + version formatée pour l'affichage
        self.duration_sec    = int(media.get('duree', 0))
        self.duree_str       = formater_duree(self.duration_sec)
        self.chapitres       = media.get('chapitres', [])
        self.total_time_ms   = self.duration_sec * 1000  # pour formatage ultérieur
        self.titre_video     = media.get('nom', None)

        # VLC
        self.vlc_instance = None
        self.player       = None
        self.tmp_dir      = None
        self.merged_ass_path = None

        # UI
        self.central_widget = QtWidgets.QWidget(self)
        self.videoframe     = QtWidgets.QFrame(self.central_widget)

        self.thumbnail_manager = VideoThumbnailManager()

        self.miniature = MiniatureLect(width=(self.width() / 3), parent=self.central_widget)
        self.miniature.hide()

        # Barre de progression custom (en secondes)
        self.bar_slide = BarSlideTimeLect(
            self.central_widget,
            self.chapitres,
            self.duration_sec,
            self.titre_video
        )
        self.bar_slide.slider.sliderPressed.connect(self._on_slider_pressed)
        self.bar_slide.slider.sliderMoved.connect(self.on_slider_preview)
        self.bar_slide.slider.sliderReleasedValue.connect(self.on_slider_released)

        self.sous_bar   = SousBarLect(self.central_widget)
        self.sous_milieu= self.sous_bar.sous_bar_milieu
        self.sous_droite= self.sous_bar.sous_bar_droite

        # Overlays
        self.volume_display = self._create_overlay_label()
        self.time_display   = self._create_overlay_label()

        # Timers
        self._hide_volume_timer      = QtCore.QTimer(self, singleShot=True, interval=1500)
        self._hide_volume_timer.timeout.connect(self.volume_display.hide)
        self._hide_time_display_timer= QtCore.QTimer(self, singleShot=True, interval=1500)
        self._hide_time_display_timer.timeout.connect(self.time_display.hide)

        self.hide_bar_timer  = QtCore.QTimer(self)
        self.cursor_monitor  = QtCore.QTimer(self)
        self.ui_timer        = QtCore.QTimer(self)

        self._setup_ui()
        self._setup_timers()

        self.setWindowTitle("Lecteur")
        self.showFullScreen()

    def _on_slider_pressed(self):
        self.ui_timer.stop()
        self.ui_timer.timeout.disconnect(self.update_ui)

    def on_slider_preview(self, seconds_position: int):
        """Pendant le drag : mise à jour du label + vignette, mais PAS la vidéo."""
        # 1) Calcul des millisecondes + formatage temps en un seul appel
        ms = seconds_position * 1000
        time_str = f"{self._format_time(ms)} / {self._format_time(self.total_time_ms)}"

        # 2) Mise à jour de l’overlay temps
        self.time_display.setText(time_str)
        self.time_display.adjustSize()
        self._position_label_top_right(self.time_display, self.videoframe.geometry())
        self.time_display.show()

        # 3) Récupération et affichage de la miniature (un appel unique)
        thumb_path = self.thumbnail_manager.get_thumbnail_for_time(self.titre_video, seconds_position)
        if thumb_path:
            self.miniature.set_image_path(thumb_path)
            self._position_miniature(seconds_position)
            self.miniature.show()
        else:
            self.miniature.hide()

    def on_slider_released(self, seconds_position: int):
        if self.player:
            ms = seconds_position * 1000
            self.player.set_time(ms)

            # Mise à jour overlay temps
            current_str = self._format_time(ms)
            total_str = self._format_time(self.total_time_ms)
            self.time_display.setText(f"{current_str} / {total_str}")
            self.time_display.adjustSize()
            self._position_label_top_right(self.time_display, self.videoframe.geometry())

            # On cache la miniature
            self.miniature.hide()

        self.ui_timer.timeout.connect(self.update_ui)
        self.ui_timer.start()

    def _position_miniature(self, seconds_position: int):
        # Récupère la position pixel du handle du slider
        slider = self.bar_slide.slider
        opt = QtWidgets.QStyleOptionSlider()
        slider.initStyleOption(opt)
        handle_rect = slider.style().subControlRect(
            QtWidgets.QStyle.ComplexControl.CC_Slider,
            opt,
            QtWidgets.QStyle.SubControl.SC_SliderHandle,
            slider
        )
        # Calculer coordonnée globale
        x = slider.mapTo(self.central_widget, handle_rect.center()).x() - self.miniature.width() // 2
        y = slider.mapTo(self.central_widget, QtCore.QPoint(0, 0)).y() - self.miniature.height() - 10
        self.miniature.move(x, y)



    # ----------------------- INITIALISATION UI -----------------------

    def _setup_ui(self) -> None:
        self.setCentralWidget(self.central_widget)
        layout = QtWidgets.QVBoxLayout(self.central_widget)
        layout.setContentsMargins(0,0,0,0)
        layout.setSpacing(0)

        # Video frame
        self.videoframe.setStyleSheet("background-color: black;")
        layout.addWidget(self.videoframe)

        # Progress bar setup
        self.bar_slide.setStyleSheet("background-color: transparent;")
        self.bar_slide.setWindowFlags(
            QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Tool
        )
        self.bar_slide.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents)

        # Bottom control bar setup
        self.sous_bar.setStyleSheet("background-color: transparent;")
        self.sous_bar.setWindowFlags(
            QtCore.Qt.WindowType.FramelessWindowHint | QtCore.Qt.WindowType.Tool
        )
        self.sous_bar.setAttribute(QtCore.Qt.WidgetAttribute.WA_TransparentForMouseEvents)

        self.sous_milieu.rewind_icon.clicked.connect(self.seek_backward)
        self.sous_milieu.play_pause_icon.clicked.connect(self.toggle_play_pause)
        self.sous_milieu.forward_icon.clicked.connect(self.seek_forward)

        self.sous_droite.volume.clicked.connect(self.toggle_mute)
        self.sous_droite.volume_slider.volumeChanged.connect(self.set_volume)

        # Démarre tout masqué
        self.bar_slide.hide()
        self.sous_bar.hide()
        self.videoframe.installEventFilter(self)

    def _create_overlay_label(self, font_size: int = 60) -> QLabel:
        label = QLabel(self.central_widget)
        label.setAttribute(Qt.WidgetAttribute.WA_AlwaysStackOnTop)
        label.setStyleSheet(f"color:white; font-size:{font_size}px; background:transparent;")
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
        """Timer -> mets à jour temps et slider."""
        if not self.player:
            return

        current_ms = self.player.get_time()
        total_ms   = self.player.get_length()
        if current_ms != -1 and total_ms > 0:
            # Label
            current_str = self._format_time(current_ms)
            total_str   = self._format_time(total_ms)
            self.time_display.setText(f"{current_str} / {total_str}")
            self.time_display.adjustSize()
            self._position_label_top_right(self.time_display, self.videoframe.geometry())
            # Slider (en secondes)
            self.bar_slide.slider.setValue(current_ms // 1000)

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
        """Restart the hide timer if mouse moves near bottom area."""
        height = self.height()
        threshold = self.sous_bar.height() + 10
        if event.position().y() > height - threshold:
            self._show_control_bar()
        self.hide_bar_timer.start()
        super().mouseMoveEvent(event)

    def enterEvent(self, event: QtCore.QEvent) -> None:
        """Affiche la barre de contrôle quand la souris entre dans la fenêtre."""
        self._show_control_bar()
        super().enterEvent(event)

    def _check_mouse_position(self) -> None:
        """Check if the mouse is near the bottom to show the control bar."""
        local_pos = self.videoframe.mapFromGlobal(QCursor.pos())
        height = self.videoframe.height()
        threshold = self.sous_bar.height() + 30
        if height - threshold <= local_pos.y() <= height:
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
        vf_width = self.width()
        vf_height = self.height()



        # Position de sous_bar en bas
        sous_bar_y = vf_height - self.sous_bar.height()
        self.sous_bar.setGeometry(0, sous_bar_y, vf_width, self.sous_bar.height())
        self.sous_bar.raise_()

        # Position de bar_slide juste au-dessus avec 10 px d’espace
        y_slide = vf_height - self.bar_slide.height() - self.sous_bar.height()
        self.bar_slide.setGeometry(0, y_slide, vf_width, self.bar_slide.height())
        self.bar_slide.raise_()

    # ----------------------- FONCTION PRINCIPALE (RUN) -----------------------

    def run(self) -> None:
        """
        Lance la procédure :
        1. Vérifie le chemin vidéo
        2. Liste les fichiers .srt (extraction si besoin)
        3. Demande à l'utilisateur de choisir deux langues
        4. Génère le fichier merged.ass et lance VLC
        """
        try:
            if not self._is_valid_video_path():
                raise FileNotFoundError("Chemin vidéo non valide ou inexistant.")

            srt_files = self._get_srt_files_for_video()
            if len(srt_files) < 2:
                QMessageBox.critical(self, "Erreur", "Moins de deux fichiers .srt trouvés.")
                return

            lang_to_path = self._map_languages_to_paths(srt_files)
            if len(lang_to_path) < 2:
                QMessageBox.critical(self, "Erreur", "Moins de deux langues détectées.")
                return

            # Choix des deux langues par l'utilisateur
            languages = sorted(lang_to_path.keys())
            choice_1 = self._ask_user_choice("Choix de la Langue 1", languages, default=0)
            if choice_1 is None:
                return

            choice_2 = self._ask_user_choice("Choix de la Langue 2", languages, default=1)
            if choice_2 is None:
                return

            path1 = lang_to_path[languages[choice_1]]
            path2 = lang_to_path[languages[choice_2]]

            # Création et écriture du fichier ASS fusionné
            self._generate_merged_ass(path1, path2)

            # Lancement du lecteur VLC
            self._init_vlc_player()
            self.show()

        except Exception as e:
            logging.error(f"Erreur lors de l'exécution : {e}", exc_info=True)
            QMessageBox.critical(self, "Erreur", str(e))

    # ────────────────────────────────
    # Méthodes auxiliaires proposées :
    # ────────────────────────────────

    def _is_valid_video_path(self) -> bool:
        return self.video_path and self.video_path.exists()

    def _get_srt_files_for_video(self) -> list[Path]:
        video_stem = self.video_path.stem
        srt_root = Path(SRT_DIR) / video_stem

        if not srt_root.exists() or not any(srt_root.glob("**/*.srt")):
            logging.info(f"Sous-titres manquants pour {self.video_path}, extraction...")
            stm = SousTitreManager()
            stm.extract_subtitle_from_video(str(self.video_path))
            srt_root = Path(SRT_DIR) / video_stem

        return sorted(srt_root.glob("**/*.srt")) if srt_root.exists() else []

    @staticmethod
    def _map_languages_to_paths(srt_files: list[Path]) -> dict[str, Path]:
        lang_map = {}
        for path in srt_files:
            lang = path.parent.name
            lang_map.setdefault(lang, path)
        return lang_map

    def _ask_user_choice(self, title: str, options: list[str], default: int = 0) -> int | None:
        prompt = "\n".join(f"{i}: {lang}" for i, lang in enumerate(options))
        choice, ok = QtWidgets.QInputDialog.getInt(
            self, title, prompt, value=default, min=0, max=len(options) - 1
        )
        return choice if ok else None

    def _generate_merged_ass(self, path1: Path, path2: Path) -> None:
        """
        Crée un fichier ASS fusionné à partir de deux fichiers SRT,
        en utilisant SousTitreConverter pour la conversion.
        """
        # Prépare le converter
        converter = SousTitreConverter()

        # Crée un dossier temporaire pour merged.ass
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.merged_ass_path = Path(self.tmp_dir.name) / "merged.ass"

        # Écrit header + dialogues pour les deux langues
        with self.merged_ass_path.open("w", encoding="utf-8") as ass_file:
            # Header ASS défini dans la classe
            ass_file.write(SousTitreConverter.ASS_HEADER)

            # Pour chaque style/langue, convertit et ajoute les lignes Dialogue
            for style, srt_path in [("TopSub", path1), ("BottomSub", path2)]:
                # Appel à la méthode srt_to_ass_lines (pas srt_to_ass)
                ass_lines = converter.srt_to_ass_lines(srt_path, style)
                ass_file.write("\n".join(ass_lines) + "\n")

    def closeEvent(self, event: QtGui.QCloseEvent) -> None:
        if self.tmp_dir:
            self.tmp_dir.cleanup()
        if self.player:
            self.player.stop()
        event.accept()
