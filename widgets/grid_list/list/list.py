# widgets/grid_list/list/list.py
# -*- coding: utf-8 -*-
from PyQt6.QtWidgets import QVBoxLayout, QSpacerItem, QSizePolicy
from PyQt6.QtCore import Qt
from widgets.grid_list.abstract_list_grid_base import AbstractListGridBase


class List(AbstractListGridBase):
    def __init__(self, parent=None):
        super().__init__(parent)

        # Layout vertical pour empiler chaque ListItem
        self.layout = QVBoxLayout(self.container)
        self.layout.setSpacing(10)
        self.layout.setContentsMargins(5, 5, 5, 5)

        # Spacer en bas pour pousser les items vers le haut
        self.spacer = QSpacerItem(20, 20, QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Expanding)
        self.layout.addItem(self.spacer)
        self._last_positions = {}

    def _remove_widget(self, widget):
        self.layout.removeWidget(widget)
        widget.setParent(None)

    def _add_widget(self, widget):
        """
        Ajoute le ListItem avant le spacer. On
        n’ajoute PAS d’alignement particulier :
        le ListItem s’étire de lui‑même sur toute la largeur
        grâce à sa QSizePolicy.Expanding.
        """
        self.layout.removeItem(self.spacer)
        self.layout.addWidget(widget)
        self.layout.addItem(self.spacer)

    def arrange(self):
        visible_items = [w for w in self.items if w.isVisible()]

        # 1) Retirer les widgets devenus invisibles
        for w in list(self._last_positions.keys()):
            if w not in visible_items:
                self._remove_widget(w)
                self._last_positions.pop(w, None)

        # 2) Ajouter les nouveaux ListItem visibles
        for widget in visible_items:
            if widget not in self._last_positions:
                self._add_widget(widget)
                self._last_positions[widget] = True

        # Le QVBoxLayout s’occupe d’empiler les ListItem, qui, grâce à
        # sizePolicy=Expanding, s’étirent pour remplir la largeur parent.
