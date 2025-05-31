from pages.folders.gestionnaire_dossiers import GestionnaireDossiers
from test_py.configuration.gestionnaire import GestionnaireConfiguration
from test_py.navigateur.fenetre import NavigateurVideos

class AppInitializer:
    def __init__(self):
        self.config = GestionnaireConfiguration()
        self.folders = self.config.get_all_folders()

    def create_main_window(self):
        if self.folders:
            return NavigateurVideos()
        else:
            return GestionnaireDossiers()  # Ou autre fenêtre de setup initial
