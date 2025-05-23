import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Chemins vers exécutables
FFMPEG_PATH = os.path.join(BASE_DIR, "Ressource", "ffmpeg", "bin", "ffmpeg.exe")
FFPROBE_PATH = os.path.join(BASE_DIR, "Ressource", "ffmpeg", "bin", "ffprobe.exe")

# Base de données dossiers
FOLDER_DB_PATH = os.path.join(BASE_DIR, "database", "data", "folders.db")

# Dossiers miniatures
THUMBNAIL_VIDEO_DIR = os.path.join(BASE_DIR, "database", "data", "miniature", "videos")
THUMBNAIL_MUSIC_DIR = os.path.join(BASE_DIR, "database", "data", "miniature", "music")

# Dossier VLC
VLC_DIR = os.path.join(BASE_DIR, "Ressource", "vlc-3.0.21")

# Extensions supportées
VIDEO_EXTENSIONS = (".mp4", ".mkv", ".avi", ".mov", ".flv", ".webm")
AUDIO_EXTENSIONS = (".mp3", ".flac", ".wav", ".aac", ".ogg", ".m4a")

def verify_paths():
    missing = []
    for name, path in {
        "ffmpeg": FFMPEG_PATH,
        "ffprobe": FFPROBE_PATH,
        "folder DB": FOLDER_DB_PATH,
        "video thumbnails": THUMBNAIL_VIDEO_DIR,
        "music thumbnails": THUMBNAIL_MUSIC_DIR,
        "vlc": VLC_DIR,
    }.items():
        if not os.path.exists(path):
            missing.append(f"❌ {name} introuvable : {path}")
    if missing:
        raise FileNotFoundError("\n".join(missing))
