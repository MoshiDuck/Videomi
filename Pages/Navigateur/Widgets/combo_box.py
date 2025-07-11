#combo_box.py

from PyQt6.QtCore import Qt, pyqtSignal, QEvent, QRect
from PyQt6.QtGui import QColor, QFont, QPen
from PyQt6.QtGui import QStandardItemModel, QStandardItem
from PyQt6.QtWidgets import QComboBox, QStyledItemDelegate, QStyle


class CheckBoxDelegate(QStyledItemDelegate):
    def paint(self, painter, option, index):
        checked = index.data(Qt.ItemDataRole.CheckStateRole) == Qt.CheckState.Checked
        text = index.data(Qt.ItemDataRole.DisplayRole)
        symbol = "✅" if checked else "❌"

        painter.save()

        # Définir les couleurs
        bg_color = QColor(255, 221, 87, 180)
        text_color = QColor("#1f1f1f")

        # Gérer sélection
        if option.state & QStyle.StateFlag.State_Selected:
            painter.fillRect(option.rect, bg_color)
        else:
            painter.fillRect(option.rect, QColor(255, 221, 87, 180))  # transparent sinon

        # Appliquer la police comme dans ton QSS
        font = QFont("Segoe UI", 10)
        font.setBold(True)
        painter.setFont(font)
        painter.setPen(QPen(text_color))

        # Dessiner le symbole
        symbol_rect = QRect(option.rect.left() + 6, option.rect.top(), 20, option.rect.height())
        painter.drawText(symbol_rect, Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft, symbol)

        # Dessiner le texte
        text_rect = option.rect.adjusted(30, 0, -4, 0)
        painter.drawText(text_rect, Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft, text)

        painter.restore()


    def editorEvent(self, event, model, option, index):
        if event.type() == QEvent.Type.MouseButtonRelease and option.rect.contains(event.position().toPoint()):
            current = model.data(index, Qt.ItemDataRole.CheckStateRole)
            new_state = Qt.CheckState.Unchecked if current == Qt.CheckState.Checked else Qt.CheckState.Checked
            model.setData(index, new_state, Qt.ItemDataRole.CheckStateRole)
            return True
        return super().editorEvent(event, model, option, index)


class ComboBox(QComboBox):
    selectionChanged = pyqtSignal(list)

    def __init__(self, items=None, parent=None):
        super().__init__(parent)
        self.items = items or []
        self._model = QStandardItemModel(self)
        self.setModel(self._model)
        self.setItemDelegate(CheckBoxDelegate(self))
        self.setFixedHeight(32)



        for text in self.items:
            item = QStandardItem(text)
            item.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsUserCheckable)
            item.setData(Qt.CheckState.Checked, Qt.ItemDataRole.CheckStateRole)
            self._model.appendRow(item)

        self.setEditable(True)
        self.lineEdit().setReadOnly(True)
        self.lineEdit().setPlaceholderText("Tous")
        self.lineEdit().installEventFilter(self)
        self.setObjectName("combo_box")

        self._update_display()
        self._model.itemChanged.connect(self._on_item_changed)

    def set_items(self, items: list[str]):
        self.items = items
        self._model.clear()

        for text in self.items:
            item = QStandardItem(text)
            item.setFlags(Qt.ItemFlag.ItemIsEnabled | Qt.ItemFlag.ItemIsUserCheckable)
            # coche par défaut
            item.setData(Qt.CheckState.Checked, Qt.ItemDataRole.CheckStateRole)
            self._model.appendRow(item)

        # on rafraîchit la ligne (Tous/Aucun/...), et on prévient l'extérieur
        self._update_display()
        self.selectionChanged.emit(self.get_checked_items())

    def eventFilter(self, obj, event):
        if obj == self.lineEdit() and event.type() == QEvent.Type.MouseButtonPress:
            if self.view().isVisible():
                self.hidePopup()
            else:
                self.showPopup()
            return True
        return super().eventFilter(obj, event)

    def _on_item_changed(self, _changed_item):
        self._update_display()
        self.selectionChanged.emit(self.get_checked_items())

    def get_checked_items(self):
        return [
            self._model.item(i).text()
            for i in range(self._model.rowCount())
            if self._model.item(i).checkState() == Qt.CheckState.Checked
        ]

    def _update_display(self):
        checked = self.get_checked_items()
        total = len(self.items)
        if len(checked) == 0:
            self.lineEdit().setText("Aucun")
        elif len(checked) == total:
            self.lineEdit().setText("Tous")
        else:
            self.lineEdit().setText(", ".join(checked))

    def set_checked_items(self, to_check: list[str]):
        self._model.blockSignals(True)
        for i in range(self._model.rowCount()):
            item = self._model.item(i)
            state = Qt.CheckState.Checked if item.text() in to_check else Qt.CheckState.Unchecked
            item.setCheckState(state)
        self._model.blockSignals(False)

        self._update_display()

        self.selectionChanged.emit(self.get_checked_items())