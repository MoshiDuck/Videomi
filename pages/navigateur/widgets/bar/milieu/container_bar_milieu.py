from PySide6.QtWidgets import QWidget, QHBoxLayout, QSizePolicy
from pages.navigateur.widgets.bar.milieu.card_categorie import CardCategorie

class ContainerBarMilieu(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Expanding)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self.card = CardCategorie()
        layout.addWidget(self.card)

