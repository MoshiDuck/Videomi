import json
import logging
import os

from Database.db_manager import DatabaseManager
from Database.sync_database import SyncDatabase
from Service.py1FichierClient import FichierClient

os.environ["QT_LOGGING_RULES"] = "*.debug=true"
import sys

import yaml
from PyQt6.QtCore import QFile, QTextStream, Qt
from PyQt6.QtWidgets import QApplication

from Pages.Auth.Connexion.page_connexion import PageConnexion
from Pages.Auth.Inscription.page_inscription import PageInscription
from Pages.Auth.firebase_auth import FirebaseAuth
from Pages.Navigateur.page_nav import PageNav

DB_PATH = "local_data.db"
CACHE_DIR = os.path.join(os.getcwd(), "cache", "images")
MAX_CACHE_SIZE_MB = 100  # max 100MB for thumbnails cache

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s][%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def load_stylesheet(app: QApplication, path: str = "Config/style.qss") -> None:
    """Charge une feuille de style QSS dans l'application."""
    file = QFile(path)
    if file.open(QFile.OpenModeFlag.ReadOnly | QFile.OpenModeFlag.Text):
        stream = QTextStream(file)
        app.setStyleSheet(stream.readAll())
    else:
        logger.warning(f"Impossible de charger le style : {path}")

class Init:
    def __init__(self):
        with open("Config/config.yaml", "r", encoding="utf-8") as f:
            self.config = yaml.safe_load(f)

        self.app = QApplication(sys.argv)
        self.taille_ecran = self.app.primaryScreen().size()

        load_stylesheet(self.app)
        self.db_manager = DatabaseManager()
        firebase_config = self.config.get("firebase", {})
        self.api_key = self.config.get("onefichier", {}).get("api_key", "")
        self.auth = FirebaseAuth(firebase_config)
        self.client_1fichier = FichierClient(api_key=self.api_key, be_nice=True)
        self.fenetre = None

        self.sync_thread = SyncDatabase(self.auth,self.db_manager, self.client_1fichier)
        self.sync_thread.finished_sync.connect(
            self._on_sync_finished,
            Qt.ConnectionType.QueuedConnection
        )


    def switch_to_inscription(self) -> None:
        if self.fenetre:
            self.fenetre.close()
        self.fenetre = PageInscription(
            self.auth,
            self.taille_ecran,
            switch_callback=self.switch_to_connexion,
            on_success=self.switch_to_navigateur,
        )
        self.fenetre.show()

    def switch_to_connexion(self) -> None:
        if self.fenetre:
            self.fenetre.close()
        self.fenetre = PageConnexion(
            self.auth,
            self.taille_ecran,
            switch_callback=self.switch_to_inscription,
            on_success=self.switch_to_navigateur,
        )
        self.fenetre.show()

    def switch_to_navigateur(self) -> None:
        if self.fenetre:
            self.fenetre.close()
        self.sync_thread.start()

    def _on_sync_finished(self) -> None:
        self.fenetre = PageNav(self.auth,self.db_manager,self.client_1fichier, self.taille_ecran)
        self.fenetre.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self.fenetre.show()

    def run(self) -> None:
        if self.auth.est_connecte():
            self.switch_to_navigateur()
        else:
            self.switch_to_connexion()
        sys.exit(self.app.exec())
