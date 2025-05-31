import os
from collections import OrderedDict
from PySide6.QtGui import QPixmap


class MiniatureCache:
    def __init__(self, max_items=100):
        self.cache = OrderedDict()  # key: titre_nettoye, value: QPixmap
        self.max_items = max_items

    def _evict_if_needed(self):
        while len(self.cache) > self.max_items:
            self.cache.popitem(last=False)

    def get(self, titre_nettoye, thumb_path):
        """Retourne un QPixmap depuis le cache ou le disque, sinon None."""
        if titre_nettoye in self.cache:
            # LRU: remet en haut
            self.cache.move_to_end(titre_nettoye)
            return self.cache[titre_nettoye]

        if os.path.exists(thumb_path):
            pixmap = QPixmap(thumb_path)
            if not pixmap.isNull():
                self.cache[titre_nettoye] = pixmap
                self._evict_if_needed()
                return pixmap
        return None

    def add(self, titre_nettoye, pixmap):
        """Ajoute une miniature dans le cache."""
        if not pixmap or pixmap.isNull():
            return
        self.cache[titre_nettoye] = pixmap
        self._evict_if_needed()

    def clear(self):
        """Vide complètement le cache."""
        self.cache.clear()

    def contains(self, titre_nettoye):
        return titre_nettoye in self.cache
