# Todo : streaming_nav.py
import os
import re
import random
import requests
import subprocess

from pathlib import Path
from yt_dlp import YoutubeDL

from Core.logger_config import logger
from Models.category import CatManager
from PyQt6.QtGui import QPixmap, QFont
from Core.Language.i18n import get_text
from Models.upload_manager import UploadManager
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from Service.py1FichierClient import FichierClient

from Core.settings import (
    VIDEO_DOWNLOAD_DIR,
    AUDIO_DOWNLOAD_DIR,
    FFMPEG_PATH
)
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout,
    QLineEdit, QPushButton, QLabel, QApplication,
    QProgressBar, QScrollArea, QFrame, QSizePolicy,
    QMessageBox, QDialog,
    QGroupBox, QRadioButton
)

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
]

def clean_filename(filename):
    cleaned = re.sub(r'[<>:"/\\|?*]', '', filename)
    cleaned = re.sub(r'\s+', ' ', cleaned)
    if len(cleaned) > 200:
        cleaned = cleaned[:200]
    return cleaned.strip()


class ExtractThread(QThread):
    finished = pyqtSignal(list)
    error = pyqtSignal(str)

    def __init__(self, url):
        super().__init__()
        self.url = url

    def run(self):
        try:
            ydl_opts = {
                'quiet': False,
                'verbose': True,
                'no_warnings': False,
                'noplaylist': False,
                'user_agent': random.choice(USER_AGENTS),
                'referer': 'https://www.youtube.com/',
                'no_check_certificate': True,
                'ignoreerrors': True,
                'retries': 15,
                'fragment_retries': 15,
                'skip_unavailable_fragments': True,
                'extractor_args': {
                    'youtube': {
                        'player_client': ['android', 'web'],
                        'skip': ['hls', 'dash', 'translated_subs']
                    }
                },
                'http_headers': {
                    'User-Agent': random.choice(USER_AGENTS),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                },
                # Éviter les formats nécessitant des tokens PO
                'compat_opts': ['no-youtube-unavailable-videos'],
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
                    single_opts = {
                        'quiet': False,
                        'verbose': True,
                        'no_warnings': False,
                        'noplaylist': True,
                        'user_agent': random.choice(USER_AGENTS),
                        'referer': 'https://www.youtube.com/',
                        'no_check_certificate': True,
                        'ignoreerrors': True,
                        'retries': 15,
                        'fragment_retries': 15,
                        'skip_unavailable_fragments': True,
                        'extractor_args': {
                            'youtube': {
                                'player_client': ['android', 'web'],
                                'skip': ['hls', 'dash', 'translated_subs']
                            }
                        },
                        'http_headers': {
                            'User-Agent': random.choice(USER_AGENTS),
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5',
                            'Accept-Encoding': 'gzip, deflate',
                            'Connection': 'keep-alive',
                            'Upgrade-Insecure-Requests': '1',
                            'Sec-Fetch-Mode': 'navigate',
                            'Sec-Fetch-Site': 'none',
                            'Sec-Fetch-User': '?1',
                        },
                        'compat_opts': ['no-youtube-unavailable-videos'],
                    }

                    with YoutubeDL(single_opts) as ydl:
                        video_info = ydl.extract_info(entry.get('url') or entry.get('webpage_url') or self.url,
                                                      download=False)

                    formats = video_info.get('formats') or [video_info]

                    filtered_formats = [
                        f for f in formats
                        if not f.get('is_unavailable') and
                           not any(x in (f.get('format_note') or '').lower() for x in
                                   ['premium', 'membership', 'subscriber'])
                    ]

                    if not filtered_formats:
                        filtered_formats = formats

                    progressive = [
                        f for f in filtered_formats
                        if f.get('acodec') not in (None, 'none') and f.get('vcodec') not in (None, 'none')
                    ]

                    def score_format(f):
                        return (f.get('height') or 0, f.get('tbr') or 0)

                    if progressive:
                        progressive.sort(key=score_format, reverse=True)
                        chosen = progressive[0]
                        url = chosen.get('url')
                        if url:
                            stream_urls.append(url)
                            continue

                    hls = [
                        f for f in filtered_formats
                        if 'm3u8' in (f.get('protocol') or '') or f.get('ext') == 'm3u8' or 'hls' in (
                                f.get('format_note') or '').lower()
                    ]
                    if hls:
                        hls.sort(key=score_format, reverse=True)
                        url = hls[0].get('url')
                        if url:
                            stream_urls.append(url)
                            continue

                    formats_sorted = sorted(filtered_formats, key=score_format, reverse=True)
                    if formats_sorted:
                        url = formats_sorted[0].get('url')
                        if url:
                            stream_urls.append(url)
                            continue

                    logger.warning(f"Aucune URL exploitable pour {entry.get('url')}")
                except Exception as e:
                    logger.warning(f"⏭️ Vidéo ignorée : {entry.get('url')} — {e}")

            if not stream_urls:
                raise ValueError("Aucun flux valide trouvé (progressif ou HLS).")

            self.finished.emit(stream_urls)
        except Exception as e:
            logger.exception("Erreur pendant l'extraction des flux")
            self.error.emit(str(e))


class DownloadThread(QThread):
    progress = pyqtSignal(int)
    finished = pyqtSignal(str)
    error = pyqtSignal(str)
    file_downloaded = pyqtSignal(str)  # Nouveau signal pour le chemin du fichier téléchargé

    def __init__(self, url, format_choice, quality_choice):
        super().__init__()
        self.url = url
        self.format_choice = format_choice
        self.quality_choice = quality_choice
        self.is_cancelled = False
        self.downloaded_file = None
        self.video_title = None

        # Déterminer le répertoire de téléchargement en fonction du format
        if self.format_choice == "Vidéo":
            self.download_path = VIDEO_DOWNLOAD_DIR
        else:
            self.download_path = AUDIO_DOWNLOAD_DIR

    def run(self):
        try:
            # Gestion des cookies
            cookiefile_path = Path.home() / 'cookies.txt'

            # Options de téléchargement selon le format et la qualité choisis
            if self.format_choice == "Vidéo":
                # Mapping des qualités vidéo
                quality_map = {
                    get_text("nav_labels.streaming_texts.quality.high"): (
                        "bestvideo[height<=1080]+bestaudio/best[height<=1080]", "1080p"),
                    get_text("nav_labels.streaming_texts.quality.medium"): (
                        "bestvideo[height<=720]+bestaudio/best[height<=720]", "720p"),
                    get_text("nav_labels.streaming_texts.quality.low"): ("bestvideo[height<=480]+bestaudio/best[height<=480]",
                                                                   "480p")
                }
                format_string, quality_suffix = quality_map.get(self.quality_choice, ("best", ""))

                ydl_opts = {
                    'format': format_string,
                    'outtmpl': str(self.download_path / f'%(title)s - {quality_suffix}.%(ext)s'),
                    'progress_hooks': [self.progress_hook],
                    'quiet': False,
                    'verbose': True,
                    'user_agent': random.choice(USER_AGENTS),
                    'referer': 'https://www.youtube.com/',
                    'no_check_certificate': True,
                    'ignoreerrors': True,
                    'retries': 15,
                    'fragment_retries': 15,
                    'skip_unavailable_fragments': True,
                    # Configuration pour éviter les problèmes de tokens PO
                    'extractor_args': {
                        'youtube': {
                            'player_client': ['android', 'web'],
                            'skip': ['hls', 'dash', 'translated_subs']
                        }
                    },
                    'http_headers': {
                        'User-Agent': random.choice(USER_AGENTS),
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1',
                    },
                    # Éviter les formats nécessitant des tokens PO
                    'compat_opts': ['no-youtube-unavailable-videos'],
                }

                # Ajouter les chemins ffmpeg si disponibles
                if str(FFMPEG_PATH):
                    ydl_opts['ffmpeg_location'] = str(FFMPEG_PATH)

                # Ajouter les cookies si disponibles
                if cookiefile_path.exists():
                    ydl_opts['cookiefile'] = str(cookiefile_path)
                else:
                    logger.warning("Fichier cookies.txt non trouvé. Téléchargement sans cookies.")

                with YoutubeDL(ydl_opts) as ydl:
                    result = ydl.extract_info(self.url, download=True)
                    self.downloaded_file = ydl.prepare_filename(result)

                if not self.is_cancelled:
                    self.file_downloaded.emit(self.downloaded_file)  # Émettre le chemin du fichier
                    self.finished.emit(f"{get_text('nav_labels.streaming_texts.download_complete')}: {self.downloaded_file}")

            else:  # Audio - Télécharger d'abord la vidéo puis convertir en audio
                # Télécharger la vidéo complète d'abord
                video_quality_map = {
                    get_text("nav_labels.streaming_texts.quality.high"): (
                        "bestvideo[height<=720]+bestaudio/best[height<=720]", "720p"),
                    get_text("nav_labels.streaming_texts.quality.medium"): (
                        "bestvideo[height<=480]+bestaudio/best[height<=480]", "480p"),
                    get_text("nav_labels.streaming_texts.quality.low"): ("bestvideo[height<=360]+bestaudio/best[height<=360]",
                                                                   "360p")
                }
                video_format_string, video_quality_suffix = video_quality_map.get(self.quality_choice, ("best", ""))

                ydl_opts = {
                    'format': video_format_string,
                    'outtmpl': str(self.download_path / 'temp_%(title)s.%(ext)s'),
                    'progress_hooks': [self.progress_hook],
                    'quiet': False,
                    'verbose': True,
                    'user_agent': random.choice(USER_AGENTS),
                    'referer': 'https://www.youtube.com/',
                    'no_check_certificate': True,
                    'ignoreerrors': True,
                    'retries': 15,
                    'fragment_retries': 15,
                    'skip_unavailable_fragments': True,
                    'extractor_args': {
                        'youtube': {
                            'player_client': ['android', 'web'],
                            'skip': ['hls', 'dash', 'translated_subs']
                        }
                    },
                    'http_headers': {
                        'User-Agent': random.choice(USER_AGENTS),
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1',
                    },
                    'compat_opts': ['no-youtube-unavailable-videos'],
                }

                # Ajouter les chemins ffmpeg si disponibles
                if str(FFMPEG_PATH):
                    ydl_opts['ffmpeg_location'] = str(FFMPEG_PATH)

                # Ajouter les cookies si disponibles
                if cookiefile_path.exists():
                    ydl_opts['cookiefile'] = str(cookiefile_path)
                else:
                    logger.warning("Fichier cookies.txt non trouvé. Téléchargement sans cookies.")

                # Télécharger la vidéo d'abord
                with YoutubeDL(ydl_opts) as ydl:
                    result = ydl.extract_info(self.url, download=True)
                    video_file = ydl.prepare_filename(result)
                    self.downloaded_file = video_file
                    self.video_title = result.get('title', get_text('nav_labels.streaming_texts.unknown'))

                # Convertir en audio si le téléchargement a réussi et n'a pas été annulé
                try:
                    if not self.is_cancelled and self.downloaded_file and os.path.exists(self.downloaded_file):
                        if FFMPEG_PATH.exists():
                            audio_file = self.convert_to_audio(self.downloaded_file, self.video_title)
                            os.remove(self.downloaded_file)

                            # Émettre le signal de fin avec le chemin du fichier audio
                            if not self.is_cancelled:
                                self.file_downloaded.emit(audio_file)  # Émettre le chemin du fichier audio
                                self.finished.emit(
                                    f"{get_text('nav_labels.streaming_texts.download_complete')}: {audio_file}")
                        else:
                            raise Exception(get_text('nav_labels.streaming_texts.ffmpeg_unavailable'))
                except Exception as e:
                    logger.error(f"Échec de la conversion: {e}")
                    self.error.emit(str(e))


        except Exception as e:
            if not self.is_cancelled:
                self.error.emit(str(e))

    def convert_to_audio(self, video_file, video_title):
        """Convertir le fichier vidéo en audio"""
        try:
            if not FFMPEG_PATH.exists():
                error_msg = f"{get_text('nav_labels.streaming_texts.ffmpeg_not_found')}: {str(FFMPEG_PATH)}"
                logger.error(error_msg)
                raise Exception(error_msg)

            # Vérifier que le fichier vidéo existe
            if not os.path.exists(video_file):
                error_msg = f"{get_text('nav_labels.streaming_texts.video_file_not_found')}: {video_file}"
                logger.error(error_msg)
                raise Exception(error_msg)

            # Déterminer la qualité audio
            quality_map = {
                get_text("nav_labels.streaming_texts.quality.high"): ("320k", "320kbps"),
                get_text("nav_labels.streaming_texts.quality.medium"): ("192k", "192kbps"),
                get_text("nav_labels.streaming_texts.quality.low"): ("128k", "128kbps")
            }
            audio_quality, audio_quality_suffix = quality_map.get(self.quality_choice, ("192k", "192kbps"))

            # Nettoyer le titre de la vidéo pour le nom de fichier
            clean_title = clean_filename(video_title)

            # Créer le nom du fichier de sortie avec la qualité
            base_name = f"{clean_title} - {audio_quality_suffix}"
            audio_file = self.download_path / f"{base_name}.mp3"

            # Éviter les doublons en ajoutant un numéro si le fichier existe déjà
            counter = 1
            while audio_file.exists():
                audio_file = self.download_path / f"{base_name} ({counter}).mp3"
                counter += 1

            # Commande FFmpeg pour extraire l'audio
            cmd = [
                str(FFMPEG_PATH),
                '-i', video_file,
                '-vn',  # Pas de vidéo
                '-acodec', 'libmp3lame',
                '-ab', audio_quality,
                '-y',  # Écraser si existe
                str(audio_file)
            ]

            # Exécuter la conversion
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )

            # Attendre la fin de la conversion
            stdout, stderr = process.communicate()

            if process.returncode != 0:
                raise Exception(f"{get_text('nav_labels.streaming_texts.conversion_error')}: {stderr}")

            logger.info(f"{get_text('nav_labels.streaming_texts.conversion_successful')}: {audio_file}")
            return str(audio_file)

        except Exception as e:
            logger.error(f"{get_text('nav_labels.streaming_texts.audio_conversion_error')}: {e}")
            raise

    def progress_hook(self, d):
        if self.is_cancelled:
            raise Exception(get_text('nav_labels.streaming_texts.download_cancelled'))

        if d['status'] == 'downloading':
            try:
                if 'total_bytes' in d:
                    percent = (d['downloaded_bytes'] / d['total_bytes']) * 100
                elif 'total_bytes_estimate' in d:
                    percent = (d['downloaded_bytes'] / d['total_bytes_estimate']) * 100
                else:
                    percent = 0
                self.progress.emit(int(percent))
            except (ZeroDivisionError, KeyError):
                self.progress.emit(0)

    def cancel(self):
        self.is_cancelled = True


