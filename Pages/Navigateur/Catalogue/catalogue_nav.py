from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QWidget, QHBoxLayout, QVBoxLayout, QScrollArea,
    QStackedWidget, QGridLayout
)

from Database.db_manager import DatabaseManager
from Pages.Auth.firebase_auth import FirebaseAuth
from Pages.Navigateur.Bar.bar_nav import BarNav
from Pages.Navigateur.Bar_Sec.bar_sec_nav import BarSecNav
from Pages.Navigateur.Widgets.item import ItemsFactory
from Service.py1FichierClient import FichierClient


class Catalogue(QWidget):
    def __init__(self, switch_to_lecteur, db_manager: DatabaseManager, client_1fichier: FichierClient,
                 nav_bar: BarNav, nav_sec_bar: BarSecNav, firebase_auth: FirebaseAuth):
        super().__init__()
        self.switch_to_lecteur = switch_to_lecteur
        self.db_manager = db_manager
        self.nav_bar = nav_bar
        self.nav_sec_bar = nav_sec_bar
        self.firebase_auth = firebase_auth


        self.items_factory = ItemsFactory(self.switch_to_lecteur, self.db_manager, client_1fichier, firebase_auth)
        self.items_factory.data_changed.connect(self.refresh_after_delete)
        self.item_widgets = []
        self.current_category = "Videos"
        self.view_mode = 'grid'
        self.sort_ascending = True
        self.sort_key = lambda item: item['title'].lower()
        self.sort_reverse = False
        self.audio_filter_active = True
        self.sub_filter_active = True
        self.filter_active = False

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

        self.nav_bar.icon_grid_list.clicked.connect(self.toggle_grid_list)
        self.nav_bar.icon_sortAZ.clicked.connect(self.toggle_sort_az)
        self.nav_bar.icon_sortTime.clicked.connect(self.toggle_sort_time)
        self.nav_bar.icon_search.clicked.connect(self.on_toggle_filter)

        self.nav_sec_bar.recherche_bar.on_text_changed.connect(self.apply_all_filters)
        self.nav_sec_bar.card.selection_changed.connect(self.toggle_category)
        self.nav_sec_bar.slide.valueChanged.connect(self.apply_all_filters)

        self.nav_sec_bar.icon1.clicked.connect(self.on_toggle_audio)
        self.nav_sec_bar.box1.selectionChanged.connect(self.apply_all_filters)

        self.nav_sec_bar.icon2.clicked.connect(self.on_toggle_sub)
        self.nav_sec_bar.box2.selectionChanged.connect(self.apply_all_filters)

    def refresh_after_delete(self):
        """Rafraîchit l'affichage après une suppression"""
        self.items_factory.load_items_data()
        self.apply_all_filters()
        self.position_items()

    def on_toggle_filter(self):
        self.filter_active = not self.filter_active
        self.nav_bar.icon_search.setChecked(self.filter_active)
        self.apply_all_filters()

    def load_items(self):
        self.items_factory.load_items_data()
        self.configure_slider_range()
        self.configure_box_audio()
        self.configure_box_sub()

        self.apply_all_filters()
        self.position_items()

    def configure_box_audio(self):
        langs = sorted({
            ItemsFactory.normaliser_langue(lang)
            for item in self.items_factory.items_data
            for lang in item['audio_languages']
        })
        self.nav_sec_bar.box1.set_items(langs)

    def configure_box_sub(self):
        langs = sorted({
            ItemsFactory.normaliser_langue(lang)
            for item in self.items_factory.items_data
            for lang in item['subtitle_languages']
        })
        self.nav_sec_bar.box2.set_items(langs)

    def on_toggle_audio(self):
        self.audio_filter_active = not self.audio_filter_active
        self.nav_sec_bar.icon1.setChecked(self.audio_filter_active)
        self.apply_all_filters()

    def on_toggle_sub(self):
        self.sub_filter_active = not self.sub_filter_active
        self.nav_sec_bar.icon2.setChecked(self.sub_filter_active)
        self.apply_all_filters()

    def apply_all_filters(self):

        if not self.filter_active:
            self.item_widgets = self.items_factory.create_item_widgets(
                min_width=320,
                mode=self.view_mode,
                sort_key=self.sort_key,
                reverse=self.sort_reverse,
                filter_func=None
            )
            self.position_items()
            return

        keyword = self.nav_sec_bar.recherche_bar.text()
        title_filter = (lambda itm: keyword.lower() in itm['title'].lower()) if keyword else None

        max_dur = self.nav_sec_bar.slide.value()
        duration_filter = (lambda itm: itm['duration_sec'] <= max_dur)

        audio_filter = None
        if self.audio_filter_active:
            sel_audio = self.nav_sec_bar.box1.get_checked_items() or []
            if sel_audio:
                def audio_filter(itm):
                    langs = itm.get('audio_languages', [])
                    if not langs:
                        langs = ["Pas défini"]
                    return any(l in langs for l in sel_audio)
            else:
                audio_filter = lambda itm: False

        sub_filter = None
        if self.sub_filter_active:
            sel_sub = self.nav_sec_bar.box2.get_checked_items()
            if sel_sub:
                def sub_filter(itm):
                    langs = itm.get('subtitle_languages', [])
                    if not langs:
                        langs = ["Pas défini"]
                    return any(l in langs for l in sel_sub)
            else:
                sub_filter = lambda itm: False

        def combined(itm):
            # catégorie déjà gérée ailleurs
            for f in (title_filter, duration_filter, audio_filter, sub_filter):
                if f and not f(itm):
                    return False
            return True

        self.item_widgets = self.items_factory.create_item_widgets(
            min_width=320,
            mode=self.view_mode,
            sort_key=self.sort_key,
            reverse=self.sort_reverse,
            filter_func=combined
        )
        self.position_items()

    def configure_slider_range(self):
        durations = [item['duration_sec'] for item in self.items_factory.items_data if item['duration_sec'] > 0]
        if durations:
            self.nav_sec_bar.slide.set_range(min(durations), max(durations))
            self.nav_sec_bar.slide.set_value(max(durations))

    def reload_items(self, filter_func=None):
        self.items_factory.load_items_data()
        self.item_widgets = self.items_factory.create_item_widgets(
            min_width=320,
            mode=self.view_mode,
            sort_key=self.sort_key,
            reverse=self.sort_reverse,
            filter_func=filter_func
        )
        self.position_items()

    def toggle_sort_time(self):
        self.sort_ascending = not self.sort_ascending
        self.sort_key = lambda item: item['duration_sec']
        self.sort_reverse = not self.sort_ascending
        self.reload_items()

    def toggle_sort_az(self):
        self.sort_ascending = not self.sort_ascending
        self.sort_key = lambda item: item['title'].lower()
        self.sort_reverse = not self.sort_ascending
        self.reload_items()

    def toggle_grid_list(self):
        self.view_mode = 'list' if self.view_mode == 'grid' else 'grid'
        self.mode_stack.setCurrentWidget(
            self.list_container if self.view_mode == 'list' else self.grid_container
        )
        self.reload_items()

    def toggle_category(self, category_label: str):
        self.current_category = category_label
        is_media = category_label in ("Videos", "Musiques")

        self.audio_filter_active = is_media
        self.nav_sec_bar.icon1.set_state(is_media)
        self.sub_filter_active = is_media
        self.nav_sec_bar.icon2.set_state(is_media)

        self.nav_bar.icon_sortTime.setVisible(is_media)
        self.nav_sec_bar.slide.setVisible(is_media)
        self.nav_sec_bar.icon1.setVisible(is_media)
        self.nav_sec_bar.box1.setVisible(is_media)
        self.nav_sec_bar.icon2.setVisible(is_media)
        self.nav_sec_bar.box2.setVisible(is_media)

        self.apply_all_filters()
        self.position_items()

    def position_items(self):
        self.setUpdatesEnabled(False)
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
