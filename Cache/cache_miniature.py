from collections import OrderedDict
from PyQt6.QtGui import QPixmap
from PyQt6.QtCore import Qt


class CacheMiniature:
    def __init__(self, max_size=500):
        self.max_size = max_size
        self._cache = OrderedDict()

    def get(self, url, width=None) -> QPixmap | None:
        if url not in self._cache:
            return None

        self._cache.move_to_end(url)  # Usage récent
        pixmap = self._cache[url]

        if width is None:
            return pixmap

        return pixmap.scaledToWidth(width, Qt.TransformationMode.SmoothTransformation)

    def insert(self, url, pixmap: QPixmap):
        self._cache[url] = pixmap
        self._cache.move_to_end(url)

        if len(self._cache) > self.max_size:
            self._cache.popitem(last=False)

    def clear(self):
        self._cache.clear()