class InfoThread(QThread):
    """Thread pour extraire les informations de la vidéo"""
    info_ready = pyqtSignal(dict)
    error = pyqtSignal(str)

    def __init__(self, url, playlist_index=None):
        super().__init__()
        self.url = url
        self.playlist_index = playlist_index

    def run(self):
        try:
            ydl_opts = {
                'quiet': False,
                'verbose': True,
                'no_warnings': False,
                'skip_download': True,
                'extract_flat': False,
                'user_agent': random.choice(USER_AGENTS),
                'referer': 'https://www.youtube.com/',
                'no_check_certificate': True,
                'ignoreerrors': True,
                'retries': 15,
                'fragment_retries': 15,
                'skip_unavailable_fragments': True,
                # Configuration pour éviter les problèmes de tokens PO
                'extractor_args': {
                    'youtube': {
                        'player_client': ['android', 'web'],
                        'skip': ['hls', 'dash', 'translated_subs']
                    }
                },
                'http_headers': {
                    'User-Agent': random.choice(USER_AGENTS),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                },
                # Éviter les formats nécessitant des tokens PO
                'compat_opts': ['no-youtube-unavailable-videos'],
            }

            # Si on veut un index spécifique dans une playlist
            if self.playlist_index is not None:
                ydl_opts['playlist_items'] = str(self.playlist_index)

            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(self.url, download=False)

            # Gérer les playlists
            if 'entries' in info and info['entries']:
                # Prendre seulement le premier élément (notre index cible)
                info = info['entries'][0]

            # Extraire les informations pertinentes
            video_info = {
                'title': info.get('title', get_text('nav_labels.streaming_texts.unknown_title')),
                'uploader': info.get('uploader', get_text('nav_labels.streaming_texts.unknown_author')),
                'duration': info.get('duration', 0),
                'view_count': info.get('view_count', 0),
                'thumbnail': info.get('thumbnail'),
                'description': info.get('description', ''),
                'upload_date': info.get('upload_date'),
                'webpage_url': info.get('webpage_url', self.url)
            }

            self.info_ready.emit(video_info)

        except Exception as e:
            self.error.emit(str(e))


