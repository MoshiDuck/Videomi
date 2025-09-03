# Todo : publication_nav.py
import os
import re
from pathlib import Path

from PyQt6.QtCore import Qt, QSize
from PyQt6.QtGui import QPalette, QColor
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QPushButton, QFileDialog,
    QFrame, QHBoxLayout, QSizePolicy,
    QTreeWidget, QTreeWidgetItem, QHeaderView, QProgressBar
)

from Core.Language.i18n import get_text
from Database.db_manager import DatabaseManager
from Database.sync_database import SyncDatabase
from Models.category import CatManager
from Models.upload_manager import UploadManager
from Pages.Auth.firebase_auth import FirebaseAuth
from Pages.Navigateur.Catalogue.catalogue_nav import Catalogue
from Service.py1FichierClient import FichierClient

IGNORED_WORDS = frozenset({
    # Langue / doublage / sous-titres
    "multi", "french", "truefrench", "vostfr", "vf2", "vff", "vfi", "vfq",
    "dub", "dubbed", "sub", "subed", "subbed", "frenchsubs", "engsub", "multi-sub", "multi-audio",

    # Résolutions & encodage
    "1080p", "720p", "2160p", "4k", "4klight", "hdr", "hdrip", "hdr10", "hdr10plus", "hdr10+",
    "dv", "dvdr", "dvdrip", "dvdscr", "bdrip", "brrip", "bluray", "blurayremux",
    "webrip", "web", "web-dl", "hdtv", "hdcam", "cam", "ts", "tc", "r5",
    "remux", "x264", "x265", "h264", "h265", "hevc", "avc", "10bit", "10bits", "264", "265",

    # Audio
    "ac3", "aac", "dts", "eac3", "dd5", "ddp5", "ddp7", "ddp", "hdma", "atmos", "6ch", "aac2",

    # Release tags génériques
    "proper", "repack", "limited", "extended", "directors", "cut", "unrated",
    "theatrical", "edition", "custom", "light", "suppl", "sample", "trailer", "preview",
    "unaired", "pilot", "cinema", "theater",

    # Formats vidéo
    "mkv", "mp4", "avi", "divx", "xvid",

    # Groupes / tags scène
    "rarbg", "ettv", "yts", "yify", "evo", "ganool",
    "amzn", "a3l", "psa", "ukdhd", "ulysse", "flux", "tyhd", "trsiel", "dread",
    "rififi", "hdlight", "hlight", "mhd", "mhdgz", "batgirl", "darkino",
    "acoool", "acool", "lypsg", "rough", "neo", "cherrycoke", "gandalf",
    "lihdl", "winks", "qtz", "muxor", "extreme", "etherum", "tfa", "fw",
    "ntg", "slay3r", "bzh29", "notag", "bulitt", "avalon", "sodapop", "jarod", "team", "ght", "r3n",

    # Divers
    "dl", "com", "eng", "fr", "en",
})
KEEP_WORDS = frozenset({
    "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
    "and", "the", "of", "a", "an", "le", "la", "les", "des", "du", "de"
})
_ROMAN_PATTERN = re.compile(
    r'^(?=[MDCLXVI])M{0,4}(CM|CD|D?C{0,3})'
    r'(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$',
    re.IGNORECASE
)


def is_roman(token: str) -> bool:
    return bool(_ROMAN_PATTERN.fullmatch(token))


def sanitize_filename(filename: str) -> str:
    p = Path(filename)
    stem = p.stem.lower()
    ext = p.suffix

    # Conserver les informations de saison/épisode et année
    patterns_to_keep = [
        r's\d{1,2}e\d{1,2}',  # S01E01
        r'\d{4}',  # Année
        r'1080p|720p|4k',  # Résolutions
        r'bluray|webrip|hdtv'  # Sources
    ]

    keep_tokens = []
    for pattern in patterns_to_keep:
        matches = re.findall(pattern, stem, re.IGNORECASE)
        keep_tokens.extend(matches)

    tokens = re.split(r'[^a-z0-9]+', stem)
    filtered = []

    for t in tokens:
        if not t:
            continue
        if t in KEEP_WORDS or is_roman(t) or t in keep_tokens:
            filtered.append(t)
            continue
        if t in IGNORED_WORDS:
            continue
        filtered.append(t)

    new_stem = "_".join(filtered) if filtered else stem
    new_stem = new_stem.title().replace("_", " ")
    return f"{new_stem}{ext}"


