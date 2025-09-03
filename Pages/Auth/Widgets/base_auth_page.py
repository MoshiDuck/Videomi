from typing import Callable, Optional

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLabel, QScrollArea, QFrame, QHBoxLayout, QPushButton, QLineEdit

from Core.Fenetre.base_fenetre import BaseFenetre


class BaseAuthPage(BaseFenetre):
    def __init__(
        self,
        title: str,
        fields: list[tuple[str, bool]],
        primary_btn_text: str,
        primary_callback: Callable,
        secondary_btn_text: str,
        secondary_callback: Callable,
        firebase_auth,
        taille_ecran,
        on_success: Optional[Callable] = None,
        width_ratio: float = 2,
        height_ratio: float = 2,
    ):
        super().__init__(largeur=(taille_ecran.width() / width_ratio), hauteur= (taille_ecran.height() / height_ratio))
        self.auth = firebase_auth
        self.on_success = on_success
        self.title = title
        self._build_ui(fields, primary_btn_text, primary_callback, secondary_btn_text, secondary_callback)

    def _build_ui(
            self,
            fields,
            primary_btn_text,
            primary_callback,
            secondary_btn_text,
            secondary_callback,
    ):
        main_layout = self.central_layout
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(20)

        title_label = QLabel(self.title)
        title_label.setObjectName("titre")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(title_label)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        container = QWidget()
        form_layout = QVBoxLayout(container)
        form_layout.setSizeConstraint(QVBoxLayout.SizeConstraint.SetMinimumSize)
        form_layout.setContentsMargins(0, 0, 0, 0)
        form_layout.setSpacing(8)
        form_layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        # Create input fields
        self.inputs = {}
        for label, pwd in fields:
            widget, input_field = self._create_field(label, pwd)
            self.inputs[label] = input_field
            form_layout.addWidget(widget)

        scroll.setWidget(container)
        main_layout.addWidget(scroll)

        # Buttons
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(10)
        secondary_btn = QPushButton(secondary_btn_text)
        primary_btn = QPushButton(primary_btn_text)
        secondary_btn.clicked.connect(secondary_callback)
        primary_btn.clicked.connect(primary_callback)
        btn_layout.addWidget(secondary_btn)
        btn_layout.addWidget(primary_btn)
        main_layout.addLayout(btn_layout)

    @staticmethod
    def _create_field(label_text: str, password: bool = False) -> tuple[QWidget, QLineEdit]:
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setSpacing(5)
        label = QLabel(label_text)
        edit = QLineEdit()
        if password:
            edit.setEchoMode(QLineEdit.EchoMode.Password)
        layout.addWidget(label)
        layout.addWidget(edit)
        return container, edit
