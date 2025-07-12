import json
import sqlite3
import sys
import yaml
import os
import re
import hashlib
import requests

from io import BytesIO
from PyQt6.QtCore import QFile, QTextStream, Qt, QThread, pyqtSignal
from PyQt6.QtWidgets import QApplication
from pyOneFichierClient.OneFichierAPI import FichierClient

from Pages.Auth.Inscription.page_inscription import PageInscription
from Pages.Auth.Connexion.page_connexion import PageConnexion
from Pages.Auth.firebase_auth import FirebaseAuth
from Pages.Navigateur.page_nav import PageNav

DB_PATH = "local_data.db"

def load_stylesheet(app, path="Config/style.qss"):
    file = QFile(path)
    if file.open(QFile.OpenModeFlag.ReadOnly | QFile.OpenModeFlag.Text):
        stream = QTextStream(file)
        app.setStyleSheet(stream.readAll())
        file.close()
    else:
        print(f"Impossible de charger le style : {path}")

class SyncThread(QThread):
    """Thread de synchronisation Firebase → SQLite + téléchargement des images."""
    finished_sync = pyqtSignal()

    def __init__(self, firebase_auth, client_1fichier):
        super().__init__()
        self.auth = firebase_auth
        self.client_1fichier = client_1fichier

    def parse_json_safe(self, js):
        try:
            return json.loads(js or "{}")
        except Exception:
            return {}

    def json_equal(self, a, b):
        return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)

    def run(self):
        try:
            print("[SyncThread] Démarrage de la synchronisation...")

            uid = self.auth.get_uid()
            token = self.auth.obtenir_token()
            if uid is None or token is None:
                print("[SyncThread] UID ou token manquant, abort sync.")
                self.finished_sync.emit()
                return

            db = self.auth.firebase.database()
            root = db.child('users').child(uid).get(token).val() or {}

            cache_dir = os.path.join(os.getcwd(), "cache", "images")
            os.makedirs(cache_dir, exist_ok=True)

            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()

            c.execute("SELECT category, title, file_link, thumbnail_url, metadata_json FROM files")
            local_data = {
                (row[0], row[1]): {
                    'file_link': row[2],
                    'thumbnail_url': row[3],
                    'metadata_json': row[4],
                }
                for row in c.fetchall()
            }

            updated = 0
            inserted = 0

            for category, titles in root.items():
                for title, entry in (titles or {}).items():
                    if not isinstance(entry, dict):
                        continue

                    file_link = entry.get('file_link', '')
                    thumb_link = entry.get('thumbnail_link', '')
                    metadata = entry.get('metadata', {})
                    metadata_json = json.dumps(metadata, ensure_ascii=False)

                    original_url = thumb_link
                    local_thumb_path = ""

                    # Téléchargement de la miniature si besoin
                    if thumb_link:
                        fname = hashlib.md5(original_url.encode('utf-8')).hexdigest() + ".jpg"
                        local_thumb_path = os.path.join(cache_dir, fname)

                        if os.path.exists(local_thumb_path):
                            print(f"[SyncThread] Miniature déjà existante : {local_thumb_path}")
                        else:
                            try:
                                resp = requests.get(thumb_link, timeout=10)
                                resp.raise_for_status()
                                with open(local_thumb_path, 'wb') as f:
                                    f.write(resp.content)
                                print(f"[SyncThread] Miniature téléchargée : {local_thumb_path}")
                            except Exception as e:
                                print(f"[SyncThread] Échec téléchargement {thumb_link} : {e}")
                                local_thumb_path = ""

                    key = (category, title)
                    if key in local_data:
                        local_entry = local_data[key]

                        # 1) Mise à jour des liens uniquement s'ils manquent en local
                        link_needs_update = (
                            not local_entry['file_link'] or
                            not local_entry['thumbnail_url']
                        )
                        # 2) Comparaison stricte des métadonnées
                        local_meta = self.parse_json_safe(local_entry['metadata_json'])
                        metadata_needs_update = not self.json_equal(local_meta, metadata)

                        db_needs_update = link_needs_update or metadata_needs_update

                        if db_needs_update:
                            print(f"[SyncThread] Mise à jour locale pour {category} → {title} :")
                            if link_needs_update:
                                if not local_entry['file_link']:
                                    print(f"  - Ajout file_link distant : {file_link}")
                                if not local_entry['thumbnail_url']:
                                    print(f"  - Ajout thumbnail_url distant : {thumb_link}")
                            if metadata_needs_update:
                                print(f"  - metadata local: {local_meta}")
                                print(f"  - metadata distant: {metadata}")

                            # Mise à jour de tous les champs (les liens identiques sont réécrits sans effet)
                            c.execute("""
                                UPDATE files
                                   SET file_link      = ?,
                                       thumbnail_url  = ?,
                                       thumbnail_path = ?,
                                       metadata_json  = ?
                                 WHERE category=? AND title=?
                            """, (
                                file_link,
                                thumb_link,
                                local_thumb_path,
                                metadata_json,
                                category, title
                            ))
                            updated += 1
                        else:
                            print(f"[SyncThread] Pas de changement pour {category} → {title}, inchangé.")

                    else:
                        print(f"[SyncThread] Nouvelle entrée ajoutée : {category} → {title}")
                        c.execute("""
                            INSERT INTO files (category, title, file_link, thumbnail_url, thumbnail_path, metadata_json)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (category, title, file_link, thumb_link, local_thumb_path, metadata_json))
                        inserted += 1

            # Suppression des entrées locales absentes de Firebase
            firebase_keys = {(cat, tit) for cat, ts in root.items() for tit in ts}
            local_keys = set(local_data.keys())
            for category, title in (local_keys - firebase_keys):
                print(f"[SyncThread] Suppression locale : {category} → {title}")
                c.execute("DELETE FROM files WHERE category=? AND title=?", (category, title))

            conn.commit()
            conn.close()
            print(f"[SyncThread] Mise à jour terminée : {updated} modifiés, {inserted} insérés.")
            print("[SyncThread] Synchronisation terminée.")
            self.finished_sync.emit()

        except Exception as e:
            print(f"[SyncThread] Erreur inattendue : {e}")
            self.finished_sync.emit()


class Init:
    def __init__(self):
        with open("Config/config.yaml", "r") as f:
            self.config = yaml.safe_load(f)

        self.app = QApplication(sys.argv)
        screen = self.app.primaryScreen()
        self.taille_ecran = screen.size()
        load_stylesheet(self.app)

        firebase_config = self.config['firebase']
        self.api_key = self.config['onefichier']['api_key']
        self.auth = FirebaseAuth(firebase_config)
        self.client_1fichier = FichierClient(APIkey=self.api_key)
        self.fenetre = None

        # création de la table SQLite
        self._init_sqlite()

        # préparer le thread de sync, connecté à l'ouverture de PageNav
        self.sync_thread = SyncThread(self.auth, self.client_1fichier)
        self.sync_thread.finished_sync.connect(self._on_sync_finished)

    def _init_sqlite(self):
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            file_link TEXT,
            thumbnail_url TEXT,
            thumbnail_path TEXT,
            metadata_json TEXT
        )
        """)
        conn.commit()
        conn.close()

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
        """Démarre la synchro + téléchargement, PageNav attend la fin."""
        if self.fenetre:
            self.fenetre.close()
        self.sync_thread.start()

    def _on_sync_finished(self):
        """Slot appelé une fois la base et les images prêtes."""
        self.fenetre = PageNav(self.auth, self.taille_ecran)
        self.fenetre.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        self.fenetre.show()

    def run(self):
        if self.auth.est_connecte():
            self.switch_to_navigateur()
        else:
            self.switch_to_connexion()
        sys.exit(self.app.exec())
