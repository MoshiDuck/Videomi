from PyQt6.QtWidgets import QMessageBox

from Core.Language.i18n import get_text
from Core.logger_config import logger
from Pages.Auth.Widgets.base_auth_page import BaseAuthPage


class PageInscription(BaseAuthPage):
    def __init__(self, firebase_auth, taille_ecran, switch_callback=None, on_success=None):
        fields = [
            (get_text("auth_texts.email"), False),
            (get_text("auth_texts.password"), True)
        ]
        super().__init__(
            title=get_text("auth_texts.register.title"),
            fields=fields,
            primary_btn_text=get_text("auth_texts.register.primary_btn"),
            primary_callback=self._on_register,
            secondary_btn_text=get_text("auth_texts.register.secondary_btn"),
            secondary_callback=switch_callback,
            firebase_auth=firebase_auth,
            taille_ecran=taille_ecran,
            on_success=on_success,
            width_ratio=3,
            height_ratio=2.5,
        )

    def _on_register(self):
        email = self.inputs[get_text("auth_texts.email")].text().strip()
        pwd = self.inputs[get_text("auth_texts.password")].text().strip()

        if not all([email, pwd]):
            QMessageBox.warning(
                self,
                get_text("dialogs.missing_fields.title"),
                get_text("dialogs.missing_fields.message")
            )
            return
        try:
            self.auth.inscrire(email, pwd)
            if self.on_success:
                self.on_success()
        except Exception as e:
            QMessageBox.critical(
                self,
                logger.exception(f"{e}"),
                str(e)
            )
        finally:
            for key in [
                get_text("auth_texts.email"),
                get_text("auth_texts.password")
            ]:
                if key in self.inputs:
                    self.inputs[key].clear()
