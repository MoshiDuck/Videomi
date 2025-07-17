import re
import os
import hashlib
import requests
from io import BytesIO
from PyQt6.QtCore import QRunnable
from PyQt6.QtGui import QPixmap

class TelechargementImage(QRunnable):
    def __init__(self, url: str, client_1fichier, callback):
        super().__init__()
        self.url = url
        self.client_1fichier = client_1fichier
        self.callback = callback

    def run(self):
        try:
            url = self.url
            if "1fichier.com" in url:
                match = re.search(r"1fichier\.com/\?([a-z0-9]+)", url, re.IGNORECASE)
                if match:
                    file_id = match.group(1)
                    canonical_url = f"https://1fichier.com/?{file_id}"
                    try:
                        url = self.client_1fichier.get_download_link(canonical_url, cdn=True)
                    except Exception:
                        self.callback(self.url, None, None)
                        return
                else:
                    self.callback(self.url, None, None)
                    return

            resp = requests.get(url, timeout=10)
            resp.raise_for_status()

            data = BytesIO(resp.content)
            pixmap = QPixmap()
            if pixmap.loadFromData(data.read()):
                cache_dir = os.path.join(os.getcwd(), "cache", "images")
                os.makedirs(cache_dir, exist_ok=True)

                filename = hashlib.md5(self.url.encode('utf-8')).hexdigest() + ".jpg"
                local_path = os.path.join(cache_dir, filename)

                pixmap.save(local_path, "JPEG")

                self.callback(self.url, pixmap, local_path)
                return

        except Exception as e:
            print(e)
            self.callback(self.url, None, None)
            pass