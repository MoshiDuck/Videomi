import json
import logging
import os
import platform
import subprocess
import tempfile
import time

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import (
    QHBoxLayout, QVBoxLayout, QLabel, QFrame
)

from Service.py1FichierClient import FichierClient
from Widgets.defilement_label import DefilementLabel

class ClickableLabel(QLabel):
    clicked = pyqtSignal()

    def mousePressEvent(self, event):
        self.clicked.emit()
        super().mousePressEvent(event)

class ItemWidget(QFrame):
    _scaled_cache = {}

    def __init__(
            self,
            switch_to_lecteur,
            client_1fichier:FichierClient,
            image_path: str,
            title: str,
            duration: str,
            width: int,
            category: str,
            audio_languages: list,
            subtitle_languages: list,
            file_link: str,
            mode="grid"
    ):
        super().__init__()
        self.switch_to_lecteur = switch_to_lecteur
        self.client_1fichier = client_1fichier
        self.title_label = None
        self.title = title
        self.duration_label = None
        self.image_label = ClickableLabel()
        self.image_label.clicked.connect(self.on_image_clicked)
        self.min_width = width
        self.category = category
        self.image_path = image_path
        self.original_pixmap = None
        self.mode = mode
        self.file_link = file_link
        self.audio_languages = audio_languages
        self.subtitle_languages = subtitle_languages
        self.init_ui(image_path, title, duration)

    def on_image_clicked(self):
        try:
            if self.category == "Images":
                if hasattr(self, "image_path") and os.path.exists(self.image_path):
                    logging.debug(f"Ouverture image locale : {self.image_path}")
                    self.open_file_with_default_application(self.image_path)
                else:
                    logging.warning("Image marquée comme locale mais introuvable.")
                return

            if not self.file_link:
                logging.warning("Aucun lien de fichier fourni.")
                return

            logging.debug(f"Téléchargement depuis : {self.file_link}")

            if self.category in {"Videos", "Musiques"}:
                dl_url = self.get_direct_download_url(inline=True)
                if not dl_url:
                    logging.warning("Lien direct non obtenu.")
                    return

                logging.debug(f"Lecture via lecteur avec URL : {dl_url}")
                if self.switch_to_lecteur:
                    self.switch_to_lecteur(dl_url)
                else:
                    logging.warning("Callback switch_to_lecteur non défini.")
            else:
                dl_url = self.get_direct_download_url(inline=False)
                if not dl_url:
                    logging.warning("Lien direct non obtenu.")
                    return

                tmp_dir = tempfile.gettempdir()
                tmp_path_raw = os.path.join(tmp_dir, f"fichier_temp_{int(time.time())}")
                success = self._download_from_direct_url(dl_url, tmp_path_raw)
                if not success:
                    logging.warning("Échec du téléchargement.")
                    return

                import magic
                mime_type = magic.from_file(tmp_path_raw, mime=True)
                logging.debug(f"MIME détecté : {mime_type}")

                import mimetypes
                extension = mimetypes.guess_extension(mime_type) or ".bin"
                tmp_path_final = tmp_path_raw + extension
                os.rename(tmp_path_raw, tmp_path_final)

                logging.debug(f"Fichier renommé en : {tmp_path_final}")
                self.open_file_with_default_application(tmp_path_final)

        except Exception as e:
            logging.exception(f"Erreur dans on_image_clicked : {e}")

    def get_page_nav_widget(self):
        parent = self.parent()
        while parent:
            if parent.__class__.__name__ == "PageNav":
                return parent
            parent = parent.parent()
        return None

    @staticmethod
    def clean_file_link(file_link):
        cleaned_url = file_link.split('&')[0]
        return cleaned_url

    def get_direct_download_url(self, inline: bool = False, cdn: bool = True, restrict_ip: bool = False,
                                no_ssl: bool = False) -> str | None:
        try:
            if not self.client_1fichier or not self.file_link:
                logging.error("Client 1fichier ou lien manquant.")
                return None

            clean_link = self.clean_file_link(self.file_link)

            logging.debug("Récupération du lien de téléchargement direct...")

            options = {
                'inline': int(inline),
                'cdn': int(cdn),
                'restrict_ip': int(restrict_ip),
                'no_ssl': int(no_ssl),
            }

            download_url = self.client_1fichier.get_download_link(clean_link, **options)
            logging.debug(f"Lien direct récupéré : {download_url}")
            return download_url
        except Exception as e:
            logging.warning(f"Échec récupération lien direct : {e}")
            return None

    @staticmethod
    def _download_from_direct_url(url: str, local_path: str) -> bool:
        import requests
        try:
            with requests.get(url, stream=True, timeout=30) as r:
                r.raise_for_status()
                with open(local_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
            return True
        except Exception as e:
            logging.error(f"Erreur téléchargement via URL directe : {e}")
            return False

    def _guess_file_extension(self):
        from urllib.parse import urlparse
        import os

        parsed = urlparse(self.file_link)
        filename = os.path.basename(parsed.path)

        _, ext = os.path.splitext(filename)
        if ext and len(ext) <= 5:
            return ext.lower()
        return ".bin"

    @staticmethod
    def open_file_with_default_application(file_path):
        try:
            logging.debug(f"Taille du fichier à ouvrir : {os.path.getsize(file_path)} octets")
            if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
                logging.error("Fichier inexistant ou vide. Annulation.")
                return

            ext = os.path.splitext(file_path)[1].lower()

            if ext == ".exe" and platform.system() == "Windows":
                logging.debug("Exécution directe d'un .exe détecté")
                subprocess.Popen([file_path], shell=True)
            elif platform.system() == "Windows":
                os.startfile(file_path)
            elif platform.system() == "Darwin":
                subprocess.run(["open", file_path], check=False)
            else:
                subprocess.run(["xdg-open", file_path], check=False)
        except Exception as e:
            logging.exception(f"Erreur lors de l'ouverture du fichier : {e}")

    def init_ui(self, image_path, title, duration):
        if self.mode == "list":
            self.setObjectName("itemListCard")
            main_layout = QHBoxLayout(self)
            main_layout.setContentsMargins(10, 5, 10, 5)
            main_layout.setSpacing(10)

            self.load_pixmap(image_path)
            text_layout = QVBoxLayout()
            text_layout.setAlignment(Qt.AlignmentFlag.AlignVCenter)
            self.title_label = DefilementLabel(title)
            self.title_label.setFixedHeight(20)
            self.title_label.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
            text_layout.addWidget(self.title_label)
            main_layout.addWidget(self.image_label)
            main_layout.addLayout(text_layout)

            self.duration_label = QLabel(duration)
            self.duration_label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
            self.duration_label.setFixedWidth(60)
            self.duration_label.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
            main_layout.addWidget(self.duration_label)

        else:
            self.setObjectName("itemGridCard")
            main_layout = QVBoxLayout(self)
            main_layout.setContentsMargins(0, 0, 0, 0)
            main_layout.setSpacing(0)

            self.load_pixmap(image_path)
            self.title_label = DefilementLabel(title)
            self.title_label.setFixedHeight(20)
            self.title_label.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

            self.duration_label = QLabel(duration)
            self.duration_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.duration_label.setFixedHeight(20)
            self.duration_label.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

            main_layout.addWidget(self.image_label)
            main_layout.addWidget(self.title_label)
            main_layout.addWidget(self.duration_label)

    def load_pixmap(self, image_path):
        pixmap = QPixmap(image_path)
        if pixmap.isNull():
            pixmap = QPixmap(self.min_width, self.min_width)
            pixmap.fill(Qt.GlobalColor.black)
        self.original_pixmap = pixmap
        self._update_scaled(self.min_width)

    def _update_scaled(self, width):
        key = (self.image_path, width, self.mode)
        if key in ItemWidget._scaled_cache:
            scaled = ItemWidget._scaled_cache[key]
        else:
            w0, h0 = self.original_pixmap.width(), self.original_pixmap.height()
            if self.mode == "list":
                target_h = 80
                ratio = w0 / h0 if h0 else 16 / 9
                target_w = int(target_h * ratio)
                scaled = self.original_pixmap.scaled(
                    target_w, target_h,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation
                )
            else:
                ratio = (h0 / w0) if w0 else 9 / 16
                ih = int(width * ratio)
                scaled = self.original_pixmap.scaled(
                    width, ih,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation
                )

            ItemWidget._scaled_cache[key] = scaled

        self.image_label.setPixmap(scaled)
        self.image_label.setFixedSize(scaled.width(), scaled.height())

        if self.mode == "list":
            self.setFixedHeight(scaled.height() + 10)
        else:
            self.setFixedSize(scaled.width(), scaled.height() + 40)

    def resize_image(self, width):
        if self.image_label.width() == width:
            return
        self._update_scaled(width)

class ItemsFactory:
    def __init__(self,switch_to_lecteur, db_manager, client_1fichier:FichierClient):
        self.switch_to_lecteur= switch_to_lecteur
        self.db_manager = db_manager
        self.client_1fichier = client_1fichier
        self.items_data = []
        self.load_items_data()

    def load_items_data(self):
        self.items_data.clear()
        raw = self.db_manager.fetch_all()
        for (category, title), data in raw.items():
            metadata = data.get("metadata_json")
            duration_str = self.extract_duration(metadata)
            duration_sec = self._duration_str_to_seconds(duration_str)
            thumbnail = data.get("thumbnail_path") or ""
            audio_langs = self.extract_audio_languages(metadata)
            subtitle_langs = self.extract_subtitle_languages(metadata)
            file_link = data.get("file_link") or ""

            self.items_data.append({
                "category": category,
                "title": title,
                "duration_str": duration_str,
                "duration_sec": duration_sec,
                "thumbnail_path": thumbnail,
                "audio_languages": audio_langs,
                "subtitle_languages": subtitle_langs,
                "file_link": file_link
            })

    def create_item_widgets(self, min_width=320, mode="grid", sort_key=None, reverse=False, filter_func=None):
        items = self.items_data
        if filter_func:
            items = [item for item in items if filter_func(item)]
        if sort_key:
            items = sorted(items, key=sort_key, reverse=reverse)

        widgets = []
        for item in items:
            widget = ItemWidget(
                self.switch_to_lecteur,
                self.client_1fichier,
                item["thumbnail_path"],
                item["title"],
                item["duration_str"],
                min_width,
                item["category"],
                item.get("audio_languages", []),
                item.get("subtitle_languages", []),
                item["file_link"],
                mode
            )
            widgets.append(widget)
        return widgets

    @staticmethod
    def title_contains_filter(keyword):
        return lambda item: keyword.lower() in item["title"].lower()

    @staticmethod
    def extract_duration(metadata_json):
        if not metadata_json:
            return ""
        try:
            meta = json.loads(metadata_json)
            dur = meta.get("ffprobe", {}).get("format", {}).get("duration")
            if dur:
                secs = float(dur)
                h = int(secs // 3600)
                m = int((secs % 3600) // 60)
                s = int(secs % 60)
                return f"{h:02d}:{m:02d}:{s:02d}"
        except Exception as e:
            print(e)
            pass
        return ""

    @staticmethod
    def _duration_str_to_seconds(duration_str):
        if not duration_str:
            return 0
        try:
            parts = list(map(int, duration_str.split(':')))
            while len(parts) < 3:
                parts.insert(0, 0)
            h, m, s = parts
            return h * 3600 + m * 60 + s
        except Exception as e:
            print(e)
            return 0

    @staticmethod
    def normaliser_langue(lang: str | None) -> str:
        if not lang:
            return "Pas défini"

        lang = lang.lower().strip()

        # Mapping noms/codes ISO 639-1 et 639-2 (2/3 lettres), anglais/français, vers label français
        mapping = {
            # Français
            "fr": "Français", "fre": "Français", "fra": "Français", "français": "Français", "francais": "Français",
            "french": "Français",
            # Anglais
            "en": "Anglais", "eng": "Anglais", "anglais": "Anglais", "english": "Anglais",
            # Espagnol
            "es": "Espagnol", "esp": "Espagnol", "spa": "Espagnol", "espagnol": "Espagnol", "español": "Espagnol",
            "spanish": "Espagnol",
            # Allemand
            "de": "Allemand", "ger": "Allemand", "deu": "Allemand", "allemand": "Allemand", "german": "Allemand",
            # Italien
            "it": "Italien", "ita": "Italien", "italien": "Italien", "italian": "Italien",
            # Portugais
            "pt": "Portugais", "por": "Portugais", "portugais": "Portugais", "portuguese": "Portugais",
            # Russe
            "ru": "Russe", "rus": "Russe", "russe": "Russe", "russian": "Russe",
            # Chinois
            "zh": "Chinois", "chi": "Chinois", "zho": "Chinois", "chinois": "Chinois", "chinese": "Chinois",
            # Japonais
            "ja": "Japonais", "jpn": "Japonais", "japonais": "Japonais", "japanese": "Japonais",
            # Coréen
            "ko": "Coréen", "kor": "Coréen", "coréen": "Coréen", "korean": "Coréen",
            # Arabe
            "ar": "Arabe", "ara": "Arabe", "arabe": "Arabe", "arabic": "Arabe",
        }

        # Si on a directement un label exact (ex: "Français"), on retourne la version capitalisée correcte
        labels_acceptes = {
            "français": "Français",
            "anglais": "Anglais",
            "espagnol": "Espagnol",
            "allemand": "Allemand",
            "italien": "Italien",
            "portugais": "Portugais",
            "russe": "Russe",
            "chinois": "Chinois",
            "japonais": "Japonais",
            "coréen": "Coréen",
            "arabe": "Arabe"
        }

        # Normalisation directe si label reçu
        if lang in labels_acceptes:
            return labels_acceptes[lang]

        # Sinon chercher dans le mapping
        if lang in mapping:
            return mapping[lang]

        # On peut aussi gérer certains cas courants où mutagen ou ffprobe renvoient None ou ""
        if lang in ("und", "undefined", ""):
            return "Pas défini"

        # Si aucune correspondance : retourner tel quel (capitalisé) ou "Pas défini"
        return lang.capitalize() if lang.isalpha() else "Pas défini"

    @staticmethod
    def extract_audio_languages(metadata_json):
        if not metadata_json:
            return []
        try:
            meta = json.loads(metadata_json)
            streams = meta.get("ffprobe", {}).get("streams", [])
            audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
            langs = []
            for stream in audio_streams:
                tags = stream.get("tags", {})
                lang = tags.get("language") or tags.get("LANGUAGE")
                norm = ItemsFactory.normaliser_langue(lang)
                if norm and norm not in langs:
                    langs.append(norm)
            return langs
        except Exception as e:
            print(e)
            return []

    @staticmethod
    def extract_subtitle_languages(metadata_json):
        if not metadata_json:
            return []
        try:
            meta = json.loads(metadata_json)
            streams = meta.get("ffprobe", {}).get("streams", [])
            subtitle_streams = [s for s in streams if s.get("codec_type") in ("subtitle", "text")]
            langs = []
            for stream in subtitle_streams:
                tags = stream.get("tags", {})
                lang = tags.get("language") or tags.get("LANGUAGE")
                norm = ItemsFactory.normaliser_langue(lang)
                if norm and norm not in langs:
                    langs.append(norm)
            return langs
        except Exception as e:
            print(e)
            return []