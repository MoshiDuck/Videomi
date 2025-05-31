import os
from pathlib import Path

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QMainWindow, QWidget, QLabel, QFileDialog, QMessageBox

from config.colors import DARK_BG, PRIMARY_COLOR,TEXT_COLOR_ORANGE
from config.texts import (
    APP_TITLE, LABEL_TITLE, MSG_INVALID_FOLDER,
    MSG_DUPLICATE
)
from database.folder_database import FolderDatabase
from widgets.action_buttons import ActionButtons
from widgets.column_widget import Column
from pages.folders.widgets.folder_item import FolderItem
from pages.folders.widgets.list_widget_folds import ListWidgetFolders

class GestionnaireDossiers(QMainWindow):
    def __init__(self):
        super().__init__()
        self.navigateur_window = None
        self.setWindowTitle(APP_TITLE)
        self.setMinimumSize(600, 400)
        self.setStyleSheet(f"QMainWindow {{ background-color: {DARK_BG}; }} QLabel {{ color: {TEXT_COLOR_ORANGE}; }}")

        self.db = FolderDatabase()

        # Titre
        self.lblTitle = QLabel(LABEL_TITLE)
        self.lblTitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lblTitle.setStyleSheet(f"font-size: 24px; color: {PRIMARY_COLOR}; margin: 10px 0;")

        # Liste et boutons
        self.list_widget = ListWidgetFolders()
        self.buttons = ActionButtons(
            add_callback=self.add_folder,
            save_callback=self.save_action
        )

        # Container principal
        main_container = Column(spacing=10, margins=(10, 10, 10, 10))
        main_container.add_widget(self.lblTitle)
        main_container.add_widget(self.list_widget, stretch=1)
        main_container.add_widget(self.buttons)

        container = QWidget()
        container.setLayout(main_container.layout)
        self.setCentralWidget(container)
        self.auto_add_default_folders()
        self.load_folders()

    def load_folders(self):
        self.list_widget.clear()
        for folder in self.db.get_all_folders():
            item = FolderItem(folder, delete_callback=self.delete_folder)
            self.list_widget.add_item(item)

    def add_folder(self):
        folder_path = QFileDialog.getExistingDirectory(self, APP_TITLE)
        if not folder_path or not os.path.isdir(folder_path):
            QMessageBox.warning(self, APP_TITLE, MSG_INVALID_FOLDER)
            return
        if self.db.add_folder(folder_path):
            self.load_folders()
        else:
            QMessageBox.information(self, APP_TITLE, MSG_DUPLICATE)

    def save_action(self):
        if self.list_widget.count() == 0:
            QMessageBox.information(self, APP_TITLE, "Aucun dossier à enregistrer.")
            return

        from pages.navigateur.navigateur import NavigateurWindow
        self.navigateur_window = NavigateurWindow()
        self.navigateur_window.show()
        self.close()

    def delete_folder(self, path):
        self.db.delete_folder(path)
        self.load_folders()

    def closeEvent(self, event):
        self.db.close()
        event.accept()

    def auto_add_default_folders(self):
        user_home = Path.home()
        default_folders = [
            user_home / "Videos",
            user_home / "Downloads",
            user_home / "Music"
        ]

        for folder in default_folders:
            if folder.exists() and folder.is_dir():
                existing_folders = set(self.db.get_all_folders())
                if str(folder) not in existing_folders:
                    self.db.add_folder(str(folder))