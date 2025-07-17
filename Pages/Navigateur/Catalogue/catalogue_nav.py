import json

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import (
    QWidget, QHBoxLayout, QVBoxLayout, QScrollArea,
    QStackedWidget, QGridLayout, QListWidget, QListWidgetItem, QSizePolicy, QLabel, QFrame
)

from Widgets.defilement_label import DefilementLabel


class ItemWidget(QFrame):
    # Cache pour pixmap scalés: {(path, width): QPixmap}
    _scaled_cache = {}

    def __init__(self, image_path: str, title: str, duration: str, width: int, category: str):
        super().__init__()
        self.setObjectName("itemCard")
        self.min_width = width
        self.category = category
        self.image_path = image_path
        self.original_pixmap = None
        self.init_ui(image_path, title, duration)

    def init_ui(self, image_path, title, duration):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Image
        self.image_label = QLabel()
        self.load_pixmap(image_path)

        # Title (défilement)
        self.title_label = DefilementLabel(title)
        self.title_label.setFixedHeight(20)

        # Duration
        self.duration_label = QLabel(duration)
        self.duration_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.duration_label.setFixedHeight(20)

        layout.addWidget(self.image_label)
        layout.addWidget(self.title_label)
        layout.addWidget(self.duration_label)

    def load_pixmap(self, image_path):
        pixmap = QPixmap(image_path)
        if pixmap.isNull():
            pixmap = QPixmap(self.min_width, self.min_width)
            pixmap.fill(Qt.GlobalColor.black)
        self.original_pixmap = pixmap
        self._update_scaled(self.min_width)

    def _update_scaled(self, width):
        key = (self.image_path, width)
        if key in ItemWidget._scaled_cache:
            scaled = ItemWidget._scaled_cache[key]
        else:
            w0, h0 = self.original_pixmap.width(), self.original_pixmap.height()
            ratio = (h0 / w0) if w0 else 9/16
            ih = int(width * ratio)
            scaled = self.original_pixmap.scaled(
                width, ih,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation
            )
            ItemWidget._scaled_cache[key] = scaled
        self.image_label.setPixmap(scaled)
        self.image_label.setFixedSize(scaled.width(), scaled.height())
        self.setFixedSize(scaled.width(), scaled.height() + 40)

    def resize_image(self, width):
        if self.image_label.width() == width:
            return
        self._update_scaled(width)


class ItemsFactory:
    def __init__(self, db_manager):
        self.db_manager = db_manager

    def create_item_widgets(self, min_width=320):
        item_widgets = []
        all_items = self.db_manager.fetch_all()
        for (category, title), data in all_items.items():
            duration = self._extract_duration(data.get("metadata_json"))
            thumbnail_path = data.get("thumbnail_path") or ""
            widget = ItemWidget(thumbnail_path, title, duration, min_width, category)
            item_widgets.append(widget)
        return item_widgets

    @staticmethod
    def _extract_duration(metadata_json):
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
        except Exception:
            pass
        return ""


class Catalogue(QWidget):
    def __init__(self, db_manager, nav_bar, nav_sec_bar):
        super().__init__()
        self.db_manager = db_manager
        self.nav_bar = nav_bar
        self.nav_sec_bar = nav_sec_bar

        self.items_factory = ItemsFactory(self.db_manager)
        self.item_widgets = []
        self.current_category = "Videos"
        self.view_mode = 'grid'

        # list and grid containers
        self.list_container = QListWidget()
        self.list_container.setSpacing(10)
        self.grid_container = QWidget()
        self.grid_container.setSizePolicy(QSizePolicy.Preferred, QSizePolicy.Fixed)

        # grid layout
        self.grid_layout = QGridLayout(self.grid_container)
        self.grid_layout.setContentsMargins(10, 10, 10, 10)
        self.grid_layout.setHorizontalSpacing(15)
        self.grid_layout.setVerticalSpacing(15)

        # stacked widget
        self.mode_stack = QStackedWidget()
        self.mode_stack.addWidget(self.list_container)
        self.mode_stack.addWidget(self.grid_container)

        # scroll area
        self.scroll = QScrollArea(self)
        self.scroll.setWidgetResizable(True)
        self.scroll.setWidget(self.mode_stack)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)

        # main layout
        main_layout = QHBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)
        main_layout.addWidget(self.nav_bar)
        main_layout.addWidget(self.scroll, stretch=1)
        main_layout.addWidget(self.nav_sec_bar)
        self.setLayout(main_layout)

        # toggle grid/list
        self.nav_bar.icon_grid_list.clicked.connect(self.toggle_grid_list)
        self.nav_sec_bar.card.selection_changed.connect(self.toggle_category)

    def toggle_grid_list(self):
        if self.view_mode == 'grid':
            self.mode_stack.setCurrentWidget(self.list_container)
            self.view_mode = 'list'
        else:
            self.mode_stack.setCurrentWidget(self.grid_container)
            self.view_mode = 'grid'


    def toggle_category(self, category_label: str):
        self.current_category = category_label
        self.position_items()

    def load_items(self):
        if not self.item_widgets:
            self.item_widgets = self.items_factory.create_item_widgets()
        self.position_items()

    def position_items(self):
        # disable updates
        self.setUpdatesEnabled(False)
        # clear list
        self.list_container.clear()
        # clear grid
        while self.grid_layout.count():
            itm = self.grid_layout.takeAt(0)
            w = itm.widget()
            if w:
                w.setParent(None)

        # compute grid
        min_w = 320
        vp = self.scroll.viewport().width()
        sbw = self.scroll.verticalScrollBar().sizeHint().width()
        eff = max(min_w, vp - sbw)
        cols = max(1, eff // min_w)
        spacing = self.grid_layout.horizontalSpacing()
        total_spacing = spacing * (cols - 1)
        item_w = (eff - total_spacing) / cols
        self.grid_container.setFixedWidth(eff)

        # populate
        row = col = 0
        for w in self.item_widgets:
            if w.category != self.current_category:
                continue
            # list
            item = QListWidgetItem()
            item.setSizeHint(w.size())
            self.list_container.addItem(item)
            self.list_container.setItemWidget(item, w)
            # grid
            w.resize_image(int(item_w))
            self.grid_layout.addWidget(w, row, col)
            col += 1
            if col >= cols:
                col = 0
                row += 1

        self.mode_stack.setCurrentWidget(self.grid_container)
        self.setUpdatesEnabled(True)

    def showEvent(self, ev):
        super().showEvent(ev)
        self.load_items()

    def resizeEvent(self, ev):
        super().resizeEvent(ev)
        if self.item_widgets:
            self.position_items()
