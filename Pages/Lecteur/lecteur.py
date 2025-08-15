# ---------- FILE: lecteur.py ----------
"""
Lecteur principal (fenêtre) — version révisée :
- logging centralisé au lieu de print()
- décorateur @safe_slot pour attraper/logger les exceptions dans les slots
- factorisation des traitements répétitifs (chapters, tracks, UI updates)
- vérifications sur l'existence de mpv.exe et PATH plus explicite
- typage plus strict et docstrings
- meilleures pratiques Qt (éviter sleep prolongés sur thread principal, gérer timers)
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import time
from functools import wraps, partial
from pathlib import Path
from typing import Optional, List, Any, Dict, Tuple, Union

from PyQt6.QtCore import QTimer, QSize, Qt
from PyQt6.QtWidgets import QFrame, QSizePolicy, QApplication

# Imports externes qui existent dans ton projet
from Pages.Lecteur.Bar_Sec.bar_sec_lect import BarSecLect
from Pages.Lecteur.mpv_controller import MPVController
from Widgets.bar_fenetre import BarFenetre
from Widgets.base_fenetre import BaseFenetre

# ---------------- Constants & paths ----------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MPV_DIR = PROJECT_ROOT / "Ressource" / "mpv"
# Platform-specific executable name fallback
MPV_EXE = MPV_DIR / ("mpv.exe" if os.name == "nt" else "mpv")

MAX_VOLUME = 200
DEFAULT_WINDOW_SIZE = QSize(800, 600)
# Add MPV_DIR to PATH if exists
if MPV_DIR.exists():
    os.environ["PATH"] = f"{MPV_DIR}{os.pathsep}{os.environ.get('PATH', '')}"
else:
    # don't crash: only log warning
    # MPV may still be found via PATH environment
    pass

# ---------------- Logging ----------------
logger = logging.getLogger("lecteur")
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.DEBUG)
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
handler.setFormatter(formatter)
if not logger.handlers:
    logger.addHandler(handler)



# ---------------- Utilities ----------------
def safe_slot(func):
    """
    Décorateur pour protéger un slot / callback Qt : logge l'exception au lieu de planter.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception:
            logger.exception("Exception dans %s", func.__name__)
            # On ne remonte pas l'exception — Qt ne l'aime pas forcément
            return None
    return wrapper


def clamp_int(value: Any, minimum: int, maximum: int, default: Optional[int] = None) -> Optional[int]:
    try:
        v = int(round(float(value)))
        return max(minimum, min(maximum, v))
    except Exception:
        return default


