from PyQt6.QtCore import QSize
from PyQt6.QtWidgets import (
    QWidget, QHBoxLayout, QSpacerItem,
    QSizePolicy, QLayout
)


class Row(QWidget):
    def __init__(self, parent=None, spacing=5, margins=(0, 0, 0, 0), space_between=False):
        super().__init__(parent)
        self._spacing = spacing
        self._margins = margins
        self._space_between = space_between
        # Stocke (objet, stretch)
        self._widgets = []

        self.layout = QHBoxLayout(self)
        self.layout.setContentsMargins(*margins)
        if not space_between:
            self.layout.setSpacing(spacing)

    def sizeHint(self) -> QSize:
        return QSize(200, 40)

    def add_widget(self, widget, stretch=0):
        """
        Ajoute un QWidget, QLayout ou QSpacerItem à la ligne.
        """
        if not isinstance(widget, (QWidget, QLayout, QSpacerItem)):
            raise TypeError(f"add_widget: type invalide {type(widget)}")
        self._widgets.append((widget, stretch))
        self._rebuild_layout()

    def _rebuild_layout(self):
        # Nettoyage
        while self.layout.count():
            item = self.layout.takeAt(0)
            w = item.widget()
            if w:
                w.setParent(None)

        for i, (obj, stretch) in enumerate(self._widgets):
            if self._space_between and i > 0:
                spacer = QSpacerItem(0, 0, QSizePolicy.Expanding, QSizePolicy.Minimum)
                self.layout.addItem(spacer)

            # Cas QWidget
            if isinstance(obj, QWidget):
                self.layout.addWidget(obj, stretch)
            # Cas QLayout
            elif isinstance(obj, QLayout):
                self.layout.addLayout(obj, stretch)
            # Cas QSpacerItem
            elif isinstance(obj, QSpacerItem):
                self.layout.addItem(obj)
            else:
                raise TypeError(f"_rebuild_layout: type non supporté {type(obj)}")

        self.update()
