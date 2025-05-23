import os

from PySide6.QtWidgets import QMainWindow, QWidget, QVBoxLayout
from config.colors import DARK_BG, TEXT_COLOR_LIGHT
from indexer.musique_indexer import musique_indexer
from indexer.thumbnail_indexer import ThumbnailIndexer
from indexer.video_indexer import video_indexer
from widgets.grid import Grid, GridItem
from pages.navigateur.widgets.bar.bar_widget_nav import BarWidgetNav
from pages.navigateur.widgets.sous_bar.sous_bar_widget import SousBarWidgetNav
from widgets.list import List, ListItem


class NavigateurWindow(QMainWindow):
    def __init__(self):
        super().__init__()

        self.setWindowTitle("Videomi")
        self.setMinimumSize(700, 400)
        self.setStyleSheet(f"background-color: {DARK_BG}; color: {TEXT_COLOR_LIGHT};")
        self.showMaximized()

        container = QWidget()
        self.setCentralWidget(container)
        main_layout = QVBoxLayout(container)
        main_layout.setSpacing(10)
        main_layout.setContentsMargins(0, 0, 0, 0)

        self.bar = BarWidgetNav()
        self.sous_bar = SousBarWidgetNav()
        self.sous_bar.setVisible(False)

        # --- Grille ---
        self.grid_video = Grid()
        self.grid_musique = Grid()
        self.grid_musique.setVisible(False)

        self.grid_container = QWidget()
        self.grid_container.setVisible(True)
        grid_layout = QVBoxLayout(self.grid_container)
        grid_layout.setContentsMargins(10, 10, 10, 10)
        grid_layout.addWidget(self.grid_video)
        grid_layout.addWidget(self.grid_musique)

        # --- Liste ---
        self.list_video = List()
        self.list_musique = List()
        self.list_musique.setVisible(False)

        self.list_container = QWidget()
        self.list_container.setVisible(False)
        list_layout = QVBoxLayout(self.list_container)
        list_layout.setContentsMargins(10, 10, 10, 10)
        list_layout.addWidget(self.list_video)
        list_layout.addWidget(self.list_musique)

        # --- Content Principal ---
        self.content = QWidget()
        content_layout = QVBoxLayout(self.content)
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.addWidget(self.grid_container)
        content_layout.addWidget(self.list_container)

        # --- Ajout à l'UI ---
        main_layout.addWidget(self.bar)
        main_layout.addWidget(self.sous_bar)
        main_layout.addWidget(self.content)

        # --- Indexeurs ---
        self.video_indexer = video_indexer()
        self.video_indexer.new.connect(self._on_new_video)
        self.video_indexer.start()

        self.thumb_indexer = ThumbnailIndexer()
        self.thumb_indexer.thumbnail_ready.connect(self._on_thumbnail_ready)
        self.thumb_indexer.start()

        self.music_indexer = musique_indexer()
        self.music_indexer.new.connect(self._on_new_music)
        self.music_indexer.start()

        # --- UI Signals ---
        self.bar.container_gauche.icon_toggle.state_changed.connect(self.toggle_grid_list)
        self.bar.container_milieu.card.state_changed.connect(self.toggle_video_musique)
        self.bar.container_droite.icon_search.state_changed.connect(self.sous_bar.setVisible)

    def _on_new_video_grid(self, entry: dict):
        item = GridItem(
            title=entry['title'],
            duration=entry['duration'],
            thumbnail_path=entry.get('thumbnail_path')
        )
        item.video_path = entry['path']
        self.grid_video.add_item(item)

    def _on_thumbnail_ready(self, video_name: str, thumb_path: str):
        for item in self.grid_video.items:
            name = os.path.splitext(os.path.basename(item.video_path))[0]
            if name == video_name:
                item.set_thumbnail(thumb_path)
                break

    def _on_new_music_grid(self, entry: dict):
        item = GridItem(
            ratio=1 / 1,
            title=entry['title'],
            duration=entry['duration'],
            thumbnail_path=entry.get('thumbnail_path')
        )
        item.music_path = entry['path']
        self.grid_musique.add_item(item)

    def toggle_video_musique(self, state: bool):
        self.grid_video.setVisible(state)
        self.grid_musique.setVisible(not state)
        self.list_video.setVisible(state)
        self.list_musique.setVisible(not state)

    def toggle_grid_list(self, state: bool):
        self.grid_container.setVisible(state)
        self.list_container.setVisible(not state)

    def _on_new_video_list(self, entry: dict):
        item = ListItem(
            title=entry['title'],
            duration=entry['duration'],
            thumbnail_path=entry.get('thumbnail_path')
        )
        item.video_path = entry['path']
        self.list_video.add_item(item)

    def _on_new_music_list(self, entry: dict):
        item = ListItem(
            ratio=1 / 1,
            title=entry['title'],
            duration=entry['duration'],
            thumbnail_path=entry.get('thumbnail_path')
        )
        item.music_path = entry['path']
        self.list_musique.add_item(item)

    def _on_new_video(self, entry: dict):
        self._on_new_video_grid(entry)
        self._on_new_video_list(entry)

    def _on_new_music(self, entry: dict):
        self._on_new_music_grid(entry)
        self._on_new_music_list(entry)