class ThumbnailLoader(QThread):
    """Thread pour charger la miniature"""
    thumbnail_ready = pyqtSignal(QPixmap)
    error = pyqtSignal(str)

    def __init__(self, thumbnail_url):
        super().__init__()
        self.thumbnail_url = thumbnail_url

    def run(self):
        try:
            if not self.thumbnail_url:
                return

            headers = {
                'User-Agent': random.choice(USER_AGENTS),
                'Referer': 'https://www.youtube.com/'
            }

            response = requests.get(self.thumbnail_url, headers=headers, timeout=10)
            response.raise_for_status()

            pixmap = QPixmap()
            if pixmap.loadFromData(response.content):
                # Redimensionner la miniature
                scaled_pixmap = pixmap.scaled(
                    320, 240,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation
                )
                self.thumbnail_ready.emit(scaled_pixmap)
            else:
                self.error.emit(get_text('nav_labels.streaming_texts.thumbnail_load_failed'))

        except Exception as e:
            self.error.emit(f"{get_text('nav_labels.streaming_texts.thumbnail_load_error')}: {e}")


class DownloadDialog(QDialog):
    file_downloaded = pyqtSignal(str)  # Nouveau signal pour le chemin du fichier téléchargé

    def __init__(self, url, parent=None):
        super().__init__(parent)
        self.url = url
        self.download_thread = None
        self.format_choice = get_text("nav_labels.streaming_texts.format.video")  # Default choice
        self.quality_choice = get_text("nav_labels.streaming_texts.quality.high")  # Default choice
        self.setup_ui()
        self.setWindowTitle(get_text("nav_labels.streaming_texts.download_options"))
        self.setModal(True)
        self.setFixedSize(500, 300)  # Taille réduite car pas de sélection de dossier

    def setup_ui(self):
        layout = QVBoxLayout()

        # Titre de la boîte de dialogue
        title_label = QLabel(get_text("nav_labels.streaming_texts.download_options"))
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_font = QFont()
        title_font.setBold(True)
        title_font.setPointSize(14)
        title_label.setFont(title_font)
        layout.addWidget(title_label)

        # Groupe pour le format
        format_group = QGroupBox(get_text("nav_labels.streaming_texts.format.title"))
        format_layout = QVBoxLayout()

        self.format_video = QRadioButton(get_text("nav_labels.streaming_texts.format.video"))
        self.format_video.setChecked(True)
        self.format_video.toggled.connect(self.on_format_changed)

        self.format_audio = QRadioButton(get_text("nav_labels.streaming_texts.format.audio"))
        self.format_audio.toggled.connect(self.on_format_changed)

        format_layout.addWidget(self.format_video)
        format_layout.addWidget(self.format_audio)
        format_group.setLayout(format_layout)
        layout.addWidget(format_group)

        # Groupe pour la qualité
        self.quality_group = QGroupBox(get_text("nav_labels.streaming_texts.quality.video_title"))
        quality_layout = QVBoxLayout()

        self.quality_video_high = QRadioButton(get_text("nav_labels.streaming_texts.quality.high"))
        self.quality_video_high.setChecked(True)

        self.quality_video_medium = QRadioButton(get_text("nav_labels.streaming_texts.quality.medium"))
        self.quality_video_low = QRadioButton(get_text("nav_labels.streaming_texts.quality.low"))

        quality_layout.addWidget(self.quality_video_high)
        quality_layout.addWidget(self.quality_video_medium)
        quality_layout.addWidget(self.quality_video_low)
        self.quality_group.setLayout(quality_layout)
        layout.addWidget(self.quality_group)

        # Groupe pour la qualité audio (initialement caché)
        self.audio_quality_group = QGroupBox(get_text("nav_labels.streaming_texts.quality.audio_title"))
        self.audio_quality_group.setVisible(False)
        audio_quality_layout = QVBoxLayout()

        self.quality_audio_high = QRadioButton(get_text("nav_labels.streaming_texts.quality.high"))
        self.quality_audio_high.setChecked(True)

        self.quality_audio_medium = QRadioButton(get_text("nav_labels.streaming_texts.quality.medium"))
        self.quality_audio_low = QRadioButton(get_text("nav_labels.streaming_texts.quality.low"))

        audio_quality_layout.addWidget(self.quality_audio_high)
        audio_quality_layout.addWidget(self.quality_audio_medium)
        audio_quality_layout.addWidget(self.quality_audio_low)
        self.audio_quality_group.setLayout(audio_quality_layout)
        layout.addWidget(self.audio_quality_group)

        # Barre de progression
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)

        # Boutons
        button_layout = QHBoxLayout()
        self.download_button = QPushButton(get_text("nav_labels.streaming_texts.download"))
        self.download_button.clicked.connect(self.start_download)
        self.cancel_button = QPushButton(get_text("nav_labels.streaming_texts.cancel"))
        self.cancel_button.clicked.connect(self.close)
        button_layout.addWidget(self.download_button)
        button_layout.addWidget(self.cancel_button)
        layout.addLayout(button_layout)

        self.setLayout(layout)

    def on_format_changed(self):
        if self.format_video.isChecked():
            self.format_choice = get_text("nav_labels.streaming_texts.format.video")
            self.quality_group.setVisible(True)
            self.audio_quality_group.setVisible(False)
        else:
            self.format_choice = get_text("nav_labels.streaming_texts.format.audio")
            self.quality_group.setVisible(False)
            self.audio_quality_group.setVisible(True)

    def start_download(self):
        # Vérifier si ffmpeg est disponible pour les formats qui en ont besoin
        if not FFMPEG_PATH.exists() and self.format_choice == get_text("nav_labels.streaming_texts.format.audio"):
            QMessageBox.warning(self, get_text("nav_labels.streaming_texts.warning"),
                                get_text("nav_labels.streaming_texts.ffmpeg_required"))
            return

        # Déterminer le choix de qualité
        if self.format_choice == get_text("nav_labels.streaming_texts.format.video"):
            if self.quality_video_high.isChecked():
                self.quality_choice = get_text("nav_labels.streaming_texts.quality.high")
            elif self.quality_video_medium.isChecked():
                self.quality_choice = get_text("nav_labels.streaming_texts.quality.medium")
            else:
                self.quality_choice = get_text("nav_labels.streaming_texts.quality.low")
        else:
            if self.quality_audio_high.isChecked():
                self.quality_choice = get_text("nav_labels.streaming_texts.quality.high")
            elif self.quality_audio_medium.isChecked():
                self.quality_choice = get_text("nav_labels.streaming_texts.quality.medium")
            else:
                self.quality_choice = get_text("nav_labels.streaming_texts.quality.low")

        # Avertissement pour l'audio
        if self.format_choice == get_text("nav_labels.streaming_texts.format.audio"):
            reply = QMessageBox.information(self, get_text("nav_labels.streaming_texts.information"),
                                            get_text("nav_labels.streaming_texts.audio_warning"),
                                            QMessageBox.StandardButton.Ok | QMessageBox.StandardButton.Cancel)
            if reply != QMessageBox.StandardButton.Ok:
                return

        self.download_thread = DownloadThread(self.url, self.format_choice, self.quality_choice)
        self.download_thread.progress.connect(self.update_progress)
        self.download_thread.finished.connect(self.download_finished)
        self.download_thread.error.connect(self.download_error)
        self.download_thread.file_downloaded.connect(self.on_file_downloaded)  # Connecter le nouveau signal
        self.download_thread.start()

        self.progress_bar.setVisible(True)
        self.download_button.setEnabled(False)

    def update_progress(self, value):
        self.progress_bar.setValue(value)

    def download_finished(self, message):
        QMessageBox.information(self, get_text("nav_labels.streaming_texts.success"), message)
        self.close()

    def download_error(self, error):
        QMessageBox.critical(self, get_text("nav_labels.streaming_texts.error"),
                             f"{get_text('nav_labels.streaming_texts.download_error')}: {error}")
        self.download_button.setEnabled(True)
        self.progress_bar.setVisible(False)

    def on_file_downloaded(self, file_path):
        """Slot pour le signal file_downloaded du thread de téléchargement"""
        self.file_downloaded.emit(file_path)  # Émettre le signal vers l'extérieur

    def closeEvent(self, event):
        if self.download_thread and self.download_thread.isRunning():
            self.download_thread.cancel()
            self.download_thread.wait()
        event.accept()


