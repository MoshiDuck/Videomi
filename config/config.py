import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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
    missing_files = []
    required_dirs = [
        THUMBNAIL_VIDEO_DIR,
        THUMBNAIL_MUSIC_DIR,
        os.path.dirname(FOLDER_DB_PATH),
        VLC_DIR
    ]

    # Création des dossiers requis
    for d in required_dirs:
        if not os.path.exists(d):
            print(f"[Création dossier] {d}")
            os.makedirs(d, exist_ok=True)

    # Vérification des exécutables uniquement
    for name, path in {
        "ffmpeg": FFMPEG_PATH,
        "ffprobe": FFPROBE_PATH,
    }.items():
        if not os.path.exists(path):
            missing_files.append(f"❌ {name} introuvable : {path}")

    if missing_files:
        raise FileNotFoundError("\n".join(missing_files))
