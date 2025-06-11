from PyQt6.QtGui import QPalette, QColor, QPixmap
from PyQt6.QtWidgets import QStyleFactory
from PySide6.QtWidgets import QApplication
import sys

from app_initializer import AppInitializer
from PyQt6 import QtWidgets

SCROLLBAR_STYLE = """
QScrollBar:vertical {
    background: transparent;
    width: 10px;
    margin: 0;
}

QScrollBar::handle:vertical {
    background: rgba(150, 150, 150, 0.6);
    border-radius: 5px;
    min-height: 20px;
    transition: background 0.3s;
}

QScrollBar::handle:vertical:hover {
    background: rgba(180, 180, 180, 0.9);
}

QScrollBar::add-line:vertical,
QScrollBar::sub-line:vertical {
    height: 0;
    border: none;
    background: none;
}

QScrollBar:horizontal {
    background: transparent;
    height: 10px;
    margin: 0;
}

QScrollBar::handle:horizontal {
    background: rgba(150, 150, 150, 0.6);
    border-radius: 5px;
    min-width: 20px;
    transition: background 0.3s;
}

QScrollBar::handle:horizontal:hover {
    background: rgba(180, 180, 180, 0.9);
}

QScrollBar::add-line:horizontal,
QScrollBar::sub-line:horizontal {
    width: 0;
    border: none;
    background: none;
}

QScrollBar::add-page:vertical,
QScrollBar::sub-page:vertical,
QScrollBar::add-page:horizontal,
QScrollBar::sub-page:horizontal {
    background: none;
}
"""
def test_webp_support():
    pix = QPixmap()
    result = pix.load("test.webp")  # Remplace par un vrai fichier WebP si possible
    print("✅ WebP supporté par Qt ?" if result else "❌ WebP NON supporté")



def set_dark_palette(app):
    """Applique un thème sombre natif avec le style Fusion."""
    app.setStyle(QStyleFactory.create("Fusion"))
    dark_palette = QPalette()
    app.setPalette(dark_palette)

def main():

    app = QtWidgets.QApplication(sys.argv)
    set_dark_palette(app)
    app.setStyleSheet(SCROLLBAR_STYLE)

    initializer = AppInitializer()
    window = initializer.create_main_window()

    window.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    main()