class PreviewWidget(QFrame):
    """Widget d'aperçu pour une vidéo"""
    watch_requested = pyqtSignal(str)  # URL de la vidéo
    download_requested = pyqtSignal(str)  # URL de la vidéo

    def __init__(self, video_info):
        super().__init__()
        self.video_info = video_info
        self.setup_ui()
        self.load_thumbnail()

    def setup_ui(self):
        """Configurer l'interface utilisateur"""
        self.setFrameStyle(QFrame.Shape.Box)
        self.setMaximumWidth(350)
        self.setMinimumWidth(300)
        self.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Maximum)

        # Style avec coins arrondis sans changer les couleurs
        self.setStyleSheet("""
            PreviewWidget {
                border-radius: 8px;
            }
        """)

        layout = QVBoxLayout()
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(10)

        # Miniature
        self.thumbnail_label = QLabel()
        self.thumbnail_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.thumbnail_label.setStyleSheet("""
            QLabel {
                border-radius: 6px;
                min-height: 180px;
                max-height: 180px;
            }
        """)
        self.thumbnail_label.setText(get_text("nav_labels.streaming_texts.thumbnail_loading"))
        layout.addWidget(self.thumbnail_label)

        # Titre
        title_label = QLabel(self.video_info.get('title', get_text('nav_labels.streaming_texts.unknown_title')))
        title_label.setWordWrap(True)
        title_label.setMaximumHeight(50)
        font = QFont()
        font.setBold(True)
        font.setPointSize(11)
        title_label.setFont(font)
        title_label.setStyleSheet("padding: 2px;")
        layout.addWidget(title_label)

        # Informations
        info_text = f"""
        👤 {self.video_info.get('uploader', get_text('nav_labels.streaming_texts.unknown_author'))}
        ⏱️ {self.format_duration(self.video_info.get('duration', 0))}
        👁️ {self.format_views(self.video_info.get('view_count', 0))}
        """
        info_label = QLabel(info_text.strip())
        info_label.setStyleSheet("font-size: 9pt; padding: 2px;")
        layout.addWidget(info_label)

        # Boutons d'action
        button_layout = QHBoxLayout()
        button_layout.setSpacing(8)

        watch_button = QPushButton(get_text("nav_labels.streaming_texts.watch"))
        watch_button.clicked.connect(lambda: self.watch_requested.emit(self.video_info.get('webpage_url')))
        watch_button.setStyleSheet("""
            QPushButton {
                padding: 8px 12px;
                border-radius: 6px;
                font-weight: bold;
            }
            QPushButton:hover {
                padding: 9px 13px;
            }
        """)

        download_button = QPushButton(get_text("nav_labels.streaming_texts.download"))
        download_button.clicked.connect(lambda: self.download_requested.emit(self.video_info.get('webpage_url')))
        download_button.setStyleSheet("""
            QPushButton {
                padding: 8px 12px;
                border-radius: 6px;
                font-weight: bold;
            }
            QPushButton:hover {
                padding: 9px 13px;
            }
        """)

        button_layout.addWidget(watch_button)
        button_layout.addWidget(download_button)
        layout.addLayout(button_layout)

        self.setLayout(layout)

    def load_thumbnail(self):
        """Charger la miniature de la vidéo"""
        thumbnail_url = self.video_info.get('thumbnail')
        if thumbnail_url:
            self.thumbnail_loader = ThumbnailLoader(thumbnail_url)
            self.thumbnail_loader.thumbnail_ready.connect(self.set_thumbnail)
            self.thumbnail_loader.error.connect(self.on_thumbnail_error)
            self.thumbnail_loader.start()

    def set_thumbnail(self, pixmap):
        """Définir la miniature chargée"""
        self.thumbnail_label.setPixmap(pixmap)

    def on_thumbnail_error(self, error_msg):
        """Gérer les erreurs de chargement de miniature"""
        self.thumbnail_label.setText(get_text("nav_labels.streaming_texts.thumbnail_unavailable"))
        self.thumbnail_label.setStyleSheet("""
            QLabel {
                color: #888;
                min-height: 180px;
                max-height: 180px;
            }
        """)

    def format_duration(self, duration):
        """Formater la durée en format lisible"""
        if not duration:
            return get_text("nav_labels.streaming_texts.unknown_duration")

        hours = duration // 3600
        minutes = (duration % 3600) // 60
        seconds = duration % 60

        if hours > 0:
            return f"{hours}h{minutes:02d}m{seconds:02d}s"
        else:
            return f"{minutes:02d}m{seconds:02d}s"

    def format_views(self, views):
        """Formater le nombre de vues"""
        if not views:
            return get_text("nav_labels.streaming_texts.unknown_views")

        if views >= 1000000:
            return f"{views / 1000000:.1f}M {get_text('nav_labels.streaming_texts.views')}"
        elif views >= 1000:
            return f"{views / 1000:.1f}K {get_text('nav_labels.streaming_texts.views')}"
        else:
            return f"{views} {get_text('nav_labels.streaming_texts.views')}"


