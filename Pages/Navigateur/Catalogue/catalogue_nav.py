#catalogue_nav.py
import weakref
import yaml
from PyQt6.QtCore import Qt, QThreadPool, QTimer
from PyQt6.QtWidgets import (
    QWidget, QHBoxLayout, QLabel, QSizePolicy,
    QScrollArea, QVBoxLayout, QSpacerItem, QFrame, QGraphicsDropShadowEffect,
    QGridLayout, QPushButton
)
from pyOneFichierClient.OneFichierAPI import FichierClient

from Cache.cache_miniature import CacheMiniature
from Service.manager_firebase import ManagerFirebase
from Widgets.defilement_label import DefilementLabel
from Widgets.label_image import LabelImage
from Widgets.pagination import Pagination
from Widgets.telechargement_image import TelechargementImage

STYLE_SHEET = {
    "card": """
        QFrame {
            background-color: #212121;
            border-radius: 10px;
        }
        QFrame:hover {
            background-color: #2a2a2a;
        }
    """,
    "label_gray_small": "color: #ccc; font-size: 9pt; background-color: transparent;",
}

LANG_MAP = {
    "fr": "Français",
    "en": "Anglais",
    "es": "Espagnol",
    "it": "Italien",
    "de": "Allemand",
    "ja": "Japonais",
    "zh": "Chinois",
    "ko": "Coréen",
    "ru": "Russe"
}

