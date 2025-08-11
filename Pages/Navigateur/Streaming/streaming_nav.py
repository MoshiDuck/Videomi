import logging
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout,
    QLineEdit, QPushButton, QLabel, QApplication
)
from yt_dlp import YoutubeDL


class ExtractThread(QThread):
    finished = pyqtSignal(list)
    error = pyqtSignal(str)

    def __init__(self, url):
        super().__init__()
        self.url = url

    def run(self):
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'noplaylist': False,
            }

            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(self.url, download=False)

            if 'entries' in info and info['entries']:
                # ✅ Playlist détectée
                entries = info['entries']
            else:
                # ✅ Vidéo seule
                entries = [info]

            stream_urls = []

            for entry in entries:
                try:
                    single_opts = {
                        'format': 'best[ext=mp4]/best',
                        'quiet': True,
                        'no_warnings': True,
                        'noplaylist': True,
                    }
                    with YoutubeDL(single_opts) as ydl:
                        video_info = ydl.extract_info(entry['url'], download=False)
                        url_stream = video_info.get('url')
                        if url_stream:
                            stream_urls.append(url_stream)
                except Exception as e:
                    logging.warning(f"⏭️ Vidéo ignorée : {entry.get('url')} — {e}")

            if not stream_urls:
                raise ValueError("Aucun flux valide avec audio trouvé.")

            self.finished.emit(stream_urls)

        except Exception as e:
            logging.exception("Erreur pendant l'extraction des flux")
            self.error.emit(str(e))


class Streaming(QWidget):
    def __init__(self, switch_to_lecteur):
        super().__init__()
        self.switch_to_lecteur = switch_to_lecteur
        self.setLayout(QVBoxLayout())

        # Ligne input + bouton Coller
        line_layout = QHBoxLayout()
        self.link_input = QLineEdit()
        self.link_input.setPlaceholderText("Lien YouTube / Vimeo / autre...")

        self.paste_button = QPushButton("📋 Coller")
        self.paste_button.clicked.connect(self.paste_from_clipboard)

        line_layout.addWidget(self.link_input)
        line_layout.addWidget(self.paste_button)

        # Bouton lecture
        self.play_button = QPushButton("🎬 Lire")
        self.play_button.clicked.connect(self.handle_stream)

        # Label de statut
        self.status_label = QLabel("")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.layout().addLayout(line_layout)
        self.layout().addWidget(self.play_button)
        self.layout().addWidget(self.status_label)

    def paste_from_clipboard(self):
        clipboard = QApplication.clipboard()
        self.link_input.setText(clipboard.text())

    def handle_stream(self):
        url = self.link_input.text().strip()
        if not url:
            self.status_label.setText("⚠️ Veuillez entrer un lien.")
            return

        self.status_label.setText("🔄 Extraction des flux…")
        # Démarrer le thread d'extraction
        self.thread = ExtractThread(url)
        self.thread.finished.connect(self.on_extracted)
        self.thread.error.connect(self.on_error)
        self.thread.start()

    def on_extracted(self, stream_urls):
        self.status_label.setText(f"▶️ {len(stream_urls)} flux prêts à la lecture")
        self.switch_to_lecteur(stream_urls)

    def on_error(self, message):
        self.status_label.setText(f"❌ Erreur : {message}")