# ---------- FILE: lecteur.py ----------
# Version modifiée : récupération asynchrone de duration + chapters via yt_dlp
import os
import sys
import time
from pathlib import Path
import threading

from PyQt6.QtCore import QTimer, QSize
from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QFrame,
    QSizePolicy, QApplication
)

from Pages.Lecteur.Bar_Sec.bar_sec_lect import BarSecLect
from Pages.Lecteur.mpv_controller import MPVController
from Widgets.bar_fenetre import BarFenetre

# Constantes
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MPV_DIR = PROJECT_ROOT / "Ressource" / "mpv"
MPV_EXE = MPV_DIR / "mpv.exe"

os.environ["PATH"] = f"{MPV_DIR}{os.pathsep}{os.environ.get('PATH', '')}"


class Lecteur(QMainWindow):
    def __init__(self, stream_urls: list[str], taille_ecran: QSize | None = None):
        super().__init__()

        self.stream_urls = stream_urls.copy()
        self.current_index = 0
        # self.youtube_chapters contiendra désormais la liste normalisée (dicts avec start/end/duration/title)
        self.youtube_chapters = []
        # drapeau pour indiquer si yt_dlp a déjà appliqué duration/chapters à l'UI
        self._youtube_info_applied = False

        self.resize(taille_ecran if taille_ecran else QSize(800, 600))

        self._setup_ui()

        # Controller mpv
        self.mpv = MPVController()

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

        self.bottom_bar = BarSecLect(parent=self)
        self.bottom_bar.setVisible(False)
        self.bottom_bar.setGeometry(0, self.height() - self.bottom_bar.height(), self.width(), self.bottom_bar.height())
        self.bottom_bar.raise_()

        self.hide_bar_timer = QTimer(self)
        self.hide_bar_timer.setInterval(1500)
        self.hide_bar_timer.timeout.connect(self.cacher_barre)

        # connect signals
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

        self.position_timer = QTimer(self)
        self.position_timer.setInterval(500)
        self.position_timer.timeout.connect(self._update_position)

        self.setMouseTracking(True)
        self.centralWidget().setMouseTracking(True)
        self.video_frame.setMouseTracking(True)
        self.top_bar.setMouseTracking(True)
        self.bottom_bar.setMouseTracking(True)
        self.showFullScreen()

    # ------------- position / durée --------------
    def _update_position(self):
        try:
            proc = getattr(self.mpv, "process", None)
            if proc is None:
                if getattr(self, "position_timer", None):
                    self.position_timer.stop()
                return
            if proc.poll() is not None:
                print(f"MPV process terminé avec code {proc.returncode}. Arrêt du timer.")
                try:
                    log_path = Path.cwd() / "mpv_debug.log"
                    if log_path.exists():
                        print("==== mpv_debug.log (début) ====")
                        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                            data = f.read()
                            print(data[-4000:])
                        print("==== mpv_debug.log (fin) ====")
                except Exception as e:
                    print(f"Impossible de lire mpv_debug.log: {e}")
                try:
                    self.position_timer.stop()
                except Exception:
                    pass
                return
        except Exception:
            try:
                if getattr(self, "position_timer", None):
                    self.position_timer.stop()
            except Exception:
                pass
            return

        # récupérer duration / pos de façon tolérante
        dur = None
        pos = None
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

        # update duration
        try:
            if dur is not None:
                try:
                    dur_int = int(float(dur))
                except Exception:
                    dur_int = None
            else:
                dur_int = None

            if dur_int is not None and dur_int > 0:
                if self._last_duration != dur_int:
                    try:
                        self.bottom_bar.set_duration(dur_int)
                    except Exception:
                        pass
                    self._last_duration = dur_int
        except Exception as e:
            print(e)
            pass

        # update position (update only if change >=1s)
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
                do_update = False
                if self._last_position is None:
                    do_update = True
                else:
                    if abs(self._last_position - pos_int) >= 1:
                        do_update = True
                    self._last_position = pos_int
        except Exception as e:
            print(e)
            pass

    # ---------- slider / chapters ----------
    def _on_slider_moved(self, pos: int):
        pass

    def _on_slider_released(self, pos: int):
        try:
            self.mpv.seek_to(pos)
        except Exception as e:
            print(f"Erreur seek (released): {e}")

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
        self.top_bar.setGeometry(0, 0, self.width(), 30)
        self.bottom_bar.setGeometry(0, self.height() - self.bottom_bar.height(), self.width(), self.bottom_bar.height())

    # helper pour trouver index chapitre YouTube à partir du temps courant
    def _youtube_current_chapter_index(self, pos_seconds: float):
        """Retourne l'index du chapitre YouTube contenant pos_seconds, ou None."""
        if not self.youtube_chapters:
            return None
        # youtube_chapters peut être list de dicts normalisés ou de seconds
        chap_secs = []
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

    def _normalize_chapters(self, chapters, total_duration=None):
        """
        Normalise une liste de chapitres (list[dict] ou list[starts]) en
        list[{"start" : float, "end" : float|None, "duration" : float|None, "title" : str|None}].
        Total_duration (float) sert à fermer le dernier chapitre si nécessaire.
        """
        parsed = []
        for ch in chapters or []:
            title = None
            start = None
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
            except Exception:
                start_f = None
            try:
                end_f = float(end) if end is not None else None
            except Exception:
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

    def _format_time(self, seconds):
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
        except Exception:
            return "—"

    def chapter_precedent(self):
        try:
            if self.youtube_chapters:
                pos = self.mpv.get_time_pos() or 0
                chap_secs = []
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
                        pass
                chap_secs = sorted(list(dict.fromkeys(chap_secs)))
                if not chap_secs:
                    print("Aucun chapitre YouTube valide")
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
                    st = None
                    if isinstance(ch, dict):
                        st = ch.get("start_time") or ch.get("start") or ch.get("time")
                    else:
                        st = ch
                    try:
                        if st is not None:
                            chap_secs.append(float(st))
                    except Exception:
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
                    st = None
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
            except Exception:
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
            except Exception:
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

                    # envoyer la liste normalisée (dicts avec start/end/duration/title) au bottom_bar/slider
                    QTimer.singleShot(0, lambda norm=norm: self.bottom_bar.set_chapters(norm))

                    # si bottom_bar supporte des infos plus riches, on les transmet aussi
                    if hasattr(self.bottom_bar, "set_chapter_infos"):
                        QTimer.singleShot(0, lambda infos=norm: self.bottom_bar.set_chapter_infos(infos))
                    elif hasattr(self.bottom_bar, "set_chapter_durations"):
                        durations = [None if c["duration"] is None else float(c["duration"]) for c in norm]
                        QTimer.singleShot(0, lambda durs=durations: self.bottom_bar.set_chapter_durations(durs))

                    print(f"Duration (yt_dlp) récupérée et appliquée : {int(float(duration)) if duration else 'None'}s")
                    print(f"Chapitres (yt_dlp) appliqués ({len(norm)})")

                    # marquer que l'info yt_dlp a été appliquée (faire le set depuis le thread UI pour être Qt-safe)
                    QTimer.singleShot(0, lambda: setattr(self, "_youtube_info_applied", True))
                else:
                    # même si pas de chapitres, on peut appliquer duration seule
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
                                except Exception:
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
                    # si yt_dlp a déjà appliqué infos, NE PAS réappliquer la branche "sans durée connue".
                    if getattr(self, "_youtube_info_applied", False):
                        print("Chapitres YouTube déjà appliqués via yt_dlp; pas de réapplication.")
                    else:
                        if self.youtube_chapters:
                            chap_secs = []
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
                                    pass
                            chap_secs = sorted(list(dict.fromkeys(chap_secs)))
                            try:
                                self.bottom_bar.set_chapters(chap_secs)
                                # Forcer la mise à jour
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

    def toggle_play_pause(self, is_playing=None):
        delay = 100
        QTimer.singleShot(delay, self.mpv.toggle_play_pause)

    def cacher_barre(self):
        if not self.top_bar.underMouse() and not self.bottom_bar.underMouse():
            self.top_bar.setVisible(False)
            self.bottom_bar.setVisible(False)
            self.hide_bar_timer.stop()

    def closeEvent(self, event):
        try:
            if hasattr(self, "position_timer") and self.position_timer is not None:
                self.position_timer.stop()
        except Exception:
            pass

        try:
            self.mpv.stop()
        except Exception as e:
            print(f"Erreur fermeture mpv: {e}")
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