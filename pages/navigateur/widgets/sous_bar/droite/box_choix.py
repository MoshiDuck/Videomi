import qtawesome as qta
from PyQt6.QtCore import Qt, QEvent, pyqtSignal
from PyQt6.QtGui import QStandardItemModel, QStandardItem
from PyQt6.QtWidgets import (
    QComboBox, QSizePolicy, QHBoxLayout, QLabel,
    QWidget, QLineEdit
)
from config.colors import DARK_ICON, PRIMARY_COLOR


class BoxChoix(QComboBox):
    stateChanged = pyqtSignal()

    def __init__(self, icon_text: str = None):
        super().__init__()
        self.setModel(QStandardItemModel(self))
        self.view().pressed.connect(self.handle_item_pressed)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setEditable(True)

        # Conteneur personnalisé (icône + texte affiché)
        self.container = QWidget(self)
        layout = QHBoxLayout(self.container)
        layout.setContentsMargins(6, 0, 6, 0)
        layout.setSpacing(6)

        # Icône à gauche (optionnelle)
        self.icon_label = QLabel()
        if icon_text:
            icon = qta.icon(icon_text, color=DARK_ICON)
            self.icon_label.setPixmap(icon.pixmap(24, 24))
        layout.addWidget(self.icon_label, alignment=Qt.AlignmentFlag.AlignVCenter)

        # Zone de texte
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

        self.container.setStyleSheet("background-color: transparent;")

        # LineEdit caché obligatoire pour QComboBox
        self.setLineEdit(QLineEdit())
        self.lineEdit().hide()
        self.container.setParent(self)
        self.container.show()

        # Style général
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

        # Items de sélection avec cases à cocher
        self.items = ["Tous", "Français", "Anglais", "Espagnol"]
        for text in self.items:
            item = QStandardItem(text)
            item.setFlags(Qt.ItemFlag.ItemIsUserCheckable | Qt.ItemFlag.ItemIsEnabled)
            item.setData(Qt.CheckState.Checked, Qt.ItemDataRole.CheckStateRole)
            self.model().appendRow(item)

        self.update_text()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.container.setGeometry(self.lineEdit().geometry())

    def handle_item_pressed(self, index):
        item = self.model().itemFromIndex(index)
        current_state = item.checkState()

        if item.text() == "Tous":
            # Basculer tous les éléments selon l’état de "Tous"
            new_state = Qt.CheckState.Checked if current_state == Qt.CheckState.Unchecked else Qt.CheckState.Unchecked
            for i in range(1, self.model().rowCount()):
                self.model().item(i).setCheckState(new_state)
            item.setCheckState(new_state)
        else:
            # Basculer l’état individuel
            item.setCheckState(Qt.CheckState.Unchecked if current_state == Qt.CheckState.Checked else Qt.CheckState.Checked)

            # Synchroniser l’état de "Tous"
            all_checked = all(
                self.model().item(i).checkState() == Qt.CheckState.Checked
                for i in range(1, self.model().rowCount())
            )
            self.model().item(0).setCheckState(Qt.CheckState.Checked if all_checked else Qt.CheckState.Unchecked)

        self.update_text()
        self.stateChanged.emit()

    def update_text(self):
        """Met à jour le texte visible en fonction des sélections."""
        checked_items = [
            self.model().item(i).text()
            for i in range(1, self.model().rowCount())
            if self.model().item(i).checkState() == Qt.CheckState.Checked
        ]

        # Si "Tous" est coché ou tous les autres cochés, afficher "Tous"
        if self.model().item(0).checkState() == Qt.CheckState.Checked or len(checked_items) == len(self.items) - 1:
            self.line_edit.setText("Tous")
        elif checked_items:
            self.line_edit.setText(", ".join(checked_items))
        else:
            self.line_edit.setText("")

    def value(self):
        """
        Renvoie la liste des langues sélectionnées.
        Si "Tous" est coché, renvoie ["Tous"].
        """
        if self.model().item(0).checkState() == Qt.CheckState.Checked:
            return ["Tous"]
        return [
            self.model().item(i).text()
            for i in range(1, self.model().rowCount())
            if self.model().item(i).checkState() == Qt.CheckState.Checked
        ]

    def eventFilter(self, obj, event):
        if obj == self.line_edit and event.type() == QEvent.Type.MouseButtonPress:
            self.showPopup()
            return True
        return super().eventFilter(obj, event)
