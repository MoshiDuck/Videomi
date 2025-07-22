import json

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import (
    QWidget, QHBoxLayout, QVBoxLayout, QScrollArea,
    QStackedWidget, QGridLayout, QLabel, QFrame
)

from Pages.Navigateur.Bar.bar_nav import BarNav
from Pages.Navigateur.Bar_Sec.bar_sec_nav import BarSecNav
from Widgets.defilement_label import DefilementLabel


class ItemWidget(QFrame):
    _scaled_cache = {}

    def __init__(self, image_path: str, title: str, duration: str, width: int, category: str, audio_languages: list, subtitle_languages: list, mode="grid"):
        super().__init__()
        self.title_label = None
        self.duration_label = None
        self.image_label = QLabel()
        self.min_width = width
        self.category = category
        self.image_path = image_path
        self.original_pixmap = None
        self.mode = mode
        self.audio_languages = audio_languages
        self.subtitle_languages = subtitle_languages
        self.init_ui(image_path, title, duration)

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
    def __init__(self, db_manager):
        self.db_manager = db_manager
        self.items_data = []
        self._load_items_data()

    def _load_items_data(self):
        self.items_data.clear()
        raw = self.db_manager.fetch_all()
        for (category, title), data in raw.items():
            metadata = data.get("metadata_json")
            duration_str = self.extract_duration(metadata)
            duration_sec = self._duration_str_to_seconds(duration_str)
            thumbnail = data.get("thumbnail_path") or ""
            audio_langs = self.extract_audio_languages(metadata)
            subtitle_langs = self.extract_subtitle_languages(metadata)

            self.items_data.append({
                "category": category,
                "title": title,
                "duration_str": duration_str,
                "duration_sec": duration_sec,
                "thumbnail_path": thumbnail,
                "audio_languages": audio_langs,
                "subtitle_languages": subtitle_langs
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
                item["thumbnail_path"],
                item["title"],
                item["duration_str"],
                min_width,
                item["category"],
                audio_languages=item.get("audio_languages", []),
                subtitle_languages=item.get("subtitle_languages", []),
                mode=mode
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
                if lang and lang not in langs:
                    langs.append(lang)
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
                if lang and lang not in langs:
                    langs.append(lang)
            return langs
        except Exception as e:
            print(e)
            return []


class Catalogue(QWidget):
    def __init__(self, db_manager, nav_bar: BarNav, nav_sec_bar: BarSecNav):
        super().__init__()
        self.db_manager = db_manager
        self.nav_bar = nav_bar
        self.nav_sec_bar = nav_sec_bar

        self.items_factory = ItemsFactory(self.db_manager)
        self.item_widgets = []
        self.current_category = "Videos"
        self.view_mode = 'grid'
        self.sort_ascending = True
        self.sort_key = lambda item: item['title'].lower()
        self.sort_reverse = False

        # Conteneurs liste et grille
        self.list_container = QWidget()
        self.list_layout = QVBoxLayout(self.list_container)
        self.list_layout.setSpacing(10)
        self.list_layout.setContentsMargins(10, 10, 10, 10)
        self.list_layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        self.grid_container = QWidget()
        self.grid_layout = QGridLayout(self.grid_container)
        self.grid_layout.setContentsMargins(10, 10, 10, 10)
        self.grid_layout.setHorizontalSpacing(15)
        self.grid_layout.setVerticalSpacing(15)
        self.grid_layout.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)

        self.mode_stack = QStackedWidget()
        self.mode_stack.addWidget(self.list_container)
        self.mode_stack.addWidget(self.grid_container)
        self.mode_stack.setCurrentWidget(self.grid_container)

        self.scroll = QScrollArea(self)
        self.scroll.setWidgetResizable(True)
        self.scroll.setWidget(self.mode_stack)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)

        main_layout = QHBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)
        main_layout.addWidget(self.nav_bar)
        main_layout.addWidget(self.scroll, stretch=1)
        main_layout.addWidget(self.nav_sec_bar)
        self.setLayout(main_layout)

        # Signaux
        self.nav_bar.icon_grid_list.clicked.connect(self.toggle_grid_list)
        self.nav_bar.icon_sortAZ.clicked.connect(self.toggle_sort_az)
        self.nav_bar.icon_sortTime.clicked.connect(self.toggle_sort_time)

        self.nav_sec_bar.recherche_bar.on_text_changed.connect(self.apply_title_filter)
        self.nav_sec_bar.card.selection_changed.connect(self.toggle_category)
        self.nav_sec_bar.slide.valueChanged.connect(self.filter_by_max_duration)
        self.nav_sec_bar.box1.selectionChanged.connect(self.apply_audio_filter)

    def load_items(self):
        if not self.item_widgets:
            self.item_widgets = self.items_factory.create_item_widgets(
                min_width=320,
                mode=self.view_mode,
                sort_key=self.sort_key,
                reverse=self.sort_reverse
            )
            self.configure_slider_range()
            self.configure_box_audio()
        self.apply_audio_filter(self.nav_sec_bar.box1.get_checked_items())
        self.position_items()

    def configure_box_audio(self):
        langs = sorted(
            {lang for item in self.items_factory.items_data for lang in item['audio_languages']}
        )
        self.nav_sec_bar.box1.set_items(langs)

    def apply_audio_filter(self, selected_langs: list[str]):
        # si rien de coché, on affiche tout
        if not selected_langs:
            filtered = self.items_factory.items_data
        else:
            filtered = [
                itm for itm in self.items_factory.items_data
                if any(lang in itm['audio_languages'] for lang in selected_langs)
            ]
        self.item_widgets = self.items_factory.create_item_widgets(
            min_width=320,
            mode=self.view_mode,
            sort_key=self.sort_key,
            reverse=self.sort_reverse,
            filter_func=lambda itm: itm in filtered
        )
        self.position_items()

    def configure_slider_range(self):
        durations = [item['duration_sec'] for item in self.items_factory.items_data if item['duration_sec'] > 0]
        if durations:
            self.nav_sec_bar.slide.set_range(min(durations), max(durations))
            self.nav_sec_bar.slide.set_value(max(durations))

    def apply_title_filter(self, keyword: str):
        self.item_widgets = self.items_factory.create_item_widgets(
            min_width=320,
            mode=self.view_mode,
            sort_key=self.sort_key,
            reverse=self.sort_reverse,
            filter_func=self.items_factory.title_contains_filter(keyword)
        )
        self.position_items()

    def filter_by_max_duration(self, max_duration):
        self.item_widgets = self.items_factory.create_item_widgets(
            min_width=320,
            mode=self.view_mode,
            sort_key=self.sort_key,
            reverse=self.sort_reverse,
            filter_func=lambda itm: itm['duration_sec'] <= max_duration
        )
        self.position_items()

    def toggle_sort_time(self):
        self.sort_ascending = not self.sort_ascending
        self.sort_key = lambda item: item['duration_sec']
        self.sort_reverse = not self.sort_ascending
        self.item_widgets = self.items_factory.create_item_widgets(
            min_width=320,
            mode=self.view_mode,
            sort_key=self.sort_key,
            reverse=self.sort_reverse
        )
        self.position_items()

    def toggle_sort_az(self):
        self.sort_ascending = not self.sort_ascending
        self.sort_key = lambda item: item['title'].lower()
        self.sort_reverse = not self.sort_ascending
        self.item_widgets = self.items_factory.create_item_widgets(
            min_width=320,
            mode=self.view_mode,
            sort_key=self.sort_key,
            reverse=self.sort_reverse
        )
        self.position_items()

    def toggle_grid_list(self):
        self.view_mode = 'list' if self.view_mode == 'grid' else 'grid'
        self.mode_stack.setCurrentWidget(
            self.list_container if self.view_mode == 'list' else self.grid_container
        )
        self.item_widgets = self.items_factory.create_item_widgets(
            min_width=320,
            mode=self.view_mode,
            sort_key=self.sort_key,
            reverse=self.sort_reverse
        )
        self.position_items()

    def toggle_category(self, category_label: str):
        self.current_category = category_label
        self.nav_bar.icon_sortTime.setVisible(category_label in ("Videos", "Musiques"))
        self.position_items()

    def position_items(self):
        self.setUpdatesEnabled(False)
        # vider layouts
        while self.list_layout.count():
            item = self.list_layout.takeAt(0)
            if widget := item.widget():
                widget.setParent(None)
        while self.grid_layout.count():
            item = self.grid_layout.takeAt(0)
            if widget := item.widget():
                widget.setParent(None)

        min_w = 320
        vp = self.scroll.viewport().width()
        sbw = self.scroll.verticalScrollBar().sizeHint().width()
        eff = max(min_w, vp - sbw) if sbw > 0 else vp
        cols = max(1, eff // min_w)
        spacing = self.grid_layout.horizontalSpacing()
        total_spacing = spacing * (cols - 1)
        item_w = (eff - total_spacing) / cols

        # filtrer catégorie
        widgets = [w for w in self.item_widgets if w.category == self.current_category]

        if self.view_mode == 'grid':
            self.grid_container.setFixedWidth(eff)
            row = col = 0
            for w in widgets:
                w.resize_image(int(item_w))
                self.grid_layout.addWidget(w, row, col)
                col += 1
                if col >= cols:
                    col = 0
                    row += 1
        else:
            list_w = min(eff, 200)
            for w in widgets:
                w.resize_image(int(list_w))
                self.list_layout.addWidget(w)

        self.setUpdatesEnabled(True)

    def showEvent(self, ev):
        super().showEvent(ev)
        if not self.item_widgets:
            self.load_items()
        else:
            self.position_items()

    def resizeEvent(self, ev):
        super().resizeEvent(ev)
        if self.item_widgets and self.isVisible():
            self.position_items()
