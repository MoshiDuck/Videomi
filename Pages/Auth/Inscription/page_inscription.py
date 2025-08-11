from PyQt6.QtWidgets import QMessageBox

from Pages.Auth.Widgets.base_auth_page import BaseAuthPage


class PageInscription(BaseAuthPage):
    def __init__(self, firebase_auth, taille_ecran, switch_callback=None, on_success=None):
        fields = [("Email", False), ("Mot de passe", True)]
        super().__init__(
            title="Inscription",
            fields=fields,
            primary_btn_text="S'inscrire",
            primary_callback=self._on_register,
            secondary_btn_text="Déjà inscrit ?",
            secondary_callback=switch_callback,
            firebase_auth=firebase_auth,
            taille_ecran=taille_ecran,
            on_success=on_success,
            width_ratio=3,
            height_ratio=2.5,
        )

    def _on_register(self):
        email = self.inputs["Email"].text().strip()
        pwd = self.inputs["Mot de passe"].text().strip()
        if not all([email, pwd]):
            QMessageBox.warning(self, "Champs manquants", "Veuillez remplir tous les champs.")
            return
        try:
            self.auth.inscrire(email, pwd)
            if self.on_success:
                self.on_success()
        except Exception as e:
            QMessageBox.critical(self, "Erreur", str(e))
        finally:
            for key in ["Nom d'utilisateur", "Email", "Mot de passe"]:
                self.inputs[key].clear()