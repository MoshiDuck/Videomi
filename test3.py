import sys
import traceback
from pathlib import Path

from PyQt6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QLabel,
    QPushButton, QProgressBar, QFileDialog, QMessageBox
)
from pyOneFichierClient.OneFichierAPI.exceptions import FichierResponseNotOk

from Models.category import CatManager
from Service.onefichier_service import FichierClient
from Models.upload_manager import UploadManager

cat_manager = CatManager()

def exception_hook(exc_type, exc_value, exc_tb):
    QMessageBox.critical(None, "Erreur inattendue", str(exc_value))
    traceback.print_exception(exc_type, exc_value, exc_tb)

def get_files_in_folder(folder_id):
    client = FichierClient()
    files = set()
    offset = 0
    limit = 100
    while True:
        try:
            resp = client.api_call(
                "https://api.1fichier.com/v1/file/ls.cgi",
                json_data={"folder_id": folder_id, "offset": offset, "limit": limit}
            )
            batch = resp.get("files", [])
            if not batch:
                break
            for f in batch:
                name_clean = f["name"].strip().lower()
                files.add(name_clean)
            if len(batch) < limit:
                break
            offset += limit
        except Exception as e:
            print(f"❌ Erreur récupération fichiers dossier {folder_id} : {e}")
            break
    return files

class MainWindow(QWidget):
    def __init__(self):
        super().__init__()

        self.setWindowTitle("Uploader 1fichier.com")
        self.resize(500, 400)
        self.total_files = 0
        self.files_done = 0
        self.client = FichierClient()
        self.folder_ids_by_name = {}

        # Création des dossiers catégories s'ils n'existent pas
        for name in ["Videos", "Musiques", "Images", "Documents", "Archives"]:
            try:
                self.client.create_folder(folder_name=name)
            except FichierResponseNotOk as e:
                if "Folder already exist" not in str(e):
                    raise

        folders = self.client.get_folders(0)
        for folder in folders.get("sub_folders", []):
            self.folder_ids_by_name[folder["name"].lower()] = folder["id"]

        # Récupération fichiers existants depuis 1fichier.com
        existing_files_1fichier = self.get_all_existing_files_by_folder(self.client)

        # Init UploadManager avec fichiers existants de 1fichier
        self.upload_manager = UploadManager(
            self.client,
            cat_manager,
            existing_files_1fichier,
            self.folder_ids_by_name,
        )

        # Récupération fichiers uploadés depuis Firebase et fusion
        firebase_files = self.upload_manager.get_uploaded_files_from_firebase()
        for key, files_set in firebase_files.items():
            if key in existing_files_1fichier:
                existing_files_1fichier[key].update(files_set)
            else:
                existing_files_1fichier[key] = files_set

        # Mise à jour de existing_files avec la fusion
        self.existing_files = existing_files_1fichier
        # Remettre à jour dans upload_manager (si besoin)
        self.upload_manager.existing_files = self.existing_files

        self.label = QLabel("Choisissez un fichier ou un dossier à uploader :")
        self.btn_browse_file = QPushButton("Choisir un fichier…")
        self.btn_browse_folder = QPushButton("Choisir un dossier…")
        self.btn_upload = QPushButton("Uploader")
        self.btn_upload.setEnabled(False)

        self.progress = QProgressBar()
        self.progress.setRange(0, 100)
        self.progress.setValue(0)

        self.label_count = QLabel("0 / 0 fichiers")

        layout = QVBoxLayout()
        layout.addWidget(self.label)
        layout.addWidget(self.btn_browse_file)
        layout.addWidget(self.btn_browse_folder)
        layout.addWidget(self.btn_upload)
        layout.addWidget(self.progress)
        layout.addWidget(self.label_count)
        self.setLayout(layout)

        self.btn_browse_file.clicked.connect(self.browse_file)
        self.btn_browse_folder.clicked.connect(self.browse_folder)
        self.btn_upload.clicked.connect(self.start_upload)

        self.files_to_upload = []

        self.upload_manager.progress.connect(self.progress.setValue)
        self.upload_manager.finished.connect(lambda link, file: print(f"✔ Upload fini: {file} → {link}"))
        self.upload_manager.error.connect(lambda msg: print(f"❌ Erreur upload : {msg}"))
        self.upload_manager.all_done.connect(self.on_uploads_done)

    def browse_file(self):
        file_path, _ = QFileDialog.getOpenFileName(self, "Choisir un fichier")
        if file_path:
            self.files_to_upload = [(file_path, False)]
            self.btn_upload.setEnabled(True)
            self.label.setText(f"Fichier sélectionné : {Path(file_path).name}")

    def browse_folder(self):
        folder_path = QFileDialog.getExistingDirectory(self, "Choisir un dossier")
        if folder_path:
            folder = Path(folder_path)
            files = [f for f in folder.glob("*") if f.is_file()]
            if not files:
                QMessageBox.information(self, "Aucun fichier", "Le dossier sélectionné est vide.")
                return
            self.files_to_upload = [(str(f), False) for f in files]
            self.btn_upload.setEnabled(True)
            self.label.setText(f"{len(files)} fichiers sélectionnés dans : {folder.name}")

    def update_count_label(self):
        self.label_count.setText(f"{self.files_done} / {self.total_files} fichiers")

    def start_upload(self):
        self.progress.setValue(0)
        self.btn_browse_file.setEnabled(False)
        self.btn_browse_folder.setEnabled(False)
        self.btn_upload.setEnabled(False)

        self.upload_manager.set_files(self.files_to_upload)
        self.upload_manager.start()

    def on_uploads_done(self):
        self.btn_browse_file.setEnabled(True)
        self.btn_browse_folder.setEnabled(True)
        self.btn_upload.setEnabled(True)
        print("Tous les uploads sont terminés.")

    @staticmethod
    def get_all_existing_files_by_folder(client):
        existing = {}
        top_level = client.get_folders(0).get("sub_folders", [])

        for folder in top_level:
            folder_name = folder["name"].lower()
            folder_id = folder["id"]
            existing[folder_name] = set()

            # Ajout fichiers du dossier principal
            existing[folder_name].update(get_files_in_folder(folder_id))

            # Parcours des sous-dossiers pour ajouter leurs fichiers aussi
            subfolders = client.get_folders(folder_id).get("sub_folders", [])
            for sub in subfolders:
                sub_id = sub["id"]
                files = get_files_in_folder(sub_id)
                existing[folder_name].update(files)

        return existing

if __name__ == "__main__":
    app = QApplication(sys.argv)
    win = MainWindow()
    win.show()
    sys.excepthook = exception_hook
    sys.exit(app.exec())
