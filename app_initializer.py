from database.folder_database import FolderDatabase
from pages.folders.gestionnaire_dossiers import GestionnaireDossiers
from pages.navigateur.navigateur import Navigateur

class AppInitializer:
    def __init__(self):
        self.config = FolderDatabase()
        self.folders = self.config.get_all_folders()

    def create_main_window(self):
        if self.folders:
            return Navigateur()
        else:
            return GestionnaireDossiers()
