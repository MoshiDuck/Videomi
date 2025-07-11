import re

from PyQt6.QtCore import QRunnable
from PyQt6.QtGui import QPixmap


class TelechargementImage(QRunnable):
    def __init__(self, url, client_1fichier, callback):
        super().__init__()
        self.url = url
        self.client_1fichier = client_1fichier
        self.callback = callback

    def run(self):
        import requests
        from io import BytesIO
        try:
            url = self.url
            if "1fichier.com" in url:
                match = re.search(r"1fichier\.com/\?([a-z0-9]+)", url, re.IGNORECASE)
                if match:
                    file_id = match.group(1)
                    canonical_url = f"https://1fichier.com/?{file_id}"
                    try:
                        url = self.client_1fichier.get_download_link(canonical_url, cdn=True)
                    except:
                        self.callback(self.url, None)
                        return
                else:
                    self.callback(self.url, None)
                    return

            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            data = BytesIO(resp.content)
            pixmap = QPixmap()
            if pixmap.loadFromData(data.read()):
                self.callback(self.url, pixmap)
                return
        except Exception:
            pass
        self.callback(self.url, None)