class Streaming(QWidget):
    def __init__(self, switch_to_lecteur, fichier_client: FichierClient, auth, db):
        super().__init__()
        self.switch_to_lecteur = switch_to_lecteur
        self.fichier_client = fichier_client
        self.auth = auth
        self.db = db
        self.cat_manager = CatManager()
        self.preview_widgets = []
        self.current_url = None
        self.upload_manager = None
        self.setup_ui()
        self.init_upload_manager()

    def setup_ui(self):
        """Configurer l'interface utilisateur principale"""
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(15)

        # En-tête avec titre
        header_label = QLabel(get_text("nav_labels.streaming_texts.title"))
        header_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        header_font = QFont()
        header_font.setPointSize(18)
        header_font.setBold(True)
        header_label.setFont(header_font)
        header_label.setStyleSheet("margin-bottom: 10px;")
        main_layout.addWidget(header_label)

        # Zone de saisie
        input_layout = QHBoxLayout()

        self.link_input = QLineEdit()
        self.link_input.setPlaceholderText(get_text("nav_labels.streaming_texts.link_placeholder"))
        self.link_input.setStyleSheet("""
            QLineEdit {
                padding: 10px;
                font-size: 12pt;
            }
        """)
        self.link_input.returnPressed.connect(self.load_preview)

        self.paste_button = QPushButton("📋")
        self.paste_button.setToolTip(get_text("nav_labels.streaming_texts.paste_tooltip"))
        self.paste_button.setFixedSize(50, 50)
        self.paste_button.clicked.connect(self.paste_from_clipboard)
        self.paste_button.setStyleSheet("""
            QPushButton {
                font-size: 16pt;
            }
            QPushButton:hover {
                padding: 1px;
            }
        """)

        self.preview_button = QPushButton(get_text("nav_labels.streaming_texts.preview"))
        self.preview_button.setFixedHeight(50)
        self.preview_button.clicked.connect(self.load_preview)
        self.preview_button.setStyleSheet("""
            QPushButton {
                font-weight: bold;
                font-size: 12pt;
                padding: 0 20px;
            }
            QPushButton:hover {
                padding: 0 21px;
            }
            QPushButton:disabled {
                opacity: 0.7;
            }
        """)

        input_layout.addWidget(self.link_input)
        input_layout.addWidget(self.paste_button)
        input_layout.addWidget(self.preview_button)
        main_layout.addLayout(input_layout)

        # Barre de progression
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        self.progress_bar.setTextVisible(False)
        self.progress_bar.setStyleSheet("""
            QProgressBar {
                height: 10px;
                border-radius: 5px;
            }
            QProgressBar::chunk {
                border-radius: 5px;
            }
        """)
        main_layout.addWidget(self.progress_bar)

        # Zone d'aperçu avec scroll
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.scroll_area.setStyleSheet("border: none;")

        self.preview_container = QWidget()
        self.preview_layout = QGridLayout()
        self.preview_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.preview_layout.setHorizontalSpacing(20)
        self.preview_layout.setVerticalSpacing(20)
        self.preview_layout.setContentsMargins(5, 5, 5, 5)
        self.preview_container.setLayout(self.preview_layout)
        self.scroll_area.setWidget(self.preview_container)

        main_layout.addWidget(self.scroll_area)

        # Label de statut
        self.status_label = QLabel(get_text("nav_labels.streaming_texts.enter_link"))
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_label.setStyleSheet("""
            QLabel {
                padding: 10px;
                border-radius: 8px;
            }
        """)

        main_layout.addWidget(self.status_label)
        self.setLayout(main_layout)

    def init_upload_manager(self):
        """Initialiser l'UploadManager avec la configuration nécessaire"""
        try:
            # Récupérer les fichiers existants depuis Firebase
            existing_files = self.get_uploaded_files_from_firebase()

            # Récupérer les IDs des dossiers existants de manière plus robuste
            folder_ids_by_name = self.get_existing_folder_ids()

            # Initialiser l'UploadManager
            self.upload_manager = UploadManager(
                client=self.fichier_client,
                cat_manager=self.cat_manager,
                existing_files=existing_files,
                folder_ids_by_name=folder_ids_by_name,
                root_folder_id='0',
            )

            # Connecter les signaux de l'UploadManager
            self.upload_manager.progress.connect(self.on_upload_progress)
            self.upload_manager.finished.connect(self.on_upload_finished)
            self.upload_manager.error.connect(self.on_upload_error)

        except Exception as e:
            logger.error(f"{get_text('nav_labels.streaming_texts.upload_manager_init_error')}: {e}")
            # En cas d'erreur, créer un UploadManager avec des valeurs par défaut
            self.upload_manager = UploadManager(
                client=self.fichier_client,
                cat_manager=self.cat_manager,
                existing_files={},
                folder_ids_by_name={},
                root_folder_id='0'
            )

    def get_uploaded_files_from_firebase(self):
        """Récupérer la liste des fichiers déjà uploadés depuis Firebase"""
        try:
            # Obtenir l'UID de l'utilisateur connecté via l'auth
            uid = self.auth.get_uid()
            if not uid:
                return {}

            # Obtenir le token d'authentification
            token = self.auth.obtenir_token()
            if not token:
                return {}

            # Utiliser la base de données Firebase via self.auth
            user_data = self.auth.firebase.database().child('users').child(uid).get(token).val()
            uploaded = {}
            if user_data:
                for category_key, files in user_data.items():
                    if isinstance(files, dict):
                        uploaded[category_key.lower()] = set(file_key.lower() for file_key in files.keys())
            return uploaded
        except Exception as e:
            logger.error(f"{get_text('nav_labels.streaming_texts.uploaded_files_error')}: {e}")
            return {}

    def get_existing_folder_ids(self):
        """Récupérer les IDs des dossiers existants sur 1Fichier de manière plus robuste"""
        try:
            # Obtenir les dossiers racine
            root_folders = self.fichier_client.get_folders(0)

            folder_ids = {}

            # Adapter en fonction de la structure réelle de la réponse
            if isinstance(root_folders, dict) and 'sub_folders' in root_folders:
                folders = root_folders['sub_folders']
            elif hasattr(root_folders, 'sub_folders'):
                folders = root_folders.sub_folders
            else:
                folders = []

            for folder in folders:
                if isinstance(folder, dict):
                    folder_name = folder.get('name', '').lower()
                    folder_id = folder.get('id')
                    if folder_name and folder_id:
                        folder_ids[folder_name] = folder_id
                elif hasattr(folder, 'name') and hasattr(folder, 'id'):
                    folder_ids[folder.name.lower()] = folder.id

            return folder_ids
        except Exception as e:
            logger.error(f"{get_text('nav_labels.streaming_texts.folder_retrieval_error')}: {e}")
            return {}

    def paste_from_clipboard(self):
        """Coller depuis le presse-papiers"""
        clipboard = QApplication.clipboard()
        text = clipboard.text().strip()
        if text:
            self.link_input.setText(text)
            self.status_label.setText(get_text("nav_labels.streaming_texts.link_pasted"))

    def load_preview(self):
        """Charger l'aperçu des vidéos"""
        url = self.link_input.text().strip()
        if not url:
            self.status_label.setText(get_text("nav_labels.streaming_texts.enter_valid_link"))
            return

        # Sauvegarder l'URL originale
        self.current_url = url

        # Nettoyer les aperçus précédens
        self.clear_previews()

        # Afficher la progression
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)  # Mode indéterminé
        self.status_label.setText(get_text("nav_labels.streaming_texts.extracting_info"))
        self.preview_button.setEnabled(False)

        # Détecter si c'est une playlist et extraire seulement l'index 2
        playlist_index = None
        if "list=" in url:
            playlist_index = 2  # Index 1-based pour yt-dlp

        # Lancer le thread d'extraction d'informations
        self.info_thread = InfoThread(url, playlist_index)
        self.info_thread.info_ready.connect(self.create_preview)
        self.info_thread.error.connect(self.on_preview_error)
        self.info_thread.start()

    def create_preview(self, video_info):
        """Créer l'aperçu de la vidéo"""
        preview_widget = PreviewWidget(video_info)
        preview_widget.watch_requested.connect(self.handle_watch)
        preview_widget.download_requested.connect(self.handle_download)

        # Ajouter au layout en grille (2 colonnes)
        row = len(self.preview_widgets) // 2
        col = len(self.preview_widgets) % 2
        self.preview_layout.addWidget(preview_widget, row, col)

        self.preview_widgets.append(preview_widget)

        # Masquer la barre de progression
        self.progress_bar.setVisible(False)
        self.status_label.setText(
            f"✅ {get_text('nav_labels.streaming_texts.preview_loaded')} - {video_info.get('title', get_text('nav_labels.streaming_texts.video'))}")
        self.preview_button.setEnabled(True)

    def handle_watch(self, url):
        """Gérer la demande de visionnage"""
        self.status_label.setText(get_text("nav_labels.streaming_texts.extracting_streams"))
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)

        # Utiliser l'URL originale (playlist complète) plutôt que l'URL de la vidéo individuelle
        url_to_extract = self.current_url if "list=" in self.current_url else url

        # Démarrer le thread d'extraction
        self.thread = ExtractThread(url_to_extract)
        self.thread.finished.connect(self.on_extracted)
        self.thread.error.connect(self.on_error)
        self.thread.start()

    def handle_download(self, url):
        """Gérer la demande de téléchargement"""
        download_dialog = DownloadDialog(url, self)
        download_dialog.file_downloaded.connect(self.start_upload)
        download_dialog.exec()

    def start_upload(self, file_path):
        """Démarrer l'upload du fichier téléchargé"""
        try:
            if not self.upload_manager:
                self.init_upload_manager()

            if self.upload_manager:
                self.status_label.setText(
                    f"🔼 {get_text('nav_labels.streaming_texts.preparing_upload')} {Path(file_path).name}")

                # Stocker le fichier courant pour une éventuelle réessaye
                self.current_upload_file = file_path

                # Déterminer la catégorie basée sur l'extension du fichier
                file_extension = Path(file_path).suffix.lower()
                category = self.cat_manager.get_category(file_extension).capitalize()
                title = Path(file_path).stem

                # Mettre à jour la base de données avec le chemin local
                self.db.update_local_path(category, title, file_path)

                # Configurer l'upload avec le chemin local
                self.upload_manager.set_files([(file_path, False)])
                self.upload_manager.local_path = file_path  # ← Assurez-vous que cette ligne est présente

                # Démarrer l'upload
                self.upload_manager.start()

                self.status_label.setText(
                    f"⏫ {get_text('nav_labels.streaming_texts.upload_in_progress')}: {Path(file_path).name}")
            else:
                self.status_label.setText(get_text("nav_labels.streaming_texts.upload_manager_error"))

        except Exception as e:
            logger.error(f"{get_text('nav_labels.streaming_texts.upload_start_error')}: {e}")
            self.status_label.setText(f"❌ {get_text('nav_labels.streaming_texts.upload_error')}: {str(e)}")

    def on_upload_progress(self, percent):
        """Mettre à jour la progression de l'upload"""
        self.progress_bar.setValue(percent)

    def on_upload_finished(self, link, uploaded_file):
        """Upload terminé avec succès"""
        self.progress_bar.setVisible(False)
        self.status_label.setText(f"✅ {get_text('nav_labels.streaming_texts.upload_complete')}: {Path(uploaded_file).name}")

        # Mettre à jour le lien dans la base de données
        file_extension = Path(uploaded_file).suffix.lower()
        category = self.cat_manager.get_category(file_extension).capitalize()
        title = Path(uploaded_file).stem

        # Récupérer le chemin local existant
        local_path = uploaded_file

        # Mettre à jour la base de données SQLite avec le lien et le chemin local
        self.db.update_file(
            category=category,
            title=title,
            file_link=link,
            thumb_url='',
            thumb_path='',
            metadata_json='{}',
            tmdb_metadata='{}',
            music_metadata='{}',
            entry_hash='',
            file_extension=file_extension,
            local_path=local_path
        )

        # Mettre à jour Firebase avec le local_path
        try:
            uid = self.auth.get_uid()
            token = self.auth.obtenir_token()
            if uid and token:
                # Préparer les données à mettre à jour dans Firebase
                data = {
                    'file_link': link,
                    'local_path': local_path,
                    'file_extension': file_extension
                }
                # Mettre à jour le nœud spécifique dans Firebase
                self.auth.firebase.database().child('users').child(uid).child(category).child(title).update(data, token)
        except Exception as e:
            logger.error(f"{get_text('nav_labels.streaming_texts.firebase_update_error')}: {e}")

        # Afficher le lien de téléchargement
        QMessageBox.information(self, get_text("nav_labels.streaming_texts.upload_success"),
                                f"{get_text('nav_labels.streaming_texts.upload_success_message')}!\n\n{get_text('nav_labels.streaming_texts.link')}: {link}")

    def on_upload_error(self, error_msg):
        """Gérer les erreurs d'upload"""
        self.progress_bar.setVisible(False)

        if "Folder already exist" in error_msg:
            # Recréer l'UploadManager avec les dossiers existants mis à jour
            self.status_label.setText(get_text("nav_labels.streaming_texts.updating_folders"))
            try:
                existing_files = self.get_uploaded_files_from_firebase()
                folder_ids_by_name = self.get_existing_folder_ids()

                self.upload_manager = UploadManager(
                    client=self.fichier_client,
                    cat_manager=self.cat_manager,
                    existing_files=existing_files,
                    folder_ids_by_name=folder_ids_by_name,
                    root_folder_id='0'
                )

                # Reconnecter les signaux
                self.upload_manager.progress.connect(self.on_upload_progress)
                self.upload_manager.finished.connect(self.on_upload_finished)
                self.upload_manager.error.connect(self.on_upload_error)

                # Réessayer l'upload
                if hasattr(self, 'current_upload_file') and self.current_upload_file:
                    self.start_upload(self.current_upload_file)
                return
            except Exception as e:
                error_msg = f"{get_text('nav_labels.streaming_texts.reset_error')}: {e}"

        self.status_label.setText(f"❌ {get_text('nav_labels.streaming_texts.upload_error')}: {error_msg}")
        QMessageBox.critical(self, get_text("nav_labels.streaming_texts.upload_error_title"),
                             f"{get_text('nav_labels.streaming_texts.upload_error_message')}:\n\n{error_msg}")

    def on_extracted(self, stream_urls):
        """Traiter les URLs de flux extraites"""
        self.progress_bar.setVisible(False)
        self.status_label.setText(f"▶️ {len(stream_urls)} {get_text('nav_labels.streaming_texts.streams_ready')}")
        self.switch_to_lecteur(stream_urls)

    def on_error(self, message):
        """Traiter les erreurs d'extraction"""
        self.progress_bar.setVisible(False)
        self.status_label.setText(f"❌ {get_text('nav_labels.streaming_texts.error')} : {message}")
        self.preview_button.setEnabled(True)

    def on_preview_error(self, message):
        """Traiter les erreurs d'aperçu"""
        self.progress_bar.setVisible(False)
        self.status_label.setText(f"❌ {get_text('nav_labels.streaming_texts.preview_error')} : {message}")
        self.preview_button.setEnabled(True)

    def clear_previews(self):
        """Nettoyer les aperçus existants"""
        for widget in self.preview_widgets:
            widget.deleteLater()
        self.preview_widgets.clear()

        # Nettoyer le layout
        while self.preview_layout.count():
            child = self.preview_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()
