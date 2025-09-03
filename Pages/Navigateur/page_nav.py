# page_nav.py

from PyQt6.QtWidgets import QSpacerItem, QSizePolicy

from Core.Language.i18n import get_text
from Pages.Navigateur.Bar.bar_nav import BarNav
from Pages.Navigateur.Bar_Sec.bar_sec_nav import BarSecNav
from Pages.Navigateur.Catalogue.catalogue_nav import Catalogue
from Pages.Navigateur.Publication.publication_nav import Publication
from Pages.Navigateur.Streaming.streaming_nav import Streaming
from Core.Fenetre.base_fenetre import BaseFenetre

class PageNav(BaseFenetre):
    def __init__(self, auth, db_manager, fichier_client, taille_ecran, switch_to_lecteur):
        super().__init__(
            largeur=taille_ecran.width(),
            hauteur=taille_ecran.height()
        )
        self.switch_to_lecteur = switch_to_lecteur
        self.db_manager = db_manager
        self.client_1fichier = fichier_client

        self.nav_bar = BarNav()
        self.auth = auth
        self.nav_sec_bar = BarSecNav()
        self.nav_sec_bar.triple.pan1.hide()
        self.nav_sec_bar.triple.pan3.hide()

        self.catalogue = Catalogue(
            self.switch_to_lecteur,
            self.db_manager,
            self.client_1fichier,
            self.nav_bar,
            self.nav_sec_bar,
            self.auth
        )
        self.streaming = Streaming(switch_to_lecteur, fichier_client, auth, db_manager)
        self.streaming.hide()
        self.publication = Publication(auth, fichier_client, db_manager, self.catalogue)
        self.publication.hide()

        main = self.central_layout
        main.setContentsMargins(0, 0, 0, 0)
        main.setSpacing(0)

        main.addWidget(self.nav_bar)
        main.addSpacerItem(QSpacerItem(0, 10, QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Fixed))
        main.addWidget(self.nav_sec_bar)
        main.addWidget(self.catalogue, stretch=1)
        main.addWidget(self.publication, stretch=1)
        main.addWidget(self.streaming, stretch=1)

        self.nav_bar.icon_search.clicked.connect(self.toggle_bar_sec)
        self.nav_bar.card.selection_changed.connect(self.on_card_selection_changed)

        # Stocker les labels utilisés dans BarNav pour la comparaison
        self.catalogue_label = get_text("nav_labels.catalogue_texts.title")
        self.streaming_label = get_text("nav_labels.streaming_texts.title")
        self.publication_label = get_text("nav_labels.publication_texts.title")

    def toggle_bar_sec(self):
        if self.nav_sec_bar.triple.pan1.isVisible():
            self.nav_sec_bar.triple.pan1.hide()
            self.nav_sec_bar.triple.pan3.hide()
        else:
            self.nav_sec_bar.triple.pan1.show()
            self.nav_sec_bar.triple.pan3.show()

    def on_card_selection_changed(self, selected_label: str):
        # Utiliser les labels stockés pour la comparaison
        if selected_label == self.catalogue_label:
            self.streaming.hide()
            self.publication.hide()
            self.catalogue.show()
            self.nav_sec_bar.show()
        elif selected_label == self.streaming_label:
            self.nav_bar.icon_search.set_state(False)
            self.nav_sec_bar.hide()
            self.catalogue.hide()
            self.publication.hide()
            self.streaming.show()
        elif selected_label == self.publication_label:
            self.nav_bar.icon_search.set_state(False)
            self.nav_sec_bar.hide()
            self.catalogue.hide()
            self.streaming.hide()
            self.publication.show()
