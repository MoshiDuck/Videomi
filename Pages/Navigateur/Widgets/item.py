# Todo : item.py
import json
import os
import platform
import subprocess

import pyrebase
import yaml
from PyQt6.QtCore import Qt, pyqtSignal, QSize, QObject, QThread
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import (
    QHBoxLayout, QVBoxLayout, QLabel, QFrame, QProgressBar
)

from Core.Language.i18n import get_text
from Core.logger_config import logger
from Core.settings import BASE_DIR
from Pages.Auth.firebase_auth import FirebaseAuth
from Service.py1FichierClient import FichierClient
from Widgets.defilement_label import DefilementLabel
from Widgets.icon_perso import IconPerso


class DownloadThread(QThread):
    progress_updated = pyqtSignal(int)
    finished = pyqtSignal(bool, str, str, str, str)
    error = pyqtSignal(str)
    download_complete = pyqtSignal(str, str, str)

    def __init__(self, client_1fichier, file_link, local_path, category, title):
        super().__init__()
        self.client_1fichier = client_1fichier
        self.file_link = file_link
        self.local_path = local_path
        self.category = category
        self.title = title
        self._is_running = True

    def run(self):
        try:
            success = self.client_1fichier.download_file(
                self.file_link,
                self.local_path,
                progress_callback=self.progress_updated.emit
            )
            self.finished.emit(success, self.file_link, self.local_path, self.category, self.title)
            if success:
                # Émettre le signal de completion pour ouverture automatique
                self.download_complete.emit(self.file_link, self.local_path, self.category)
        except Exception as e:
            logger.error(f"Download error: {str(e)}")
            self.error.emit(str(e))

    def stop(self):
        self._is_running = False


class ClickableLabel(QLabel):
    clicked = pyqtSignal()

    def mousePressEvent(self, event):
        self.clicked.emit()
        super().mousePressEvent(event)


