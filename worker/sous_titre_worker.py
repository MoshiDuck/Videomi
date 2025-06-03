from PyQt6.QtCore import QObject, pyqtSignal

from database.sous_titre_manager import SousTitreManager


class SousTitreWorker(QObject):
    finished = pyqtSignal()

    def run(self):
        try:
            manager = SousTitreManager()
            manager.extract_subtitles_from_videos()
            manager.close()
        except Exception as e:
            print(f"Erreur dans SousTitreWorker : {e}")
        self.finished.emit()