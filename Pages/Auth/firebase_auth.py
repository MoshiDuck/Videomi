# firebase_auth.py
import firebase_admin
import pyrebase
import os
import json
import requests
from firebase_admin import credentials


class FirebaseAuth:
    def __init__(self, firebase_config):
        path_cred = "Config/config.json"
        database_url = "https://videomi-2ee1c-default-rtdb.firebaseio.com/  "

        if not firebase_admin._apps:
            cred = credentials.Certificate(path_cred)
            firebase_admin.initialize_app(cred, {
                'databaseURL': database_url
            })
        firebase = pyrebase.initialize_app(firebase_config)
        self.auth = firebase.auth()
        self.firebase = firebase

        self.user = None
        self.token_file = "user_token.json"
        self._charger_token_si_disponible()


    def get_uid(self) -> str | None:
        if self.user and "localId" in self.user:
            return self.user["localId"]

        print("[FirebaseAuth] UID introuvable dans self.user.")
        return None

    def inscrire(self, email: str, password: str):
        try:
            user = self.auth.create_user_with_email_and_password(email, password)
            # Récupérer le localId manuellement
            account_info = self.auth.get_account_info(user["idToken"])
            user["localId"] = account_info["users"][0]["localId"]
            self.user = user
            self._sauvegarder_token(user)
            return user
        except Exception as e:
            raise Exception(f"Erreur inscription : {e}")

    def connecter(self, email: str, password: str):
        try:
            user = self.auth.sign_in_with_email_and_password(email, password)
            # Récupérer le localId manuellement
            account_info = self.auth.get_account_info(user["idToken"])
            user["localId"] = account_info["users"][0]["localId"]
            self.user = user
            self._sauvegarder_token(user)
            return user
        except Exception as e:
            raise Exception(f"Erreur connexion : {e}")

    def deconnecter(self):
        """Déconnexion (simple reset + suppression fichier token)."""
        self.user = None
        if os.path.exists(self.token_file):
            os.remove(self.token_file)

    def est_connecte(self) -> bool:
        """Retourne True si un utilisateur est connecté et token valide."""
        if not self.user:
            return False
        try:
            self.auth.get_account_info(self.user["idToken"])
            return True
        except:
            try:
                self.user = self.auth.refresh(self.user['refreshToken'])
                self._sauvegarder_token(self.user)
                return True
            except:
                return False

    def obtenir_token(self) -> str | None:
        """Récupère le token d'authentification valide."""
        if not self.user:
            return None
        try:
            self.user = self.auth.refresh(self.user['refreshToken'])
            self._sauvegarder_token(self.user)
            return self.user['idToken']
        except Exception:
            return None

    def envoyer_email_reset(self, email: str):
        """Envoie un mail de réinitialisation de mot de passe."""
        try:
            self.auth.send_password_reset_email(email)
        except Exception as e:
            raise Exception(f"Erreur envoi mail reset : {e}")

    def mettre_a_jour_profil(self, display_name: str = None, photo_url: str = None):
        """Met à jour le profil utilisateur."""
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
        data = {
            "idToken": id_token,
            **payload,
            "returnSecureToken": True
        }
        res = requests.post(url, json=data, headers=headers)
        if res.status_code == 200:
            updated_user = res.json()
            self.user['idToken'] = updated_user['idToken']
            self.user['refreshToken'] = updated_user['refreshToken']
            self._sauvegarder_token(self.user)
            return updated_user
        else:
            raise Exception(f"Erreur mise à jour profil : {res.json()}")

    def get_user_info(self):
        """Récupère les infos de l'utilisateur connecté."""
        if not self.user:
            return None
        return self.auth.get_account_info(self.user['idToken'])

    def _sauvegarder_token(self, user_data: dict):
        """Sauvegarde les données d'utilisateur dans un fichier local."""
        with open(self.token_file, "w") as f:
            json.dump(user_data, f)

    def _charger_token_si_disponible(self):
        """Charge les données d'utilisateur si elles existent localement et essaie de rafraîchir le token."""
        if os.path.exists(self.token_file):
            try:
                with open(self.token_file, "r") as f:
                    user_data = json.load(f)
                    print("[FirebaseAuth] Lecture fichier token OK")

                    # Rafraîchir le token
                    refreshed_user = self.auth.refresh(user_data["refreshToken"])

                    # 👇 Conserve le localId d'origine
                    if "localId" in user_data:
                        refreshed_user["localId"] = user_data["localId"]

                    self.user = refreshed_user
                    self._sauvegarder_token(refreshed_user)
                    print(f"[FirebaseAuth] Token rafraîchi. UID : {self.user.get('localId')}")
            except Exception as e:
                self.user = None
                print(f"[FirebaseAuth] Token invalide ou expiré: {e}")
