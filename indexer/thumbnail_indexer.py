import os
import time
import logging
from PySide6.QtCore import QThread, Signal

from config.config import THUMBNAIL_VIDEO_DIR

logger = logging.getLogger(__name__)

class ThumbnailIndexer(QThread):
    thumbnail_ready = Signal(str, str)

    def __init__(self, poll_interval: float = 1.0, parent=None):
        super().__init__(parent)
        self.thumbnail_dir = THUMBNAIL_VIDEO_DIR
        self.poll_interval = poll_interval
        self._known = set()

    def run(self):
        while True:
            try:
                files = os.listdir(self.thumbnail_dir)
            except FileNotFoundError:
                logger.warning(f"Thumbnail directory not found: {self.thumbnail_dir}")
                files = []
            except PermissionError:
                logger.error(f"Permission denied accessing: {self.thumbnail_dir}")
                files = []
            except Exception as e:
                logger.error(f"Unexpected error listing thumbnails: {e}")
                files = []

            for fname in files:
                if not fname.lower().endswith('.jpg'):
                    continue
                thumb = os.path.join(self.thumbnail_dir, fname)
                if thumb not in self._known:
                    video_name = os.path.splitext(fname)[0]
                    self.thumbnail_ready.emit(video_name, thumb)
                    self._known.add(thumb)

            time.sleep(self.poll_interval)
