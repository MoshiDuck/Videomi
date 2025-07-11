from PyQt6.QtWidgets import QWidget, QHBoxLayout, QSizePolicy

class TripleContainer(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.pan1 = QWidget(self)
        self.pan2 = QWidget(self)
        self.pan3 = QWidget(self)

        for pan in (self.pan1, self.pan2, self.pan3):
            pan.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Fixed)
            layout.addWidget(pan, 1)

        self.setLayout(layout)
