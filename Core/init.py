# TODO: main.py
import pythoncom
import faulthandler
import sys
from pathlib import Path

import yaml
from PyQt6.QtCore import QFile, QTextStream, Qt
from PyQt6.QtWidgets import QApplication
from Core.Language.language_manager import init_db
from Core.Language.i18n import get_text
from Core.Language.language_manager import get_lang
from Core.logger_config import logger
from Core.settings import CONFIG_PATH, STYLE_PATH
from Database.db_manager import DatabaseManager
from Database.sync_database import SyncDatabase
from Pages.Auth.Connexion.page_connexion import PageConnexion
from Pages.Auth.Inscription.page_inscription import PageInscription
from Pages.Auth.firebase_auth import FirebaseAuth
from Pages.Navigateur.page_nav import PageNav
from Service.py1FichierClient import FichierClient

# Active faulthandler pour TOUS les threads
faulthandler.enable(all_threads=True)

# Initialise COM pour le thread principal
pythoncom.CoInitializeEx(pythoncom.COINIT_MULTITHREADED)


def load_stylesheet(app: QApplication, path: Path = STYLE_PATH) -> None:
    """Charge une feuille de style QSS dans l'application."""
    file = QFile(str(path))
    if not file.exists():
        logger.warning(f"Feuille de style inexistante : {path}")
        return
    if file.open(QFile.OpenModeFlag.ReadOnly | QFile.OpenModeFlag.Text):
        stream = QTextStream(file)
        app.setStyleSheet(stream.readAll())
        file.close()
        logger.debug(f"Feuille de style chargée : {path}")
    else:
        logger.warning(f"Impossible d'ouvrir la feuille de style : {path}")


class Init:
    def __init__(self):
        # FORCER la réinitialisation de la langue avant de récupérer la langue
        init_db()

        self.config = self._load_config(CONFIG_PATH)
        self.lang = get_lang()  # Récupère la langue depuis SQLite
        logger.info(f"Langue de l'application: {self.lang}")

        self.app = QApplication(sys.argv)
        self.taille_ecran = self.app.primaryScreen().size()

        load_stylesheet(self.app)

        # Initialisation des services
        self.db_manager = DatabaseManager()
        firebase_config = self.config.get("firebase", {})
        api_key = self.config.get("onefichier", {}).get("api_key", "")

        self.auth = FirebaseAuth(firebase_config)
        self.client_1fichier = FichierClient(api_key=api_key, be_nice=True)
        self.fenetre = None

        # Thread de synchronisation
        self.sync_thread = SyncDatabase(self.auth, self.db_manager, self.client_1fichier)
        self.sync_thread.finished_sync.connect(
            self._on_sync_finished,
            Qt.ConnectionType.QueuedConnection
        )

    @staticmethod
    def _load_config(path: Path) -> dict:
        """Charge la configuration YAML avec gestion d'erreurs."""
        if not path.is_file():
            logger.error(f"Fichier de configuration introuvable : {path}")
            return {}
        try:
            with path.open("r", encoding="utf-8") as f:
                config = yaml.safe_load(f)
                logger.debug(f"Configuration chargée depuis {path}")
                return config if config else {}
        except Exception as e:
            logger.error(f"Erreur lors du chargement de la configuration : {e}")
            return {}

    def switch_to_inscription(self) -> None:
        if self.fenetre:
            self.fenetre.close()
        self.fenetre = PageInscription(
            self.auth,
            self.taille_ecran,
            self.switch_to_connexion,
            self.switch_to_navigateur,
        )
        self.fenetre.setWindowTitle(get_text("main_window.title"))
        self.fenetre.show()

    def switch_to_connexion(self) -> None:
        if self.fenetre:
            self.fenetre.close()
        self.fenetre = PageConnexion(
            self.auth,
            self.taille_ecran,
            self.switch_to_inscription,
            self.switch_to_navigateur,
        )
        self.fenetre.setWindowTitle(get_text("main_window.title"))
        self.fenetre.show()

    def switch_to_lecteur(self, stream_url) -> None:
        if self.fenetre:
            self.fenetre.hide()
        from Pages.Lecteur.lecteur import Lecteur
        lecteur = Lecteur(stream_urls=stream_url, taille_ecran=self.taille_ecran)
        lecteur.show()

    def switch_to_navigateur(self) -> None:
        if self.fenetre:
            self.fenetre.close()
        self.sync_thread.start()

    def _on_sync_finished(self) -> None:
        self.fenetre = PageNav(
            self.auth,
            self.db_manager,
            self.client_1fichier,
            self.taille_ecran,
            self.switch_to_lecteur
        )
        self.fenetre.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self.fenetre.show()

    def run(self) -> None:
        try:
            if self.auth.est_connecte():
                logger.info("Utilisateur déjà connecté, chargement du navigateur")
                self.switch_to_navigateur()
            else:
                logger.info("Utilisateur non connecté, affichage page de connexion")
                self.switch_to_connexion()

            # Gestionnaire d'exceptions global
            def excepthook(exctype, value, traceback):
                logger.error("Exception non attrapée", exc_info=(exctype, value, traceback))
                sys.__excepthook__(exctype, value, traceback)

            sys.excepthook = excepthook

            exit_code = self.app.exec()
            sys.exit(exit_code)

        except Exception as e:
            logger.exception("Exception non gérée dans run()")
            sys.exit(1)


