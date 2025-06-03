from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QGridLayout
from widgets.grid_list.abstract_list_grid_base import AbstractListGridBase

class Grid(AbstractListGridBase):
    def __init__(self, parent=None, min_width=300):
        super().__init__(parent, min_width)
        self.layout = QGridLayout(self.container)
        self.layout.setSpacing(10)
        self.layout.setContentsMargins(5, 0, 5, 5)
        self._last_col_count = -1
        self._last_positions = {}

    def _remove_widget(self, widget):
        # Remove widget from grid layout
        self.layout.removeWidget(widget)
        widget.setParent(None)

    def _add_widget(self, widget):
        # Placeholder: actual positioning happens in arrange()
        # Ensure widget is in the layout so it can be managed
        self.layout.addWidget(widget)

    def arrange(self):
        # Compute number of columns based on viewport width
        viewport_width = self.scroll.viewport().width()
        spacing = self.layout.spacing()
        col_count = max(1, int((viewport_width + spacing) // (self.min_width + spacing)))
        item_width = int((viewport_width - (col_count - 1) * spacing) / col_count)

        # Reset positions if column count changed
        if col_count != self._last_col_count:
            self._last_positions.clear()

        # Temporarily disable updates
        self.setUpdatesEnabled(False)
        try:
            for idx, widget in enumerate(self.items):
                row, col = divmod(idx, col_count)
                last = self._last_positions.get(widget)
                if last != (row, col):
                    self.layout.addWidget(widget, row, col)
                    self._last_positions[widget] = (row, col)
                # Resize widget width
                if widget.width() != item_width:
                    widget.setFixedWidth(item_width)
        finally:
            self.setUpdatesEnabled(True)

        self._last_col_count = col_count
        # Stretch to fill remaining space
        self.layout.setRowStretch(self.layout.rowCount(), 1)
        self.layout.setColumnStretch(col_count, 1)
