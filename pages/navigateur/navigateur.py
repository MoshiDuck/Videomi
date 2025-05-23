import os

from PySide6.QtWidgets import QMainWindow, QWidget, QVBoxLayout
from config.colors import DARK_BG, TEXT_COLOR_LIGHT
from config.config import THUMBNAIL_VIDEO_DIR
from indexer.musique_indexer import musique_indexer
from indexer.thumbnail_indexer import ThumbnailIndexer
from indexer.video_indexer import  video_indexer
from widgets.grid import Grid, GridItem
from pages.navigateur.widgets.bar.bar_widget_nav import BarWidgetNav
from pages.navigateur.widgets.sous_bar.sous_bar_widget import SousBarWidgetNav



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
        main_layout.setContentsMargins(0,0,0,0)

        self.bar = BarWidgetNav()
        self.sous_bar = SousBarWidgetNav()
        self.sous_bar.setVisible(False)

        self.grid_video = Grid()
        self.grid_musique = Grid()
        self.grid_musique.setVisible(False)

        content = QWidget()
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(10,10,10,10)
        content_layout.addWidget(self.grid_video)
        content_layout.addWidget(self.grid_musique)

        main_layout.addWidget(self.bar)
        main_layout.addWidget(self.sous_bar)
        main_layout.addWidget(content)

        self.video_indexer = video_indexer()
        self.video_indexer.new.connect(self._on_new_video)
        self.video_indexer.start()

        self.thumb_indexer = ThumbnailIndexer()
        self.thumb_indexer.thumbnail_ready.connect(self._on_thumbnail_ready)
        self.thumb_indexer.start()

        self.music_indexer = musique_indexer()
        self.music_indexer.new.connect(self._on_new_music)
        self.music_indexer.start()

        # UI signals
        self.bar.container_milieu.card.state_changed.connect(self.toggle_video_musique)
        self.bar.container_droite.icon_search.state_changed.connect(self.sous_bar.setVisible)

    def _on_new_video(self, entry: dict):
        item = GridItem(
            title=entry['title'],
            duration=entry['duration'],
            thumbnail_path=entry.get('thumbnail_path')
        )
        # Stocker mapping path->item
        item.video_path = entry['path']
        self.grid_video.add_item(item)

    def _on_thumbnail_ready(self, video_name: str, thumb_path: str):
        # Trouver l'item dont le nom correspond
        for item in self.grid_video.items:
            name = os.path.splitext(os.path.basename(item.video_path))[0]
            if name == video_name:
                item.set_thumbnail(thumb_path)
                break

    def _on_new_music(self, entry: dict):
        item = GridItem(
            title=entry['title'],
            duration=entry['duration'],
            thumbnail_path=entry.get('thumbnail_path')
        )
        item.music_path = entry['path']
        self.grid_musique.add_item(item)

    def toggle_video_musique(self, state: bool):
        self.grid_video.setVisible(state)
        self.grid_musique.setVisible(not state)
