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
                entries = info['entries']
            else:
                entries = [info]

            stream_urls = []

            for entry in entries:
                try:
                    # Demander un maximum d'infos (mais sans télécharger)
                    single_opts = {
                        'quiet': True,
                        'no_warnings': True,
                        'noplaylist': True,
                        # ne forcer pas "bestvideo+bestaudio" ici — on va analyser les formats
                    }

                    with YoutubeDL(single_opts) as ydl:
                        video_info = ydl.extract_info(entry.get('url') or entry.get('webpage_url') or self.url,
                                                      download=False)

                    formats = video_info.get('formats') or [video_info]

                    # 1) Chercher formats «progressifs» (audio+video dans le même format)
                    progressive = [
                        f for f in formats
                        if f.get('acodec') not in (None, 'none') and f.get('vcodec') not in (None, 'none')
                    ]

                    # trier par hauteur (height) puis par bitrate (tbr)
                    def score_format(f):
                        return (f.get('height') or 0, f.get('tbr') or 0)

                    if progressive:
                        progressive.sort(key=score_format, reverse=True)
                        chosen = progressive[0]
                        url = chosen.get('url')
                        if url:
                            stream_urls.append(url)
                            continue  # on passe à la vidéo suivante

                    # 2) Si pas de format progressif, chercher HLS / m3u8 adaptatif
                    hls = [
                        f for f in formats
                        if 'm3u8' in (f.get('protocol') or '') or f.get('ext') == 'm3u8' or 'hls' in (
                                    f.get('format_note') or '').lower()
                    ]
                    if hls:
                        # preferer le plus haut bitrate / resolution
                        hls.sort(key=score_format, reverse=True)
                        url = hls[0].get('url')
                        if url:
                            stream_urls.append(url)
                            continue

                    # 3) Si on a des formats vidéo-only + audio-only, on peut tenter de renvoyer
                    # l'URL vidéo-only la meilleure — ATTENTION: peut manquer l'audio si le lecteur
                    # ne sait pas mixer séparément. On préfère renvoyer tout de même la meilleure
                    # url disponible pour que l'utilisateur ait une lecture (à améliorer : utiliser VLC).
                    # Chercher la meilleure URL par hauteur/tbr, peu importe audio/video
                    formats_sorted = sorted(formats, key=score_format, reverse=True)
                    if formats_sorted:
                        url = formats_sorted[0].get('url')
                        if url:
                            stream_urls.append(url)
                            continue

                    logging.warning(f"Aucune URL exploitable pour {entry.get('url')}")

                except Exception as e:
                    logging.warning(f"⏭️ Vidéo ignorée : {entry.get('url')} — {e}")

            if not stream_urls:
                raise ValueError("Aucun flux valide trouvé (progressif ou HLS).")

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