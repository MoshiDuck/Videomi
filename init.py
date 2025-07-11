# init.py
import sys
import yaml
from PyQt6.QtCore import QFile, QTextStream, Qt
from PyQt6.QtWidgets import QApplication
from Pages.Auth.Inscription.page_inscription import PageInscription
from Pages.Auth.Connexion.page_connexion import PageConnexion
from Pages.Auth.firebase_auth import FirebaseAuth
from Pages.Navigateur.page_nav import PageNav


def load_stylesheet(app, path="Config/style.qss"):
    file = QFile(path)
    if file.open(QFile.OpenModeFlag.ReadOnly | QFile.OpenModeFlag.Text):
        stream = QTextStream(file)
        app.setStyleSheet(stream.readAll())
        file.close()
    else:
        print(f"Impossible de charger le style : {path}")

class Init:
    def __init__(self):
        with open("Config/config.yaml", "r") as f:
            self.config = yaml.safe_load(f)

        self.app = QApplication(sys.argv)
        screen = self.app.primaryScreen()
        self.taille_ecran = screen.size()
        load_stylesheet(self.app)

        firebase_config = self.config['firebase']
        self.auth = FirebaseAuth(firebase_config)
        self.fenetre = None

    def switch_to_inscription(self):
        if self.fenetre:
            self.fenetre.close()
        self.fenetre = PageInscription(
            self.auth,
            self.taille_ecran,
            switch_callback=self.switch_to_connexion,
            on_success=self.switch_to_navigateur
        )
        self.fenetre.show()

    def switch_to_connexion(self):
        if self.fenetre:
            self.fenetre.close()
        self.fenetre = PageConnexion(
            self.auth,
            self.taille_ecran,
            switch_callback=self.switch_to_inscription,
            on_success=self.switch_to_navigateur
        )
        self.fenetre.show()

    def switch_to_navigateur(self):
        if self.fenetre:
            self.fenetre.close()
        self.fenetre = PageNav(self.auth, self.taille_ecran)
        self.fenetre.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self.fenetre.show()

    def run(self):
        if self.auth.est_connecte():
            self.switch_to_navigateur()
        else:
            self.switch_to_connexion()
        sys.exit(self.app.exec())