# ---------------- Main class ----------------
class Lecteur(BaseFenetre):
    """
    Fenêtre lecteur basée sur BaseFenetre.
    """

    def __init__(self, stream_urls: List[str], taille_ecran: Optional[QSize] = None):
        super().__init__(bar=False)

        # génération pour annuler callbacks asynchrones si on relance la lecture
        self._playgen: int = 0

        # timers
        self.position_timer: Optional[QTimer] = None
        self._volume_timer: Optional[QTimer] = None
        self.hide_bar_timer: Optional[QTimer] = None
        self._cursor_timer: Optional[QTimer] = None

        # sources & indices
        self.stream_urls: List[str] = list(stream_urls or [])
        self.current_index: int = 0

        # youtube chapters / info
        self.youtube_chapters: List[Any] = []
        self._youtube_info_applied: bool = False

        # volume state
        self._last_volume: Optional[int] = None
        self._previous_volume: int = 50
        self._muted: bool = False

        # UI sizing
        self.resize(taille_ecran if taille_ecran else DEFAULT_WINDOW_SIZE)

        # build UI
        self._setup_ui()

        # MPV controller initialisé en fin d'init UI
        if not MPV_EXE.exists():
            logger.warning("MPV executable introuvable à %s — MPVController peut échouer.", MPV_EXE)
        self.mpv = MPVController(MPV_EXE)

        # volume poller
        self._volume_timer = QTimer(self)
        self._volume_timer.setInterval(1000)
        self._volume_timer.timeout.connect(self._poll_volume)

        # démarrage léger (après la boucle d'événements)
        QTimer.singleShot(200, self.lancer_video)

    # ---------------- UI Setup ----------------
    def _setup_ui(self) -> None:
        """Configure l'UI, barres, timers et connecte les signaux de base."""
        self.central_layout.setContentsMargins(0, 0, 0, 0)
        self.central_layout.setSpacing(0)

        # video frame
        self.video_frame = QFrame()
        self.video_frame.setStyleSheet("background-color: transparent")
        self.video_frame.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.central_layout.addWidget(self.video_frame, 1)

        # top bar
        self.top_bar = BarFenetre(parent=None, main_window=self)
        flags = self.top_bar.windowFlags()
        flags |= (Qt.WindowType.Tool | Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.top_bar.setWindowFlags(flags)
        self.top_bar.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.top_bar.setAttribute(Qt.WidgetAttribute.WA_NoSystemBackground, True)
        self.top_bar.setAutoFillBackground(False)
        self.top_bar.setVisible(False)
        self.top_bar.show()
        self.top_bar.raise_()

        # bottom bar
        self.bottom_bar = BarSecLect(parent=None)
        flags = self.bottom_bar.windowFlags()
        flags |= (Qt.WindowType.Tool | Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.bottom_bar.setWindowFlags(flags)
        self.bottom_bar.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.bottom_bar.setAttribute(Qt.WidgetAttribute.WA_NoSystemBackground, True)
        self.bottom_bar.setAutoFillBackground(False)
        self.bottom_bar.setVisible(False)
        self.bottom_bar.show()
        self.bottom_bar.raise_()

        # hide bar timer
        self.hide_bar_timer = QTimer(self)
        self.hide_bar_timer.setInterval(1500)
        self.hide_bar_timer.timeout.connect(self.cacher_barre)

        # connect bottom bar signals (defensive: vérifier existence)
        try:
            self.bottom_bar.play_pause_clicked.connect(self.toggle_play_pause)
            self.bottom_bar.prev_clicked.connect(self.video_precedente)
            self.bottom_bar.next_clicked.connect(self.video_suivante)
            self.bottom_bar.chapter_prev_clicked.connect(self.chapter_precedent)
            self.bottom_bar.chapter_next_clicked.connect(self.chapter_suivant)
            self.bottom_bar.moins_10_clicked.connect(self.seek_backward)
            self.bottom_bar.plus_10_clicked.connect(self.seek_forward)
            self.bottom_bar.position_changed.connect(self._on_slider_moved)
            # certains widgets exposent slider.position_released
            if getattr(self.bottom_bar, "slider", None) and getattr(self.bottom_bar.slider, "position_released", None):
                self.bottom_bar.slider.position_released.connect(self._on_slider_released)
            elif getattr(self.bottom_bar, "slider", None) and getattr(self.bottom_bar, "sliderReleased", None):
                self.bottom_bar.slider.sliderReleased.connect(lambda: self._on_slider_released(self.bottom_bar.slider.value()))
            self.bottom_bar.chapter_selected.connect(self._on_chapter_selected)
        except Exception:
            logger.exception("Erreur connexion signaux bottom_bar")

        # volume connections — 2 variantes supportées
        try:
            if hasattr(self.bottom_bar, "volume_changed") and hasattr(self.bottom_bar, "mute_toggled"):
                self.bottom_bar.volume_changed.connect(self._on_volume_changed)
                self.bottom_bar.mute_toggled.connect(self._on_mute_toggled)
            else:
                vc = getattr(self.bottom_bar, "volume_control", None)
                if vc:
                    if getattr(vc, "volume_changed", None):
                        vc.volume_changed.connect(self._on_volume_changed)
                    if getattr(vc, "mute_toggled", None):
                        vc.mute_toggled.connect(self._on_mute_toggled)
        except Exception:
            logger.exception("Erreur connexion volume UI")

        # barLangueSub optional
        try:
            bls = getattr(self.bottom_bar, "barLangueSub", None)
            if bls:
                bls.audio_selected.connect(lambda aid: QTimer.singleShot(0, partial(self._apply_audio_track, aid)))
                bls.subtitle_selected.connect(lambda sid: QTimer.singleShot(0, partial(self._apply_subtitle_track, sid)))
                try:
                    bls.link_with_bar(self.bottom_bar)
                except Exception:
                    # non critique
                    logger.debug("link_with_bar indisponible ou a échoué", exc_info=True)
        except Exception:
            logger.exception("Erreur connexion BarLangueSub signaux")

        # position timer
        self.position_timer = QTimer(self)
        self.position_timer.setInterval(500)
        self.position_timer.timeout.connect(self._update_position)

        # cursor auto-hide control
        self._cursor_timer = QTimer(self)
        self._cursor_timer.setInterval(100)
        self._cursor_timer.timeout.connect(self._check_cursor_and_show_hide)
        self._cursor_timer.start()

        # mouse tracking + fullscreen
        self.setMouseTracking(True)
        self.video_frame.setMouseTracking(True)
        self.showFullScreen()

        QTimer.singleShot(0, self._update_bars_geometry)

    # ---------------- Helper methods ----------------
    def _is_mpv_alive(self) -> bool:
        proc = getattr(self.mpv, "process", None)
        try:
            return proc is not None and proc.poll() is None
        except Exception:
            logger.exception("Erreur vérification process MPV")
            return False

    def _get_current_url(self) -> Optional[str]:
        if self.stream_urls:
            try:
                return self.stream_urls[self.current_index]
            except Exception:
                logger.exception("Erreur récupération URL courante")
        return None

    # ---------------- Cursor / bars visibility ----------------
    @safe_slot
    def _check_cursor_and_show_hide(self):
        """Affiche/masque les barres en fonction de la position du curseur."""
        try:
            from PyQt6.QtGui import QCursor
            cursor_pos = QCursor.pos()
        except Exception:
            logger.exception("Erreur QCursor")
            return

        try:
            main_geo = self.geometry()
            top_over = bool(getattr(self, "top_bar", None) and self.top_bar.geometry().contains(cursor_pos))
            bottom_over = bool(getattr(self, "bottom_bar", None) and self.bottom_bar.geometry().contains(cursor_pos))
            threshold = 30

            # show top
            if (cursor_pos.y() <= main_geo.y() + threshold) or top_over:
                if getattr(self, "top_bar", None) and not self.top_bar.isVisible():
                    self.top_bar.setVisible(True)
                try:
                    self.hide_bar_timer.start()
                except Exception:
                    logger.exception("Erreur démarrage hide_bar_timer")

            # show bottom
            elif (cursor_pos.y() >= main_geo.y() + main_geo.height() - threshold) or bottom_over:
                if getattr(self, "bottom_bar", None) and not self.bottom_bar.isVisible():
                    self.bottom_bar.setVisible(True)
                try:
                    self.hide_bar_timer.start()
                except Exception:
                    logger.exception("Erreur démarrage hide_bar_timer")

            # otherwise schedule hide unless the cursor is over a bar
            else:
                if not top_over and not bottom_over:
                    if not self.hide_bar_timer.isActive():
                        try:
                            self.hide_bar_timer.start()
                        except Exception:
                            logger.exception("Erreur démarrage hide_bar_timer")
                else:
                    try:
                        self.hide_bar_timer.stop()
                    except Exception:
                        logger.exception("Erreur stop hide_bar_timer")
        except Exception:
            logger.exception("_check_cursor_and_show_hide erreur globale")

    @safe_slot
    def cacher_barre(self):
        """Masque les barres si le curseur n'est pas dessus."""
        try:
            from PyQt6.QtGui import QCursor
            pos = QCursor.pos()
            on_top = getattr(self, "top_bar", None) and self.top_bar.geometry().contains(pos)
            on_bottom = getattr(self, "bottom_bar", None) and self.bottom_bar.geometry().contains(pos)
            if not on_top and not on_bottom:
                if getattr(self, "top_bar", None):
                    self.top_bar.setVisible(False)
                if getattr(self, "bottom_bar", None):
                    self.bottom_bar.setVisible(False)
                if getattr(self, "hide_bar_timer", None):
                    self.hide_bar_timer.stop()
        except Exception:
            logger.exception("cacher_barre erreur")

    # ---------------- MPV safe stop ----------------
    def _safe_stop_mpv(self, timeout_ms: int = 1500) -> bool:
        """
        Tente d'arrêter proprement mpv, puis kill si nécessaire.
        Retourne True si le processus est arrêté ou absent, False sinon.
        """
        self._playgen += 1  # invalide callbacks asynchrones
        try:
            # Stop timers
            try:
                if self.position_timer is not None:
                    self.position_timer.stop()
            except Exception:
                logger.exception("Erreur stop position_timer")

            try:
                if self._volume_timer is not None:
                    self._volume_timer.stop()
            except Exception:
                logger.exception("Erreur stop volume_timer")

            # request mpv stop
            try:
                if hasattr(self.mpv, "stop"):
                    self.mpv.stop()
            except Exception:
                logger.exception("Erreur mpv.stop()")

            # ensure process terminated
            proc = getattr(self.mpv, "process", None)
            if proc is None:
                return True

            waited = 0
            interval = 50
            while proc.poll() is None and waited < timeout_ms:
                time.sleep(interval / 1000.0)
                waited += interval

            if proc.poll() is None:
                try:
                    if hasattr(proc, "kill"):
                        proc.kill()
                        time.sleep(0.05)
                except Exception:
                    logger.exception("Erreur kill process")

            if proc.poll() is None:
                logger.warning("MPV n'a pas terminé après timeout")
                return False

            return True
        except Exception:
            logger.exception("_safe_stop_mpv erreur globale")
            return False

    # ---------------- Audio / Subtitle application ----------------
    @safe_slot
    def _apply_audio_track(self, aid):
        if aid is None:
            return
        try:
            self.mpv.set_audio_track(aid)
            logger.debug("Piste audio changée: %s", aid)
        except Exception:
            logger.exception("Erreur application piste audio")

    @safe_slot
    def _apply_subtitle_track(self, sid):
        if sid is None:
            return
        try:
            self.mpv.set_subtitle_track(sid)
            logger.debug("Piste sous-titre changée: %s", sid)
        except Exception:
            logger.exception("Erreur application piste sous-titre")

    # ---------------- Track list fetching & application ----------------
    def _parse_track_list(self, tracks: Optional[List[Dict[str, Any]]]) -> Tuple[List[Dict], List[Dict]]:
        audios = []
        subs = []
        if not tracks:
            return audios, subs

        for i, t in enumerate(tracks):
            try:
                if isinstance(t, dict):
                    ttype = (t.get("type") or "").lower()
                    if ttype == "audio":
                        audios.append(t)
                    elif ttype in ("sub", "subtitle"):
                        subs.append(t)
            except Exception:
                logger.exception("Erreur traitement piste index %s", i)
        return audios, subs

    def _fetch_and_apply_track_lists(self, attempts: int = 12, delay_ms: int = 500, gen: Optional[int] = None):
        """
        Tente de récupérer la liste des pistes depuis MPV et l'applique à l'UI.
        Si c'est une URL YouTube sans pistes, essaie le fallback via MPVController.get_youtube_info.
        """
        if gen is None:
            gen = self._playgen
        if gen != self._playgen:
            logger.debug("Génération invalide, annulation fetch_and_apply_track_lists")
            return

        current_url = self._get_current_url()
        try:
            proc = getattr(self.mpv, "process", None)
            if proc is None or proc.poll() is not None:
                logger.debug("Processus MPV absent ou terminé lors de fetch tracks")
                return
        except Exception:
            logger.exception("Erreur vérification process avant fetch tracks")
            return

        tracks = None
        try:
            tracks = self.mpv.get_track_list()
            logger.debug("Pistes récupérées: %d", len(tracks or []))
        except Exception:
            logger.exception("Erreur get_track_list")
            tracks = None

        audios, subs = self._parse_track_list(tracks)

        # Fallback pour YouTube si aucune piste détectée
        if (not audios and not subs) and current_url and ("youtube.com" in current_url or "youtu.be" in current_url):
            try:
                logger.debug("Tentative fallback YouTube pour les pistes")
                info = MPVController.get_youtube_info(current_url)
                if isinstance(info, dict):
                    subs_from_yt = info.get("subtitles") or info.get("requested_subtitles") or info.get("automatic_captions")
                    if subs_from_yt:
                        generated_subs = []
                        if isinstance(subs_from_yt, dict):
                            for lang, info_sub in subs_from_yt.items():
                                label = lang
                                generated_subs.append({"id": f"yt-{lang}", "lang": lang, "title": label})
                        elif isinstance(subs_from_yt, list):
                            for s in subs_from_yt:
                                lang = s.get("lang") if isinstance(s, dict) else str(s)
                                generated_subs.append({"id": f"yt-{lang}", "lang": lang, "title": str(lang)})
                        subs = generated_subs
                        logger.debug("Subs générés pour UI: %d", len(subs))
            except Exception:
                logger.exception("Erreur fallback YouTube")

        # Si encore rien, réessayer plus tard (seulement si attempts > 0)
        if (not audios and not subs) and attempts > 0:
            logger.debug("Pas de pistes, réessai dans %sms (restant: %d)", delay_ms, attempts - 1)
            QTimer.singleShot(delay_ms, lambda g=gen: (g == self._playgen and self._fetch_and_apply_track_lists(attempts - 1, delay_ms, gen=g)))
            return

        # Appliquer à l'UI
        try:
            if gen != self._playgen:
                return
            bls = getattr(self.bottom_bar, "barLangueSub", None)
            if bls:
                bls.set_audio_tracks(audios)
                bls.set_subtitle_tracks(subs)
                logger.debug("Pistes appliquées: audio=%d, subs=%d", len(audios), len(subs))
                # update geometry si disponible
                QTimer.singleShot(0, partial(getattr(bls, "update_geometry", lambda w: None), self.window()))
        except Exception:
            logger.exception("Erreur application pistes à UI")

    # ---------------- UI Geometry ----------------
    @safe_slot
    def _update_bars_geometry(self):
        try:
            geo = self.geometry()
            if getattr(self, "top_bar", None):
                self.top_bar.setGeometry(geo.x(), geo.y(), geo.width(), 30)
            if getattr(self, "bottom_bar", None):
                self.bottom_bar.setGeometry(
                    geo.x(),
                    geo.y() + geo.height() - self.bottom_bar.height(),
                    geo.width(),
                    self.bottom_bar.height()
                )
        except Exception:
            logger.exception("Erreur update_bars_geometry")

    # ---------------- Position updates ----------------
    @safe_slot
    def _update_position(self):
        """Lit la position et la durée depuis MPV et met à jour l'UI."""
        try:
            if not self._is_mpv_alive():
                if self.position_timer:
                    self.position_timer.stop()
                return
        except Exception:
            logger.exception("Erreur vérification process dans _update_position")
            return

        try:
            dur = self.mpv.get_duration()
            pos = self.mpv.get_time_pos()
        except Exception:
            logger.exception("Erreur get_duration/get_time_pos")
            return

        if not hasattr(self, "_last_duration"):
            self._last_duration = None
        if not hasattr(self, "_last_position"):
            self._last_position = None

        # duration
        try:
            if dur is not None:
                dur_int = int(float(dur))
                if dur_int > 0 and self._last_duration != dur_int:
                    self.bottom_bar.set_duration(dur_int)
                    self._last_duration = dur_int
        except Exception:
            logger.exception("Erreur set_duration")

        # position
        try:
            if pos is not None:
                pos_int = int(float(pos))
                if self._last_position is None or abs(self._last_position - pos_int) >= 1:
                    slider = getattr(self.bottom_bar, "slider", None)
                    if slider is not None:
                        slider.blockSignals(True)
                        slider.setValue(pos_int)
                        slider.update()
                        slider.blockSignals(False)
                    if hasattr(self.bottom_bar, "set_current_time"):
                        self.bottom_bar.set_current_time(pos_int)
                    self._last_position = pos_int
        except Exception:
            logger.exception("Erreur update position")

    # ---------------- Volume handling ----------------
    @safe_slot
    def _on_volume_changed(self, value: int):
        try:
            vol_int = clamp_int(value, 0, MAX_VOLUME, default=None)
            if vol_int is None:
                logger.debug("_on_volume_changed: valeur non convertible %s", value)
                return
            if vol_int > 0:
                self._previous_volume = vol_int
            self._last_volume = vol_int
            self._muted = (vol_int == 0)
            self.mpv.set_volume(vol_int)
        except Exception:
            logger.exception("Erreur _on_volume_changed")

    @safe_slot
    def _on_mute_toggled(self, muted: bool):
        try:
            self._muted = bool(muted)
            self.mpv.set_mute(self._muted)
        except Exception:
            logger.exception("Erreur _on_mute_toggled")

    @safe_slot
    def _poll_volume(self):
        try:
            if not self._is_mpv_alive():
                if self._volume_timer is not None:
                    self._volume_timer.stop()
                return
        except Exception:
            logger.exception("Erreur vérification process dans _poll_volume")
            return

        try:
            vol = self.mpv.get_volume()
            muted = self.mpv.get_mute()
        except Exception:
            logger.exception("Erreur get_volume/get_mute")
            return

        vol_int = None
        try:
            vol_int = clamp_int(vol, 0, MAX_VOLUME, default=None)
        except Exception:
            vol_int = None

        try:
            changed = False
            if vol_int is not None and vol_int != self._last_volume:
                self._last_volume = vol_int
                changed = True
            if muted is not None and muted != self._muted:
                self._muted = muted
                changed = True

            if changed:
                if hasattr(self.bottom_bar, "set_volume"):
                    self.bottom_bar.set_volume(int(self._last_volume or 0))
                if hasattr(self.bottom_bar, "set_mute"):
                    self.bottom_bar.set_mute(bool(self._muted))
                else:
                    vc = getattr(self.bottom_bar, "volume_control", None)
                    if vc:
                        try:
                            vc.slider.blockSignals(True)
                            vc.slider.setValue(int(self._last_volume or 0))
                            # set_state expects not-muted state typically
                            if getattr(vc, "icon", None) and hasattr(vc.icon, "set_state"):
                                vc.icon.set_state(not bool(self._muted))
                                vc._update_icon()
                            vc.slider.blockSignals(False)
                        except Exception:
                            logger.exception("Erreur mise à jour volume_control")
        except Exception:
            logger.exception("Erreur mise à jour volume UI")

    # ---------------- Slider / position interaction ----------------
    def _on_slider_moved(self, pos: int):
        # placeholder: peut être surchargé pour montrer un tooltip
        pass

    @safe_slot
    def _on_slider_released(self, pos: int):
        try:
            slider = getattr(self.bottom_bar, "slider", None)
            if slider is not None:
                slider.blockSignals(True)
                slider.setValue(pos)
                slider.update()
                slider.blockSignals(False)
            else:
                if hasattr(self.bottom_bar, "set_position"):
                    self.bottom_bar.set_position(pos)

            self.mpv.seek_to(pos)
            self._last_position = int(pos)
        except Exception:
            logger.exception("Erreur _on_slider_released")

    @safe_slot
    def _on_chapter_selected(self, seconds: int):
        try:
            self.mpv.seek_to(seconds)
            logger.debug("Chapitre sélectionné: %ds", seconds)
        except Exception:
            logger.exception("Erreur _on_chapter_selected")

    # ---------------- Short seeks ----------------
    def seek_forward(self):
        try:
            self.mpv.seek_forward(10)
        except Exception:
            logger.exception("Erreur seek_forward")

    def seek_backward(self):
        try:
            self.mpv.seek_backward(10)
        except Exception:
            logger.exception("Erreur seek_backward")

    # ---------------- Events ----------------
    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._update_bars_geometry()

    def moveEvent(self, event):
        super().moveEvent(event)
        self._update_bars_geometry()

    # ---------------- Chapters helpers ----------------
    def _youtube_current_chapter_index(self, pos_seconds: float) -> Optional[int]:
        if not self.youtube_chapters:
            return None
        chap_secs: List[float] = []
        for ch in self.youtube_chapters:
            st = None
            if isinstance(ch, dict):
                st = ch.get("start_time") or ch.get("start") or ch.get("time")
            else:
                st = ch
            try:
                if st is not None:
                    chap_secs.append(float(st))
            except Exception:
                continue
        chap_secs = sorted(list(dict.fromkeys(chap_secs)))
        if not chap_secs:
            return None
        idx: Optional[int] = None
        for i, t in enumerate(chap_secs):
            if i + 1 == len(chap_secs):
                if pos_seconds >= t:
                    idx = i
                    break
            else:
                if t <= pos_seconds < chap_secs[i + 1]:
                    idx = i
                    break
        if idx is None and pos_seconds < chap_secs[0]:
            idx = 0
        return idx

    @staticmethod
    def _normalize_chapters(chapters: Optional[List[Any]], total_duration: Optional[Union[int, float]] = None) -> List[Dict[str, Any]]:
        parsed: List[Dict[str, Any]] = []
        for ch in chapters or []:
            title = None
            end = None
            if isinstance(ch, dict):
                start = ch.get("start_time") or ch.get("start") or ch.get("time")
                end = ch.get("end_time") or ch.get("end")
                title = ch.get("title") or ch.get("name") or ch.get("label")
            else:
                start = ch

            try:
                start_f = float(start) if start is not None else None
                end_f = float(end) if end is not None else None
            except Exception:
                continue

            if start_f is not None:
                parsed.append({"start": start_f, "end": end_f, "title": title})

        parsed = sorted(parsed, key=lambda x: x["start"])
        n = len(parsed)
        for i in range(n):
            if parsed[i]["end"] is None:
                if i + 1 < n:
                    parsed[i]["end"] = parsed[i + 1]["start"]
                elif total_duration is not None:
                    parsed[i]["end"] = float(total_duration)
                else:
                    parsed[i]["end"] = None

            if parsed[i]["end"] is not None:
                dur = float(parsed[i]["end"]) - float(parsed[i]["start"])
                parsed[i]["duration"] = dur if dur >= 0 else None
            else:
                parsed[i]["duration"] = None

        return parsed

    @staticmethod
    def _format_time(seconds: Optional[Union[int, float]]) -> str:
        try:
            if seconds is None:
                return "—"
            s = int(round(float(seconds)))
            h = s // 3600
            m = (s % 3600) // 60
            sec = s % 60
            if h:
                return f"{h:d}:{m:02d}:{sec:02d}"
            return f"{m:d}:{sec:02d}"
        except Exception:
            return "—"

    # ---------------- Chapter navigation ----------------
    @safe_slot
    def chapter_precedent(self):
        try:
            # Priorité: youtube_chapters si présents
            if self.youtube_chapters:
                pos = self.mpv.get_time_pos() or 0
                chap_secs = []
                for ch in self.youtube_chapters:
                    st = ch.get("start_time") or ch.get("start") or ch.get("time") if isinstance(ch, dict) else ch
                    try:
                        if st is not None:
                            chap_secs.append(float(st))
                    except Exception:
                        continue
                chap_secs = sorted(list(dict.fromkeys(chap_secs)))
                if not chap_secs:
                    logger.debug("Aucun chapitre YouTube valable")
                    return
                cur_idx = self._youtube_current_chapter_index(pos) or 0
                prev_idx = (cur_idx - 1) % len(chap_secs)
                target = chap_secs[prev_idx]
                self.mpv.seek_to(target)
                logger.debug("Passé au chapitre YouTube index %d -> %ss", prev_idx, target)
                return
        except Exception:
            logger.exception("Erreur navigation chapitre précédent (YouTube)")

        try:
            current_chapter = self.mpv.get_property("chapter")
            if current_chapter is None:
                logger.debug("Impossible de récupérer le chapitre actuel (mpv)")
                return
            prev_chapter = int(current_chapter) - 1
            chapters = self.mpv.get_chapter_list() or []
            if prev_chapter < 0:
                prev_chapter = max(0, len(chapters) - 1)
            self.mpv.set_property("chapter", prev_chapter)
            logger.debug("Passé au chapitre mpv index %d", prev_chapter)
        except Exception:
            logger.exception("Erreur chapter_precedent mpv")

    @safe_slot
    def chapter_suivant(self):
        try:
            if self.youtube_chapters:
                pos = self.mpv.get_time_pos() or 0
                chap_secs = []
                for ch in self.youtube_chapters:
                    st = ch.get("start_time") or ch.get("start") or ch.get("time") if isinstance(ch, dict) else ch
                    try:
                        if st is not None:
                            chap_secs.append(float(st))
                    except Exception:
                        continue
                chap_secs = sorted(list(dict.fromkeys(chap_secs)))
                if not chap_secs:
                    logger.debug("Aucun chapitre YouTube valide")
                    return
                cur_idx = self._youtube_current_chapter_index(pos) or 0
                next_idx = (cur_idx + 1) % len(chap_secs)
                target = chap_secs[next_idx]
                self.mpv.seek_to(target)
                logger.debug("Passé au chapitre YouTube index %d -> %ss", next_idx, target)
                return
        except Exception:
            logger.exception("Erreur navigation chapitre suivant (YouTube)")

        try:
            current_chapter = self.mpv.get_property("chapter")
            if current_chapter is None:
                logger.debug("Impossible de récupérer le chapitre actuel (mpv)")
                return
            next_chapter = int(current_chapter) + 1
            chapters = self.mpv.get_chapter_list() or []
            if next_chapter >= len(chapters):
                next_chapter = 0
            self.mpv.set_property("chapter", next_chapter)
            logger.debug("Passé au chapitre mpv index %d", next_chapter)
        except Exception:
            logger.exception("Erreur chapter_suivant mpv")

    # ---------------- Get chapter list for UI ----------------
    @safe_slot
    def get_chapter_list(self):
        """
        Remplit self.youtube_chapters et met à jour bottom_bar.
        """
        self.youtube_chapters = []
        try:
            dur_val = self.mpv.get_duration()
            if dur_val and dur_val > 0:
                self.bottom_bar.set_duration(int(float(dur_val)))
        except Exception:
            logger.exception("(get_chapter_list) impossible de récupérer duration")

        # If youtube_chapters already filled, apply directly
        try:
            if getattr(self, "youtube_chapters", None):
                self.bottom_bar.set_chapters(self.youtube_chapters)
                return
        except Exception:
            logger.exception("(get_chapter_list) erreur traitement youtube_chapters")

        try:
            chapters = self.mpv.get_chapter_list()
        except Exception:
            logger.exception("(get_chapter_list) erreur get_chapter_list mpv")
            chapters = None

        if not chapters:
            logger.debug("Pas de chapitres MPV.")
            try:
                self.bottom_bar.set_chapters([])
            except Exception:
                logger.exception("Erreur set_chapters bottom_bar")
            return

        chap_secs = []
        for ch in chapters:
            try:
                if isinstance(ch, dict):
                    t = ch.get("time") or ch.get("start_time") or ch.get("start")
                else:
                    t = ch
                if t is not None:
                    chap_secs.append(int(float(t)))
            except Exception:
                logger.exception("Erreur parsing chapter item")
                continue

        chap_secs = sorted(list(dict.fromkeys(chap_secs)))
        try:
            self.bottom_bar.set_chapters(chap_secs)
            # Ensure slider redraw
            try:
                self.bottom_bar.slider.update()
            except Exception:
                pass
        except Exception:
            logger.exception("(get_chapter_list) erreur set_chapters bottom_bar")

    # ---------------- Video switching ----------------
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
        # Reset state and stop mpv safely, then relaunch
        self.youtube_chapters = []
        self._youtube_info_applied = False

        try:
            self.bottom_bar.set_chapters([])
        except Exception:
            logger.exception("Erreur reset chapters UI")

        try:
            self._safe_stop_mpv(timeout_ms=2000)
        except Exception:
            logger.exception("_restart_video: erreur safe_stop_mpv")

        # short pause non bloquante alternative: use singleShot to delay lancer_video
        QTimer.singleShot(100, self.lancer_video)

    @staticmethod
    def get_youtube_chapters(url: str) -> Any:
        return MPVController.get_youtube_chapters(url)

    # ---------------- Launch / main playback flow ----------------
    def lancer_video(self):
        """Lance la lecture du flux courant (self.current_index)."""
        if not self.stream_urls:
            logger.warning("Aucune URL fournie")
            return

        # Reset chapter info
        self.youtube_chapters = []
        self._youtube_info_applied = False

        # Clear UI chapters immediately
        try:
            self.bottom_bar.set_chapters([])
            try:
                self.bottom_bar.slider.update()
            except Exception:
                pass
        except Exception:
            logger.exception("Erreur reset chapters UI")

        self._playgen += 1
        this_gen = self._playgen

        url = self._get_current_url()
        if not url:
            logger.error("URL actuelle introuvable")
            return

        window_id = str(int(self.video_frame.winId()))

        # force update lang bar geometry helper
        def _force_update_lang_bar_geometry(gen: int = this_gen):
            try:
                if gen != self._playgen:
                    return
                bls = getattr(self.bottom_bar, "barLangueSub", None)
                if bls and hasattr(bls, "update_geometry"):
                    bls.update_geometry(self.window())
            except Exception:
                logger.exception("_force_update_lang_bar_geometry erreur")

        # fetch youtube info in background to not bloquer l'UI
        def _fetch_yt_info_and_apply(gen: int = this_gen, url_local: str = url):
            try:
                info = MPVController.get_youtube_info(url_local)
                if gen != self._playgen:
                    return

                chapters = None
                duration = None
                if isinstance(info, (tuple, list)):
                    if len(info) >= 1:
                        chapters = info[0]
                    if len(info) >= 2:
                        duration = info[1]
                elif isinstance(info, dict):
                    chapters = info.get("chapters") or info.get("chapter") or info.get("chapters_list")
                    duration = info.get("duration") or info.get("length")

                norm = self._normalize_chapters(chapters, total_duration=duration) if chapters else None
                if gen != self._playgen:
                    return

                if norm:
                    QTimer.singleShot(0, lambda n=norm, g=gen: (g == self._playgen and self.bottom_bar.set_chapters(n)))
                    if hasattr(self.bottom_bar, "set_chapter_infos"):
                        QTimer.singleShot(0, lambda n=norm, g=gen: (g == self._playgen and self.bottom_bar.set_chapter_infos(n)))
                    elif hasattr(self.bottom_bar, "set_chapter_durations"):
                        durations = [None if c.get("duration") is None else float(c.get("duration")) for c in norm]
                        QTimer.singleShot(0, lambda d=durations, g=gen: (g == self._playgen and self.bottom_bar.set_chapter_durations(d)))
                    QTimer.singleShot(0, lambda g=gen: setattr(self, "_youtube_info_applied", True) if g == self._playgen else None)
                    QTimer.singleShot(0, lambda g=gen: _force_update_lang_bar_geometry(g))
                else:
                    if duration and duration > 0:
                        QTimer.singleShot(0, lambda d=int(float(duration)), g=gen: (g == self._playgen and self.bottom_bar.set_duration(d)))
                        QTimer.singleShot(0, lambda g=gen: setattr(self, "_youtube_info_applied", True) if g == self._playgen else None)
            except Exception:
                logger.exception("Erreur fetch_yt_info thread")

        try:
            threading.Thread(target=_fetch_yt_info_and_apply, daemon=True).start()
        except Exception:
            logger.exception("Erreur démarrage thread fetch_yt_info")

        # Launch mpv (non bloquant)
        try:
            launched = self.mpv.launch(url, window_id)
        except Exception:
            logger.exception("Exception lors du lancement mpv")
            launched = False

        if not launched:
            logger.error("Échec du lancement mpv pour l'URL: %s", url)
            return

        # démarrage timers
        if not getattr(self, "position_timer", None):
            self.position_timer = QTimer(self)
            self.position_timer.setInterval(500)
            self.position_timer.timeout.connect(self._update_position)
        self.position_timer.start()

        try:
            if self._volume_timer:
                QTimer.singleShot(300, lambda g=this_gen: (g == self._playgen and self._volume_timer.start()))
                QTimer.singleShot(500, lambda g=this_gen: (g == self._playgen and self._poll_volume()))
        except Exception:
            logger.exception("Erreur démarrage _volume_timer")

        # UI updates and background polls
        QTimer.singleShot(0, lambda: getattr(self.bottom_bar, "update", lambda: None)())

        QTimer.singleShot(2000, lambda g=this_gen: (g == self._playgen and self.get_chapter_list()))
        QTimer.singleShot(800, lambda g=this_gen: (g == self._playgen and self._fetch_and_apply_track_lists(gen=g)))
        QTimer.singleShot(1200, lambda g=this_gen: (g == self._playgen and _force_update_lang_bar_geometry(g)))
        QTimer.singleShot(2200, lambda g=this_gen: (g == self._playgen and _force_update_lang_bar_geometry(g)))

        def _poll_duration(attempts_left: int = 20, gen: int = this_gen):
            try:
                if gen != self._playgen:
                    return
                dur = self.mpv.get_duration()
                if gen != self._playgen:
                    return

                if dur and dur > 0:
                    d = int(float(dur))
                    try:
                        self.bottom_bar.set_duration(d)
                        logger.debug("Duration récupérée : %ds", d)
                    except Exception:
                        logger.exception("Erreur set_duration bottom_bar (non bloquant)")

                    # try to apply youtube_chapters or mpv chapters
                    if self.youtube_chapters:
                        try:
                            if isinstance(self.youtube_chapters[0], dict):
                                self.bottom_bar.set_chapters(self.youtube_chapters)
                                try:
                                    self.bottom_bar.slider.update()
                                except Exception:
                                    pass
                            else:
                                chap_secs = sorted(list(dict.fromkeys([float(ch) for ch in self.youtube_chapters])))
                                self.bottom_bar.set_chapters(chap_secs)
                                try:
                                    self.bottom_bar.slider.update()
                                except Exception:
                                    pass
                        except Exception:
                            logger.exception("Erreur set_chapters bottom_bar (non bloquant)")
                        QTimer.singleShot(0, lambda g=gen: _force_update_lang_bar_geometry(g) if g == self._playgen else None)
                    else:
                        try:
                            chapters = self.mpv.get_chapter_list()
                            if chapters:
                                chap_secs = []
                                for ch in chapters:
                                    try:
                                        if isinstance(ch, dict):
                                            t = ch.get("time") or ch.get("start_time") or ch.get("start")
                                        else:
                                            t = ch
                                        if t is not None:
                                            chap_secs.append(int(float(t)))
                                    except Exception:
                                        logger.exception("Erreur parse chapter item (poll_duration)")
                                        continue
                                chap_secs = sorted(list(dict.fromkeys(chap_secs)))
                                try:
                                    self.bottom_bar.set_chapters(chap_secs)
                                    try:
                                        self.bottom_bar.slider.update()
                                    except Exception:
                                        pass
                                except Exception:
                                    logger.exception("Erreur set_chapters bottom_bar (non bloquant)")
                        except Exception:
                            logger.exception("Erreur get_chapter_list mpv (non bloquant)")
                    return
                else:
                    if attempts_left > 0:
                        QTimer.singleShot(500, lambda a=attempts_left - 1, g=gen: (g == self._playgen and _poll_duration(a, g)))
            except Exception:
                logger.exception("_poll_duration erreur")

        QTimer.singleShot(0, lambda g=this_gen: _poll_duration(20, g))

    # ---------------- Misc event handlers ----------------
    def mouseMoveEvent(self, event):
        try:
            self._check_cursor_and_show_hide()
        except Exception:
            logger.exception("mouseMoveEvent erreur")
        super().mouseMoveEvent(event)

    def toggle_play_pause(self):
        # minute delay pour éviter double-trigger rapide
        delay = 100
        QTimer.singleShot(delay, self.mpv.toggle_play_pause)

    # ---------------- Close / cleanup ----------------
    def closeEvent(self, event):
        logger.debug("closeEvent déclenché — nettoyage")
        try:
            if getattr(self, "position_timer", None):
                self.position_timer.stop()
        except Exception:
            logger.exception("closeEvent position_timer")

        try:
            if getattr(self, "_volume_timer", None):
                self._volume_timer.stop()
        except Exception:
            logger.exception("closeEvent volume_timer")

        try:
            # assure shutdown propre de mpv
            self._safe_stop_mpv(timeout_ms=2000)
        except Exception:
            logger.exception("closeEvent safe_stop_mpv")

        try:
            if getattr(self, "top_bar", None):
                self.top_bar.close()
            if getattr(self, "bottom_bar", None):
                self.bottom_bar.close()
        except Exception:
            logger.exception("closeEvent barres")

        super().closeEvent(event)


# ---------------- Entrée principale ----------------
def main():
    app = QApplication(sys.argv)
    dossier_script = Path(__file__).parent
    dossier_projet = dossier_script.parent.parent

    chemin_style = dossier_projet / "Config" / "style.qss"
    if chemin_style.exists():
        try:
            with open(chemin_style, "r", encoding="utf-8") as f:
                app.setStyleSheet(f.read())
        except Exception:
            logger.exception("Impossible d'appliquer le style QSS")

    taille_ecran = QSize(1280, 720)
    urls_test = [
        "https://www.youtube.com/watch?v=GoN0-7z6NZk",
        "https://www.youtube.com/watch?v=GCW1cWMlrDA",
        "https://www.youtube.com/watch?v=OIxRRR3gS_E&list=OLAK5uy_ke4zvQhGW2BDith3tH_fh_uMaoGunxkHo&index=7"
    ]

    lecteur = Lecteur(stream_urls=urls_test, taille_ecran=taille_ecran)
    lecteur.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