class ItemWidget(QFrame):
    _scaled_cache = {}
    delete_requested = pyqtSignal(str)
    download_requested = pyqtSignal(str)

    def __init__(
            self,
            switch_to_lecteur,
            client_1fichier: FichierClient,
            image_path: str,
            title: str,
            duration: str,
            width: int,
            category: str,
            audio_languages: list,
            subtitle_languages: list,
            file_link: str,
            mode="grid",
            local_path: str = ""
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
        self.local_path = local_path
        self.progress_bar = None

        # Créer les icônes
        self.download_icon = IconPerso(
            icon_only_name="fa5s.download",
            color="white",
            flash_color=True,
            icon_size=QSize(16, 16)
        )

        self.delete_icon = IconPerso(
            icon_only_name="fa5s.trash",
            color="white",
            flash_color=True,
            icon_size=QSize(16, 16)
        )

        # Connecter les icônes
        self.download_icon.clicked.connect(self.handle_download)
        self.delete_icon.clicked.connect(self.handle_delete)

        if self.local_path and os.path.exists(self.local_path):
            self.download_icon.hide()
        else:
            self.download_icon.show()

        self.init_ui(image_path, title, duration)

    def handle_delete(self):
        self.delete_requested.emit(self.file_link)

    def handle_download(self):
        self.download_requested.emit(self.file_link)

    def on_image_clicked(self):
        try:
            force_download_categories = {"Documents", "Images", "Archives", "executables"}

            if self.local_path and os.path.exists(self.local_path):
                logger.debug(f"Fichier local trouvé : {self.local_path}")

                if self.category in {"Videos", "Musiques"}:
                    logger.debug(f"Ouverture dans le lecteur MPV : {self.local_path}")
                    if self.switch_to_lecteur:
                        self.switch_to_lecteur([self.local_path])
                    else:
                        logger.warning(get_text("nav_labels.item_texts.switch_to_lecteur_undefined"))
                    return
                else:
                    logger.debug(f"Ouverture avec application par défaut : {self.local_path}")
                    self.open_file_with_default_application(self.local_path)
                    return

            if not self.file_link:
                logger.warning(get_text("nav_labels.item_texts.no_file_link"))
                return

            logger.debug(f"Tentative d'ouverture depuis : {self.file_link}")

            # Pour les catégories nécessitant un téléchargement automatique
            if self.category in force_download_categories:
                logger.debug(f"Téléchargement automatique pour {self.category}")
                self.handle_download()
            else:
                if self.category in {"Videos", "Musiques"}:
                    dl_url = self.get_direct_download_url(inline=True)
                    if not dl_url:
                        logger.warning(get_text("nav_labels.item_texts.direct_link_failed"))
                        return

                    logger.debug(f"Lecture via lecteur avec URL : {dl_url}")
                    if self.switch_to_lecteur:
                        self.switch_to_lecteur([dl_url])
                    else:
                        logger.warning(get_text("nav_labels.item_texts.switch_to_lecteur_undefined"))
                else:
                    # Pour les autres catégories, téléchargement normal
                    self.handle_download()

        except Exception as e:
            logger.exception(f"{get_text('nav_labels.item_texts.image_click_error')} : {e}")

    @staticmethod
    def _is_download_required_category(category):
        return category in {"Documents", "Images", "Archives", "Applications"}

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
                logger.error(get_text("nav_labels.item_texts.missing_client_or_link"))
                return None

            clean_link = self.clean_file_link(self.file_link)

            logger.debug(get_text("nav_labels.item_texts.getting_direct_link"))

            options = {
                'inline': int(inline),
                'cdn': int(cdn),
                'restrict_ip': int(restrict_ip),
                'no_ssl': int(no_ssl),
            }

            download_url = self.client_1fichier.get_download_link(clean_link, **options)
            logger.debug(f"{get_text('nav_labels.item_texts.direct_link_retrieved')} : {download_url}")
            return download_url
        except Exception as e:
            logger.warning(f"{get_text('nav_labels.item_texts.direct_link_failed')} : {e}")
            return None

    @staticmethod
    def _download_from_direct_url(url: str, local_path: str) -> bool:
        import requests
        try:
            with requests.get(url, stream=True, timeout=(5, None)) as r:
                r.raise_for_status()

                with open(local_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
            return True
        except Exception as e:
            logger.error(f"{get_text('nav_labels.item_texts.direct_download_error')} : {e}")
            return False

    @staticmethod
    def _download_with_resume(url: str, local_path: str) -> bool:
        import requests
        temp_path = local_path + '.part'
        headers = {}
        mode = 'wb'

        if os.path.exists(temp_path):
            existing = os.path.getsize(temp_path)
            headers['Range'] = f'bytes={existing}-'
            mode = 'ab'
            logger.info(
                f"{get_text('nav_labels.item_texts.resume_from')} {existing} {get_text('nav_labels.item_texts.bytes')}")

        try:
            with requests.get(url, stream=True, headers=headers, timeout=(5, None)) as r:
                r.raise_for_status()
                with open(temp_path, mode) as f:
                    for chunk in r.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            f.write(chunk)
            os.rename(temp_path, local_path)
            return True
        except Exception as e:
            logger.error(f"{get_text('nav_labels.item_texts.resume_download_error')} : {e}")
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
            logger.debug(
                f"{get_text('nav_labels.item_texts.file_size_to_open')} : {os.path.getsize(file_path)} {get_text('nav_labels.item_texts.bytes')}")
            if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
                logger.error(get_text("nav_labels.item_texts.file_not_exist_or_empty"))
                return

            ext = os.path.splitext(file_path)[1].lower()

            if ext == ".exe" and platform.system() == "Windows":
                logger.debug(get_text("nav_labels.item_texts.direct_execute_exe"))
                subprocess.Popen([file_path], shell=True)
            elif platform.system() == "Windows":
                os.startfile(file_path)
            elif platform.system() == "Darwin":
                subprocess.run(["open", file_path], check=False)
            else:
                subprocess.run(["xdg-open", file_path], check=False)
        except Exception as e:
            logger.exception(f"{get_text('nav_labels.item_texts.file_open_error')} : {e}")

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

            # Layout pour durée + icônes (en list)
            duration_layout = QHBoxLayout()
            duration_layout.setContentsMargins(0, 0, 0, 0)
            duration_layout.setSpacing(5)

            # Télécharger à gauche, durée au centre, supprimer à droite
            duration_layout.addWidget(self.download_icon)
            self.duration_label = QLabel(duration)
            self.duration_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.duration_label.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
            duration_layout.addWidget(self.duration_label)
            duration_layout.addWidget(self.delete_icon)

            main_layout.addLayout(duration_layout)

        else:
            self.setObjectName("itemGridCard")
            main_layout = QVBoxLayout(self)
            main_layout.setContentsMargins(0, 0, 0, 0)
            main_layout.setSpacing(0)

            self.load_pixmap(image_path)

            # Ajouter la barre de progression sous l'image
            self.progress_bar = QProgressBar()
            self.progress_bar.setVisible(False)
            self.progress_bar.setFixedHeight(10)
            self.progress_bar.setTextVisible(True)
            self.progress_bar.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.progress_bar.setStyleSheet("""
                QProgressBar {
                    border: 1px solid #444;
                    background-color: #2A2A2A;
                    border-radius: 3px;
                    text-align: center;
                    font-size: 10px;
                    color: white;
                }
                QProgressBar::chunk {
                    background-color: #4CAF50;
                    border-radius: 3px;
                }
            """)

            self.title_label = DefilementLabel(title)
            self.title_label.setFixedHeight(20)
            self.title_label.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

            # Layout pour durée + icônes (en grid)
            duration_layout = QHBoxLayout()
            duration_layout.setContentsMargins(0, 0, 0, 0)
            duration_layout.setSpacing(5)

            # Télécharger à gauche, durée au centre, supprimer à droite
            duration_layout.addWidget(self.download_icon)
            self.duration_label = QLabel(duration)
            self.duration_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.duration_label.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
            duration_layout.addWidget(self.duration_label, 1)
            duration_layout.addWidget(self.delete_icon)

            main_layout.addWidget(self.image_label)
            main_layout.addWidget(self.progress_bar)  # Barre de progression sous l'image
            main_layout.addWidget(self.title_label)
            main_layout.addLayout(duration_layout)

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
            self.setFixedSize(scaled.width(), scaled.height() + 40 + 6)  # +6 pour la barre de progression

    def resize_image(self, width):
        if self.image_label.width() == width:
            return
        self._update_scaled(width)

    def show_progress(self, visible=True):
        """Affiche ou masque la barre de progression"""
        if self.progress_bar:
            self.progress_bar.setVisible(visible)
            if visible:
                self.progress_bar.setRange(0, 100)
                self.progress_bar.setValue(0)

    def update_progress(self, percentage):
        """Met à jour la barre de progression avec un pourcentage"""
        if self.progress_bar:
            self.progress_bar.setValue(percentage)
            self.progress_bar.setFormat(f"{percentage}%")
            self.progress_bar.setVisible(True)


class ItemsFactory(QObject):
    data_changed = pyqtSignal()
    download_progress = pyqtSignal(str, int)
    download_finished = pyqtSignal(str, str)

    def __init__(self, switch_to_lecteur, db_manager, client_1fichier: FichierClient, firebase_auth: FirebaseAuth):
        super().__init__()
        self.switch_to_lecteur = switch_to_lecteur
        self.db_manager = db_manager
        self.client_1fichier = client_1fichier
        self.firebase_auth = firebase_auth
        self.items_data = []
        self.download_threads = {}  # Pour garder une référence aux threads de téléchargement
        self.item_widgets = {}  # Pour garder une référence aux widgets par file_link
        self.auto_open_files = {}  # Pour suivre les fichiers à ouvrir après téléchargement

        # Initialisation Firebase
        with open(BASE_DIR / 'Config/config.yaml', 'r') as f:
            cfg = yaml.safe_load(f)
        firebase = pyrebase.initialize_app(cfg['firebase'])
        user = firebase.auth().sign_in_with_email_and_password(
            cfg.get('email', 'weck20pro@gmail.com'),
            cfg.get('password', 'Azerty')
        )
        self.db = firebase.database()
        self.token = user['idToken']
        self.uid = user['localId']
        self.refresh_token = user['refreshToken']
        self.auth = firebase.auth()

        self.load_items_data()

    def _ensure_token(self):
        """Rafraîchit le token Firebase si nécessaire"""
        try:
            new_user = self.auth.refresh(self.refresh_token)
            self.token = new_user['idToken']
            self.refresh_token = new_user['refreshToken']
        except Exception as e:
            logger.exception(f"{get_text('nav_labels.item_texts.unable_refresh_token')} : {e}")

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
            local_path = data.get("local_path") or ""

            self.items_data.append({
                "category": category,
                "title": title,
                "duration_str": duration_str,
                "duration_sec": duration_sec,
                "thumbnail_path": thumbnail,
                "audio_languages": audio_langs,
                "subtitle_languages": subtitle_langs,
                "file_link": file_link,
                "local_path": local_path
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
                mode,
                local_path=item.get("local_path", "")
            )
            # Connecter les signaux de suppression et téléchargement
            widget.delete_requested.connect(self.handle_item_delete)
            widget.download_requested.connect(self.handle_item_download)

            # Garder une référence au widget par file_link
            self.item_widgets[item["file_link"]] = widget

            widgets.append(widget)
        return widgets

    def handle_item_delete(self, file_link):
        """Supprime un item de Firestore et de la base de données locale"""
        try:
            # Trouver l'item correspondant au file_link
            item_to_delete = None
            for item in self.items_data:
                if item["file_link"] == file_link:
                    item_to_delete = item
                    break

            if not item_to_delete:
                logger.warning(f"{get_text('nav_labels.item_texts.item_not_found')} {file_link}")
                return

            # Supprimer de Firestore
            self._ensure_firebase_token()

            # Obtenir l'UID de l'utilisateur
            uid = self.firebase_auth.get_uid()
            if not uid:
                logger.warning(get_text("nav_labels.item_texts.unable_get_uid"))
                return

            # Sanitize les clés pour Firebase
            safe_category = self._sanitize_for_firebase_key(item_to_delete["category"])
            safe_title = self._sanitize_for_firebase_key(item_to_delete["title"])

            # Référence au document dans Firebase
            ref = self.firebase_auth.firebase.database().child('users').child(uid).child(safe_category).child(
                safe_title)

            # Obtenir le token
            token = self.firebase_auth.obtenir_token()
            if not token:
                logger.warning(get_text("nav_labels.item_texts.unable_get_token"))
                return

            # Supprimer de Firebase
            ref.remove(token)

            # Supprimer de la base de données locale
            self.db_manager.delete_file(item_to_delete["category"], item_to_delete["title"])

            # Recharger les données
            self.load_items_data()
            self.data_changed.emit()

            logger.info(f"{get_text('nav_labels.item_texts.item_deleted')} {item_to_delete['title']}")

        except Exception as e:
            logger.exception(f"{get_text('nav_labels.item_texts.delete_error')} : {e}")

    def _ensure_firebase_token(self):
        """Rafraîchit le token Firebase si nécessaire"""
        try:
            # Vérifie si l'utilisateur est connecté et rafraîchit le token si nécessaire
            if not self.firebase_auth.est_connecte():
                logger.warning(get_text("nav_labels.item_texts.user_not_connected"))
                return False
            return True
        except Exception as e:
            logger.exception(f"{get_text('nav_labels.item_texts.unable_check_connection')} : {e}")
            return False

    @staticmethod
    def _sanitize_for_firebase_key(key: str) -> str:
        """Nettoie une chaîne pour être utilisée comme clé Firebase"""
        import re
        if not key:
            return "untitled"
        # Remplace les caractères non autorisés par des underscores
        key = re.sub(r'[.#$/\[\]]', '_', key)
        return key

    @staticmethod
    def open_file(file_path):
        """Ouvre un fichier avec l'application par défaut"""
        ItemWidget.open_file_with_default_application(file_path)

    def handle_item_download(self, file_link, open_after_download=False):
        """Lance le téléchargement d'un fichier dans un thread séparé"""
        try:
            # Trouver l'item correspondant au file_link
            item_to_download = None
            for item in self.items_data:
                if item["file_link"] == file_link:
                    item_to_download = item
                    break

            if not item_to_download:
                logger.warning(f"{get_text('nav_labels.item_texts.item_not_found')} {file_link}")
                return

            category = item_to_download["category"]
            title = item_to_download["title"]

            # Vérifier si le fichier est déjà téléchargé
            local_data = self.db_manager.fetch_all()
            key = (category, title)

            if key in local_data:
                local_entry = local_data[key]
                local_path = local_entry.get("local_path")

                # Si le fichier existe déjà localement, l'ouvrir
                if local_path and os.path.exists(local_path):
                    logger.info(
                        f"{get_text('nav_labels.item_texts.file_already_exists')} {title} {get_text('nav_labels.item_texts.at')} {local_path}")
                    self.open_file(local_path)
                    return

                # Récupérer l'extension depuis la base de données
                file_extension = local_entry.get("file_extension", "")
            else:
                # Si l'item n'est pas dans la base locale, on ne peut pas télécharger
                logger.warning(f"{get_text('nav_labels.item_texts.item_not_in_db')} {title}")
                return

            # Construire le chemin de destination
            base_dir = os.path.join(os.getcwd(), "Cache", "Downloads", category)
            os.makedirs(base_dir, exist_ok=True)

            # Nettoyer le titre pour en faire un nom de fichier valide
            safe_title = self._sanitize_filename(title)

            # Utiliser l'extension stockée dans la base de données
            filename = safe_title + file_extension
            local_path = os.path.join(base_dir, filename)

            # Vérifier si un téléchargement est déjà en cours pour ce fichier
            if file_link in self.download_threads:
                logger.info(f"{get_text('nav_labels.item_texts.download_already_in_progress')} {file_link}")
                return

            # Afficher la barre de progression
            if file_link in self.item_widgets:
                self.item_widgets[file_link].show_progress(True)

            # Créer et lancer le thread de téléchargement
            download_thread = DownloadThread(
                self.client_1fichier,
                file_link,
                local_path,
                category,
                title
            )
            download_thread.progress_updated.connect(
                lambda percentage: self.update_item_progress(file_link, percentage)
            )
            download_thread.finished.connect(self.on_download_finished)
            download_thread.error.connect(
                lambda error: logger.error(f"{get_text('nav_labels.item_texts.download_error')} {file_link} : {error}")
            )

            # Si c'est un téléchargement avec ouverture automatique, connecter le signal
            if open_after_download:
                download_thread.download_complete.connect(
                    lambda file_link, local_path, category: self.open_file(local_path)
                )

            self.download_threads[file_link] = download_thread
            download_thread.start()

        except Exception as e:
            logger.exception(f"{get_text('nav_labels.item_texts.download_start_error')} : {e}")

    def update_item_progress(self, file_link, percentage):
        """Met à jour la barre de progression d'un item spécifique"""
        if file_link in self.item_widgets:
            self.item_widgets[file_link].update_progress(percentage)

    def on_download_finished(self, success, file_link, local_path, category, title):
        """Gère la fin du téléchargement"""
        try:
            # Nettoyer la référence au thread
            if file_link in self.download_threads:
                del self.download_threads[file_link]

            # Masquer la barre de progression
            if file_link in self.item_widgets:
                self.item_widgets[file_link].show_progress(False)

            if success:
                # Mettre à jour la base de données locale avec le local_path
                self.db_manager.update_local_path(category, title, local_path)

                # Mettre à jour Firebase avec le chemin local
                self._update_firebase_local_path(category, title, local_path)

                logger.info(f"{get_text('nav_labels.item_texts.download_success')} {local_path}")
                self.download_finished.emit(file_link, local_path)
                self.data_changed.emit()

                # Vérifier si ce fichier doit être ouvert automatiquement
                force_open_categories = {"Documents", "Images", "Archives", "executables"}
                if category in force_open_categories:
                    self.open_file(local_path)
            else:
                logger.error(f"{get_text('nav_labels.item_texts.download_failed')} {file_link}")

        except Exception as e:
            logger.exception(f"{get_text('nav_labels.item_texts.post_download_error')} : {e}")

    @staticmethod
    def _sanitize_filename(filename):
        """Nettoie le nom de fichier pour qu'il soit valide sur tous les systèmes de fichiers"""
        import re
        # Remplace les caractères non autorisés par des underscores
        return re.sub(r'[<>:"/\\|?*]', '_', filename)

    def _update_firebase_local_path(self, category, title, local_path):
        """Met à jour le chemin local dans Firebase"""
        try:
            self._ensure_firebase_token()

            # Obtenir l'UID de l'utilisateur
            uid = self.firebase_auth.get_uid()
            if not uid:
                logger.warning(get_text("nav_labels.item_texts.unable_get_uid"))
                return False

            # Sanitize les clés pour Firebase
            safe_category = self._sanitize_for_firebase_key(category)
            safe_title = self._sanitize_for_firebase_key(title)

            # Référence au document dans Firebase
            ref = self.firebase_auth.firebase.database().child('users').child(uid).child(safe_category).child(
                safe_title)

            # Obtenir le token
            token = self.firebase_auth.obtenir_token()
            if not token:
                logger.warning(get_text("nav_labels.item_texts.unable_get_token"))
                return False

            # Mettre à jour uniquement le champ local_path
            ref.update({'local_path': local_path}, token)
            logger.info(
                f"{get_text('nav_labels.item_texts.local_path_updated')} {local_path} {get_text('nav_labels.item_texts.in_firebase')}")
            return True

        except Exception as e:
            logger.error(f"{get_text('nav_labels.item_texts.firebase_update_error')} : {e}")
            return False

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
            logger.error(f"Error extracting duration: {e}")
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
            logger.error(f"Error converting duration to seconds: {e}")
            return 0

    @staticmethod
    def normaliser_langue(lang: str | None) -> str:
        if not lang:
            return get_text("nav_labels.item_texts.undefined")

        lang = lang.lower().strip()

        # Mapping noms/codes ISO 639-1 et 639-2 (2/3 lettres), anglais/français, vers label français
        mapping = {
            # Français
            "fr": get_text("nav_labels.item_texts.french"),
            "fre": get_text("nav_labels.item_texts.french"),
            "fra": get_text("nav_labels.item_texts.french"),
            "français": get_text("nav_labels.item_texts.french"),
            "francais": get_text("nav_labels.item_texts.french"),
            "french": get_text("nav_labels.item_texts.french"),
            # Anglais
            "en": get_text("nav_labels.item_texts.english"),
            "eng": get_text("nav_labels.item_texts.english"),
            "anglais": get_text("nav_labels.item_texts.english"),
            "english": get_text("nav_labels.item_texts.english"),
            # Espagnol
            "es": get_text("nav_labels.item_texts.spanish"),
            "esp": get_text("nav_labels.item_texts.spanish"),
            "spa": get_text("nav_labels.item_texts.spanish"),
            "espagnol": get_text("nav_labels.item_texts.spanish"),
            "español": get_text("nav_labels.item_texts.spanish"),
            "spanish": get_text("nav_labels.item_texts.spanish"),
            # Allemand
            "de": get_text("nav_labels.item_texts.german"),
            "ger": get_text("nav_labels.item_texts.german"),
            "deu": get_text("nav_labels.item_texts.german"),
            "allemand": get_text("nav_labels.item_texts.german"),
            "german": get_text("nav_labels.item_texts.german"),
            # Italien
            "it": get_text("nav_labels.item_texts.italian"),
            "ita": get_text("nav_labels.item_texts.italian"),
            "italien": get_text("nav_labels.item_texts.italian"),
            "italian": get_text("nav_labels.item_texts.italian"),
            # Portugais
            "pt": get_text("nav_labels.item_texts.portuguese"),
            "por": get_text("nav_labels.item_texts.portuguese"),
            "portugais": get_text("nav_labels.item_texts.portuguese"),
            "portuguese": get_text("nav_labels.item_texts.portuguese"),
            # Russe
            "ru": get_text("nav_labels.item_texts.russian"),
            "rus": get_text("nav_labels.item_texts.russian"),
            "russe": get_text("nav_labels.item_texts.russian"),
            "russian": get_text("nav_labels.item_texts.russian"),
            # Chinois
            "zh": get_text("nav_labels.item_texts.chinese"),
            "chi": get_text("nav_labels.item_texts.chinese"),
            "zho": get_text("nav_labels.item_texts.chinese"),
            "chinois": get_text("nav_labels.item_texts.chinese"),
            "chinese": get_text("nav_labels.item_texts.chinese"),
            # Japonais
            "ja": get_text("nav_labels.item_texts.japanese"),
            "jpn": get_text("nav_labels.item_texts.japanese"),
            "japonais": get_text("nav_labels.item_texts.japanese"),
            "japanese": get_text("nav_labels.item_texts.japanese"),
            # Coréen
            "ko": get_text("nav_labels.item_texts.korean"),
            "kor": get_text("nav_labels.item_texts.korean"),
            "coréen": get_text("nav_labels.item_texts.korean"),
            "korean": get_text("nav_labels.item_texts.korean"),
            # Arabe
            "ar": get_text("nav_labels.item_texts.arabic"),
            "ara": get_text("nav_labels.item_texts.arabic"),
            "arabe": get_text("nav_labels.item_texts.arabic"),
            "arabic": get_text("nav_labels.item_texts.arabic"),
        }

        # Si on a directement un label exact (ex: "Français"), on retourne la version capitalisée correcte
        labels_acceptes = {
            "français": get_text("nav_labels.item_texts.french"),
            "anglais": get_text("nav_labels.item_texts.english"),
            "espagnol": get_text("nav_labels.item_texts.spanish"),
            "allemand": get_text("nav_labels.item_texts.german"),
            "italien": get_text("nav_labels.item_texts.italian"),
            "portugais": get_text("nav_labels.item_texts.portuguese"),
            "russe": get_text("nav_labels.item_texts.russian"),
            "chinois": get_text("nav_labels.item_texts.chinese"),
            "japonais": get_text("nav_labels.item_texts.japanese"),
            "coréen": get_text("nav_labels.item_texts.korean"),
            "arabe": get_text("nav_labels.item_texts.arabic")
        }

        # Normalisation directe si label reçu
        if lang in labels_acceptes:
            return labels_acceptes[lang]

        # Sinon chercher dans le mapping
        if lang in mapping:
            return mapping[lang]

        # On peut aussi gérer certains cas courants où mutagen ou ffprobe renvoient None ou ""
        if lang in ("und", "undefined", ""):
            return get_text("nav_labels.item_texts.undefined")

        # Si aucune correspondance : retourner tel quel (capitalisé) ou "Pas défini"
        return lang.capitalize() if lang.isalpha() else get_text("nav_labels.item_texts.undefined")

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
            logger.error(f"Error extracting audio languages: {e}")
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
            logger.error(f"Error extracting subtitle languages: {e}")
            return []