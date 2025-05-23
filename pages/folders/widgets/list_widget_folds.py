from PySide6.QtCore import Qt
from PySide6.QtWidgets import QWidget, QListWidget, QListWidgetItem, QVBoxLayout, QFrame
from config.colors import ITEM_BG, LIST_BG, TEXT_COLOR_LIGHT, PRIMARY_COLOR

class ListWidgetFolders(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)

        self.list_widget = QListWidget()
        self.list_widget.setFrameShape(QFrame.NoFrame)
        self.list_widget.setFocusPolicy(Qt.NoFocus)

        self.list_widget.setStyleSheet(f"""
            /* Conteneur global transparent */
            QListWidget {{
                background: transparent;
                border: none;
                padding: 0;
            }}

            /* Ligne non sélectionnée : fond ITEM_BG */
            QListWidget::item {{
                background-color: {ITEM_BG};
                color: {TEXT_COLOR_LIGHT};
                padding: 4px 8px;
                margin: 2px 0;
            }}

            /* Ligne sélectionnée : fond LIST_BG + bande orange à gauche */
            QListWidget::item:selected {{
                background-color: {LIST_BG};
                border-left: 2px solid {PRIMARY_COLOR};
                padding-left: 6px; /* compense la bordure */
            }}

            /* Même rendu si la fenêtre perd le focus */
            QListWidget::item:selected:!active {{
                background-color: {LIST_BG};
                border-left: 2px solid {PRIMARY_COLOR};
                padding-left: 6px;
            }}
        """)

        self.layout.addWidget(self.list_widget)

    def count(self):
        return self.list_widget.count()

    def clear(self):
        self.list_widget.clear()

    def add_item(self, widget_item):
        item = QListWidgetItem()
        item.setSizeHint(widget_item.sizeHint())
        self.list_widget.addItem(item)
        self.list_widget.setItemWidget(item, widget_item)

    def items(self):
        return [
            self.list_widget.itemWidget(self.list_widget.item(i))
            for i in range(self.list_widget.count())
        ]
