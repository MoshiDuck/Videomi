from widgets.base_button import BaseButton
from config.texts import BTN_DELETE

class DeleteButton(BaseButton):
    def __init__(self, parent=None):
        super().__init__(BTN_DELETE, parent)
        # Style rouge intermédiaire
        self.setStyleSheet(self.custom_style())

    @staticmethod
    def custom_style():
        return """
        QPushButton {
            background-color: #E74C3C;      /* Rouge vif modéré */
            color: black;
            border: none;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 12px;
        }
        QPushButton:hover {
            background-color: #D64541;     /* Légèrement plus foncé au hover */
        }
        QPushButton:pressed {
            background-color: #B03A2E;     /* Encore plus foncé au clic */
        }
        """
