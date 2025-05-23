from PySide6.QtGui import QStandardItemModel, QStandardItem
from PySide6.QtWidgets import (
    QComboBox, QSizePolicy, QHBoxLayout, QLabel, QWidget, QLineEdit
)
from PySide6.QtCore import Qt, QEvent
import qtawesome as qta

from config.colors import DARK_ICON, PRIMARY_COLOR

class BoxChoix(QComboBox):
    def __init__(self, icon_text: str = None):
        super().__init__()
        self.setModel(QStandardItemModel(self))
        self.view().pressed.connect(self.handle_item_pressed)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setEditable(True)

        # Création du conteneur personnalisé (icône + lineEdit)
        self.container = QWidget(self)
        layout = QHBoxLayout(self.container)
        layout.setContentsMargins(6, 0, 6, 0)
        layout.setSpacing(6)

        self.icon_label = QLabel()
        if icon_text:
            icon = qta.icon(icon_text, color=DARK_ICON)
            pixmap = icon.pixmap(24, 24)  # tu peux changer la taille ici
            self.icon_label.setPixmap(pixmap)

        layout.addWidget(self.icon_label, alignment=Qt.AlignVCenter)

        self.line_edit = QLineEdit()
        self.line_edit.setReadOnly(True)
        self.line_edit.setFrame(False)
        self.line_edit.installEventFilter(self)
        self.line_edit.setStyleSheet("""
            background: transparent;
            color: white;
            font-size: 15px;
            padding: 0;
            margin: 0;
        """)
        layout.addWidget(self.line_edit)

        self.container.setStyleSheet("""
            background-color: transparent;
        """)

        self.setLineEdit(QLineEdit())  # obligatoire mais caché
        self.lineEdit().hide()
        self.container.setParent(self)
        self.container.show()

        # Style sombre de la ComboBox (popup, bordure, etc.)
        self.setStyleSheet(f"""
            QComboBox {{
                border: 1px solid {PRIMARY_COLOR};
                border-radius: 6px;
                padding: 6px;
                font-size: 14px;
            }}
            QComboBox QAbstractItemView {{
                background-color: #2e2e2e;
                color: white;
                selection-background-color: #444;
                border: 1px solid #555;
                font-size: 13px;
            }}
            QComboBox::down-arrow {{ image: none; }}
            QComboBox::drop-down {{ width: 0px; border: none; }}
        """)

        # Données
        self.items = ["Tous", "Français", "Anglais", "Espagnol"]
        for text in self.items:
            item = QStandardItem(text)
            item.setFlags(Qt.ItemIsUserCheckable | Qt.ItemIsEnabled)
            item.setData(Qt.Checked, Qt.CheckStateRole)
            self.model().appendRow(item)

        self.update_text()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self.container:
            self.container.setGeometry(self.lineEdit().geometry())

    def handle_item_pressed(self, index):
        item = self.model().itemFromIndex(index)
        current_state = item.checkState()

        if item.text() == "Tous":
            new_state = Qt.Checked if current_state == Qt.Unchecked else Qt.Unchecked
            for i in range(1, self.model().rowCount()):
                self.model().item(i).setCheckState(new_state)
            item.setCheckState(new_state)
        else:
            item.setCheckState(Qt.Unchecked if current_state == Qt.Checked else Qt.Checked)
            all_checked = all(
                self.model().item(i).checkState() == Qt.Checked
                for i in range(1, self.model().rowCount())
            )
            self.model().item(0).setCheckState(Qt.Checked if all_checked else Qt.Unchecked)

        self.update_text()

    def update_text(self):
        checked_items = [
            self.model().item(i).text()
            for i in range(1, self.model().rowCount())
            if self.model().item(i).checkState() == Qt.Checked
        ]

        all_checked = self.model().item(0).checkState() == Qt.Checked

        if all_checked or len(checked_items) == self.model().rowCount() - 1:
            self.line_edit.setText("Tous")
        elif checked_items:
            self.line_edit.setText(", ".join(checked_items))

    def eventFilter(self, obj, event):
        if obj == self.line_edit and event.type() == QEvent.MouseButtonPress:
            self.showPopup()
            return True
        return super().eventFilter(obj, event)
