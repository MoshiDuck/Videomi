# upload_manager.py
import fitz
import json
import os
import re
import yaml
import zipfile
import traceback
import subprocess
import unicodedata

from PIL import Image
import multiprocessing
from typing import List
from pathlib import Path
from docx import Document

from odf import opendocument
from mutagen.id3 import APIC
from pptx import Presentation
from pyrebase import pyrebase
from mutagen.flac import Picture
from mutagen.mp4 import MP4Cover
from openpyxl import load_workbook
from odf.draw import Image as ODFImage
from mutagen import File as MutagenFile, File
from PyQt6.QtCore import QObject, QThread, pyqtSignal, QTimer
from pyOneFichierClient.OneFichierAPI.py1FichierClient import s
from pyOneFichierClient.OneFichierAPI.exceptions import FichierResponseNotOk
from requests_toolbelt.multipart.encoder import MultipartEncoder, MultipartEncoderMonitor

from Models.category import CatManager
from Service.onefichier_service import FichierClient

BASE_DIR = Path(__file__).resolve().parents[1]
FFMPEG_PATH = BASE_DIR / "Ressource" / "ffmpeg" / "bin" / "ffmpeg.exe"
FFPROBE_PATH = BASE_DIR / "Ressource" / "ffmpeg" / "bin" / "ffprobe.exe"

AFF_ID = "5091183"

def inject_affiliation(url: str, aff_id: str = AFF_ID) -> str:
    if "1fichier.com" not in url:
        return url
    if re.search(r"[?&]af=\d+", url):
        return re.sub(r"([?&]af=)\d+", rf"\1{aff_id}", url)
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}af={aff_id}"

def sanitize_for_firebase_key(key: str) -> str:
    if not key:
        return "untitled"
    key = unicodedata.normalize('NFKD', key).encode('ascii', 'ignore').decode('ascii')
    key = re.sub(r'[.#$/\[\]()]+', '_', key)
    key = key.replace(' ', '_')
    key = re.sub(r'_+', '_', key)
    return key.strip('_')

def sanitize_folder_name(name: str) -> str:
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii')
    name = re.sub(r'[^\w\-]', '_', name)
    name = re.sub(r'_+', '_', name)
    return name.strip('_')

def sanitize_dict_keys(d):
    if isinstance(d, dict):
        new_dict = {}
        for k, v in d.items():
            new_key = sanitize_for_firebase_key(str(k))
            new_dict[new_key] = sanitize_dict_keys(v)
        return new_dict
    elif isinstance(d, list):
        return [sanitize_dict_keys(i) for i in d]
    else:
        return d

def extract_audio_cover(file_path: str, output_jpg: str) -> bool:
    try:
        audio = File(file_path)
        if audio is None:
            return False

        if audio.tags is not None:
            for tag in audio.tags.values():
                if isinstance(tag, APIC):
                    with open(output_jpg, 'wb') as img:
                        img.write(tag.data)
                    return True

        if hasattr(audio, "pictures"):
            for pic in audio.pictures:
                if isinstance(pic, Picture):
                    with open(output_jpg, 'wb') as img:
                        img.write(pic.data)
                    return True

        if hasattr(audio, "tags") and 'covr' in audio.tags:
            for cover in audio.tags['covr']:
                if isinstance(cover, MP4Cover):
                    with open(output_jpg, 'wb') as img:
                        img.write(cover)
                    return True
    except Exception as e:
        print(f"Erreur extraction cover audio : {e}")
    return False

