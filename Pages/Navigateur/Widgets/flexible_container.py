# Todo : flexible_container.py
from PyQt6.QtWidgets import QWidget, QHBoxLayout, QSizePolicy, QFrame

class FlexibleContainer(QWidget):
    pan1: QWidget
    pan2: QWidget
    pan3: QWidget
    pan4: QWidget

    def __init__(self, parent=None, ratios=None, dividers=False, divider_color="#444"):
        super().__init__(parent)
        if ratios is None:
            ratios = [1, 1, 1]

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        self.panels = []

        for i, ratio in enumerate(ratios, start=1):
            pan = QWidget(self)
            pan.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
            layout.addWidget(pan, ratio)
            self.panels.append(pan)
            setattr(self, f"pan{i}", pan)

            # Dividers
            if dividers and i < len(ratios):
                divider = QFrame(self)
                divider.setFrameShape(QFrame.Shape.VLine)
                divider.setFrameShadow(QFrame.Shadow.Plain)
                divider.setStyleSheet(
                    f"color: {divider_color}; background-color: {divider_color};"
                )
                layout.addWidget(divider)
        self.setLayout(layout)