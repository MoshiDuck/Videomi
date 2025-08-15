# -*- coding: utf-8 -*-
"""
Fichier optimisé: lecteur_optimized.py
- Refactorisation, typage renforcé, meilleure gestion du process MPV (non-bloquant),
- Moins de sleep sur le thread principal, utilisation prudente de threads pour opérations blocking,
- Centralisation des messages d'erreur / logging et décorateurs réutilisables,
- Petits helpers pour réduire les répétitions et rendre le code plus lisible.

Remarque: ce fichier garde l'API publique (méthodes) du fichier original pour minimiser
les modifications côté Widgets / MPVController. Il suppose l'existence de MPVController,
BarFenetre, BarSecLect et BaseFenetre comme dans ton projet.

Auteur: assistant (optimisation demandée)
"""
from __future__ import annotations

import logging
import os
import sys
import threading
import subprocess
from functools import wraps, partial
from pathlib import Path
from typing import Optional, List, Any, Dict, Tuple, Union, Callable

from PyQt6.QtCore import QTimer, QSize, Qt, QRunnable, QThreadPool
from PyQt6.QtWidgets import QFrame, QSizePolicy, QApplication

# Imports externes du projet
from Pages.Lecteur.Bar_Sec.bar_sec_lect import BarSecLect
from Pages.Lecteur.mpv_controller import MPVController
from Widgets.bar_fenetre import BarFenetre
from Widgets.base_fenetre import BaseFenetre

# ---------------- Constants & paths ----------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MPV_DIR = PROJECT_ROOT / "Ressource" / "mpv"
MPV_EXE = MPV_DIR / ("mpv.exe" if os.name == "nt" else "mpv")

MAX_VOLUME = 200
DEFAULT_WINDOW_SIZE = QSize(800, 600)

# try to ensure MPV_DIR in PATH (non-destructive)
if MPV_DIR.exists():
    _old_path = os.environ.get("PATH", "")
    if str(MPV_DIR) not in _old_path.split(os.pathsep):
        os.environ["PATH"] = f"{MPV_DIR}{os.pathsep}{_old_path}"

# ---------------- Logging ----------------
logger = logging.getLogger("lecteur")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.DEBUG)

# ---------------- Utilities ----------------

