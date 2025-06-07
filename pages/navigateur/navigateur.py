# -*- coding: utf-8 -*-
import logging
import os
import subprocess
from typing import Union

from PyQt6 import QtWidgets, QtCore, QtGui
from PyQt6.QtGui import QGuiApplication
from PyQt6.QtWidgets import QWidget, QVBoxLayout

from config.config import FFMPEG_PATH
from database.musique_manager import MusiqueManager
from database.musique_thumbnail_manager import MusiqueThumbnailManager
from database.video_manager import VideoManager
from database.video_thumbnail_manager import VideoThumbnailManager
from database.videos import normaliser_langue
from pages.lecteur.lecteur import Lecteur
from pages.navigateur.widgets.bar.bar_nav import BarNav
from pages.navigateur.widgets.sous_bar.sous_bar_nav import SousBarNav
from utils.filtrer_et_afficher import filtrer_et_afficher
from utils.formater_duree import formater_duree
from widgets.grid_list.grid.grid import Grid
from widgets.grid_list.grid.grid_item import GridItem
from widgets.grid_list.list.list import List
from widgets.grid_list.list.list_item import ListItem


class Navigateur(QtWidgets.QMainWindow):
    DERNIERE_LARGEUR = 0

    def __init__(self):
        super().__init__()
        self._active_threads = []
        # 1. Mode d'affichage initial : 'grille' ou 'liste'
        self.mode_affichage = 'grille'
        # 2. Type initial : True = vidéo, False = musique
        self.show_video = True
        # 3. Sens du tri (alphabétique / durée)
        self.tri_alphabetique_asc = True
        self.tri_duree_asc       = True

        # Gestionnaires divers
        self.thumbnail_labels = {}

        # Barre principale + sous-barre
        self.bar      = BarNav(self)
        self.sous_bar = SousBarNav(self)
        self.sous_bar.setVisible(False)

        # Répertoires pour miniatures et infos
        self.base_path     = os.path.join(os.path.expanduser("~"), "mediatheque", "donnees")
        self.thumbnail_dir = os.path.join(self.base_path, "images")
        self.info_dir      = os.path.join(self.base_path, "informations")
        os.makedirs(self.thumbnail_dir, exist_ok=True)
        os.makedirs(self.info_dir, exist_ok=True)

        # --- Managers vidéo ---
        self.video_thumbnail_manager = VideoThumbnailManager()
        self.video_thumbnail_manager.thumbnail_ready.connect(self.update_thumbnail)
        self.video_manager = VideoManager({}, self.video_thumbnail_manager, self.thumbnail_dir)
        self.video_info    = self.video_manager.load_video_info()
        self.video_manager.video_info = self.video_info

        # --- Managers musique ---
        self.music_thumbnail_manager = MusiqueThumbnailManager()
        self.music_thumbnail_manager.thumbnail_ready.connect(self.update_thumbnail)
        self.music_manager = MusiqueManager({}, self.music_thumbnail_manager, self.thumbnail_dir)
        self.music_info = self.music_manager.load_music_info()
        self.music_manager.music_info = self.music_info

        # Création de l’interface graphique
        self._creer_interface()
        self._verifier_ffmpeg()
        self.showMaximized()
        # Timer pour le filtrage différé (300 ms)

        self.filtre_timer = QtCore.QTimer(self)
        self.filtre_timer.setSingleShot(True)
        self.filtre_timer.setInterval(300)
        self.filtre_timer.timeout.connect(self._appliquer_filtre)

        left       = self.bar.container_gauche
        middle     = self.bar.container_milieu
        right      = self.bar.container_droite
        sous_left  = self.sous_bar.sous_bar_gauche
        sous_right = self.sous_bar.sous_bar_droite

        # Clic sur l’icône “recherche” (affiche/masque la sous-barre)
        right.icon_search.state_changed.connect(self._on_state_changed)

        # Texte saisi dans la barre de recherche secondaire
        sous_left.bar_search.textChanged.connect(self._demarrer_filtre_timer)

        # Tri alphabétique / tri par durée / bascule grille-liste
        left.sortAZ_toggle.clicked.connect(self._toggle_tri_alphabetique)
        left.sortTime_toggle.clicked.connect(self._toggle_tri_duree)
        left.icon_toggle.clicked.connect(self._toggle_mode_affichage)

        # Slider de durée dans la sous-barre
        sous_right.slide.valueChanged.connect(self._demarrer_filtre_timer)

        sous_right.box_audio.stateChanged.connect(self._demarrer_filtre_timer)
        sous_right.box_sub.stateChanged.connect(self._demarrer_filtre_timer)

        # Basculer entre vidéo/musique (carte du milieu)
        middle.card.state_changed.connect(self._toggle_type_media)

        videos = self.video_manager.charger_videos()
        if videos:
            min_d = min(v.get("duree", float('inf')) for v in videos if v.get("duree", 0) > 0)
            max_d = max(v.get("duree", 0) for v in videos)
        else:
            min_d, max_d = 0, 600

        sous_right.slide.setRange(round(min_d), round(max_d))
        sous_right.slide.setValue(round(max_d))

        # Filtre initial
        self._appliquer_filtre()



    def _creer_interface(self):
        self.setWindowTitle("Médiathèque")
        self.setMinimumSize(1200, 700)

        # Widget principal + layout vertical
        main_widget = QWidget()
        main_layout = QVBoxLayout(main_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # 1) Barre + sous-barre
        main_layout.addWidget(self.bar)
        main_layout.addSpacing(10)
        main_layout.addWidget(self.sous_bar)

        # 2) QStackedWidget pour 4 “pages”
        self.main_stack = QtWidgets.QStackedWidget()

        # --- Page 0 : Grille vidéo ---
        page_grid_video = QWidget()
        layout_grid_video = QVBoxLayout(page_grid_video)
        layout_grid_video.setContentsMargins(10, 10, 10, 10)
        self.graphics_video = Grid(parent=self)
        self.graphics_video.min_width = 300
        layout_grid_video.addWidget(self.graphics_video)

        # --- Page 1 : Grille musique ---
        page_grid_musique = QWidget()
        layout_grid_musique = QVBoxLayout(page_grid_musique)
        layout_grid_musique.setContentsMargins(10, 10, 10, 10)
        self.graphics_musique = Grid(parent=self)
        self.graphics_musique.min_width = 300
        layout_grid_musique.addWidget(self.graphics_musique)

        # --- Page 2 : Liste vidéo ---
        page_list_video = QWidget()
        layout_list_video = QVBoxLayout(page_list_video)
        layout_list_video.setContentsMargins(10, 10, 10, 10)
        self.lists_video = List(parent=self)
        self.lists_video.min_width = 300
        layout_list_video.addWidget(self.lists_video)

        # --- Page 3 : Liste musique ---
        page_list_musique = QWidget()
        layout_list_musique = QVBoxLayout(page_list_musique)
        layout_list_musique.setContentsMargins(10, 10, 10, 10)
        self.lists_musique = List(parent=self)
        self.lists_musique.min_width = 300
        layout_list_musique.addWidget(self.lists_musique)

        # Ajout des 4 pages au stacked
        self.main_stack.addWidget(page_grid_video)    # index 0
        self.main_stack.addWidget(page_grid_musique)  # index 1
        self.main_stack.addWidget(page_list_video)    # index 2
        self.main_stack.addWidget(page_list_musique)  # index 3

        # Par défaut, on montre la grille vidéo (index 0).
        self.main_stack.setCurrentIndex(0)

        # 3) Ajout du stacked au layout principal
        main_layout.addWidget(self.main_stack)

        # Définir le central widget et mettre en taille de l'écran
        self.setCentralWidget(main_widget)
        screen = QGuiApplication.primaryScreen()
        if screen:
            geom = screen.availableGeometry()
            self.setGeometry(geom)


    def _toggle_mode_affichage(self):
        self.mode_affichage = 'liste' if self.mode_affichage == 'grille' else 'grille'
        self._mettre_a_jour_vue()


    def _toggle_type_media(self, state: bool):
        self.show_video = state
        # À la bascule, on remet à jour la vue immédiatement
        self._mettre_a_jour_vue()


    def _mettre_a_jour_vue(self):
        if self.mode_affichage == 'grille' and self.show_video:
            self.main_stack.setCurrentIndex(0)
        elif self.mode_affichage == 'grille' and not self.show_video:
            self.main_stack.setCurrentIndex(1)
        elif self.mode_affichage == 'liste' and self.show_video:
            self.main_stack.setCurrentIndex(2)
        else:  # 'liste' et musique
            self.main_stack.setCurrentIndex(3)

        # On réapplique le filtre dès que la page change
        self._appliquer_filtre()


    def _on_state_changed(self, state):
        try:
            self.sous_bar.setVisible(state)
            sous_right = self.sous_bar.sous_bar_droite

            if self.show_video:
                medias = self.video_manager.charger_videos()
            else:
                medias = self.music_manager.charger_musiques()

            if medias:
                min_d = min(m.get("duree", float('inf')) for m in medias if m.get("duree", 0) > 0)
                max_d = max(m.get("duree", 0) for m in medias)
            else:
                min_d, max_d = 0, 600

            sous_right.slide.setRange(round(min_d), round(max_d))
            sous_right.slide.setValue(round(max_d))

        except Exception as e:
            print(f"Erreur dans _on_state_changed : {e}")


    def filtrer_depuis_menu(self):
        max_minutes = self.sous_bar.sous_bar_gauche.slide_time.value() // 60
        filtrer_et_afficher(self, max_minutes, None, None)


    def showEvent(self, event):
        super().showEvent(event)
        # Quand la fenêtre apparaît, on arrange la vue visible
        QtCore.QTimer.singleShot(0, self._arranger_vue_actuelle)


    def _arranger_vue_actuelle(self):
        idx = self.main_stack.currentIndex()
        if idx == 0:   # grille vidéo
            self.graphics_video.arrange()
        elif idx == 1: # grille musique
            self.graphics_musique.arrange()
        elif idx == 2: # liste vidéo
            self.lists_video.arrange()
        else:          # liste musique
            self.lists_musique.arrange()


    def update_thumbnail(self, chemin_media, pixmap: QtGui.QPixmap):
        if chemin_media in self.thumbnail_labels:
            widget = self.thumbnail_labels[chemin_media]
            widget.setThumbnailPixmap(pixmap)

    def closeEvent(self, event):
        try:
            # Si tu veux continuer à faire ce nettoyage, garde-le ici.
            if hasattr(self, 'video_thumbnail_manager'):
                self.video_thumbnail_manager.stop_all_processes()
            if hasattr(self, 'music_thumbnail_manager'):
                self.music_thumbnail_manager.stop_all_processes()

            if hasattr(self, '_active_threads'):
                for thread, worker in self._active_threads:
                    if thread.isRunning():
                        thread.quit()
                        thread.wait(5000)
                self._active_threads.clear()

            if hasattr(self, 'lecteur'):
                self.lecteur.close()

        except Exception as e:
            print(f"Erreur lors de la fermeture : {e}")

        event.ignore()  # Empêche la fermeture définitive
        self.hide()  # Cache la fenêtre

    def _verifier_ffmpeg(self):
        if not os.path.exists(FFMPEG_PATH):
            self._afficher_erreur("❌ FFmpeg manquant ! Ajoutez-le via les paramètres.")
            return
        try:
            subprocess.run(
                [FFMPEG_PATH, '-version'],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        except Exception as e:
            self._afficher_erreur(f"FFmpeg défectueux : {str(e)}")


    def resizeEvent(self, event):
        super().resizeEvent(event)
        new_width = self.width()
        # Réarrange seulement si la largeur a changé de manière significative
        if abs(new_width - self.DERNIERE_LARGEUR) > 50:
            self.DERNIERE_LARGEUR = new_width
            self._arranger_vue_actuelle()


    def _demarrer_filtre_timer(self):
        self.filtre_timer.stop()
        self.filtre_timer.start()


    def _appliquer_filtre(self):
        if self.show_video:
            medias = self.video_manager.charger_videos()
        else:
            medias = self.music_manager.charger_musiques()

        # Valeurs des filtres (slider + texte)
        texte_recherche = self.sous_bar.sous_bar_gauche.bar_search.text()
        max_duree = self.sous_bar.sous_bar_droite.slide.value()
        audio = self.sous_bar.sous_bar_droite.box_audio.value()
        st = self.sous_bar.sous_bar_droite.box_sub.value()

        if "Tous" in audio:
            audio = None
        else:
            audio = [normaliser_langue(l) for l in audio]

        if "Tous" in st:
            st = None
        else:
            st = [normaliser_langue(l) for l in st]


        # Filtre avancé selon le type de média
        if self.show_video:
            filtered = self.video_manager.advanced_filter(
                videos=medias,
                texte_recherche=texte_recherche,
                max_duree=max_duree,
                audio=audio,
                st=st
            )
        else:
            filtered = self.music_manager.advanced_filter(
                musiques=medias,
                artiste=None,
                album=None,
                max_duree=max_duree,  # convertir en minutes (durée musique)
                texte_recherche=texte_recherche,
            )

        # Afficher les éléments filtrés
        self._afficher_items(filtered)


    def _afficher_items(self, items: list):
        idx = self.main_stack.currentIndex()

        if idx == 0:          # grille vidéo
            widget_cible = self.graphics_video
            mode = 'grille'
        elif idx == 1:        # grille musique
            widget_cible = self.graphics_musique
            mode = 'grille'
        elif idx == 2:        # liste vidéo
            widget_cible = self.lists_video
            mode = 'liste'
        else:                 # liste musique
            widget_cible = self.lists_musique
            mode = 'liste'

        new_items = [self._creer_carte(media=v, mode=mode) for v in items]

        widget_cible.clear_items()
        widget_cible.ajouter_items(new_items)
        widget_cible.arrange()


    def _creer_carte(self, media: dict, mode: str):
        chemin = media['chemin']
        if self.show_video:
            titre = media['nom']
            pix = self.video_thumbnail_manager.get_cached_pixmap(chemin, titre)
            self.video_thumbnail_manager.check_and_queue_thumbnail(
                chemin, titre
            )
        else:
            titre = media['titre']
            pix = self.music_thumbnail_manager.get_cached_pixmap(chemin, titre)
            self.music_thumbnail_manager.check_and_queue_thumbnail(chemin, titre)

        if pix is None:
            pix = self._creer_pixmap_vide()

        duree_str = formater_duree(media.get('duree', 0))

        if mode == 'grille':
            item = GridItem(
                title=titre,
                duration=duree_str,
                pixmap=pix,
                chemin=chemin
            )
        else:
            item = ListItem(
                title=titre,
                duration=duree_str,
                pixmap=pix,
                chemin=chemin
            )

        # Connexion au clic pour ouvrir le lecteur
        item.clicked.connect(lambda _, ch=chemin: self._ouvrir_lecteur(ch))

        # Conserver la référence pour mettre à jour la miniature plus tard
        self.thumbnail_labels[chemin] = item

        return item


    @staticmethod
    def _creer_pixmap_vide():
        pixmap = QtGui.QPixmap(320, 180)
        pixmap.fill(QtGui.QColor(40, 40, 40))
        painter = QtGui.QPainter(pixmap)
        painter.setPen(QtGui.QColor(120, 120, 120))
        painter.drawText(pixmap.rect(), QtCore.Qt.AlignCenter, "Miniature non disponible")
        painter.end()
        return pixmap


    def _menu_contextuel(self, pos):
        menu = QtWidgets.QMenu()
        idx = self.main_stack.currentIndex()
        if idx == 2:  # liste vidéo
            # Actions spécifiques aux vidéos
            pass
        elif idx == 3:  # liste musique
            # Actions spécifiques aux musiques
            pass
        menu.exec_(self.mapToGlobal(pos))


    def wheelEvent(self, event):
        delta = int(event.angleDelta().y() * 0.3)
        idx = self.main_stack.currentIndex()
        if idx == 0:
            current_widget = self.graphics_video
        elif idx == 1:
            current_widget = self.graphics_musique
        elif idx == 2:
            current_widget = self.lists_video
        else:
            current_widget = self.lists_musique

        if hasattr(current_widget, "verticalScrollBar"):
            scrollbar = current_widget.verticalScrollBar()
            scrollbar.setValue(scrollbar.value() - delta)
        else:
            super().wheelEvent(event)

    def _ouvrir_lecteur(self, chemin_media: str):
        if not os.path.exists(chemin_media):
            QtWidgets.QMessageBox.critical(self, "Erreur", "Le fichier est introuvable.")
            return

        # 1) On crée d’abord l’instance du Lecteur avec le chemin fourni
        # On passe self.video_info à Lecteur
        self.lecteur = Lecteur(chemin_media, vm=self.video_manager)

        # 2) On ferme la fenêtre Navigateur
        self.hide()

        # 3) On lance la méthode run() du Lecteur (sélection des sous-titres + VLC)
        self.lecteur.run()


    def _toggle_tri_alphabetique(self):
        self.tri_alphabetique_asc = not self.tri_alphabetique_asc

        if self.show_video:
            medias = self.video_manager.charger_videos()
            sorted_medias = self.video_manager.sort_videos(
                medias, key='nom', ascending=self.tri_alphabetique_asc
            )
        else:
            medias = self.music_manager.charger_musiques()
            sorted_medias = self.music_manager.sort_musics(
                medias, key='titre', ascending=self.tri_alphabetique_asc
            )

        self._afficher_items(sorted_medias)


    def _toggle_tri_duree(self):
        self.tri_duree_asc = not self.tri_duree_asc

        if self.show_video:
            medias = self.video_manager.charger_videos()
            sorted_medias = self.video_manager.sort_videos(
                medias, key='duree', ascending=self.tri_duree_asc
            )
        else:
            medias = self.music_manager.charger_musiques()
            sorted_medias = self.music_manager.sort_musics(
                medias, key='duree', ascending=self.tri_duree_asc
            )

        self._afficher_items(sorted_medias)


    def _afficher_erreur(self, message: str):
        dlg = QtWidgets.QMessageBox(self)
        dlg.setIcon(QtWidgets.QMessageBox.Icon.Critical)
        dlg.setWindowTitle("Erreur")
        dlg.setText(message)
        dlg.exec()
