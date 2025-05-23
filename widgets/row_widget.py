from PySide6.QtCore import QSize
from PySide6.QtWidgets import QWidget, QHBoxLayout, QSpacerItem, QSizePolicy

class Row(QWidget):
    def __init__(self, parent=None, spacing=5, margins=(0, 0, 0, 0), space_between=False):
        super().__init__(parent)
        self._spacing = spacing
        self._margins = margins
        self._space_between = space_between
        self._widgets = []

        self.layout = QHBoxLayout(self)
        self.layout.setContentsMargins(*margins)

        if not space_between:
            self.layout.setSpacing(spacing)

    def sizeHint(self) -> QSize:
        return QSize(200, 40)

    def add_widget(self, widget, stretch=0):
        self._widgets.append((widget, stretch))
        self._rebuild_layout()

    def _rebuild_layout(self):
        # Nettoyage du layout existant
        while self.layout.count():
            item = self.layout.takeAt(0)
            if item.widget():
                item.widget().setParent(None)

        count = len(self._widgets)
        for i, (widget, stretch) in enumerate(self._widgets):
            if self._space_between and i > 0:
                # Ajoute un espace extensible entre les widgets
                spacer = QSpacerItem(0, 0, QSizePolicy.Expanding, QSizePolicy.Minimum)
                self.layout.addItem(spacer)
            self.layout.addWidget(widget, stretch)

        self.update()
