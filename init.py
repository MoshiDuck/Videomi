import logging
import os
import sys
import yaml

from PyQt6.QtCore import QFile, QTextStream, Qt
from PyQt6.QtWidgets import QApplication

from Database.db_manager import DatabaseManager
from Database.sync_database import SyncDatabase
from Service.py1FichierClient import FichierClient
from Pages.Auth.Connexion.page_connexion import PageConnexion
from Pages.Auth.Inscription.page_inscription import PageInscription
from Pages.Auth.firebase_auth import FirebaseAuth
from Pages.Navigateur.page_nav import PageNav

# Configuration environnementale
os.environ["QT_LOGGING_RULES"] = "*.debug=true"

# Constantes
DB_PATH = "local_data.db"
CACHE_DIR = os.path.join(os.getcwd(), "cache", "images")
MAX_CACHE_SIZE_MB = 100
CONFIG_PATH = "Config/config.yaml"
STYLE_PATH = "Config/style.qss"

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s][%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def load_stylesheet(app: QApplication, path: str = STYLE_PATH) -> None:
    """Charge une feuille de style QSS dans l'application."""
    file = QFile(path)
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
        self.config = self._load_config(CONFIG_PATH)
        self.app = QApplication(sys.argv)
        self.taille_ecran = self.app.primaryScreen().size()

        load_stylesheet(self.app)

        self.db_manager = DatabaseManager()
        firebase_config = self.config.get("firebase", {})
        api_key = self.config.get("onefichier", {}).get("api_key", "")

        self.auth = FirebaseAuth(firebase_config)
        self.client_1fichier = FichierClient(api_key=api_key, be_nice=True)
        self.fenetre = None

        self.sync_thread = SyncDatabase(self.auth, self.db_manager, self.client_1fichier)
        self.sync_thread.finished_sync.connect(
            self._on_sync_finished,
            Qt.ConnectionType.QueuedConnection
        )

    @staticmethod
    def _load_config(path: str) -> dict:
        """Charge la configuration YAML avec gestion d'erreurs."""
        if not os.path.isfile(path):
            logger.error(f"Fichier de configuration introuvable : {path}")
            return {}
        try:
            with open(path, "r", encoding="utf-8") as f:
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
        if self.auth.est_connecte():
            logger.info("Utilisateur déjà connecté, chargement du navigateur")
            self.switch_to_navigateur()
        else:
            logger.info("Utilisateur non connecté, affichage page de connexion")
            self.switch_to_connexion()
        sys.exit(self.app.exec())
