# ---------- FILE: lecteur.py ----------
import os
import sys
import threading
import time
from pathlib import Path

from PyQt6.QtCore import QTimer, QSize, Qt
from PyQt6.QtWidgets import (
    QFrame,
    QSizePolicy, QApplication
)

from Pages.Lecteur.Bar_Sec.bar_sec_lect import BarSecLect
from Pages.Lecteur.mpv_controller import MPVController
from Widgets.bar_fenetre import BarFenetre
from Widgets.base_fenetre import BaseFenetre

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MPV_DIR = PROJECT_ROOT / "Ressource" / "mpv"
MPV_EXE = MPV_DIR / "mpv.exe"

MAX_VOLUME = 200

os.environ["PATH"] = f"{MPV_DIR}{os.pathsep}{os.environ.get('PATH', '')}"


class Lecteur(BaseFenetre):
    def __init__(self, stream_urls: list[str], taille_ecran: QSize | None = None):
        super().__init__(bar=False)

        self.position_timer = None
        self.stream_urls = stream_urls.copy()
        self.current_index = 0
        self.youtube_chapters = []
        self._youtube_info_applied = False

        self._last_volume = None
        self._previous_volume = 50
        self._muted = False

        self.resize(taille_ecran if taille_ecran else QSize(800, 600))

        self._setup_ui()

        self.mpv = MPVController()

        self._volume_timer = QTimer(self)
        self._volume_timer.setInterval(1000)
        self._volume_timer.timeout.connect(self._poll_volume)

        QTimer.singleShot(200, self.lancer_video)

    def _setup_ui(self):
        self.central_layout.setContentsMargins(0, 0, 0, 0)
        self.central_layout.setSpacing(0)

        self.video_frame = QFrame()
        self.video_frame.setStyleSheet("background-color: transparent")
        self.video_frame.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.central_layout.addWidget(self.video_frame, 1)

        self.top_bar = BarFenetre(parent=None, main_window=self)
        self.top_bar.setWindowFlags(self.top_bar.windowFlags() |
                                    Qt.WindowType.Tool |
                                    Qt.WindowType.FramelessWindowHint |
                                    Qt.WindowType.WindowStaysOnTopHint)
        self.top_bar.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.top_bar.setAttribute(Qt.WidgetAttribute.WA_NoSystemBackground, True)
        self.top_bar.setAutoFillBackground(False)
        self.top_bar.setVisible(False)
        self.top_bar.show()
        self.top_bar.raise_()

        self.bottom_bar = BarSecLect(parent=None)
        self.bottom_bar.setWindowFlags(self.bottom_bar.windowFlags() |
                                       Qt.WindowType.Tool |
                                       Qt.WindowType.FramelessWindowHint |
                                       Qt.WindowType.WindowStaysOnTopHint)
        self.bottom_bar.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.bottom_bar.setAttribute(Qt.WidgetAttribute.WA_NoSystemBackground, True)
        self.bottom_bar.setAutoFillBackground(False)
        self.bottom_bar.setVisible(False)
        self.bottom_bar.show()
        self.bottom_bar.raise_()
        self.hide_bar_timer = QTimer(self)
        self.hide_bar_timer.setInterval(1500)
        self.hide_bar_timer.timeout.connect(self.cacher_barre)
        self.bottom_bar.play_pause_clicked.connect(self.toggle_play_pause)
        self.bottom_bar.prev_clicked.connect(self.video_precedente)
        self.bottom_bar.next_clicked.connect(self.video_suivante)
        self.bottom_bar.chapter_prev_clicked.connect(self.chapter_precedent)
        self.bottom_bar.chapter_next_clicked.connect(self.chapter_suivant)
        self.bottom_bar.moins_10_clicked.connect(self.seek_backward)
        self.bottom_bar.plus_10_clicked.connect(self.seek_forward)
        self.bottom_bar.position_changed.connect(self._on_slider_moved)
        self.bottom_bar.slider.position_released.connect(self._on_slider_released)
        self.bottom_bar.chapter_selected.connect(self._on_chapter_selected)


        try:
            if hasattr(self.bottom_bar, "volume_changed") and hasattr(self.bottom_bar, "mute_toggled"):
                self.bottom_bar.volume_changed.connect(self._on_volume_changed)
                self.bottom_bar.mute_toggled.connect(self._on_mute_toggled)
            elif hasattr(self.bottom_bar, "volume_control"):
                vc = getattr(self.bottom_bar, "volume_control")
                if hasattr(vc, "volume_changed"):
                    vc.volume_changed.connect(self._on_volume_changed)
                if hasattr(vc, "mute_toggled"):
                    vc.mute_toggled.connect(self._on_mute_toggled)
        except Exception as e:
            print(f"Erreur connexion volume UI: {e}")

        self.position_timer = QTimer(self)
        self.position_timer.setInterval(500)
        self.position_timer.timeout.connect(self._update_position)

        self.setMouseTracking(True)
        self.video_frame.setMouseTracking(True)
        self.showFullScreen()

        QTimer.singleShot(0, self._update_bars_geometry)

    def _update_bars_geometry(self):
        try:
            geo = self.geometry()
            # top bar : en haut
            if getattr(self, "top_bar", None):
                self.top_bar.setGeometry(geo.x(), geo.y(), geo.width(), 30)
            # bottom bar : en bas
            if getattr(self, "bottom_bar", None):
                self.bottom_bar.setGeometry(
                    geo.x(),
                    geo.y() + geo.height() - self.bottom_bar.height(),
                    geo.width(),
                    self.bottom_bar.height()
                )
        except Exception as e:
            print(e)
            pass

    # ------------- position / durée --------------
    def _update_position(self):
        try:
            proc = getattr(self.mpv, "process", None)
            if proc is None:
                if getattr(self, "position_timer", None):
                    self.position_timer.stop()
                return
            if proc.poll() is not None:
                try:
                    if getattr(self, "position_timer", None):
                        self.position_timer.stop()
                except Exception as e:
                    print(e)
                    pass
                return
        except Exception as e:
            print(e)
            try:
                if getattr(self, "position_timer", None):
                    self.position_timer.stop()
            except Exception as e:
                print(e)
                pass
            return

        try:
            dur = self.mpv.get_duration()
        except Exception as e:
            print(f"(update_position) erreur get_duration: {e}")
            dur = None

        try:
            pos = self.mpv.get_time_pos()
        except Exception as e:
            print(f"(update_position) erreur get_time_pos: {e}")
            pos = None

        if not hasattr(self, "_last_duration"):
            self._last_duration = None
        if not hasattr(self, "_last_position"):
            self._last_position = None

        # --- update duration ---
        try:
            if dur is not None:
                try:
                    dur_int = int(float(dur))
                except Exception as e:
                    print(e)
                    dur_int = None
            else:
                dur_int = None

            if dur_int is not None and dur_int > 0:
                if self._last_duration != dur_int:
                    try:
                        self.bottom_bar.set_duration(dur_int)
                    except Exception as e:
                        print(e)
                        pass
                    self._last_duration = dur_int
        except Exception as e:
            print(e)
            pass

        # --- update position (mise à jour effective du slider/UI) ---
        try:
            if pos is not None:
                try:
                    pos_int = int(float(pos))
                except Exception as e:
                    print(e)
                    pos_int = None
            else:
                pos_int = None

            if pos_int is not None:
                # mettre à jour si première fois ou changement >= 1s
                if self._last_position is None or abs(self._last_position - pos_int) >= 1:
                    try:
                        # update UI directement sur le slider tout en bloquant les signaux
                        slider = getattr(self.bottom_bar, "slider", None)
                        if slider is not None:
                            slider.blockSignals(True)
                            slider.setValue(pos_int)
                            slider.update()
                            slider.blockSignals(False)
                        else:
                            # fallback : tenter la méthode set_position si un jour ajoutée
                            if hasattr(self.bottom_bar, "set_position"):
                                try:
                                    self.bottom_bar.set_position(pos_int)
                                except Exception as e:
                                    print(f"Erreur bottom_bar.set_position fallback: {e}")

                        # --- NOUVEAU : mettre à jour le label temps courant si disponible ---
                        try:
                            if hasattr(self, "bottom_bar") and hasattr(self.bottom_bar, "set_current_time"):
                                # mettre à jour immédiatement le label de temps courant (gauche)
                                self.bottom_bar.set_current_time(pos_int)
                        except Exception as e:
                            # ne pas interrompre l'affichage si erreur
                            print(f"Erreur mise à jour label temps courant: {e}")

                    except Exception as e:
                        print(f"Erreur lors mise à jour UI position: {e}")

                    # mettre à jour la dernier position connu
                    self._last_position = pos_int
        except Exception as e:
            print(e)
            pass

    # ---------- volume management ----------
    def _on_volume_changed(self, value: int):
        """
        Reçoit la valeur depuis l'UI (0-150) et l'applique à mpv.
        Empêche les boucles de feedback en mettant à jour self._last_volume.
        """
        try:
            # clamp
            try:
                vol_int = int(max(0, min(MAX_VOLUME, int(value))))
            except Exception as e:
                print(e)
                vol_int = 0

            # store previous (for unmute restore)
            if vol_int > 0:
                self._previous_volume = vol_int
            self._last_volume = vol_int
            self._muted = (vol_int == 0)

            # apply to mpv using best available API
            self._set_mpv_volume(vol_int)
        except Exception as e:
            print(f"_on_volume_changed erreur: {e}")

    def _on_mute_toggled(self, muted: bool):
        """
        Reçoit l'action mute depuis l'UI. Essaie d'utiliser la propriété 'mute' si dispo,
        sinon simule via volume = 0 / restore previous.
        """
        try:
            self._muted = bool(muted)
            if self._muted:
                # store previous if not already zero
                if self._last_volume and self._last_volume > 0:
                    self._previous_volume = self._last_volume
                # try to set mpv mute property
                if not self._set_mpv_mute(True):
                    # fallback: force volume 0
                    self._set_mpv_volume(0)
                self._last_volume = 0
            else:
                # unmute: try to clear mute property or restore previous volume
                if not self._set_mpv_mute(False):
                    self._set_mpv_volume(self._previous_volume or 50)
                self._last_volume = self._previous_volume or 50
        except Exception as e:
            print(f"_on_mute_toggled erreur: {e}")

    def _set_mpv_volume(self, value: int) -> bool:
        """
        Tente plusieurs méthodes pour définir le volume sur self.mpv.
        Retourne True si une méthode a été utilisée sans exception.
        """
        success = False
        try:
            v = int(max(0, min(MAX_VOLUME, int(value))))
        except Exception as e:
            print(e)
            v = 0
        try:
            # prefer dedicated helper
            if hasattr(self.mpv, "set_volume"):
                try:
                    self.mpv.set_volume(v)
                    success = True
                except Exception as e:
                    print(e)
                    success = False
            # try generic set_property
            if not success and hasattr(self.mpv, "set_property"):
                try:
                    # mpv volume usually expects a number 0-100 (but we allow 0-150)
                    self.mpv.set_property("volume", float(v))
                    success = True
                except Exception as e:
                    print(e)
                    success = False
            # try to call via 'command' if implemented
            if not success and hasattr(self.mpv, "command"):
                try:
                    self.mpv.command("set_property", "volume", float(v))
                    success = True
                except Exception as e:
                    print(e)
                    success = False
        except Exception as e:
            print(f"_set_mpv_volume erreur: {e}")
            success = False

        return success

    def _set_mpv_mute(self, muted: bool) -> bool:
        """
        Tente de définir la propriété 'mute' si disponible.
        Retourne True si une méthode a été utilisée sans exception.
        """
        success = False
        try:
            if hasattr(self.mpv, "set_property"):
                try:
                    # mpv accepts 1/0 or true/false depending on wrapper; use int
                    self.mpv.set_property("mute", int(bool(muted)))
                    success = True
                except Exception as e:
                    print(e)
                    success = False
            if not success and hasattr(self.mpv, "command"):
                try:
                    self.mpv.command("set_property", "mute", int(bool(muted)))
                    success = True
                except Exception as e:
                    print(e)
                    success = False
        except Exception as e:
            print(f"_set_mpv_mute erreur: {e}")
            success = False
        return success

    def _poll_volume(self):
        """
        Poll mpv for current volume/mute and update UI if changed.
        S'exécute régulièrement par _volume_timer.
        """
        try:
            proc = getattr(self.mpv, "process", None)
            if proc is None:
                if getattr(self, "_volume_timer", None):
                    self._volume_timer.stop()
                return
            if proc.poll() is not None:
                # mpv stopped
                if getattr(self, "_volume_timer", None):
                    self._volume_timer.stop()
                return
        except Exception as e:
            print(e)
            return

        vol = None
        muted = None

        # try to get 'mute' property
        try:
            if hasattr(self.mpv, "get_property"):
                try:
                    m = self.mpv.get_property("mute")
                    if m is not None:
                        # convert to boolean if possible
                        try:
                            muted = bool(int(m))
                        except Exception as e:
                            print(e)
                            try:
                                muted = bool(m)
                            except Exception as e:
                                print(e)
                                muted = None
                except Exception as e:
                    print(e)
                    pass
        except Exception as e:
            print(e)
            pass

        # try to get 'volume' property / helper
        try:
            if hasattr(self.mpv, "get_property"):
                try:
                    v = self.mpv.get_property("volume")
                    if v is not None:
                        vol = float(v)
                except Exception as e:
                    print(e)
                    pass
        except Exception as e:
            print(e)
            pass

        # fallback to dedicated get_volume()
        if vol is None:
            try:
                if hasattr(self.mpv, "get_volume"):
                    try:
                        v2 = self.mpv.get_volume()
                        if v2 is not None:
                            vol = float(v2)
                    except Exception as e:
                        print(e)
                        pass
            except Exception as e:
                print(e)
                pass

        # normalize and clamp
        if vol is not None:
            try:
                vol_int = int(round(float(vol)))
            except Exception as e:
                print(e)
                vol_int = int(float(vol)) if isinstance(vol, (int, float)) else 0
            vol_int = max(0, min(MAX_VOLUME, vol_int))
        else:
            vol_int = None


        # if mute unknown but vol == 0, we consider muted
        if muted is None and vol_int is not None:
            muted = (vol_int == 0)

        # update UI if there's any change
        try:
            changed = False
            if vol_int is not None and vol_int != self._last_volume:
                self._last_volume = vol_int
                changed = True
            if muted is not None and muted != self._muted:
                self._muted = muted
                changed = True

            if changed:
                # update bottom_bar UI safely (block signals to avoid feedback)
                try:
                    # preferred: bottom_bar exposes set_volume / set_mute methods
                    if hasattr(self.bottom_bar, "set_volume"):
                        try:
                            self.bottom_bar.set_volume(int(self._last_volume or 0))
                        except Exception as e:
                            print(e)
                            pass
                    if hasattr(self.bottom_bar, "set_mute"):
                        try:
                            self.bottom_bar.set_mute(bool(self._muted))
                        except Exception as e:
                            print(e)
                            pass

                    # fallback: bottom_bar has a nested volume_control widget
                    elif hasattr(self.bottom_bar, "volume_control"):
                        vc = getattr(self.bottom_bar, "volume_control")
                        try:
                            vc.slider.blockSignals(True)
                            vc.slider.setValue(int(self._last_volume or 0))
                            vc.icon.set_state(not bool(self._muted))
                            vc._update_icon()
                            vc.slider.blockSignals(False)
                        except Exception as e:
                            print(e)
                            pass
                    else:
                        # last resort: try to find a slider attribute
                        for name in ("volume_slider", "volume", "slider_volume", "slider"):
                            if hasattr(self.bottom_bar, name):
                                s = getattr(self.bottom_bar, name)
                                try:
                                    s.blockSignals(True)
                                    s.setValue(int(self._last_volume or 0))
                                    s.blockSignals(False)
                                except Exception as e:
                                    print(e)
                                    pass
                except Exception as e:
                    print(f"_poll_volume mise a jour UI erreur: {e}")
        except Exception as e:
            print(f"_poll_volume erreur globale: {e}")

    # ---------- slider / chapters ----------
    def _on_slider_moved(self, pos: int):
        pass

    def _on_slider_released(self, pos: int):
        """
        L'utilisateur a lâché le slider : mise à jour immédiate de l'UI puis seek mpv.
        """
        try:
            # Mise à jour immédiate de l'UI (block signals pour éviter position_changed -> feed)
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
            except Exception as e:
                print(f"Erreur mise à jour UI (released): {e}")

            # Demander à mpv de se positionner
            try:
                self.mpv.seek_to(pos)
            except Exception as e:
                print(f"Erreur seek (released): {e}")

            # mettre à jour la variable interne pour éviter des retours immédiats
            try:
                self._last_position = int(pos)
            except Exception as e:
                print(e)
                pass

        except Exception as e:
            print(f"_on_slider_released erreur globale: {e}")

    def _on_chapter_selected(self, seconds: int):
        try:
            self.mpv.seek_to(seconds)
        except Exception as e:
            print(f"Erreur seek chapitre: {e}")

    def seek_forward(self):
        self.mpv.seek_forward(10)

    def seek_backward(self):
        self.mpv.seek_backward(10)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        # repositionner barres top-level
        self._update_bars_geometry()

    def moveEvent(self, event):
        super().moveEvent(event)
        # repositionner barres top-level quand la fenêtre bouge
        self._update_bars_geometry()

    # helper pour trouver index chapitre YouTube à partir du temps courant
    def _youtube_current_chapter_index(self, pos_seconds: float):
        """Retourne l'index du chapitre YouTube contenant pos_seconds, ou None."""
        if not self.youtube_chapters:
            return None
        # youtube_chapters peut être list de dicts normalisés ou de seconds
        chap_secs = []
        for ch in self.youtube_chapters:
            if isinstance(ch, dict):
                st = ch.get("start_time") or ch.get("start") or ch.get("time")
            else:
                st = ch
            try:
                if st is not None:
                    chap_secs.append(float(st))
            except Exception as e:
                print(e)
                pass
        chap_secs = sorted(list(dict.fromkeys(chap_secs)))
        if not chap_secs:
            return None
        idx = None
        for i, t in enumerate(chap_secs):
            # si on est dans la dernière section
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
    def _normalize_chapters(chapters, total_duration=None):
        """
        Normalise une liste de chapitres (list[dict] ou list[starts]) en
        list[{"start" : float, "end" : float|None, "duration" : float|None, "title" : str|None}].
        Total_duration (float) sert à fermer le dernier chapitre si nécessaire.
        """
        parsed = []
        for ch in chapters or []:
            title = None
            end = None
            if isinstance(ch, dict):
                start = ch.get("start_time") or ch.get("start") or ch.get("time")
                end = ch.get("end_time") or ch.get("end")
                title = ch.get("title") or ch.get("name") or ch.get("label") or None
            else:
                # simple liste de secondes
                start = ch

            try:
                start_f = float(start) if start is not None else None
            except Exception as e:
                print(e)
                start_f = None
            try:
                end_f = float(end) if end is not None else None
            except Exception as e:
                print(e)
                end_f = None

            if start_f is not None:
                parsed.append({"start": start_f, "end": end_f, "title": title})

        # trier et déduire les end si manquants
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

            # calculer duration si possible (garantir >=0)
            if parsed[i]["end"] is not None:
                dur = float(parsed[i]["end"]) - float(parsed[i]["start"])
                parsed[i]["duration"] = dur if dur >= 0 else None
            else:
                parsed[i]["duration"] = None

        return parsed

    @staticmethod
    def _format_time(seconds):
        """Retourne HH:MM:SS depuis des secondes (float|int|None)."""
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
        except Exception as e:
            print(e)
            return "—"

    def chapter_precedent(self):
        try:
            if self.youtube_chapters:
                pos = self.mpv.get_time_pos() or 0
                chap_secs = []
                for ch in self.youtube_chapters:
                    if isinstance(ch, dict):
                        st = ch.get("start_time") or ch.get("start") or ch.get("time")
                    else:
                        st = ch
                    try:
                        if st is not None:
                            chap_secs.append(float(st))
                    except Exception as e:
                        print(e)
                        pass
                chap_secs = sorted(list(dict.fromkeys(chap_secs)))
                if not chap_secs:
                    print("Aucun chapitre YouTube valable")
                    return
                cur_idx = self._youtube_current_chapter_index(pos) or 0
                prev_idx = (cur_idx - 1) % len(chap_secs)
                target = chap_secs[prev_idx]
                self.mpv.seek_to(target)
                print(f"Passé au chapitre YouTube index {prev_idx} -> {target}s")
                return
        except Exception as e:
            print(f"Erreur navigation chapitre précédent (YouTube): {e}")

        try:
            current_chapter = self.mpv.get_property("chapter")
            if current_chapter is None:
                print("Impossible de récupérer le chapitre actuel (mpv)")
                return
            prev_chapter = int(current_chapter) - 1
            chapters = self.mpv.get_chapter_list() or []
            if prev_chapter < 0:
                prev_chapter = max(0, len(chapters) - 1)
            self.mpv.set_property("chapter", prev_chapter)
            print(f"Passé au chapitre mpv index {prev_chapter}")
        except Exception as e:
            print(f"Erreur chapter_precedent mpv: {e}")

    def chapter_suivant(self):
        try:
            if self.youtube_chapters:
                pos = self.mpv.get_time_pos() or 0
                chap_secs = []
                for ch in self.youtube_chapters:
                    if isinstance(ch, dict):
                        st = ch.get("start_time") or ch.get("start") or ch.get("time")
                    else:
                        st = ch
                    try:
                        if st is not None:
                            chap_secs.append(float(st))
                    except Exception as e:
                        print(e)
                        pass
                chap_secs = sorted(list(dict.fromkeys(chap_secs)))
                if not chap_secs:
                    print("Aucun chapitre YouTube valide")
                    return
                cur_idx = self._youtube_current_chapter_index(pos) or 0
                next_idx = (cur_idx + 1) % len(chap_secs)
                target = chap_secs[next_idx]
                self.mpv.seek_to(target)
                print(f"Passé au chapitre YouTube index {next_idx} -> {target}s")
                return
        except Exception as e:
            print(f"Erreur navigation chapitre suivant (YouTube): {e}")

        try:
            current_chapter = self.mpv.get_property("chapter")
            if current_chapter is None:
                print("Impossible de récupérer le chapitre actuel (mpv)")
                return
            next_chapter = int(current_chapter) + 1
            chapters = self.mpv.get_chapter_list() or []
            if next_chapter >= len(chapters):
                next_chapter = 0
            self.mpv.set_property("chapter", next_chapter)
            print(f"Passé au chapitre mpv index {next_chapter}")
        except Exception as e:
            print(f"Erreur chapter_suivant mpv: {e}")

    def get_chapter_list(self):
        try:
            dur_val = self.mpv.get_duration()
            if dur_val and dur_val > 0:
                self.bottom_bar.set_duration(int(float(dur_val)))
        except Exception as e:
            print(f"(get_chapter_list) impossible de récupérer duration: {e}")

        try:
            if hasattr(self, "youtube_chapters") and self.youtube_chapters:
                # youtube_chapters peut être normalisée (dicts) ; extraire start
                chap_secs = []
                for ch in self.youtube_chapters:
                    if isinstance(ch, dict):
                        st = ch.get("start_time") or ch.get("start") or ch.get("time")
                    else:
                        st = ch
                    try:
                        if st is not None:
                            chap_secs.append(float(st))
                    except Exception as e:
                        print(e)
                        pass
                self.bottom_bar.set_chapters(self.youtube_chapters)
                print(f"Chapitres YouTube appliqués ({len(self.youtube_chapters)})")
                return
        except Exception as e:
            print(f"(get_chapter_list) erreur traitement youtube_chapters: {e}")

        try:
            chapters = self.mpv.get_chapter_list()
        except Exception as e:
            print(f"(get_chapter_list) erreur get_chapter_list mpv: {e}")
            chapters = None

        if not chapters:
            print("Pas de chapitres MPV.")
            try:
                self.bottom_bar.set_chapters([])
            except Exception as e:
                print(e)
                pass
            return

        chap_secs = []
        for ch in chapters:
            try:
                if isinstance(ch, dict):
                    t = ch.get("time") or ch.get("start_time") or ch.get("start") or None
                else:
                    t = ch
                if t is not None:
                    chap_secs.append(int(float(t)))
            except Exception as e:
                print(e)
                pass

        chap_secs = sorted(list(dict.fromkeys(chap_secs)))
        try:
            self.bottom_bar.set_chapters(chap_secs)
            # Forcer la mise à jour du slider
            self.bottom_bar.slider.update()
            print(f"Liste des chapitres MPV ({len(chap_secs)}) appliquée et mise à jour")
        except Exception as e:
            print(f"(get_chapter_list) erreur set_chapters bottom_bar: {e}")

    # ---------- navigation vidéo ----------
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
        try:
            self.mpv.stop()
        except Exception as e:
            print(e)
            pass
        self.lancer_video()

    @staticmethod
    def get_youtube_chapters(url):
        return MPVController.get_youtube_chapters(url)

    # ---------- lancement vidéo (modifié) ----------
    def lancer_video(self):
        if not self.stream_urls:
            print("Aucune URL fournie")
            return

        url = self.stream_urls[self.current_index]
        window_id = str(int(self.video_frame.winId()))

        self.youtube_chapters = []
        self._youtube_info_applied = False


        def _fetch_yt_info_and_apply():
            try:
                chapters, duration = MPVController.get_youtube_info(url)
                norm = self._normalize_chapters(chapters, total_duration=duration)
                if norm:
                    self.youtube_chapters = norm

                    print(f"Chapitres normalisés ({len(norm)}):")
                    for i, ch in enumerate(norm):
                        st = ch.get("start")
                        end = ch.get("end")
                        dur = ch.get("duration")
                        title = ch.get("title") or ""
                        st_h = self._format_time(st)
                        end_h = self._format_time(end) if end is not None else "—"
                        dur_h = self._format_time(dur) if dur is not None else "—"
                        print(
                            f"  [{i:02d}] {title!s} — start: {st} ({st_h}), end: {end if end is not None else 'None'} ({end_h}), duration: {dur if dur is not None else 'None'} ({dur_h})")

                    QTimer.singleShot(0, lambda norm=norm: self.bottom_bar.set_chapters(norm))

                    if hasattr(self.bottom_bar, "set_chapter_infos"):
                        QTimer.singleShot(0, lambda infos=norm: self.bottom_bar.set_chapter_infos(infos))
                    elif hasattr(self.bottom_bar, "set_chapter_durations"):
                        durations = [None if c["duration"] is None else float(c["duration"]) for c in norm]
                        QTimer.singleShot(0, lambda durs=durations: self.bottom_bar.set_chapter_durations(durs))

                    print(f"Duration (yt_dlp) récupérée et appliquée : {int(float(duration)) if duration else 'None'}s")
                    print(f"Chapitres (yt_dlp) appliqués ({len(norm)})")

                    QTimer.singleShot(0, lambda: setattr(self, "_youtube_info_applied", True))
                else:
                    if duration and duration > 0:
                        QTimer.singleShot(0, lambda d=int(float(duration)): self.bottom_bar.set_duration(d))
                        QTimer.singleShot(0, lambda: setattr(self, "_youtube_info_applied", True))
            except Exception as e:
                print(f"Erreur fetch_yt_info thread: {e}")

        threading.Thread(target=_fetch_yt_info_and_apply, daemon=True).start()

        try:
            launched = self.mpv.launch(url, window_id)
        except Exception as e:
            print(f"Exception lors du lancement mpv: {e}")
            launched = False

        if not launched:
            print("Échec du lancement mpv")
            return

        try:
            time.sleep(0.4)
        except Exception as e:
            print(e)
            pass

        if not hasattr(self, "position_timer") or self.position_timer is None:
            self.position_timer = QTimer(self)
            self.position_timer.setInterval(500)
            self.position_timer.timeout.connect(self._update_position)
        self.position_timer.start()


        try:

            if getattr(self, "_volume_timer", None):
                QTimer.singleShot(300, lambda: self._volume_timer.start())
                QTimer.singleShot(500, self._poll_volume)
        except Exception as e:
            print(f"Erreur démarrage _volume_timer: {e}")

        QTimer.singleShot(2000, self.get_chapter_list)

        def _poll_duration(attempts_left=20):
            try:
                dur = self.mpv.get_duration()
            except Exception as e:
                print(f"Erreur lecture duration (non bloquant): {e}")
                dur = None

            if dur and dur > 0:
                d = int(float(dur))
                try:
                    self.bottom_bar.set_duration(d)
                    print(f"Duration récupérée : {d}s")
                except Exception as e:
                    print(f"Erreur set_duration bottom_bar (non bloquant): {e}")

                # si on a déjà youtube_chapters (thread yt_dlp) on les applique
                if self.youtube_chapters:
                    # si youtube_chapters est normalisé (dicts), transmettez-le directement
                    if isinstance(self.youtube_chapters[0], dict):
                        try:
                            self.bottom_bar.set_chapters(self.youtube_chapters)
                            # Forcer la mise à jour
                            self.bottom_bar.slider.update()
                            print(f"{len(self.youtube_chapters)} chapitres YouTube appliqués au slider (structurée)")
                        except Exception as e:
                            print(f"Erreur set_chapters bottom_bar (non bloquant): {e}")
                    else:
                        # ancienne logique : list de floats
                        chap_secs = sorted(list(dict.fromkeys([float(ch) for ch in self.youtube_chapters])))
                        try:
                            self.bottom_bar.set_chapters(chap_secs)
                            # Forcer la mise à jour
                            self.bottom_bar.slider.update()
                            print(f"{len(chap_secs)} chapitres YouTube appliqués au slider")
                        except Exception as e:
                            print(f"Erreur set_chapters bottom_bar (non bloquant): {e}")
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
                                except Exception as e:
                                    print(e)
                                    pass
                            chap_secs = sorted(list(dict.fromkeys(chap_secs)))
                            try:
                                self.bottom_bar.set_chapters(chap_secs)
                                # Forcer la mise à jour
                                self.bottom_bar.slider.update()
                                print(f"Liste des chapitres MPV ({len(chap_secs)}) appliquée")
                            except Exception as e:
                                print(f"Erreur set_chapters bottom_bar (non bloquant): {e}")
                    except Exception as e:
                        print(f"Erreur get_chapter_list mpv (non bloquant): {e}")
                return
            else:
                if attempts_left > 0:
                    QTimer.singleShot(500, lambda: _poll_duration(attempts_left - 1))
                else:
                    if getattr(self, "_youtube_info_applied", False):
                        print("Chapitres YouTube déjà appliqués via yt_dlp; pas de réapplication.")
                    else:
                        if self.youtube_chapters:
                            chap_secs = []
                            for ch in self.youtube_chapters:
                                if isinstance(ch, dict):
                                    st = ch.get("start_time") or ch.get("start") or ch.get("time")
                                else:
                                    st = ch
                                try:
                                    if st is not None:
                                        chap_secs.append(float(st))
                                except Exception as e:
                                    print(e)
                                    pass
                            chap_secs = sorted(list(dict.fromkeys(chap_secs)))
                            try:
                                self.bottom_bar.set_chapters(chap_secs)
                                self.bottom_bar.slider.update()
                                print(f"Chapitres YouTube appliqués sans durée connue ({len(chap_secs)})")
                            except Exception as e:
                                print(f"Erreur set_chapters bottom_bar (non bloquant): {e}")
                        else:
                            print(
                                "Durée non disponible après plusieurs essais; pas de chapitres appliqués pour l'instant")

        _poll_duration()

    # ---------- UI interactions ----------
    def mouseMoveEvent(self, event):
        try:
            gpos = event.globalPosition().toPoint()
        except Exception as e:
            print(e)
            gpos = None

        main_geo = self.geometry()

        top_over = False
        bottom_over = False
        try:
            if gpos is not None:
                if getattr(self, "top_bar", None):
                    top_over = self.top_bar.geometry().contains(gpos)
                if getattr(self, "bottom_bar", None):
                    bottom_over = self.bottom_bar.geometry().contains(gpos)
        except Exception as e:
            print(e)
            top_over = False
            bottom_over = False

        # si le curseur est tout en haut ou au-dessus de la barre top de la fenêtre principale
        if (gpos is not None and gpos.y() <= main_geo.y() + 30) or top_over:
            if not self.top_bar.isVisible():
                self.top_bar.setVisible(True)
            self.hide_bar_timer.start()
        # si curseur tout en bas de la fenêtre principale ou sur la barre bottom
        elif (gpos is not None and gpos.y() >= main_geo.y() + main_geo.height() - 30) or bottom_over:
            if not self.bottom_bar.isVisible():
                self.bottom_bar.setVisible(True)
            self.hide_bar_timer.start()
        else:
            # vérifier si la souris est sur aucune des deux barres
            if not top_over and not bottom_over:
                if not self.hide_bar_timer.isActive():
                    self.hide_bar_timer.start()
            else:
                self.hide_bar_timer.stop()

        super().mouseMoveEvent(event)

    def toggle_play_pause(self):
        delay = 100
        QTimer.singleShot(delay, self.mpv.toggle_play_pause)

    def cacher_barre(self):
        # si la souris n'est sur aucune des barres -> cacher
        try:
            # on vérifie la position globale du curseur
            from PyQt6.QtGui import QCursor
            g = QCursor.pos()
            on_top = getattr(self, "top_bar", None) and self.top_bar.geometry().contains(g)
            on_bottom = getattr(self, "bottom_bar", None) and self.bottom_bar.geometry().contains(g)
            if not on_top and not on_bottom:
                if getattr(self, "top_bar", None):
                    self.top_bar.setVisible(False)
                if getattr(self, "bottom_bar", None):
                    self.bottom_bar.setVisible(False)
                self.hide_bar_timer.stop()
        except Exception as e:
            print(e)
            try:
                if getattr(self, "top_bar", None):
                    self.top_bar.setVisible(False)
                if getattr(self, "bottom_bar", None):
                    self.bottom_bar.setVisible(False)
                self.hide_bar_timer.stop()
            except Exception as e:
                print(e)
                pass

    def closeEvent(self, event):
        try:
            if hasattr(self, "position_timer") and self.position_timer is not None:
                self.position_timer.stop()
        except Exception as e:
            print(e)
            pass

        try:
            # stop volume polling
            if getattr(self, "_volume_timer", None):
                self._volume_timer.stop()
        except Exception as e:
            print(e)
            pass

        try:
            self.mpv.stop()
        except Exception as e:
            print(f"Erreur fermeture mpv: {e}")

        # fermer explicitement les barres top-level
        try:
            if getattr(self, "top_bar", None):
                self.top_bar.close()
            if getattr(self, "bottom_bar", None):
                self.bottom_bar.close()
        except Exception as e:
            print(e)
            pass

        super().closeEvent(event)


# ---------- main (test) ----------
def main():
    app = QApplication(sys.argv)
    dossier_script = Path(__file__).parent
    dossier_projet = dossier_script.parent.parent

    chemin_style = dossier_projet / "Config" / "style.qss"
    if chemin_style.exists():
        with open(chemin_style, "r", encoding="utf-8") as f:
            app.setStyleSheet(f.read())

    taille_ecran = QSize(1280, 720)
    urls_test = [
        "https://www.youtube.com/watch?v=GoN0-7z6NZk",
        "https://www.youtube.com/watch?v=GCW1cWMlrDA",
    ]

    lecteur = Lecteur(stream_urls=urls_test, taille_ecran=taille_ecran)
    lecteur.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
