import os
from PySide6.QtCore import QSize
from PySide6.QtWidgets import QWidget, QLabel, QHBoxLayout
from config.colors import TEXT_COLOR_LIGHT
from pages.folders.widgets.delete_button import DeleteButton

class FolderItem(QWidget):
    def __init__(self, folder_path: str, delete_callback, parent=None):
        super().__init__(parent)
        self.folder_path = folder_path
        self.delete_callback = delete_callback
        name = os.path.basename(folder_path) or folder_path
        self.label = QLabel(name)
        # Texte blanc, sans fond
        self.label.setStyleSheet(
            f"color: {TEXT_COLOR_LIGHT}; padding:4px;"
        )
        self.label.setWordWrap(False)

        self.btn_delete = DeleteButton(self)
        self.btn_delete.clicked.connect(self._on_delete)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)
        layout.addWidget(self.label, stretch=1)
        layout.addWidget(self.btn_delete, stretch=0)

    def sizeHint(self) -> QSize:
        hint = super().sizeHint()
        return QSize(hint.width(), 40)

    def _on_delete(self):
        if callable(self.delete_callback):
            self.delete_callback(self.folder_path)
