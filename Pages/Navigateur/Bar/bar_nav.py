from PyQt6.QtWidgets import QWidget, QHBoxLayout, QSpacerItem, QSizePolicy

from Core.Language.i18n import get_text
from Pages.Navigateur.Widgets.card_nav import CardNav
from Pages.Navigateur.Widgets.flexible_container import FlexibleContainer
from Widgets.icon_perso import IconPerso

class BarNav(QWidget):
    def __init__(self):
        super().__init__()
        self.setFixedHeight(40)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.triple = FlexibleContainer(self)
        layout.addWidget(self.triple)

        # === Panneau gauche ===
        gauche_layout = QHBoxLayout(self.triple.pan1)
        gauche_layout.setContentsMargins(0, 0, 0, 0)
        gauche_layout.setSpacing(5)


        self.icon_grid_list = IconPerso(
            icon_true_name='mdi.view-grid-outline',
            icon_false_name='mdi.format-list-bulleted'
        )
        self.icon_sortAZ = IconPerso(
            icon_true_name='mdi.sort-alphabetical-ascending',
            icon_false_name='mdi.sort-alphabetical-descending'
        )
        self.icon_sortTime = IconPerso(
            icon_true_name='mdi.sort-clock-ascending',
            icon_false_name='mdi.sort-clock-descending'
        )


        gauche_layout.addWidget(self.icon_grid_list)
        gauche_layout.addWidget(self.icon_sortAZ)
        gauche_layout.addWidget(self.icon_sortTime)
        gauche_layout.addStretch()

        # === Panneau central ===

        milieu_layout = QHBoxLayout(self.triple.pan2)
        milieu_layout.setContentsMargins(0, 0, 0, 0)
        milieu_layout.setSpacing(0)
        self.triple.pan2.setLayout(milieu_layout)

        self.catalogue_label = get_text("nav_labels.catalogue_texts.title")
        self.streaming_label = get_text("nav_labels.streaming_texts.title")
        self.publication_label = get_text("nav_labels.publication_texts.title")
        self.card = CardNav(items=[
            (self.catalogue_label, "mdi.view-dashboard-outline"),
            (self.streaming_label, "mdi.play-circle-outline"),
            (self.publication_label, "mdi.cloud-upload-outline")
        ])
        self.card.selection_changed.connect(self.on_card_selection_changed)
        milieu_layout.addWidget(self.card)


        droite_layout = QHBoxLayout(self.triple.pan3)
        droite_layout.setContentsMargins(0, 0, 0, 0)
        droite_layout.setSpacing(0)
        self.triple.pan3.setLayout(droite_layout)


        self.icon_search = IconPerso(icon_only_name='mdi.magnify')
        droite_layout.addStretch()
        droite_layout.addWidget(self.icon_search)


    def on_card_selection_changed(self, selected_label: str):
        if selected_label == self.catalogue_label:
            self.icon_grid_list.show()
            self.icon_sortAZ.show()
            self.icon_sortTime.show()
            self.icon_search.show()
        elif selected_label == self.streaming_label:
            self.icon_grid_list.hide()
            self.icon_sortAZ.hide()
            self.icon_sortTime.hide()
            self.icon_search.hide()
        elif selected_label == self.publication_label:
            self.icon_grid_list.hide()
            self.icon_sortAZ.hide()
            self.icon_sortTime.hide()
            self.icon_search.hide()