class BaseView(QWidget):
    def __init__(self, client_1fichier, pixmap_cache, threadpool, taille_ecran, layout_type, spacing=15, margin=15, parent=None):
        super().__init__(parent)
        self.client_1fichier = client_1fichier
        self.pixmap_cache = pixmap_cache
        self.threadpool = threadpool
        self.taille_ecran = taille_ecran
        self._current_items = []
        self.pagination = Pagination([], initial_count=24, batch_count=6)

        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll_area.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.scroll_area.verticalScrollBar().valueChanged.connect(self.on_scroll)

        scrollbar_width = self.scroll_area.verticalScrollBar().sizeHint().width()
        self.container = QWidget()
        self.scroll_area.setWidget(self.container)

        if layout_type == 'grid':
            self.layout_container = QGridLayout(self.container)
        else:
            self.layout_container = QVBoxLayout(self.container)

        self.layout_container.setSpacing(spacing)
        self.layout_container.setContentsMargins(margin, margin, margin + scrollbar_width, margin)

        main_layout = QVBoxLayout(self)
        main_layout.addWidget(self.scroll_area)

        self.container.setMinimumWidth(self.scroll_area.viewport().width())
        self.container.setMaximumWidth(self.scroll_area.viewport().width())

    def show_message(self, message: str):
        self.clear()
        label = QLabel(message)
        label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.layout_container.addWidget(label)

    def load_image_async(self, url, label, width, height=None):
        if not url or not hasattr(label, 'current_url'):
            return

        # Vérifier que l'URL n'a pas changé depuis l'appel
        if label.current_url != url:
            return

        weak_label = weakref.ref(label)

        def callback(u, p):
            lbl = weak_label()
            if lbl and getattr(lbl, 'current_url', None) == u and p:
                self._on_image_loaded(u, p, lbl, width, height)

        runnable = TelechargementImage(url, self.client_1fichier, callback)
        self.threadpool.start(runnable)

    def _on_image_loaded(self, url, pixmap, label, width, height=None):
        if pixmap:
            if height:
                scaled = pixmap.scaled(width, height, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
            else:
                scaled = pixmap.scaledToWidth(width, Qt.TransformationMode.SmoothTransformation)
            label.setPixmap(scaled)
            self.pixmap_cache.insert(url, pixmap)

    @staticmethod
    def format_duration(seconds: float) -> str:
        if seconds is None:
            return ""
        seconds = int(seconds)
        m, s = divmod(seconds, 60)
        h, m = divmod(m, 60)
        return f"{h:02}:{m:02}:{s:02}" if h else f"{m:02}:{s:02}"

    def clear(self):
        while self.layout_container.count():
            item = self.layout_container.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()


class GridView(BaseView):
    def __init__(self, client_1fichier, pixmap_cache, threadpool, taille_ecran, parent=None):
        super().__init__(client_1fichier, pixmap_cache, threadpool, taille_ecran, layout_type='grid', parent=parent)

    def display(self, items: dict, reset_pagination=True):
        self._current_items = items
        if reset_pagination:
            self.pagination.reset(list(items.items()))
            self.clear()

        if not self.pagination.has_more():
            return

        items_batch = self.pagination.next_batch(initial=reset_pagination)
        if not items_batch:
            return

        min_item_width = 150
        spacing = self.layout_container.spacing()
        margins = self.layout_container.contentsMargins()
        available_width = self.scroll_area.viewport().width() - margins.left() - margins.right()
        columns = min(6, max(1, available_width // (min_item_width + spacing)))
        item_width = (available_width - spacing * (columns - 1)) // columns

        start_index = self.pagination.current_index - len(items_batch)
        for i, (title, info) in enumerate(items_batch, start=start_index):
            row, col = divmod(i, columns)
            card = self.create_card(title, info, item_width)
            self.layout_container.addWidget(card, row, col)

        spacer = QSpacerItem(0, 0, QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Expanding)
        self.layout_container.addItem(spacer, (self.pagination.current_index // columns) + 1, 0, 1, columns)

    def create_card(self, title, info, width):
        card = QFrame()
        card.setFixedWidth(width)
        card.setStyleSheet(STYLE_SHEET["card"])
        card.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Minimum)
        card.setGraphicsEffect(QGraphicsDropShadowEffect(blurRadius=12, xOffset=0, yOffset=2, color=Qt.GlobalColor.black))

        layout = QVBoxLayout(card)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        layout.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignHCenter)

        img_label = LabelImage()
        img_label.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Minimum)
        url = info.get("thumbnail")

        # Définir l'URL avant toute opération
        img_label.set_current_url(url)

        pix = self.pixmap_cache.get(url, width)
        if pix:
            img_label.setPixmap(pix)
        elif url:
            self.load_image_async(url, img_label, width)
        else:
            img_label.setText("Aucune image")

        layout.addWidget(img_label)

        text_container = QWidget()
        text_layout = QVBoxLayout(text_container)
        text_layout.setContentsMargins(6, 6, 6, 6)

        title_label = DefilementLabel()
        title_label.setText(title)
        text_layout.addWidget(title_label)

        duration = info.get("duration")
        duration_label = QLabel(self.format_duration(duration) if duration else "")
        duration_label.setStyleSheet(STYLE_SHEET["label_gray_small"])
        duration_label.setFixedHeight(20)
        duration_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        text_layout.addWidget(duration_label)

        layout.addWidget(text_container)
        return card

    def on_scroll(self):
        scrollbar = self.scroll_area.verticalScrollBar()
        if scrollbar.value() >= scrollbar.maximum() - 100:
            self.display({}, reset_pagination=False)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        old_w = event.oldSize().width()
        new_w = event.size().width()
        if new_w != old_w:
            QTimer.singleShot(50, lambda: self.display(self._current_items, reset_pagination=False))


class ListView(BaseView):
    def __init__(self, client_1fichier, pixmap_cache, threadpool, taille_ecran, parent=None):
        super().__init__(client_1fichier, pixmap_cache, threadpool, taille_ecran, layout_type='list', parent=parent)

    def display(self, items: dict, reset_pagination=True):
        self._current_items = items
        if reset_pagination:
            self.pagination.reset(list(items.items()))
            self.clear()

        if not self.pagination.has_more():
            return

        items_batch = self.pagination.next_batch(initial=reset_pagination)
        if not items_batch:
            return

        for title, info in items_batch:
            item = self.create_item(title, info)
            self.layout_container.addWidget(item)

        self.layout_container.addStretch()

    def create_item(self, title, info):
        item_widget = QFrame()
        item_widget.setStyleSheet(STYLE_SHEET["card"])
        item_widget.setGraphicsEffect(QGraphicsDropShadowEffect(blurRadius=8, xOffset=0, yOffset=2, color=Qt.GlobalColor.black))

        layout = QHBoxLayout(item_widget)
        layout.setContentsMargins(10, 5, 10, 5)
        layout.setSpacing(15)

        img_label = LabelImage()
        img_label.setFixedSize(160, 90)

        url = info.get("thumbnail")
        # Définir l'URL avant toute opération
        img_label.set_current_url(url)

        pix = self.pixmap_cache.get(url, 160)
        if pix:
            img_label.setPixmap(pix)
        elif url:
            self.load_image_async(url, img_label, 160, 90)
        else:
            img_label.setText("Aucune image")

        layout.addWidget(img_label)

        title_label = DefilementLabel()
        title_label.setText(title)
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        layout.addWidget(title_label)

        duration = info.get("duration")
        duration_label = QLabel(self.format_duration(duration) if duration else "")
        duration_label.setStyleSheet(STYLE_SHEET["label_gray_small"])
        duration_label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        duration_label.setFixedWidth(60)
        layout.addWidget(duration_label)

        return item_widget

    def on_scroll(self):
        scrollbar = self.scroll_area.verticalScrollBar()
        if scrollbar.value() >= scrollbar.maximum() - 100:
            self.display({}, reset_pagination=False)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        old_w = event.oldSize().width()
        new_w = event.size().width()
        if new_w != old_w:
            QTimer.singleShot(50, lambda: self.display(self._current_items, reset_pagination=False))


class Catalogue(QWidget):
    def __init__(self, firebase_auth, taille_ecran, nav_bar, nav_sec_bar):
        super().__init__()

        with open("Config/config.yaml", "r") as f:
            config = yaml.safe_load(f)
        self.api_key = config['onefichier']['api_key']

        self.firebase_auth = firebase_auth
        self.nav_bar = nav_bar
        self.nav_sec_bar = nav_sec_bar

        self.client_1fichier = FichierClient(APIkey=self.api_key, be_nice=True)
        self.pixmap_cache = CacheMiniature()
        self.threadpool = QThreadPool.globalInstance()

        self.current_category = None
        self.current_loader = None
        self.items = {}
        self.sort_asc = True
        self.sort_by_time = False
        self.recherche_texte = ""
        self.duration_threshold = 0
        self.selected_languages = []
        self.selected_subtitles = []
        self.filter_audio_active = True
        self.filter_sub_active = True

        # Vues
        self.grid_view = GridView(self.client_1fichier, self.pixmap_cache, self.threadpool, taille_ecran, parent=self)
        self.list_view = ListView(self.client_1fichier, self.pixmap_cache, self.threadpool, taille_ecran, parent=self)
        self.list_view.hide()

        # Layout principal
        main_layout = QHBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)
        main_layout.addWidget(self.grid_view)
        main_layout.addWidget(self.list_view)


        # Connexions
        self.nav_bar.icon_grid_list.clicked.connect(self.toggle_grid_list)
        self.nav_bar.icon_sortAZ.clicked.connect(self.toggle_sort_direction)
        self.nav_bar.icon_sortTime.clicked.connect(self.toggle_time_direction)

        self.nav_sec_bar.recherche_bar.on_text_changed.connect(self.on_recherche_text_changed)
        self.nav_sec_bar.card.selection_changed.connect(self.on_card_sec_selection_changed_wrapper)

        self.slide = self.nav_sec_bar.slide
        self.slide.valueChanged.connect(self.on_slider_changed)

        self.nav_sec_bar.icon1.clicked.connect(self.toggle_audio_filter)


        self.box1 = self.nav_sec_bar.box1
        self.box1.selectionChanged.connect(self.on_language_changed)

        self.nav_sec_bar.icon2.clicked.connect(self.toggle_sub_filter)

        self.box2 = self.nav_sec_bar.box2
        self.box2.selectionChanged.connect(self.on_subtitle_changed)

        # Chargement initial
        self.load_category("Videos")

    def toggle_audio_filter(self):
        self.filter_audio_active = not self.filter_audio_active
        # Optionnel : changer l’icône pour refléter ON/OFF
        self.apply_display()

    def toggle_sub_filter(self):
        self.filter_sub_active = not self.filter_sub_active
        # Optionnel : idem pour icon2
        self.apply_display()

    def on_slider_changed(self, value):
        self.duration_threshold = value
        self.apply_display()

    def on_recherche_text_changed(self, text):
        self.recherche_texte = text.strip().lower()
        self.apply_display()

    def toggle_grid_list(self):
        if self.grid_view.isVisible():
            self.grid_view.hide()
            self.list_view.show()
        else:
            self.list_view.hide()
            self.grid_view.show()

    def load_category(self, category_label: str):
        if self.current_category == category_label:
            return
        self.current_category = category_label

        if self.current_loader and self.current_loader.isRunning():
            self.current_loader.quit()
            self.current_loader.wait()

        self.grid_view.show_message("Chargement en cours...")
        self.list_view.show_message("")

        self.current_loader = ManagerFirebase(self.firebase_auth, category_label, self)
        self.current_loader.finished.connect(lambda: self._on_data_loaded(self.current_loader))
        self.current_loader.start()

    def _on_data_loaded(self, loader_thread):
        if loader_thread != self.current_loader:
            return
        if loader_thread.error:
            msg = "Aucun fichier trouvé."
            self.grid_view.show_message(msg)
            self.list_view.show_message(msg)
            return

        new_items = loader_thread.items or {}
        if not new_items:
            msg = "Aucun fichier trouvé."
            self.grid_view.show_message(msg)
            self.list_view.show_message(msg)
            return

        self.items = new_items

        # --- Extraction des langues audio uniques + map par vidéo ---
        langues_uniques = set()
        self.item_languages = {}

        for title, meta in self.items.items():
            langs_for_item = []
            for stream in meta.get("ffprobe", {}).get("streams", []):
                if stream.get("codec_type") != "audio":
                    continue
                raw = stream.get("tags", {}).get("language")
                if not raw:
                    continue
                code2 = raw[:2].lower()
                nom = LANG_MAP.get(code2, raw.capitalize())
                langs_for_item.append(nom)
                langues_uniques.add(nom)
            # élimine les doublons
            self.item_languages[title] = sorted(set(langs_for_item))

        if not langues_uniques:
            langues_uniques.add("Inconnue")
            # si aucune vidéo n'a de langue, on met "Inconnue" pour toutes
            for title in self.items:
                self.item_languages[title] = ["Inconnue"]

        # mets à jour ta ComboBox
        all_langs = sorted(langues_uniques)
        self.selected_languages = all_langs.copy()
        self.box1.set_items(all_langs)

        self.item_subtitles = {}
        subtitles_set = set()

        for title, meta in self.items.items():
            subs_for_item = []
            for stream in meta.get("ffprobe", {}).get("streams", []):
                if stream.get("codec_type") != "subtitle":
                    continue
                raw = stream.get("tags", {}).get("language")
                if not raw:
                    continue
                code2 = raw[:2].lower()
                nom = LANG_MAP.get(code2, raw.capitalize())
                subs_for_item.append(nom)
                subtitles_set.add(nom)
            self.item_subtitles[title] = sorted(set(subs_for_item))

        # si aucune sous‑titre trouvée, mettre "Inconnue"
        if not subtitles_set:
            subtitles_set.add("Inconnue")
            for title in self.items:
                self.item_subtitles[title] = ["Inconnue"]

        # mets à jour box2
        all_subs = sorted(subtitles_set)
        self.selected_subtitles = all_subs.copy()
        self.box2.set_items(all_subs)

        # Gestion des durées
        durations = [
            int(v.get("duration", 0)) for v in new_items.values()
            if v.get("duration") is not None
        ]
        if durations:
            self.duration_min = min(durations)
            self.duration_max = max(durations)
        else:
            self.duration_min = 0
            self.duration_max = 0

        self.duration_threshold = self.duration_max
        self.slide.set_range(self.duration_min, self.duration_max)
        self.slide.set_value(self.duration_max)
        self.apply_display()

    def toggle_sort_direction(self):
        self.sort_by_time = False
        self.sort_asc = not self.sort_asc
        self.apply_display()

    def toggle_time_direction(self):
        self.sort_by_time = True
        self.sort_asc = not self.sort_asc
        self.apply_display()

    def on_language_changed(self, selected: list[str]):
        self.selected_languages = selected
        self.apply_display()

    def on_subtitle_changed(self, selected: list[str]):
        self.selected_subtitles = selected
        self.apply_display()

    def apply_display(self):
        # 1) Filtre texte
        if self.recherche_texte:
            filtered = {
                k: v for k, v in self.items.items()
                if self.recherche_texte in k.lower()
            }
        else:
            filtered = dict(self.items)

        # 2) Filtre durée
        if self.slide:
            thr = int(self.duration_threshold)
            filtered = {
                k: v for k, v in filtered.items()
                if v.get("duration") is not None and int(v["duration"]) <= thr
            }

        # 3) Filtre audio (si activé)
        if self.filter_audio_active:
            all_langs = sorted(self.box1.items)
            sel_langs = self.box1.get_checked_items()

            # si on n'a coché aucun → vide ; si on a coché tout → pas de filtrage ;
            # sinon on ne garde que les vidéos dont au moins une langue apparaît
            if not sel_langs:
                filtered = {}
            elif set(sel_langs) != set(all_langs):
                filtered = {
                    title: info for title, info in filtered.items()
                    if any(lang in sel_langs for lang in self.item_languages.get(title, []))
                }

        # 4) Filtre sous‑titres (si activé)
        if self.filter_sub_active:
            all_subs = sorted(self.box2.items)
            sel_subs = self.box2.get_checked_items()

            if not sel_subs:
                filtered = {}
            elif set(sel_subs) != set(all_subs):
                filtered = {
                    title: info for title, info in filtered.items()
                    if any(sub in sel_subs for sub in self.item_subtitles.get(title, []))
                }

        # 5) Tri
        if self.sort_by_time:
            items_to_show = dict(
                sorted(
                    filtered.items(),
                    key=lambda kv: kv[1].get("duration", 0),
                    reverse=not self.sort_asc
                )
            )
        else:
            items_to_show = dict(
                sorted(
                    filtered.items(),
                    key=lambda kv: kv[0].lower(),
                    reverse=not self.sort_asc
                )
            )

        # 6) Affichage
        self.grid_view.display(items_to_show, reset_pagination=True)
        self.list_view.display(items_to_show, reset_pagination=True)

    def on_card_sec_selection_changed_wrapper(self, selected_label: str):
        self.load_category(selected_label)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        old_w = event.oldSize().width()
        new_w = event.size().width()
        if new_w != old_w:
            QTimer.singleShot(50, self._refresh_views)

    def _refresh_views(self):
        for view in (self.grid_view, self.list_view):
            view.taille_ecran = self.size()
            view.container.setFixedWidth(self.size().width() - 15)
        self.apply_display()