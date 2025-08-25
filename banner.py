from PyQt6.QtCore import QUrl
from PyQt6.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QWidget, QLabel
from PyQt6.QtWebEngineWidgets import QWebEngineView
import sys

class BannerWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("App avec bannière pub discrète")
        self.resize(400, 400)

        container = QWidget()
        layout = QVBoxLayout()
        container.setLayout(layout)

        label = QLabel("Bienvenue dans l'application premium-lite 😎")
        layout.addWidget(label)

        self.webview = QWebEngineView()
        self.webview.setFixedSize(300, 250)
        self.webview.setUrl(QUrl.fromLocalFile("/chemin/vers/banner.html"))
        layout.addWidget(self.webview)

        self.setCentralWidget(container)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = BannerWindow()
    window.show()
    sys.exit(app.exec())
