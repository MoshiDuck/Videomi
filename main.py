from PySide6.QtWidgets import QApplication
import sys
from database.folder_database import FolderDatabase
from pages.folders.gestionnaire_dossiers import ManagerWindow
from pages.navigateur.navigateur import NavigateurWindow

SCROLLBAR_STYLE = """
QScrollBar:vertical {
    border: none;
    background: transparent;
    width: 8px;
    margin: 0;
}

QScrollBar::handle:vertical {
    background: #666;
    border-radius: 4px;
}

QScrollBar::add-line:vertical,
QScrollBar::sub-line:vertical {
    height: 0;
    background: none;
}

QScrollBar::add-page:vertical,
QScrollBar::sub-page:vertical {
    background: none;
}

QScrollBar:horizontal {
    border: none;
    background: transparent;
    height: 8px;
    margin: 0;
}

QScrollBar::handle:horizontal {
    background: #666;
    min-width: 20px;
    border-radius: 4px;
}

QScrollBar::add-line:horizontal,
QScrollBar::sub-line:horizontal {
    width: 0;
    background: none;
}

QScrollBar::add-page:horizontal,
QScrollBar::sub-page:horizontal {
    background: none;
}
"""

def main():

    app = QApplication(sys.argv)
    app.setStyleSheet(SCROLLBAR_STYLE)

    db = FolderDatabase()
    try:
        folders = db.get_all_folders()
    finally:
        db.close()

    window = NavigateurWindow() if folders else ManagerWindow()
    window.show()

    sys.exit(app.exec())

if __name__ == "__main__":
    main()
