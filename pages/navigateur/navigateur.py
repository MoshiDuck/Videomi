
import os
from PyQt6 import QtCore
from PyQt6.QtWidgets import QMainWindow, QWidget, QVBoxLayout
from config.colors import DARK_BG, TEXT_COLOR_LIGHT
from database.miniature_video_database import MiniatureVideoDataBase
from database.miniature_musique_database import MiniatureMusiqueDataBase
from database.musique_database import MusiqueDataBase
from database.video_database import VideoDataBase
from pages.folders.gestionnaire_dossiers import GestionnaireDossiers
from widgets.grid_list.grid.grid import Grid
from widgets.grid_list.grid.grid_item import GridItem
from widgets.grid_list.list.list import List
from pages.navigateur.widgets.bar.bar_widget_nav import BarWidgetNav
from pages.navigateur.widgets.sous_bar.sous_bar_widget import SousBarWidgetNav
from widgets.grid_list.list.list_item import ListItem

class NavigateurWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.config = GestionnaireDossiers()
        self._setup_window()
        self._last_slider_range = None
        # Managers
        self.thumbnail_manager = MiniatureVideoDataBase()
        self.music_thumbnail_manager = MiniatureMusiqueDataBase()
        self.music_thumbnail_manager.thumbnail_ready.connect(self._on_thumbnail_ready)
        self.video_manager = VideoDataBase()
        self.musique_manager = MusiqueDataBase()
        self.video_info = self.video_manager.load_video_info()
        self.video_manager.video_info = self.video_info
        self._thumb_labels = {}
        self.show_video = True
        # UI & signals
        self._init_ui()
        self._init_signals()

        # Debounce timer for search
        self._filter_timer = QtCore.QTimer(self, interval=300, singleShot=True)

     # **Avant** le premier refresh, on ajuste la plage du slide**
        min_dur, max_dur = self._get_duration_range_minutes()
        # on passe des **minutes**


    def _setup_window(self):
        self.setWindowTitle("Videomi")
        self.setMinimumSize(700, 400)
        self.setStyleSheet(f"background-color: {DARK_BG}; color: {TEXT_COLOR_LIGHT};")
        self.showMaximized()

    def _init_ui(self):
        c = QWidget()
        self.setCentralWidget(c)
        layout = QVBoxLayout(c)
        layout.setSpacing(10)
        layout.setContentsMargins(0, 0, 0, 0)

        # navigation
        self.bar = BarWidgetNav()
        self.sous_bar = SousBarWidgetNav()
        self.sous_bar.setVisible(False)

        # containers
        self.grid_video = Grid()
        self.grid_musique = Grid()
        self.grid_musique.setVisible(False)
        self.list_video = List()
        self.list_musique = List()
        self.list_musique.setVisible(False)

        self.grid_container = self._make_container([self.grid_video, self.grid_musique])
        self.list_container = self._make_container([self.list_video, self.list_musique])
        self.list_container.setVisible(False)

        for w in (self.bar, self.sous_bar, self.grid_container, self.list_container):
            layout.addWidget(w)

    def _init_signals(self):
        left = self.bar.container_gauche
        right = self.bar.container_droite
        middle = self.bar.container_milieu
        sous_left = self.sous_bar.sous_bar_gauche
        sous_right = self.sous_bar.sous_bar_droite
        left.icon_toggle.state_changed.connect(self.toggle_grid_list)
        middle.card.state_changed.connect(self.toggle_video_musique)
        right.icon_search.state_changed.connect(self.sous_bar.setVisible)
        sous_left.bar_search.textChanged.connect(self._on_search_text)


        try:
            self.thumbnail_manager.thumbnail_ready.connect(self._on_thumbnail_ready)
        except AttributeError:
            pass

    def _on_duration_filter_changed(self, _):
        self._filter_timer.start()

    @staticmethod
    def _make_container(widgets):
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(10, 10, 10, 10)
        for widget in widgets:
            layout.addWidget(widget)
        return w

    def _on_search_text(self, _):
        self._filter_timer.start()

    @staticmethod
    def _normalize(raw):
        nom = raw.get('nom', raw.get('title', ''))
        sec = raw.get('duree', raw.get('duration', 0))
        return {
            'title': nom,
            'duration': f"{int(sec // 3600):02d}:{int((sec % 3600) // 60):02d}:{int(sec % 60):02d}",
            'duration_sec': int(sec),
            'path': raw.get('chemin', raw.get('path', ''))
        }

    def  _collect_entries(self):
        if self.show_video:
            return [self._normalize(r) for r in self.video_manager.get_all_for_display()]
        else :
            return [self._normalize(r) for r in self.musique_manager.get_all_for_display()]

    def toggle_video_musique(self, state: bool):
        """
        Basculer en mode vidéo (True) ou musique (False),
        montrer/cacher les bons conteneurs, et forcer le rafraîchissement.
        """
        self.show_video = state
        self.grid_video.setVisible(state)
        self.list_video.setVisible(state)
        self.grid_musique.setVisible(not state)
        self.list_musique.setVisible(not state)

        # on peut appeler directement sans timer, pour plus de fiabilité
        self._refresh_view()

    def _get_duration_range_minutes(self):
        entries = self._collect_entries()
        durations = []
        for e in entries:
            h, m, s = map(int, e['duration'].split(":"))
            durations.append(h * 60 + m + s // 60)

        if not durations:
            return 0, 120  # fallback : 0 à 2h

        min_dur = min(durations)
        max_dur = max(durations)

        step = 30
        min_rounded = (min_dur // step) * step
        max_rounded = ((max_dur + step - 1) // step) * step

        return min_rounded, max_rounded



    @staticmethod
    def _add_item(container, cls, entry, is_music=False):
        kwargs = {
            'title': entry['title'],
            'duration': entry['duration'],
            'thumbnail_path': entry.get('thumbnail_path'),
        }
        if is_music:
            # par exemple, forcer un ratio carré sur les pochettes
            kwargs['ratio'] = 1
        item = cls(**kwargs)
        # selon le type, on stocke le chemin dans l'attribut adéquat
        setattr(item, 'music_path' if is_music else 'video_path', entry['path'])
        if hasattr(container, 'add_item'):
            container.add_item(item)
        else:
            container.items.append(item)
            container.layout.addWidget(item)
            container.schedule_arrange()
        thumb = getattr(item, 'thumbnail', None)
        return (entry['path'], thumb) if thumb else (None, None)

    def _on_thumbnail_ready(self, path, pixmap):
        if not pixmap or pixmap.isNull():
            return
        for lbl in self._thumb_labels.get(path, []):
            lbl.setPixmap(pixmap)

    def toggle_grid_list(self, state):
        self.grid_container.setVisible(not state)
        self.list_container.setVisible(state)

    def closeEvent(self, event):
        self.thumbnail_manager.stop_all_processes()
        super().closeEvent(event)
