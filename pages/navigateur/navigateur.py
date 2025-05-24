import os
from PySide6.QtWidgets import QMainWindow, QWidget, QVBoxLayout
from config.colors import DARK_BG, TEXT_COLOR_LIGHT
from indexer.musique_indexer import musique_indexer
from indexer.thumbnail_indexer import ThumbnailIndexer
from indexer.video_indexer import video_indexer
from widgets.grid import Grid, GridItem
from widgets.list import List, ListItem
from pages.navigateur.widgets.bar.bar_widget_nav import BarWidgetNav
from pages.navigateur.widgets.sous_bar.sous_bar_widget import SousBarWidgetNav
from widgets.trier_a_z import TrierAZ
from widgets.trier_time import TrierTime


class NavigateurWindow(QMainWindow):
    def __init__(self):
        super().__init__()

        self.setWindowTitle("Videomi")
        self.setMinimumSize(700, 400)
        self.setStyleSheet(f"background-color: {DARK_BG}; color: {TEXT_COLOR_LIGHT};")
        self.showMaximized()

        self._init_ui()
        self._init_indexers()
        self._init_signals()

    def _init_ui(self):
        container = QWidget()
        self.setCentralWidget(container)
        main_layout = QVBoxLayout(container)
        main_layout.setSpacing(10)
        main_layout.setContentsMargins(0, 0, 0, 0)

        self.bar = BarWidgetNav()
        self.sous_bar = SousBarWidgetNav()
        self.sous_bar.setVisible(False)

        self.grid_video = Grid()
        self.grid_musique = Grid()
        self.grid_musique.setVisible(False)

        self.grid_container = self._create_container([self.grid_video, self.grid_musique], visible=True)

        self.list_video = List()
        self.list_musique = List()
        self.list_musique.setVisible(False)

        self.list_container = self._create_container([self.list_video, self.list_musique], visible=False)

        self.content = QWidget()
        content_layout = QVBoxLayout(self.content)
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.addWidget(self.grid_container)
        content_layout.addWidget(self.list_container)

        main_layout.addWidget(self.bar)
        main_layout.addWidget(self.sous_bar)
        main_layout.addWidget(self.content)

    def _create_container(self, widgets, visible):
        container = QWidget()
        container.setVisible(visible)
        layout = QVBoxLayout(container)
        layout.setContentsMargins(10, 10, 10, 10)
        for w in widgets:
            layout.addWidget(w)
        return container

    def _init_indexers(self):
        self.video_indexer = video_indexer()
        self.video_indexer.new.connect(self._on_new_video)
        self.video_indexer.start()

        self.thumb_indexer = ThumbnailIndexer()
        self.thumb_indexer.thumbnail_ready.connect(self._on_thumbnail_ready)
        self.thumb_indexer.start()

        self.music_indexer = musique_indexer()
        self.music_indexer.new.connect(self._on_new_music)
        self.music_indexer.start()

    def _init_signals(self):
        bar = self.bar.container_gauche
        bar.icon_toggle.state_changed.connect(self.toggle_grid_list)
        bar.sortAZ_toggle.state_changed.connect(self._sort_active_view_AZ)
        bar.sortTime_toggle.state_changed.connect(self._sort_active_view_time)

        self.bar.container_milieu.card.state_changed.connect(self.toggle_video_musique)
        self.bar.container_droite.icon_search.state_changed.connect(self.sous_bar.setVisible)
        search_bar = self.sous_bar.sous_bar_gauche.bar_search
        search_bar.textChanged.connect(self.grid_video.apply_filter)
        search_bar.textChanged.connect(self.grid_musique.apply_filter)

    @staticmethod
    def _add_item(container, item_class, entry, is_music=False):
        kwargs = dict(
            title=entry['title'],
            duration=entry['duration'],
            thumbnail_path=entry.get('thumbnail_path'),
        )
        if is_music:
            kwargs['ratio'] = 1 / 1

        item = item_class(**kwargs)
        setattr(item, 'music_path' if is_music else 'video_path', entry['path'])
        container.add_item(item)

    def _on_new_video_grid(self, entry):
        self._add_item(self.grid_video, GridItem, entry)

    def _on_new_video_list(self, entry):
        self._add_item(self.list_video, ListItem, entry)

    def _on_new_music_grid(self, entry):
        self._add_item(self.grid_musique, GridItem, entry, is_music=True)

    def _on_new_music_list(self, entry):
        self._add_item(self.list_musique, ListItem, entry, is_music=True)

    def _on_new_video(self, entry):
        self._on_new_video_grid(entry)
        self._on_new_video_list(entry)

    def _on_new_music(self, entry):
        self._on_new_music_grid(entry)
        self._on_new_music_list(entry)

    def _on_thumbnail_ready(self, video_name, thumb_path):
        for item in self.grid_video.items:
            name = os.path.splitext(os.path.basename(item.video_path))[0]
            if name == video_name:
                item.set_thumbnail(thumb_path)
                break

    def _get_active_containers(self):
        return (self.list_video, self.list_musique) if self.list_container.isVisible() else (self.grid_video, self.grid_musique)

    def _sort_items(self, sorter_class, reverse):
        video_container, music_container = self._get_active_containers()
        container = video_container if video_container.isVisible() else music_container

        sorter = sorter_class(reverse=reverse)
        sorted_items = sorter.sort(container.items)

        if isinstance(container, List):
            container.clear_items()
            for item in sorted_items:
                container.add_item(item)
        elif isinstance(container, Grid):
            container.items = sorted_items

    def _sort_active_view_AZ(self, state):
        if state:
            self.bar.container_gauche.sortTime_toggle.setChecked(False)
        self._sort_items(TrierAZ, reverse=state)

    def _sort_active_view_time(self, state):
        if state:
            self.bar.container_gauche.sortAZ_toggle.setChecked(False)
        self._sort_items(TrierTime, reverse=state)

    def toggle_video_musique(self, state):
        self.grid_video.setVisible(state)
        self.grid_musique.setVisible(not state)
        self.list_video.setVisible(state)
        self.list_musique.setVisible(not state)

    def toggle_grid_list(self, state):
        self.grid_container.setVisible(not state)
        self.list_container.setVisible(state)
