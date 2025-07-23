import sys
import traceback
from pathlib import Path

import yaml
from PyQt6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QLabel,
    QPushButton, QProgressBar, QFileDialog, QMessageBox
)

from Models.category import CatManager
from Models.upload_manager import UploadManager
from Service.py1FichierClient import FichierClient

cat_manager = CatManager()

def exception_hook(exc_type, exc_value, exc_tb):
    QMessageBox.critical(None, "Erreur inattendue", str(exc_value))
    traceback.print_exception(exc_type, exc_value, exc_tb)

class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        with open("Config/config.yaml", "r", encoding="utf-8") as f:
            self.config = yaml.safe_load(f)
        self.setWindowTitle("Uploader 1fichier.com")
        self.resize(500, 400)
        self.total_files = 0
        self.files_done = 0
        self.api_key = self.config.get("onefichier", {}).get("api_key", "")
        self.client = FichierClient(api_key=self.api_key, be_nice=True)
        self.folder_ids_by_name = {}

        # 1) Récupère les sub_folders du root
        resp = self.client.get_folders(0)
        existing_names = {f["name"].lower() for f in resp.get("sub_folders", [])}

        # 2) Crée seulement si absent
        for name in ["Videos", "Musiques", "Images", "Documents", "Archives", "Executables"]:
            if name.lower() not in existing_names:
                try:
                    self.client.create_folder(folder_name=name)
                except Exception as e:
                    print(f"Erreur création dossier '{name}': {e}")
                    raise

        folders = self.client.get_folders(0)
        for folder in folders.get("sub_folders", []):
            self.folder_ids_by_name[folder["name"].lower()] = folder["id"]

        existing_files_1fichier = self.get_all_existing_files_by_folder(self.client)

        self.upload_manager = UploadManager(
            self.client,
            cat_manager,
            existing_files_1fichier,
            self.folder_ids_by_name,
        )

        firebase_files = self.upload_manager.get_uploaded_files_from_firebase()
        for key, files_set in firebase_files.items():
            if key in existing_files_1fichier:
                existing_files_1fichier[key].update(files_set)
            else:
                existing_files_1fichier[key] = files_set

        self.existing_files = existing_files_1fichier
        self.upload_manager.existing_files = self.existing_files

        self.label = QLabel("Choisissez un fichier ou un dossier à uploader :")
        self.btn_browse_file = QPushButton("Choisir un fichier…")
        self.btn_browse_folder = QPushButton("Choisir un dossier…")
        self.btn_upload = QPushButton("Uploader")
        self.btn_upload.setEnabled(False)

        self.progress = QProgressBar()
        self.progress.setRange(0, 100)
        self.progress.setValue(0)

        self.label_count = QLabel(" 0 / 0 fichiers")

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
            existing[folder_name].update(client.get_files_in_folder(folder_id))
            subfolders = client.get_folders(folder_id).get("sub_folders", [])
            for sub in subfolders:
                sub_id = sub["id"]
                files = client.get_files_in_folder(sub_id)
                existing[folder_name].update(files)

        return existing

if __name__ == "__main__":
    app = QApplication(sys.argv)
    win = MainWindow()
    win.show()
    sys.excepthook = exception_hook
    sys.exit(app.exec())
