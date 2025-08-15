from PyQt6.QtWidgets import QWidget, QToolButton, QHBoxLayout
from PyQt6.QtCore import Qt
import qtawesome as qta

class BarFenetre(QWidget):
    def __init__(self, parent=None, widget=None, main_window=None):
        super().__init__(parent)
        self.main_window = main_window
        self.setFixedHeight(30)

        self.widget = widget
        if self.widget:
            self.widget.setParent(self)
            self.widget.setFixedHeight(self.height())

        # Icônes MDI via QtAwesome
        icon_min = qta.icon('mdi.window-minimize', color='white')
        icon_close = qta.icon('mdi.window-close', color='white')

        # Boutons stylés
        self.btn_minimize = QToolButton()
        self.btn_minimize.setObjectName("bar_btn_minimize")
        self.btn_minimize.setIcon(icon_min)

        self.btn_close = QToolButton()
        self.btn_close.setObjectName("bar_btn_close")
        self.btn_close.setIcon(icon_close)

        for btn in (self.btn_minimize, self.btn_close):
            btn.setFixedSize(30, 30)
            btn.setIconSize(btn.size() * 0.6)
            btn.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonIconOnly)

        # Layout boutons
        btn_layout = QHBoxLayout()
        btn_layout.setContentsMargins(0, 0, 0, 0)
        btn_layout.setSpacing(0)
        btn_layout.addWidget(self.btn_minimize)
        btn_layout.addWidget(self.btn_close)

        self.buttons_widget = QWidget(self)
        self.buttons_widget.setLayout(btn_layout)
        self.buttons_widget.adjustSize()

        # Connexions
        self.btn_minimize.clicked.connect(self.on_minimize)
        self.btn_close.clicked.connect(self.on_close)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        btn_w = self.buttons_widget.sizeHint().width()
        self.buttons_widget.setGeometry(self.width() - btn_w, 0, btn_w, self.height())
        if self.widget:
            cw = self.widget.sizeHint().width()
            ch = self.widget.sizeHint().height()
            cx = (self.width() - cw) // 2
            cy = (self.height() - ch) // 2
            self.widget.setGeometry(cx, cy, cw, ch)

    def on_minimize(self):
        window = self.main_window or self.window()
        window.showMinimized()

    def on_close(self):
        window = self.main_window or self.window()
        window.close()
