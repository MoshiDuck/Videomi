from PyQt6 import QtCore

class GestionnaireNavigation(QtCore.QObject):
    changement = QtCore.pyqtSignal()

    def __init__(self):
        super().__init__()
        self.dossier_actuel = None
        self.historique = []
        self.index_historique = -1

    def ajouter_historique(self, chemin):
        if self.historique and self.historique[-1] == chemin:
            return
        self.historique = self.historique[:self.index_historique + 1]
        self.historique.append(chemin)
        self.index_historique += 1
        self.changement.emit()

    def precedent(self):
        if self.index_historique > 0:
            self.index_historique -= 1
            self.dossier_actuel = self.historique[self.index_historique]
            self.changement.emit()

    def suivant(self):
        if self.index_historique < len(self.historique) - 1:
            self.index_historique += 1
            self.dossier_actuel = self.historique[self.index_historique]
            self.changement.emit()

    def changer_dossier(self, nouveau_dossier):
        if nouveau_dossier is None:
            self.dossier_actuel = None
            self.historique.clear()
            self.index_historique = -1
        else:
            self.ajouter_historique(nouveau_dossier)
            self.dossier_actuel = nouveau_dossier
        self.changement.emit()