import os
from PyQt6.QtCore import Qt, QSize
from PyQt6.QtGui import QPalette, QColor
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QPushButton, QFileDialog,
    QFrame, QHBoxLayout, QSizePolicy,
    QTreeWidget, QTreeWidgetItem, QHeaderView, QProgressBar
)

from Database.db_manager import DatabaseManager
from Database.sync_database import SyncDatabase
from Models.category import CatManager
from Models.upload_manager import UploadManager
from Pages.Auth.firebase_auth import FirebaseAuth
from Pages.Navigateur.Catalogue.catalogue_nav import Catalogue
from Service.py1FichierClient import FichierClient


class ProportionalTree(QTreeWidget):
    def __init__(self, *args, status_ratio: float = 0.1, **kwargs):
        super().__init__(*args, **kwargs)
        self._status_ratio = status_ratio

    def resizeEvent(self, event):
        super().resizeEvent(event)
        total_width = self.viewport().width()
        self.header().resizeSection(0, int(total_width * self._status_ratio))


class Publication(QWidget):

    def __init__(self, firebase_auth: FirebaseAuth, client: FichierClient, db_manager: DatabaseManager,
                 catalogue: Catalogue):
        super().__init__()
        self._init_theme()
        self.client = client
        self.db = db_manager
        self.cat_manager = CatManager()
        self.catalogue = catalogue
        self.selected_files = []
        self.item_map = {}
        self.folder_ids = {}
        self.uploaded_links = {}

        self.ICONS = {
            "Videos": "mdi.video-outline",
            "Musiques": "mdi.music-note-outline",
            "Images": "mdi.image-outline",
            "Documents": "mdi.file-document-outline",
            "Archives": "mdi.zip-box-outline",
            "Executables": "mdi.cog-outline",
        }

        self.setObjectName("publication_page")
        # → 1. Instancie ton thread SyncDatabase
        self.sync_thread = SyncDatabase(
            firebase_auth=firebase_auth,
            db_manager=db_manager,
            client=client
        )

        # → 2. Connecte son signal finished_sync
        self.sync_thread.finished_sync.connect(
            self._on_sync_finished,
            Qt.ConnectionType.QueuedConnection
        )

        self._ensure_folders_exist()
        existing_files = self._fetch_existing_files()

        self.upload_manager = UploadManager(
            client, self.cat_manager, existing_files, self.folder_ids
        )
        self.upload_manager.finished.connect(self._on_file_uploaded)
        # → Connecter le signal de progression individuelle
        self.upload_manager.file_progress.connect(self._on_file_progress)
        # → 3. Au lieu de te brancher sur all_done pour juste vider l’UI,
        # tu y déclenches aussi ton sync_thread
        self.upload_manager.all_done.connect(self._on_all_done)
        self.upload_manager.existing_files = existing_files

        self._build_ui()

    def _on_sync_finished(self):
        self.catalogue.reload_items()

    def _init_theme(self):
        pal = QPalette()
        pal.setColor(QPalette.ColorRole.Window, QColor(24, 24, 24))
        self.setAutoFillBackground(True)
        self.setPalette(pal)

    def _ensure_folders_exist(self):
        root = self.client.get_folders(0)
        existing = {f["name"].lower() for f in root.get("sub_folders", [])}
        for name in self.ICONS:
            lname = name.lower()
            if lname not in existing:
                self.client.create_folder(folder_name=name)

        for folder in self.client.get_folders(0).get("sub_folders", []):
            self.folder_ids[folder["name"].lower()] = folder["id"]

    def _fetch_existing_files(self):
        files_by_folder = {}
        for name, fid in self.folder_ids.items():
            all_ids = [fid] + [sub['id']
                               for sub in self.client.get_folders(fid).get('sub_folders', [])]
            files = set()
            for f_id in all_ids:
                files.update(self.client.get_files_in_folder(f_id))
            files_by_folder[name] = files
        return files_by_folder

    def _build_ui(self):
        main = QVBoxLayout()
        main.setAlignment(Qt.AlignmentFlag.AlignTop)
        main.setContentsMargins(60, 60, 60, 60)
        main.setSpacing(20)

        # Buttons
        btn_layout = QHBoxLayout()
        self.btn_file = QPushButton("📂 Choisir un fichier")
        self.btn_file.clicked.connect(self._pick_file)
        self.btn_folder = QPushButton("📁 Choisir un dossier")
        self.btn_folder.clicked.connect(self._pick_folder)
        self.btn_file.setObjectName("btn_file")
        self.btn_folder.setObjectName("btn_folder")
        for btn in (self.btn_file, self.btn_folder):
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setFixedHeight(40)
            btn_layout.addWidget(btn)
        main.addLayout(btn_layout)

        # File List Tree
        self.tree = ProportionalTree(status_ratio=0.1)
        self.tree.setHeaderLabels(["Statut", "Catégorie", "Nom de fichier"])
        self.tree.setIndentation(0)
        self.tree.setIconSize(QSize(16, 16))
        self.tree.setObjectName("files_tree")
        self._setup_header(self.tree.header())
        self.tree.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        main.addWidget(self.tree)

        # Progress
        main.addWidget(self._separator())
        self.progress = QProgressBar()
        self.progress.setObjectName("progress_bar")
        self.progress.setRange(0, 0)
        self.progress.setValue(0)
        main.addWidget(self.progress)
        main.addWidget(self._separator())

        # Actions
        action_layout = QHBoxLayout()
        self.clear_btn = QPushButton("🗑️ Vider la liste")
        self.clear_btn.clicked.connect(self._clear_list)
        self.clear_btn.setFixedHeight(40)
        self.clear_btn.setObjectName("clear_btn")
        action_layout.addWidget(self.clear_btn)

        self.pub_btn = QPushButton("🚀 Publier")
        self.pub_btn.clicked.connect(self._publish)
        self.pub_btn.setFixedHeight(40)
        action_layout.addWidget(self.pub_btn)

        main.addLayout(action_layout)
        self.setLayout(main)

    @staticmethod
    def _setup_header(header):
        header.setDefaultAlignment(Qt.AlignmentFlag.AlignCenter)
        for idx, mode in enumerate(
                [QHeaderView.ResizeMode.Interactive,
                 QHeaderView.ResizeMode.Stretch,
                 QHeaderView.ResizeMode.Stretch]
        ):
            header.setSectionResizeMode(idx, mode)

    @staticmethod
    def _separator():
        sep = QFrame()
        sep.setObjectName("separator_line")
        sep.setFrameShape(QFrame.Shape.HLine)
        return sep

    def _add_files(self, paths):
        for path in paths:
            if path in self.selected_files:
                continue
            ext = os.path.splitext(path)[1]
            cat = CatManager.get_category(ext).capitalize()
            if cat.lower() == 'autres':
                continue
            item = QTreeWidgetItem(['🕒', cat, os.path.basename(path)])
            for col in range(3):
                item.setTextAlignment(col, Qt.AlignmentFlag.AlignCenter)
            self.tree.addTopLevelItem(item)
            self.selected_files.append(path)
            self.item_map[path] = item

    def _pick_file(self):
        f, _ = QFileDialog.getOpenFileName(self, "Choisir un fichier")
        if f:
            self._add_files([f])

    def _pick_folder(self):
        d = QFileDialog.getExistingDirectory(self, "Choisir un dossier")
        if d:
            files = [os.path.join(d, f) for f in os.listdir(d)
                     if os.path.isfile(os.path.join(d, f))]
            self._add_files(files)

    def _on_file_progress(self, percent: int):
        """Met à jour la barre de progression pour un fichier individuel"""
        total_files = len(self.selected_files)
        if total_files == 1:
            # Pour un seul fichier, utilisez directement le pourcentage
            self.progress.setValue(percent)
        # Pour plusieurs fichiers, le calcul global est déjà géré par UploadManager

    def _publish(self):
        if not self.selected_files:
            self.tree.clear()
            warn = QTreeWidgetItem(['', 'Aucun fichier sélectionné', ''])
            warn.setTextAlignment(1, Qt.AlignmentFlag.AlignCenter)
            self.tree.addTopLevelItem(warn)
            return

        # disable buttons during upload
        for btn in (self.btn_file, self.btn_folder, self.clear_btn, self.pub_btn):
            btn.setEnabled(False)

        total = len(self.selected_files)
        # Configure la barre de progression différemment selon le nombre de fichiers
        if total == 1:
            self.progress.setRange(0, 100)
            self.progress.setValue(0)
        else:
            self.progress.setRange(0, total)
            self.progress.setValue(0)

        self.upload_manager.set_files([(f, True) for f in self.selected_files])
        self.upload_manager.start()

    def _on_file_uploaded(self, link, file_path=None):
        item = self.item_map.get(file_path)
        if item:
            item.setText(0, '✅')
            item.setTextAlignment(0, Qt.AlignmentFlag.AlignCenter)
            # store link for DB update
            self.uploaded_links[file_path] = link

        # Mettre à jour la progression pour plusieurs fichiers
        if len(self.selected_files) > 1:
            self.progress.setValue(self.progress.value() + 1)

    def _on_all_done(self):
        # Re-enable buttons after all uploads
        for btn in (self.btn_file, self.btn_folder, self.clear_btn, self.pub_btn):
            btn.setEnabled(True)

        for path, link in self.uploaded_links.items():
            item = self.item_map.get(path)
            if not item:
                continue
            category = item.text(1)
            title = item.text(2)
            file_extension = os.path.splitext(path)[1]  # Get file extension
            self.db.insert_file(category, title, link, '', '', '{}', '', file_extension)  # Add extension parameter
        self.uploaded_links.clear()

        # 4. Lancer la synchronisation après tout upload
        self.sync_thread.start()

        self.progress.setValue(0)

    def _clear_list(self):
        self.selected_files.clear()
        self.item_map.clear()
        self.tree.clear()