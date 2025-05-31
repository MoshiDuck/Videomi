from PyQt6.QtCore import QTimer, pyqtSlot
from PyQt6.QtWidgets import QWidget, QVBoxLayout, QScrollArea


class AbstractListGridBase(QWidget):
    def __init__(self, parent=None, min_width=300):
        super().__init__(parent)
        self.min_width = min_width
        self.items = []

        self.main_layout = QVBoxLayout(self)
        self.main_layout.setContentsMargins(0, 0, 0, 0)
        self.main_layout.setSpacing(5)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.container = QWidget()
        self.scroll.setWidget(self.container)
        self.main_layout.addWidget(self.scroll)

        # Timer to batch arrange calls
        self._arrange_timer = QTimer(self)
        self._arrange_timer.setSingleShot(True)
        self._arrange_timer.timeout.connect(self.arrange)

    def schedule_arrange(self):
        if not self._arrange_timer.isActive():
            self._arrange_timer.start(50)

    @pyqtSlot(str)
    def apply_filter(self, text: str):
        query = text.strip().lower()
        changed = False
        self.setUpdatesEnabled(False)

        for item in self.items:
            should_be_visible = not query or item.matches_filter(query)
            if item.isVisible() != should_be_visible:
                item.setVisible(should_be_visible)
                changed = True

        # Reset cached positions and column count if filtre vide
        if not query:
            self._last_positions = {}
            self._last_col_count = -1

        if changed:
            self.schedule_arrange()

        self.setUpdatesEnabled(True)
        self.update()

    def clear_items(self):
        for w in self.items:
            w.hide()
            self._remove_widget(w)
        self.items.clear()

    def _remove_widget(self, widget):
        # To be implemented by subclass depending on layout type
        raise NotImplementedError

    def ajouter_items(self, widgets):
        self.clear_items()
        self.items = widgets[:]
        for w in self.items:
            w.setParent(self.container)
            w.show()
            self._add_widget(w)
        self.schedule_arrange()

    def _add_widget(self, widget):
        # To be implemented by subclass depending on layout type
        raise NotImplementedError

    def arrange(self):
        # To be implemented by subclass
        raise NotImplementedError

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.schedule_arrange()