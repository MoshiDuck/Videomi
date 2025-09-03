from PyQt6.QtWidgets import QMessageBox

from Core.Language.i18n import get_text
from Pages.Auth.Widgets.base_auth_page import BaseAuthPage


class PageConnexion(BaseAuthPage):
    def __init__(self, firebase_auth, taille_ecran, switch_callback=None, on_success=None):
        fields = [
            (get_text("auth_texts.email"), False),
            (get_text("auth_texts.password"), True)
        ]
        super().__init__(
            title=get_text("auth_texts.login.title"),
            fields=fields,
            primary_btn_text=get_text("auth_texts.login.primary_btn"),
            primary_callback=self._on_login,
            secondary_btn_text=get_text("auth_texts.login.secondary_btn"),
            secondary_callback=switch_callback,
            firebase_auth=firebase_auth,
            taille_ecran=taille_ecran,
            on_success=on_success,
            width_ratio=3,
            height_ratio=2.5,
        )

    def _on_login(self):
        email = self.inputs[get_text("auth_texts.email")].text().strip()
        pwd = self.inputs[get_text("auth_texts.password")].text().strip()
        try:
            self.auth.connecter(email, pwd)
            if self.on_success:
                self.on_success()
        except Exception as e:
            QMessageBox.critical(
                self,
                get_text("dialogs.error.title"),
                str(e)
            )
        finally:
            for key in [get_text("auth_texts.email"), get_text("auth_texts.password")]:
                if key in self.inputs:
                    self.inputs[key].clear()
