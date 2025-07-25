from PyQt6.QtWidgets import QWidget, QHBoxLayout

from Pages.Navigateur.Widgets.card_nav import CardNav
from Pages.Navigateur.Widgets.triple_container import TripleContainer
from Widgets.icon_perso import IconPerso


class BarNav(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(40)

        # === Layout principal horizontal ===
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # === Container triple : gauche / milieu / droite ===
        self.triple = TripleContainer(self)
        layout.addWidget(self.triple)

        # === Panneau gauche : icônes de tri & grille/liste ===
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

        # === Panneau central : CardNav (onglets) ===
        milieu_layout = QHBoxLayout(self.triple.pan2)
        milieu_layout.setContentsMargins(0, 0, 0, 0)
        milieu_layout.setSpacing(0)
        self.triple.pan2.setLayout(milieu_layout)

        self.card = CardNav(items=[
            ("Catalogue", "mdi.view-dashboard-outline"),
            ("Streaming", "mdi.play-circle-outline"),
            ("Publication", "mdi.cloud-upload-outline")
        ])
        self.card.selection_changed.connect(self.on_card_selection_changed)
        milieu_layout.addWidget(self.card)

        # === Panneau droit : icône de recherche ===
        droite_layout = QHBoxLayout(self.triple.pan3)
        droite_layout.setContentsMargins(0, 0, 0, 0)
        droite_layout.setSpacing(0)
        self.triple.pan3.setLayout(droite_layout)

        self.icon_search = IconPerso(icon_only_name='mdi.magnify')
        droite_layout.addStretch()
        droite_layout.addWidget(self.icon_search)

    def on_card_selection_changed(self, selected_label: str):
        if selected_label == "Catalogue":
            self.icon_grid_list.show()
            self.icon_sortAZ.show()
            self.icon_sortTime.show()
            self.icon_search.show()
        elif selected_label == "Publication":
            self.icon_grid_list.hide()
            self.icon_sortAZ.hide()
            self.icon_sortTime.hide()
            self.icon_search.hide()