def generate_thumbnail(video_path: str, thumb_path: str, percent: float = 0.15):
    cmd_probe = [str(FFPROBE_PATH), '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', video_path]
    proc = subprocess.run(cmd_probe, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe error: {proc.stderr}")
    duration_str = proc.stdout.strip()
    if not duration_str or not duration_str.replace('.', '', 1).isdigit():
        raise ValueError(f"Durée invalide extraite: '{duration_str}'")
    duration = float(duration_str)

    timestamp = duration * percent
    filt = "crop='if(gt(iw/ih\\,16/9)\\,ih*16/9\\,iw)':if(gt(iw/ih\\,16/9)\\,ih\\,iw*9/16),scale=320:180"
    cmd_ff = [str(FFMPEG_PATH), '-hide_banner', '-loglevel', 'error', '-hwaccel', 'auto', '-ss', str(timestamp), '-i', video_path, '-vf', filt, '-vframes', '1', '-qscale:v', '2', '-preset', 'ultrafast', '-threads', str(multiprocessing.cpu_count()), '-nostdin', '-y', thumb_path]
    proc2 = subprocess.run(cmd_ff, capture_output=True, text=True)
    if proc2.returncode != 0:
        raise RuntimeError(f"ffmpeg error: {proc2.stderr}")
    return thumb_path

class UploadThread(QThread):
    progress = pyqtSignal(int)
    finished = pyqtSignal(str)
    error = pyqtSignal(str)

    def __init__(self, client: FichierClient, file_path: str):
        super().__init__()
        self.client = client
        self.file_path = file_path
        self.last_logged_percent = -10

    def run(self):
        try:
            resp = self.client.api_call('https://api.1fichier.com/v1/upload/get_upload_server.cgi', method='GET')
            up_srv, upload_id = resp['url'], resp['id']
            with open(self.file_path, 'rb') as f:
                encoder = MultipartEncoder({'file[]': (Path(self.file_path).name, f, 'application/octet-stream')})

                def monitor_callback(mon):
                    percent = int(100 * mon.bytes_read / mon.len)
                    if percent >= self.last_logged_percent + 10:
                        self.last_logged_percent = (percent // 10) * 10
                        print(f"Progress: {self.last_logged_percent}%")
                    self.progress.emit(percent)

                monitor = MultipartEncoderMonitor(encoder, monitor_callback)

                headers = {'Content-Type': monitor.content_type}
                if self.client.authed:
                    headers.update(self.client.auth_nc)
                url = f'https://{up_srv}/upload.cgi?id={upload_id}'
                r = s.post(url, data=monitor, headers=headers, allow_redirects=False)
                if 'Location' not in r.headers:
                    raise FichierResponseNotOk('Header Location manquant')
                loc = r.headers['Location']
                r2 = s.get(f'https://{up_srv}{loc}')
                m = re.search(r'<td class="normal"><a href="(.+)"', r2.text)
                if not m:
                    raise FichierResponseNotOk('Lien de téléchargement introuvable')
                self.finished.emit(m.group(1))
        except Exception as e:
            tb = traceback.format_exc()
            self.error.emit(f"{e}\n{tb}")

class UploadManager(QObject):
    progress = pyqtSignal(int)
    finished = pyqtSignal(str, str)
    thumb_finished = pyqtSignal(str, str)
    error = pyqtSignal(str)
    all_done = pyqtSignal()

    def __init__(self, client: FichierClient, cat_manager: CatManager, existing_files: dict, folder_ids_by_name: dict, root_folder_id: str = '0'):
        super().__init__()
        self.thumb_threads: List[UploadThread] = []
        self._firebase_keys: dict[str, tuple[str, str, str]] = {}
        self.client = client
        self.cat_manager = cat_manager
        self.existing_files = existing_files
        self.folder_ids_by_name = folder_ids_by_name
        self.folder_parent_id = root_folder_id
        with open(BASE_DIR / 'Config/config.yaml', 'r') as f:
            cfg = yaml.safe_load(f)
        firebase = pyrebase.initialize_app(cfg['firebase'])
        user = firebase.auth().sign_in_with_email_and_password(
            cfg.get('email', 'weck20pro@gmail.com'),
            cfg.get('password', 'Azerty')
        )
        self.db = firebase.database()
        self.token = user['idToken']
        self.uid = user['localId']
        self.files_to_upload: List[tuple[str, bool]] = []
        self.files_done = 0
        self.total_files = 0
        self.thread: UploadThread | None = None
        self.thumb_finished.connect(self._on_thumb_finished)
        self.refresh_token = user['refreshToken']
        self.token = user['idToken']
        self.auth = firebase.auth()

    def _ensure_token(self):
        try:
            new_user = self.auth.refresh(self.refresh_token)
            self.token = new_user['idToken']
            self.refresh_token = new_user['refreshToken']
        except Exception as e:
            print("[Firebase] Impossible de rafraîchir le token :", e)

    def get_uploaded_files_from_firebase(self) -> dict[str, set[str]]:
        try:
            user_data = self.db.child('users').child(self.uid).get(self.token).val()
            uploaded = {}
            if user_data:
                for category_key, files in user_data.items():
                    if not isinstance(files, dict):
                        print(f"[Firebase] Warning: données inattendues pour catégorie '{category_key}': {files}")
                        continue
                    uploaded[category_key.lower()] = set(file_key.lower() for file_key in files.keys())
            return uploaded
        except Exception as e:
            print(f"[Firebase] Erreur lecture fichiers uploadés : {e}")
            return {}

    def _get_db_ref(self, category: str, title: str):
        self._ensure_token()
        safe_category = sanitize_for_firebase_key(category)
        safe_title = sanitize_for_firebase_key(title)
        return self.db.child('users').child(self.uid).child(safe_category).child(safe_title)

    def store_metadata_in_firebase(
            self, main_link: str,
            metadata: dict,
            thumb_link: str = '',
            category: str = None,
            title: str = None
    ) -> bool:
        self._ensure_token()
        main_link = inject_affiliation(main_link)
        clean_metadata = sanitize_dict_keys(metadata)
        if thumb_link:
            thumb_link = inject_affiliation(thumb_link)

        data = {'file_link': main_link, 'metadata': clean_metadata, 'thumbnail_link': thumb_link}
        try:
            self._get_db_ref(category, title).set(data, self.token)
            return True
        except Exception as e:
            print(f"[Firebase] Erreur stockage métadonnées : {e}")
            return False

    def set_files(self, files: List[tuple[str, bool]]):
        self.files_to_upload = files
        self.files_done = 0
        self.total_files = len(files)
        self.existing_files = self.get_uploaded_files_from_firebase()

    def start(self):
        if not self.files_to_upload:
            self.all_done.emit()
        else:
            self.upload_next_file()

    def upload_next_file(self):
        if not self.files_to_upload:
            self.progress.emit(100)
            self.all_done.emit()
            return

        path, _ = self.files_to_upload.pop(0)
        suffix = Path(path).suffix.lower()
        category = self.cat_manager.get_category(suffix).capitalize()
        key = category.lower()

        name = Path(path).stem
        metadata = self.get_all_metadata(path, category)

        title_from_meta = name
        if key == 'videos':
            tags = metadata.get('ffprobe', {}).get('format', {}).get('tags', {})
            if tags.get('title', '').strip():
                title_from_meta = tags['title'].strip()
        elif key == 'musiques':
            tags = metadata.get('mutagen_tags', {})
            if tags.get('title', '').strip():
                title_from_meta = tags['title'].strip()

        firebase_sanitized_title = sanitize_folder_name(title_from_meta).lower()

        if firebase_sanitized_title in self.existing_files.get(key, set()):
            self.files_done += 1
            self.progress.emit(int(self.files_done / self.total_files * 100))
            QTimer.singleShot(0, self.upload_next_file)
            return

        if key not in self.folder_ids_by_name:
            safe_name = sanitize_folder_name(key)

            resp = self.client.create_folder(safe_name, parent_folder_id=self.folder_parent_id)
            self.folder_ids_by_name[key] = resp.get('folder_id') or resp.get('id')

        is_media = key in ('musiques', 'videos')

        self.thread = UploadThread(self.client, path)
        self.thread.progress.connect(self.progress.emit)
        self.thread.finished.connect(lambda link, p=path: self.on_finished(link, p, category, name, is_media))
        self.thread.error.connect(self.error.emit)
        self.thread.start()

    def on_finished(self, link: str, uploaded_file: str, category: str, title: str, is_media: bool):
        try:
            metadata = self.get_all_metadata(uploaded_file, category)

            new_title = title
            if category.lower() == 'videos':
                tags = metadata.get('ffprobe', {}).get('format', {}).get('tags', {})
                if tags.get('title', '').strip():
                    new_title = tags['title'].strip()
            elif category.lower() == 'musiques':
                tags = metadata.get('mutagen_tags', {})
                if tags.get('title', '').strip():
                    new_title = tags['title'].strip()

            firebase_key_raw = sanitize_for_firebase_key(new_title).lower()
            firebase_key = sanitize_folder_name(firebase_key_raw)
            key = category.lower()

            parent_id = self.folder_ids_by_name.get(key)
            folder_id = parent_id

            if is_media or key == 'documents':
                sub_key = f"{key}/{firebase_key}"
                folder_id = self._get_or_create_folder(
                    base_key=key,
                    sub_key=sub_key,
                    name=firebase_key,
                    parent_folder_id=parent_id
                )

                if key != 'documents':
                    try:
                        self.client.move_file([link], destination_folder=folder_id)
                    except FichierResponseNotOk as e:
                        if '#604' not in str(e):
                            raise

            if key == 'images':
                self._firebase_keys[uploaded_file] = (category, firebase_key, '')
                thumb_path = str(Path(uploaded_file).with_suffix('.thumb.jpg'))
                self.store_metadata_in_firebase(
                    main_link='',
                    metadata=metadata,
                    thumb_link='',
                    category=category,
                    title=firebase_key
                )
                if self.resize_image_thumbnail(uploaded_file, thumb_path):
                    self.upload_and_move_thumb(thumb_path, folder_id, uploaded_file)
                    return
                else:
                    print(f"[Thumbnail] Impossible de générer la miniature image pour {uploaded_file}")
                    self.store_metadata_in_firebase(
                        main_link='',
                        metadata=metadata,
                        thumb_link=link,
                        category=category,
                        title=firebase_key
                    )
                    self.files_done += 1
                    self.progress.emit(int(self.files_done / self.total_files * 100))
                    self.finished.emit(link, uploaded_file)
                    QTimer.singleShot(0, self.upload_next_file)

            else:
                self.store_metadata_in_firebase(
                    main_link=link,
                    metadata=metadata,
                    thumb_link='',
                    category=category,
                    title=firebase_key
                )

            link_with_aff = inject_affiliation(link)
            self._firebase_keys[uploaded_file] = (category, firebase_key, link_with_aff)
            self.existing_files.setdefault(key, set()).add(firebase_key)

            if key == 'videos':
                thumb = str(Path(uploaded_file).with_suffix('.thumb.jpg'))
                try:
                    generate_thumbnail(uploaded_file, thumb)
                    self.upload_and_move_thumb(thumb, folder_id, uploaded_file)
                except Exception as e:
                    print(f"[Thumbnail] Erreur génération vidéo : {e}")
                    self._on_thumb_finished('', uploaded_file)

            elif key == 'musiques':
                cover_path = str(Path(uploaded_file).with_suffix('.thumb.jpg'))
                if extract_audio_cover(uploaded_file, cover_path):
                    self.upload_and_move_thumb(cover_path, folder_id, uploaded_file)
                    return
                self.files_done += 1
                self.progress.emit(int(self.files_done / self.total_files * 100))
                self.finished.emit(link_with_aff, uploaded_file)
                QTimer.singleShot(0, self.upload_next_file)

            elif key == 'documents':
                tmp_dir = BASE_DIR / 'temp_extracted' / firebase_key
                images = self.extract_images_from_document(uploaded_file, str(tmp_dir))
                try:
                    self.client.move_file([link], destination_folder=folder_id)
                except FichierResponseNotOk as e:
                    if '#604' not in str(e):
                        raise
                if not images:
                    self._complete_document_upload(link, uploaded_file)
                    return
                preview_path = images[0]
                self._firebase_keys[preview_path] = (category, firebase_key, link)
                thumb_path = str(Path(preview_path).with_suffix('.jpg'))
                if self.resize_image_thumbnail(preview_path, thumb_path):
                    self.upload_and_move_thumb(thumb_path, folder_id, preview_path)
                else:
                    self._complete_document_upload(link, uploaded_file)
                return

            else:
                try:
                    self.client.move_file([link], destination_folder=folder_id)
                except FichierResponseNotOk as e:
                    if '#604' not in str(e):
                        raise
                self.files_done += 1
                self.progress.emit(int(self.files_done / self.total_files * 100))
                self.finished.emit(link_with_aff, uploaded_file)
                QTimer.singleShot(0, self.upload_next_file)

        except Exception as e:
            print(f"[UploadManager] Erreur sur {uploaded_file}: {e}")
            self.files_done += 1
            self.progress.emit(int(self.files_done / self.total_files * 100))
            self.finished.emit(link, uploaded_file)
            QTimer.singleShot(0, self.upload_next_file)

    def _get_or_create_folder(self, base_key: str, sub_key: str, name: str, parent_folder_id: str) -> str:
        if sub_key in self.folder_ids_by_name:
            return self.folder_ids_by_name[sub_key]

        try:
            resp = self.client.create_folder(name, parent_folder_id=parent_folder_id)
            folder_id = resp.get('folder_id') or resp.get('id')
        except FichierResponseNotOk as e:
            if "Folder already exist" in str(e):
                print(f"[Folder] Le dossier '{name}' existe déjà, récupération possible.")
                folder_id = self.folder_ids_by_name.get(sub_key, parent_folder_id)
            else:
                raise

        self.folder_ids_by_name[sub_key] = folder_id
        return folder_id

    def _complete_document_upload(self, link: str, uploaded_file: str):
        self.files_done += 1
        self.progress.emit(int(self.files_done / self.total_files * 100))
        self.finished.emit(link, uploaded_file)
        QTimer.singleShot(0, self.upload_next_file)

    def extract_images_from_document(self, doc_path: str, output_dir: str) -> list[str]:
        path = Path(doc_path)
        ext = path.suffix.lower()
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        saved = []
        base = path.stem  # <-- nom de base pour la miniature

        def save_bytes(data: bytes, suffix: str):
            name = f"{base}.thumb{suffix}"
            dest = out / name
            with open(dest, "wb") as f:
                f.write(data)
            saved.append(str(dest))

        # --- PDF : rendre uniquement la première page
        if ext == ".pdf":
            doc = fitz.open(str(path))
            if len(doc) > 0:
                page = doc.load_page(0)
                pix = page.get_pixmap()
                suffix = ".png"
                preview_path = out / f"{base}.thumb{suffix}"
                pix.save(str(preview_path))
                saved.append(str(preview_path))
            doc.close()

        # --- DOCX : extraire seulement la première image trouvée
        elif ext == ".docx":
            doc = Document(str(path))
            for rel in doc.part._rels.values():
                if "image" in rel.reltype:
                    data = rel.target_part.blob
                    suffix = Path(rel.target_part.partname).suffix
                    save_bytes(data, suffix)
                    break  # on s’arrête après la première image

        # --- PPTX : extraire seulement la première image du premier slide
        elif ext == ".pptx":
            pres = Presentation(str(path))
            if pres.slides:
                slide = pres.slides[0]
                for shape in slide.shapes:
                    if hasattr(shape, "image"):
                        data = shape.image.blob
                        suffix = f".{shape.image.ext}"
                        save_bytes(data, suffix)
                        break  # on s’arrête après la première image

        else:
            # Pour les autres formats, on ne fait rien ou on peut logguer
            print(f"Preview extraction non géré pour {ext}")

        return saved

    def resize_image_thumbnail(self, input_path: str, output_path: str, target_size=(320, 180)) -> bool:
        from PIL import Image

        try:
            with Image.open(input_path) as img:
                if img.mode != 'RGB':
                    img = img.convert('RGB')

                img.thumbnail(target_size, Image.Resampling.LANCZOS)
                background = Image.new('RGB', target_size, (0, 0, 0))
                x = (target_size[0] - img.width) // 2
                y = (target_size[1] - img.height) // 2
                background.paste(img, (x, y))
                background.save(output_path, 'JPEG', quality=90)
            return True

        except Exception as e:
            print(f"[Thumbnail] Erreur redimensionnement image (fit) : {e}")
            return False

    def upload_and_move_thumb(self, thumb_path: str, dest_folder_id: str, parent_file: str):
        t = UploadThread(self.client, thumb_path)
        t.progress.connect(lambda _: None)
        t.finished.connect(lambda link: self.client.move_file([link], destination_folder=dest_folder_id))
        t.finished.connect(lambda link, pf=parent_file: self.thumb_finished.emit(link, pf))
        t.finished.connect(lambda: os.remove(thumb_path))
        self.thumb_threads.append(t)
        t.start()

    def _on_thumb_finished(self, thumb_url: str, parent_file: str):
        self._ensure_token()
        category, title, main_link = self._firebase_keys[parent_file]
        thumb_url = inject_affiliation(thumb_url)
        try:
            self._get_db_ref(category, title).update({'thumbnail_link': thumb_url}, self.token)
        except Exception as e:
            print(f"[Firebase] Erreur update thumbnail: {e}")
        self.thumb_threads = [t for t in self.thumb_threads if t.isRunning()]
        self.files_done += 1
        self.progress.emit(int(self.files_done / self.total_files * 100))
        self.finished.emit(main_link, parent_file)
        QTimer.singleShot(0, self.upload_next_file)

    @staticmethod
    def get_all_metadata(file_path: str, category: str) -> dict:
        metadata = {}
        try:
            if category.lower() == 'videos':
                ff = subprocess.run(
                    [str(FFPROBE_PATH), '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams',
                     file_path],
                    capture_output=True, text=True, check=True)
                metadata['ffprobe'] = json.loads(ff.stdout)
            elif category.lower() == 'musiques':
                m = MutagenFile(file_path)
                tags = {str(k): str(v) for k, v in (m.tags or {}).items()}
                metadata['mutagen_tags'] = tags
                if hasattr(m, 'info') and hasattr(m.info, 'length'):
                    metadata['duration'] = round(m.info.length, 2)
            elif category.lower() == 'images':
                ff = subprocess.run(
                    [str(FFPROBE_PATH), '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams',
                     file_path],
                    capture_output=True, text=True, check=True)
                metadata['ffprobe'] = json.loads(ff.stdout)
        except Exception as e:
            print(f"[Metadata] Erreur lecture métadonnées : {e}")
        return metadata