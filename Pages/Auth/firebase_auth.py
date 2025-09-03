import os
import json
import requests
import pyrebase
from Core.settings import CONFIG_DIR
from Core.logger_config import logger


class FirebaseAuth:
    def __init__(self, firebase_config: dict):
        self.firebase = pyrebase.initialize_app(firebase_config)
        self.auth = self.firebase.auth()

        self.user = None
        self.token_file = os.path.join(CONFIG_DIR, "user_token.json")
        self._charger_token_si_disponible()

    def get_uid(self) -> str | None:
        if self.user:
            uid = self.user.get("localId")
            if uid:
                return uid

            id_token = self.user.get("idToken")
            if id_token:
                try:
                    info = self.auth.get_account_info(id_token)
                    uid = info["users"][0]["localId"]
                    self.user["localId"] = uid
                    self._sauvegarder_token(self.user)
                    return uid
                except Exception as e:
                    logger.error(f"[FirebaseAuth] Erreur récupération UID : {e}")

        logger.warning("[FirebaseAuth] UID introuvable.")
        return None

    def inscrire(self, email: str, password: str) -> dict:
        try:
            user = self.auth.create_user_with_email_and_password(email, password)
            self._finaliser_auth(user)
            return user
        except Exception as e:
            logger.error(f"Erreur inscription : {e}")
            raise Exception(f"Erreur inscription : {e}")

    def connecter(self, email: str, password: str) -> dict:
        try:
            user = self.auth.sign_in_with_email_and_password(email, password)
            self._finaliser_auth(user)
            return user
        except Exception as e:
            logger.error(f"Erreur connexion : {e}")
            raise Exception(f"Erreur connexion : {e}")

    def deconnecter(self):
        self.user = None
        if os.path.exists(self.token_file):
            os.remove(self.token_file)
            logger.info("Token supprimé à la déconnexion.")

    def est_connecte(self) -> bool:
        if not self.user:
            return False

        try:
            self.auth.get_account_info(self.user["idToken"])
            return True
        except Exception as e:
            logger.warning(f"[FirebaseAuth] Erreur connexion : {e}")
            return self._refresh_token()

    def obtenir_token(self) -> str | None:
        if not self.user:
            return None
        return self._refresh_token(return_token=True)

    def envoyer_email_reset(self, email: str):
        try:
            self.auth.send_password_reset_email(email)
            logger.info(f"Email de réinitialisation envoyé à {email}.")
        except Exception as e:
            logger.error(f"Erreur envoi mail reset : {e}")
            raise Exception(f"Erreur envoi mail reset : {e}")

    def mettre_a_jour_profil(self, display_name: str = None, photo_url: str = None) -> dict:
        if not self.user:
            raise Exception("Utilisateur non connecté")

        id_token = self.obtenir_token()
        if not id_token:
            raise Exception("Token invalide ou expiré")

        payload = {}
        if display_name:
            payload["displayName"] = display_name
        if photo_url:
            payload["photoUrl"] = photo_url
        if not payload:
            raise Exception("Aucune donnée à mettre à jour")

        url = f"https://identitytoolkit.googleapis.com/v1/accounts:update?key={self.firebase.api_key}"
        headers = {"Content-Type": "application/json"}
        data = {"idToken": id_token, **payload, "returnSecureToken": True}

        res = requests.post(url, json=data, headers=headers)
        if res.status_code == 200:
            updated = res.json()
            self.user["idToken"] = updated["idToken"]
            self.user["refreshToken"] = updated["refreshToken"]
            self._sauvegarder_token(self.user)
            logger.info("Profil mis à jour avec succès.")
            return updated
        else:
            logger.error(f"Erreur mise à jour profil : {res.json()}")
            raise Exception(f"Erreur mise à jour profil : {res.json()}")

    def get_user_info(self) -> dict | None:
        if not self.user:
            return None
        try:
            return self.auth.get_account_info(self.user["idToken"])
        except Exception as e:
            logger.error(f"[FirebaseAuth] Erreur get_user_info : {e}")
            return None

    # -------------------------
    # Gestion du token JSON
    # -------------------------
    def _sauvegarder_token(self, user_data: dict):
        with open(self.token_file, "w", encoding="utf-8") as f:
            json.dump(user_data, f)
        logger.debug("Token sauvegardé dans le fichier JSON.")

    def _charger_token_si_disponible(self):
        if not os.path.exists(self.token_file):
            return

        try:
            with open(self.token_file, "r", encoding="utf-8") as f:
                saved = json.load(f)

            logger.info("[FirebaseAuth] Lecture fichier token OK")

            old_uid = saved.get("localId")
            refreshed = self.auth.refresh(saved["refreshToken"])

            if old_uid:
                refreshed["localId"] = old_uid

            self.user = refreshed
            self._sauvegarder_token(self.user)

            logger.info(f"[FirebaseAuth] Token rafraîchi. UID : {self.user.get('localId')}")
        except Exception as e:
            self.user = None
            logger.error(f"[FirebaseAuth] Token invalide ou expiré : {e}")

    def _refresh_token(self, return_token=False) -> str | bool:
        try:
            old_uid = self.user.get("localId")
            refreshed = self.auth.refresh(self.user["refreshToken"])
            if old_uid:
                refreshed["localId"] = old_uid

            self.user = refreshed
            self._sauvegarder_token(self.user)

            return refreshed["idToken"] if return_token else True
        except Exception as e:
            logger.error(f"[FirebaseAuth] Token invalide ou expiré : {e}")
            self.user = None
            return None if return_token else False

    def _finaliser_auth(self, user: dict):
        try:
            account_info = self.auth.get_account_info(user["idToken"])
            user["localId"] = account_info["users"][0]["localId"]
            self.user = user
            self._sauvegarder_token(user)
            logger.info(f"[FirebaseAuth] Authentification finalisée. UID : {user['localId']}")
        except Exception as e:
            logger.error(f"Erreur récupération UID : {e}")
            raise Exception(f"Erreur récupération UID : {e}")