class ProportionalTree(QTreeWidget):
    def __init__(self, *args, status_ratio: float = 0.1, **kwargs):
        super().__init__(*args, **kwargs)
        self._status_ratio = status_ratio

    def resizeEvent(self, event):
        super().resizeEvent(event)
        total_width = self.viewport().width()
        self.header().resizeSection(0, int(total_width * self._status_ratio))


class Publication(QWidget):
    def __init__(self, firebase_auth: FirebaseAuth, client: FichierClient,
                 db_manager: DatabaseManager, catalogue: Catalogue):
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

        # Vérification que toutes les clés de traduction sont disponibles
        self.ICONS = {
            get_text("nav_labels.catalogue_texts.videos") or "Videos": "mdi.video-outline",
            get_text("nav_labels.catalogue_texts.musics") or "Musics": "mdi.music-note-outline",
            get_text("nav_labels.catalogue_texts.images") or "Images": "mdi.image-outline",
            get_text("nav_labels.catalogue_texts.documents") or "Documents": "mdi.file-document-outline",
            get_text("nav_labels.catalogue_texts.archives") or "Archives": "mdi.zip-box-outline",
            get_text("nav_labels.catalogue_texts.executables") or "Executables": "mdi.cog-outline",
        }

        self.setObjectName("publication_page")
        self.sync_thread = SyncDatabase(
            firebase_auth=firebase_auth,
            db_manager=db_manager,
            client=client
        )
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
        self.upload_manager.file_progress.connect(self._on_file_progress)
        self.upload_manager.all_done.connect(self._on_all_done)
        self.upload_manager.existing_files = existing_files

        self._build_ui()

    def _init_theme(self):
        pal = QPalette()
        pal.setColor(QPalette.ColorRole.Window, QColor(24, 24, 24))
        self.setAutoFillBackground(True)
        self.setPalette(pal)

    def _ensure_folders_exist(self):
        try:
            root = self.client.get_folders(0)
            # Vérification que root n'est pas None et contient bien sub_folders
            if not root or 'sub_folders' not in root:
                return

            existing = {f["name"].lower() for f in root.get("sub_folders", []) if f and "name" in f and f["name"]}
            for name in list(self.ICONS.keys()):  # Utiliser list() pour éviter de modifier le dict pendant l'itération
                if name is None:
                    continue
                lname = name.lower()
                if lname not in existing:
                    self.client.create_folder(folder_name=name)
            for folder in root.get("sub_folders", []):
                if folder and "name" in folder and folder["name"]:
                    self.folder_ids[folder["name"].lower()] = folder["id"]
        except Exception as e:
            print(f"Erreur lors de la création des dossiers: {e}")

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

        btn_layout = QHBoxLayout()
        self.btn_file = QPushButton(f"📂 {get_text('nav_labels.publication_texts.choose_file')}")
        self.btn_file.clicked.connect(self._pick_file)
        self.btn_folder = QPushButton(f"📁 {get_text('nav_labels.publication_texts.choose_folder')}")
        self.btn_folder.clicked.connect(self._pick_folder)
        self.btn_file.setObjectName("btn_file")
        self.btn_folder.setObjectName("btn_folder")
        for btn in (self.btn_file, self.btn_folder):
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setFixedHeight(40)
            btn_layout.addWidget(btn)
        main.addLayout(btn_layout)

        self.tree = ProportionalTree(status_ratio=0.1)
        self.tree.setHeaderLabels([
            get_text('nav_labels.publication_texts.status'),
            get_text('nav_labels.publication_texts.category'),
            get_text('nav_labels.publication_texts.filename')
        ])
        self.tree.setIndentation(0)
        self.tree.setIconSize(QSize(16, 16))
        self.tree.setObjectName("files_tree")
        self._setup_header(self.tree.header())
        self.tree.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        main.addWidget(self.tree)

        main.addWidget(self._separator())
        self.progress = QProgressBar()
        self.progress.setObjectName("progress_bar")
        self.progress.setRange(0, 0)
        self.progress.setValue(0)
        main.addWidget(self.progress)
        main.addWidget(self._separator())

        action_layout = QHBoxLayout()
        self.clear_btn = QPushButton(f"🗑️ {get_text('nav_labels.publication_texts.clear_list')}")
        self.clear_btn.clicked.connect(self._clear_list)
        self.clear_btn.setFixedHeight(40)
        self.clear_btn.setObjectName("clear_btn")
        action_layout.addWidget(self.clear_btn)
        self.pub_btn = QPushButton(f"🚀 {get_text('nav_labels.publication_texts.publish')}")
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
        f, _ = QFileDialog.getOpenFileName(self, get_text('nav_labels.publication_texts.choose_file'))
        if f:
            self._add_files([f])

    def _pick_folder(self):
        d = QFileDialog.getExistingDirectory(self, get_text('nav_labels.publication_texts.choose_folder'))
        if d:
            files = [os.path.join(d, f) for f in os.listdir(d)
                     if os.path.isfile(os.path.join(d, f))]
            self._add_files(files)

    def _on_file_progress(self, percent: int):
        total_files = len(self.selected_files)
        if total_files == 1:
            self.progress.setValue(percent)

    def _publish(self):
        if not self.selected_files:
            self.tree.clear()
            warn = QTreeWidgetItem(['', get_text('nav_labels.publication_texts.no_file_selected'), ''])
            warn.setTextAlignment(1, Qt.AlignmentFlag.AlignCenter)
            self.tree.addTopLevelItem(warn)
            return

        # Renommer les fichiers avant upload
        renamed = []
        new_item_map = {}
        for path in self.selected_files:
            dir_, name = os.path.split(path)
            new_name = sanitize_filename(name)
            new_path = os.path.join(dir_, new_name)
            if new_path != path:
                os.rename(path, new_path)
                # Mettre à jour item_map avec le nouveau chemin
                if path in self.item_map:
                    new_item_map[new_path] = self.item_map[path]
                else:
                    # Normalement, chaque chemin dans selected_files devrait être dans item_map
                    print(f"Attention: chemin {path} non trouvé dans item_map")
            else:
                new_item_map[path] = self.item_map[path]  # si pas de changement, on garde la même entrée
            renamed.append(new_path)

        self.selected_files = renamed
        self.item_map = new_item_map

        for btn in (self.btn_file, self.btn_folder, self.clear_btn, self.pub_btn):
            btn.setEnabled(False)

        total = len(self.selected_files)
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
            # Forcer la mise à jour de l'affichage de l'item
            self.tree.viewport().update()
            # Ajuster la largeur de la colonne 0 pour s'assurer que l'icône est visible
            self.tree.resizeColumnToContents(0)
        if len(self.selected_files) > 1:
            self.progress.setValue(self.progress.value() + 1)

    def _on_all_done(self):
        for btn in (self.btn_file, self.btn_folder, self.clear_btn, self.pub_btn):
            btn.setEnabled(True)
        for path, link in self.uploaded_links.items():
            item = self.item_map.get(path)
            if not item:
                continue
            category = item.text(1)
            title = item.text(2)
            file_extension = os.path.splitext(path)[1]

            # Récupérer les métadonnées TMDB si disponibles
            tmdb_metadata = getattr(self.upload_manager, 'tmdb_metadata', {}).get(path, "{}")

            # Récupérer les métadonnées musicales si disponibles
            music_metadata = getattr(self.upload_manager, 'music_metadata', {}).get(path, "{}")

            self.db.insert_file(category, title, link, '', '', '{}', tmdb_metadata, music_metadata, '', file_extension)

        self.uploaded_links.clear()
        self.sync_thread.start()
        self.progress.setValue(0)

    def _clear_list(self):
        self.selected_files.clear()
        self.item_map.clear()
        self.tree.clear()

    def _on_sync_finished(self):
        self.catalogue.reload_items()