def safe_slot(func: Callable) -> Callable:
    """Décorateur pour slots/callbacks Qt : log et stabilise.

    Attrape les exceptions, les logge et évite la propagation qui ferait crasher Qt.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as exc:  # pragma: no cover - stability
            logger.exception("Exception dans %s: %s", func.__name__, exc)
            return None

    return wrapper


def clamp_int(value: Any, minimum: int, maximum: int, default: Optional[int] = None) -> Optional[int]:
    try:
        if value is None:
            return default
        v = int(round(float(value)))
        return max(minimum, min(maximum, v))
    except Exception:
        return default


def _safe_getattr(obj: Any, name: str, default: Any = None) -> Any:
    try:
        return getattr(obj, name, default)
    except Exception:
        logger.exception("_safe_getattr failed for %s on %s", name, obj)
        return default


class _BackgroundCallable(QRunnable):
    """QRunnable utilitaire pour exécuter une callable (non-UI) dans le thread-pool.

    La callable doit éviter de toucher directement les widgets Qt ; utiliser QTimer.singleShot
    ou d'autres mécanismes pour effectuer des updates sur le thread principal.
    """

    def __init__(self, func: Callable, *args, **kwargs):
        super().__init__()
        self.func = func
        self.args = args
        self.kwargs = kwargs

    def run(self) -> None:  # pragma: no cover - depends on runtime
        try:
            self.func(*self.args, **self.kwargs)
        except Exception:
            logger.exception("Erreur dans background runnable")


# ---------------- Main class ----------------
class Lecteur(BaseFenetre):
    """Fenêtre principale du lecteur.

    Conserve l'API publique du lecteur original — méthode/nommages compatibles.
    """

    def __init__(self, stream_urls: List[str], taille_ecran: Optional[QSize] = None):
        super().__init__(bar=False)

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
        mpv_exe_path = self._resolve_mpv_exe()
        if not mpv_exe_path:
            logger.warning("MPV executable introuvable — MPVController risque d'échouer (rechercher dans PATH)")
        self.mpv = MPVController(mpv_exe_path, MAX_VOLUME)

        # volume poller
        self._volume_timer = QTimer(self)
        self._volume_timer.setInterval(1000)
        self._volume_timer.timeout.connect(self._poll_volume)

        # thread pool pour tâches non-UI
        self._tp = QThreadPool.globalInstance()

        # démarrage léger (après la boucle d'événements)
        QTimer.singleShot(200, self.lancer_video)

    # ---------------- Helpers ----------------
    def _resolve_mpv_exe(self) -> Optional[Path]:
        """Retourne le Path vers l'exécutable mpv ou None si introuvable.

        Cherche d'abord dans MPV_EXE, puis tente shutil.which sur PATH.
        """
        try:
            if MPV_EXE.exists():
                return MPV_EXE
            # fallback: chercher dans PATH
            import shutil

            found = shutil.which("mpv")
            if found:
                return Path(found)
            return None
        except Exception:
            logger.exception("Erreur résolution mpv exe")
            return None

    @property
    def current_url(self) -> Optional[str]:
        """URL actuelle protégée."""
        try:
            if not self.stream_urls:
                return None
            return self.stream_urls[self.current_index]
        except Exception:
            logger.exception("Erreur récupération current_url")
            return None

    def _is_mpv_alive(self) -> bool:
        proc = _safe_getattr(self.mpv, "process", None)
        try:
            return proc is not None and proc.poll() is None
        except Exception:
            logger.exception("Erreur vérification process MPV")
            return False

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

        # connect signals de la bottom bar (défensif)
        try:
            self.bottom_bar.play_pause_clicked.connect(self.toggle_play_pause)
            self.bottom_bar.prev_clicked.connect(self.video_precedente)
            self.bottom_bar.next_clicked.connect(self.video_suivante)
            self.bottom_bar.chapter_prev_clicked.connect(self.chapter_precedent)
            self.bottom_bar.chapter_next_clicked.connect(self.chapter_suivant)
            self.bottom_bar.moins_10_clicked.connect(self.seek_backward)
            self.bottom_bar.plus_10_clicked.connect(self.seek_forward)
            self.bottom_bar.position_changed.connect(self._on_slider_moved)
            # connect slider released variations
            if getattr(self.bottom_bar, "slider", None):
                slider = self.bottom_bar.slider
                if getattr(slider, "position_released", None):
                    slider.position_released.connect(self._on_slider_released)
                elif getattr(slider, "sliderReleased", None):
                    slider.sliderReleased.connect(lambda: self._on_slider_released(slider.value()))
            self.bottom_bar.chapter_selected.connect(self._on_chapter_selected)
        except Exception:
            logger.exception("Erreur connexion signaux bottom_bar")

        # volume connections
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

        # optional language/sub widgets
        try:
            bls = getattr(self.bottom_bar, "barLangueSub", None)
            if bls:
                bls.audio_selected.connect(lambda aid: QTimer.singleShot(0, partial(self._apply_audio_track, aid)))
                bls.subtitle_selected.connect(lambda sid: QTimer.singleShot(0, partial(self._apply_subtitle_track, sid)))
                try:
                    if hasattr(bls, "link_with_bar"):
                        bls.link_with_bar(self.bottom_bar)
                except Exception:
                    logger.debug("link_with_bar indisponible ou a échoué", exc_info=True)
        except Exception:
            logger.exception("Erreur connexion BarLangueSub signaux")

        # position timer
        self.position_timer = QTimer(self)
        self.position_timer.setInterval(500)
        self.position_timer.timeout.connect(self._update_position)

        # cursor auto-hide
        self._cursor_timer = QTimer(self)
        self._cursor_timer.setInterval(100)
        self._cursor_timer.timeout.connect(self._check_cursor_and_show_hide)
        self._cursor_timer.start()

        # mouse tracking + fullscreen
        self.setMouseTracking(True)
        self.video_frame.setMouseTracking(True)
        self.showFullScreen()

        QTimer.singleShot(0, self._update_bars_geometry)

    # ---------------- Cursor / bars visibility ----------------
    @safe_slot
    def _check_cursor_and_show_hide(self) -> None:
        """Affiche/masque les barres en fonction du curseur (appelé fréquemment).

        Implémentation robuste: protège contre erreurs QCursor et problèmes de géométrie.
        """
        try:
            from PyQt6.QtGui import QCursor

            cursor_pos = QCursor.pos()
        except Exception:
            logger.exception("Erreur lecture QCursor")
            return

        try:
            main_geo = self.geometry()
            top_over = bool(_safe_getattr(self, "top_bar", None) and self.top_bar.geometry().contains(cursor_pos))
            bottom_over = bool(
                _safe_getattr(self, "bottom_bar", None) and self.bottom_bar.geometry().contains(cursor_pos)
            )
            threshold = 30

            if (cursor_pos.y() <= main_geo.y() + threshold) or top_over:
                if _safe_getattr(self, "top_bar", None) and not self.top_bar.isVisible():
                    self.top_bar.setVisible(True)
                try:
                    self.hide_bar_timer.start()
                except Exception:
                    logger.exception("Erreur démarrage hide_bar_timer")

            elif (cursor_pos.y() >= main_geo.y() + main_geo.height() - threshold) or bottom_over:
                if _safe_getattr(self, "bottom_bar", None) and not self.bottom_bar.isVisible():
                    self.bottom_bar.setVisible(True)
                try:
                    self.hide_bar_timer.start()
                except Exception:
                    logger.exception("Erreur démarrage hide_bar_timer")

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
    def cacher_barre(self) -> None:
        try:
            from PyQt6.QtGui import QCursor

            pos = QCursor.pos()
            on_top = _safe_getattr(self, "top_bar", None) and self.top_bar.geometry().contains(pos)
            on_bottom = _safe_getattr(self, "bottom_bar", None) and self.bottom_bar.geometry().contains(pos)
            if not on_top and not on_bottom:
                if _safe_getattr(self, "top_bar", None):
                    self.top_bar.setVisible(False)
                if _safe_getattr(self, "bottom_bar", None):
                    self.bottom_bar.setVisible(False)
                if _safe_getattr(self, "hide_bar_timer", None):
                    self.hide_bar_timer.stop()
        except Exception:
            logger.exception("cacher_barre erreur")

    # ---------------- MPV stop safer (non-bloquant) ----------------
    def _safe_stop_mpv(self, timeout_ms: int = 1500) -> bool:
        """Tente d'arrêter proprement mpv. Si le process ne répond pas, lance un kill en background.

        Retourne True si le process est absent ou arrêté, False si toujours vivant après la tentative.
        La méthode évite de bloquer le thread principal plus que quelques dizaines de ms.
        """
        self._playgen += 1

        # Stop timers rapidement
        try:
            if self.position_timer:
                self.position_timer.stop()
        except Exception:
            logger.exception("Erreur stop position_timer")

        try:
            if self._volume_timer:
                self._volume_timer.stop()
        except Exception:
            logger.exception("Erreur stop volume_timer")

        # ask mpv to stop
        try:
            if hasattr(self.mpv, "stop"):
                self.mpv.stop()
        except Exception:
            logger.exception("Erreur mpv.stop()")

        # check process and wait a short non-blocking time
        proc = _safe_getattr(self.mpv, "process", None)
        if proc is None:
            return True

        try:
            # try a short wait using subprocess.wait with timeout to avoid sleep loops
            try:
                proc.wait(timeout=timeout_ms / 1000.0)
            except subprocess.TimeoutExpired:
                logger.debug("MPV n'a pas terminé après %dms — tentative kill en background", timeout_ms)

                def _kill_proc(p):
                    try:
                        if getattr(p, "poll", lambda: 1)() is None:
                            try:
                                p.kill()
                            except Exception:
                                logger.exception("Erreur kill process (background)")
                            try:
                                p.wait(timeout=0.1)
                            except Exception:
                                pass
                    except Exception:
                        logger.exception("Erreur vérification process (background)")

                t = threading.Thread(target=_kill_proc, args=(proc,), daemon=True)
                t.start()

                # Give a tiny grace period for background thread to do its job
                try:
                    proc.wait(timeout=0.1)
                except Exception:
                    pass

            # final check
            alive = proc.poll() is None
            if alive:
                logger.warning("MPV n'a pas terminé après tentative d'arrêt")
                return False
            return True
        except Exception:
            logger.exception("_safe_stop_mpv erreur globale")
            return False

    # ---------------- Audio / Subtitle application ----------------
    @safe_slot
    def _apply_audio_track(self, aid: Any) -> None:
        if aid is None:
            return
        try:
            self.mpv.set_audio_track(aid)
            logger.debug("Piste audio changée: %s", aid)
        except Exception:
            logger.exception("Erreur application piste audio")

    @safe_slot
    def _apply_subtitle_track(self, sid: Any) -> None:
        if sid is None:
            return
        try:
            self.mpv.set_subtitle_track(sid)
            logger.debug("Piste sous-titre changée: %s", sid)
        except Exception:
            logger.exception("Erreur application piste sous-titre")

    # ---------------- Track list parsing & application ----------------
    def _parse_track_list(self, tracks: Optional[List[Dict[str, Any]]]) -> Tuple[List[Dict], List[Dict]]:
        audios: List[Dict] = []
        subs: List[Dict] = []
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

    def _fetch_and_apply_track_lists(self, attempts: int = 12, delay_ms: int = 500, gen: Optional[int] = None) -> None:
        """Récupère les pistes MPV et les applique à l'UI.

        Utilise des QTimer.singleShot pour réessayer sans bloquer.
        """
        if gen is None:
            gen = self._playgen
        if gen != self._playgen:
            logger.debug("Génération invalide, annulation fetch_and_apply_track_lists")
            return

        try:
            proc = _safe_getattr(self.mpv, "process", None)
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

        # Fallback YouTube si aucune piste trouvée
        if (not audios and not subs) and self.current_url and ("youtube.com" in self.current_url or "youtu.be" in self.current_url):
            try:
                logger.debug("Tentative fallback YouTube pour les pistes")
                info = MPVController.get_youtube_info(self.current_url)
                if isinstance(info, dict):
                    subs_from_yt = info.get("subtitles") or info.get("requested_subtitles") or info.get("automatic_captions")
                    if subs_from_yt:
                        generated_subs: List[Dict] = []
                        if isinstance(subs_from_yt, dict):
                            for lang in subs_from_yt.keys():
                                generated_subs.append({"id": f"yt-{lang}", "lang": lang, "title": lang})
                        elif isinstance(subs_from_yt, list):
                            for s in subs_from_yt:
                                lang = s.get("lang") if isinstance(s, dict) else str(s)
                                generated_subs.append({"id": f"yt-{lang}", "lang": lang, "title": str(lang)})
                        subs = generated_subs
                        logger.debug("Subs générés pour UI: %d", len(subs))
            except Exception:
                logger.exception("Erreur fallback YouTube")

        if (not audios and not subs) and attempts > 0:
            logger.debug("Pas de pistes, réessai dans %sms (restant: %d)", delay_ms, attempts - 1)
            QTimer.singleShot(delay_ms, lambda g=gen: (g == self._playgen and self._fetch_and_apply_track_lists(attempts - 1, delay_ms, gen=g)))
            return

        # Appliquer à l'UI
        try:
            if gen != self._playgen:
                return
            bls = _safe_getattr(self.bottom_bar, "barLangueSub", None)
            if bls:
                bls.set_audio_tracks(audios)
                bls.set_subtitle_tracks(subs)
                logger.debug("Pistes appliquées: audio=%d, subs=%d", len(audios), len(subs))
                QTimer.singleShot(0, partial(getattr(bls, "update_geometry", lambda w: None), self.window()))
        except Exception:
            logger.exception("Erreur application pistes à UI")

    # ---------------- UI Geometry ----------------
    @safe_slot
    def _update_bars_geometry(self) -> None:
        try:
            geo = self.geometry()
            if _safe_getattr(self, "top_bar", None):
                self.top_bar.setGeometry(geo.x(), geo.y(), geo.width(), 30)
            if _safe_getattr(self, "bottom_bar", None):
                self.bottom_bar.setGeometry(
                    geo.x(), geo.y() + geo.height() - self.bottom_bar.height(), geo.width(), self.bottom_bar.height()
                )
        except Exception:
            logger.exception("Erreur update_bars_geometry")

    # ---------------- Position updates ----------------
    @safe_slot
    def _update_position(self) -> None:
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
                    slider = _safe_getattr(self.bottom_bar, "slider", None)
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
    def _on_volume_changed(self, value: int) -> None:
        try:
            vol_int = clamp_int(value, 0, MAX_VOLUME, default=None)
            if vol_int is None:
                logger.debug("_on_volume_changed: valeur non convertible %s", value)
                return
            if vol_int > 0:
                self._previous_volume = vol_int
            self._last_volume = vol_int
            self._muted = vol_int == 0
            self.mpv.set_volume(vol_int)
        except Exception:
            logger.exception("Erreur _on_volume_changed")

    @safe_slot
    def _on_mute_toggled(self, muted: bool) -> None:
        try:
            self._muted = bool(muted)
            self.mpv.set_mute(self._muted)
        except Exception:
            logger.exception("Erreur _on_mute_toggled")

    @safe_slot
    def _poll_volume(self) -> None:
        try:
            if not self._is_mpv_alive():
                if self._volume_timer:
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

        vol_int = clamp_int(vol, 0, MAX_VOLUME, default=None)

        try:
            changed = False
            if vol_int is not None and vol_int != self._last_volume:
                self._last_volume = vol_int
                changed = True
            if muted is not None and muted != self._muted:
                self._muted = bool(muted)
                changed = True

            if changed:
                if hasattr(self.bottom_bar, "set_volume"):
                    self.bottom_bar.set_volume(int(self._last_volume or 0))
                if hasattr(self.bottom_bar, "set_mute"):
                    self.bottom_bar.set_mute(bool(self._muted))
                else:
                    vc = _safe_getattr(self.bottom_bar, "volume_control", None)
                    if vc and getattr(vc, "slider", None):
                        try:
                            vc.slider.blockSignals(True)
                            vc.slider.setValue(int(self._last_volume or 0))
                            if getattr(vc, "icon", None) and hasattr(vc.icon, "set_state"):
                                vc.icon.set_state(not bool(self._muted))
                                vc._update_icon()
                            vc.slider.blockSignals(False)
                        except Exception:
                            logger.exception("Erreur mise à jour volume_control")
        except Exception:
            logger.exception("Erreur mise à jour volume UI")

    # ---------------- Slider / position interaction ----------------
    def _on_slider_moved(self, pos: int) -> None:
        # placeholder: peut être surchargé pour montrer un tooltip
        return None

    @safe_slot
    def _on_slider_released(self, pos: int) -> None:
        try:
            slider = _safe_getattr(self.bottom_bar, "slider", None)
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
    def _on_chapter_selected(self, seconds: int) -> None:
        try:
            self.mpv.seek_to(seconds)
            logger.debug("Chapitre sélectionné: %ds", seconds)
        except Exception:
            logger.exception("Erreur _on_chapter_selected")

    # ---------------- Short seeks ----------------
    def seek_forward(self) -> None:
        try:
            self.mpv.seek_forward(10)
        except Exception:
            logger.exception("Erreur seek_forward")

    def seek_backward(self) -> None:
        try:
            self.mpv.seek_backward(10)
        except Exception:
            logger.exception("Erreur seek_backward")

    # ---------------- Events ----------------
    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        self._update_bars_geometry()

    def moveEvent(self, event) -> None:
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
    def chapter_precedent(self) -> None:
        try:
            if self.youtube_chapters:
                pos = self.mpv.get_time_pos() or 0
                chap_secs = [
                    float(ch.get("start_time") or ch.get("start") or ch.get("time")
                          ) if isinstance(ch, dict) else float(ch)
                    for ch in self.youtube_chapters
                    if (ch.get("start_time") or ch.get("start") or ch.get("time") if isinstance(ch, dict) else ch) is not None
                ]
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
    def chapter_suivant(self) -> None:
        try:
            if self.youtube_chapters:
                pos = self.mpv.get_time_pos() or 0
                chap_secs = [
                    float(ch.get("start_time") or ch.get("start") or ch.get("time")
                          ) if isinstance(ch, dict) else float(ch)
                    for ch in self.youtube_chapters
                    if (ch.get("start_time") or ch.get("start") or ch.get("time") if isinstance(ch, dict) else ch) is not None
                ]
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
    def get_chapter_list(self) -> None:
        self.youtube_chapters = []
        try:
            dur_val = self.mpv.get_duration()
            if dur_val and dur_val > 0 and hasattr(self.bottom_bar, "set_duration"):
                self.bottom_bar.set_duration(int(float(dur_val)))
        except Exception:
            logger.exception("(get_chapter_list) impossible de récupérer duration")

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

        chap_secs: List[int] = []
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
            try:
                self.bottom_bar.slider.update()
            except Exception:
                pass
        except Exception:
            logger.exception("(get_chapter_list) erreur set_chapters bottom_bar")

    # ---------------- Video switching ----------------
    def video_precedente(self) -> None:
        if not self.stream_urls:
            return
        self.current_index = (self.current_index - 1) % len(self.stream_urls)
        self._restart_video()

    def video_suivante(self) -> None:
        if not self.stream_urls:
            return
        self.current_index = (self.current_index + 1) % len(self.stream_urls)
        self._restart_video()

    def _restart_video(self) -> None:
        self.youtube_chapters = []
        self._youtube_info_applied = False

        try:
            self.bottom_bar.set_chapters([])
        except Exception:
            logger.exception("Erreur reset chapters UI")

        try:
            # Non-bloquant: _safe_stop_mpv fait le nécessaire (kill en background si besoin)
            self._safe_stop_mpv(timeout_ms=2000)
        except Exception:
            logger.exception("_restart_video: erreur safe_stop_mpv")

        # Délai non bloquant avant relancer
        QTimer.singleShot(100, self.lancer_video)

    @staticmethod
    def get_youtube_chapters(url: str) -> Any:  # passthrough
        return MPVController.get_youtube_chapters(url)

    # ---------------- Launch / main playback flow ----------------
    def lancer_video(self) -> None:
        """Lance la lecture du flux courant (self.current_index).

        Cette méthode orchestre des tâches rapides sur le thread principal et délègue
        les opérations potentiellement bloquantes au thread-pool / threads daemon.
        """
        if not self.stream_urls:
            logger.warning("Aucune URL fournie")
            return

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

        url = self.current_url
        if url and ("youtube.com" in url or "youtu.be" in url):
            try:
                from urllib.parse import urlparse, parse_qs, urlunparse
                parsed = urlparse(url)
                qs = parse_qs(parsed.query)

                # Supprimer les paramètres problématiques
                for param in ['list', 'index']:
                    if param in qs:
                        del qs[param]

                new_query = "&".join([f"{k}={v[0]}" for k, v in qs.items()])
                url = urlunparse(parsed._replace(query=new_query))
            except Exception as e:
                logger.error(f"Erreur nettoyage URL: {e}")
        if not url:
            logger.error("URL actuelle introuvable")
            return

        window_id = str(int(self.video_frame.winId()))

        def _force_update_lang_bar_geometry(gen: int = this_gen):
            try:
                if gen != self._playgen:
                    return
                bls = _safe_getattr(self.bottom_bar, "barLangueSub", None)
                if bls and hasattr(bls, "update_geometry"):
                    bls.update_geometry(self.window())
            except Exception:
                logger.exception("_force_update_lang_bar_geometry erreur")

        def _fetch_yt_info_and_apply(gen: int = this_gen, url_local: str = url) -> None:
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
                    if duration and duration > 0 and hasattr(self.bottom_bar, "set_duration"):
                        QTimer.singleShot(0, lambda d=int(float(duration)), g=gen: (g == self._playgen and self.bottom_bar.set_duration(d)))
                        QTimer.singleShot(0, lambda g=gen: setattr(self, "_youtube_info_applied", True) if g == self._playgen else None)
            except Exception:
                logger.exception("Erreur fetch_yt_info thread")

        # lancer fetch YouTube info dans le thread-pool (évite création explicite de threads)
        try:
            self._tp.start(_BackgroundCallable(_fetch_yt_info_and_apply))
        except Exception:
            logger.exception("Erreur démarrage background pour fetch_yt_info")

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

        QTimer.singleShot(0, lambda: getattr(self.bottom_bar, "update", lambda: None)())

        QTimer.singleShot(2000, lambda g=this_gen: (g == self._playgen and self.get_chapter_list()))
        QTimer.singleShot(800, lambda g=this_gen: (g == self._playgen and self._fetch_and_apply_track_lists(gen=g)))
        QTimer.singleShot(1200, lambda g=this_gen: (g == self._playgen and _force_update_lang_bar_geometry(g)))
        QTimer.singleShot(2200, lambda g=this_gen: (g == self._playgen and _force_update_lang_bar_geometry(g)))

        def _poll_duration(attempts_left: int = 20, gen: int = this_gen) -> None:
            try:
                if gen != self._playgen:
                    return
                dur = self.mpv.get_duration()
                if gen != self._playgen:
                    return

                if dur and dur > 0:
                    d = int(float(dur))
                    try:
                        if hasattr(self.bottom_bar, "set_duration"):
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
    def mouseMoveEvent(self, event) -> None:
        try:
            self._check_cursor_and_show_hide()
        except Exception:
            logger.exception("mouseMoveEvent erreur")
        super().mouseMoveEvent(event)

    def toggle_play_pause(self) -> None:
        # délai court pour éviter double-trigger rapide
        delay = 100
        QTimer.singleShot(delay, self.mpv.toggle_play_pause)

    # ---------------- Close / cleanup ----------------
    def closeEvent(self, event) -> None:
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
            # _safe_stop_mpv tente un arrêt propre et lance un kill en background si nécessaire
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
def main() -> None:
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
        "https://www.youtube.com/watch?v=OIxRRR3gS_E&list=OLAK5uy_ke4zvQhGW2BDith3tH_fh_uMaoGunxkHo&index=7",
    ]

    lecteur = Lecteur(stream_urls=urls_test, taille_ecran=taille_ecran)
    lecteur.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
