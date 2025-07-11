from PyQt6.QtWidgets import QMessageBox

from Pages.Auth.Widgets.base_auth_page import BaseAuthPage


class PageConnexion(BaseAuthPage):
    def __init__(self, firebase_auth, taille_ecran, switch_callback=None, on_success=None):
        fields = [("Email", False), ("Mot de passe", True)]
        super().__init__(
            title="Connexion",
            fields=fields,
            primary_btn_text="Se connecter",
            primary_callback=self._on_login,
            secondary_btn_text="Créer un compte",
            secondary_callback=switch_callback,
            firebase_auth=firebase_auth,
            taille_ecran=taille_ecran,
            on_success=on_success,
            width_ratio=3,
            height_ratio=2.5,
        )

    def _on_login(self):
        email = self.inputs["Email"].text().strip()
        pwd = self.inputs["Mot de passe"].text().strip()
        try:
            self.auth.connecter(email, pwd)
            if self.on_success:
                self.on_success()
        except Exception as e:
            QMessageBox.critical(self, "Erreur", str(e))
        finally:
            self.inputs["Email"].clear()
            self.inputs["Mot de passe"].clear()