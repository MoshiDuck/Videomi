from widgets.row_widget import Row
from widgets.base_button import BaseButton
from config.texts import BTN_ADD, BTN_SAVE

class ActionButtons(Row):
    def __init__(self, add_callback=None, save_callback=None, parent=None):
        super().__init__(parent=parent, spacing=5, margins=(5, 5, 5, 5))

        self.btn_add = self._create_button(BTN_ADD, add_callback)
        self.btn_save = self._create_button(BTN_SAVE, save_callback)

        self.add_widget(self.btn_add)
        self.add_widget(self.btn_save)

    @staticmethod
    def _create_button(label, callback):
        btn = BaseButton(label)
        if callback:
            btn.clicked.connect(callback)
        return btn
