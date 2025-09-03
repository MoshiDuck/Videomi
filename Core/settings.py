from pathlib import Path
import platform
import os

# --------------------------------------------------
# Répertoires de base
# --------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = BASE_DIR / "Cache"
CONFIG_DIR = BASE_DIR / "Config"
DB_DIR = BASE_DIR / "Db"
RESSOURCES_DIR = BASE_DIR / "Ressource"


# Fonction utilitaire pour créer un dossier s'il n'existe pas
def ensure_dir(path):
    path = Path(path)
    if not path.exists():
        path.mkdir(parents=True, exist_ok=True)


# Crée automatiquement les dossiers principaux
for d in [
    CONFIG_DIR,
    CACHE_DIR,
    DB_DIR,
    RESSOURCES_DIR
]:
    ensure_dir(d)

# --------------------------------------------------
# Fichiers principaux
# --------------------------------------------------
CONFIG_PATH = CONFIG_DIR / "config.yaml"
STYLE_PATH = CONFIG_DIR / "style.qss"
DB_LOCAL_PATH = DB_DIR / "local_data.db"
DB_LANG_PATH = DB_DIR / "lang.db"

# --------------------------------------------------
# Répertoires de téléchargement
# --------------------------------------------------
DOWNLOADS_DIR = CACHE_DIR / "Downloads"
VIDEO_DOWNLOAD_DIR = DOWNLOADS_DIR / "Videos"
AUDIO_DOWNLOAD_DIR = DOWNLOADS_DIR / "Musiques"

# Créer les dossiers de téléchargement
for d in [DOWNLOADS_DIR, VIDEO_DOWNLOAD_DIR, AUDIO_DOWNLOAD_DIR]:
    ensure_dir(d)


# --------------------------------------------------
# Cache Image
# --------------------------------------------------

CACHE_IMAGE_DIR = CACHE_DIR / "Images"

# --------------------------------------------------
# Chemins FFmpeg et MPV selon l'OS
# --------------------------------------------------
def get_ffmpeg_paths():
    system = platform.system().lower()

    if system == "windows":
        ffmpeg_dir = RESSOURCES_DIR / "Win" / "ffmpeg" / "bin"
        return {
            "ffmpeg": ffmpeg_dir / "ffmpeg.exe",
            "ffprobe": ffmpeg_dir / "ffprobe.exe",
            "mpv": RESSOURCES_DIR / "Win" / "mpv" / "mpv.exe"
        }
    elif system == "darwin":  # macOS
        return {
            "ffmpeg": RESSOURCES_DIR / "MacOs" / "ffmpeg" / "ffmpeg",
            "ffprobe": RESSOURCES_DIR / "MacOs" / "ffmpeg" / "ffprobe",
            "mpv": RESSOURCES_DIR / "MacOs" / "mpv.app" / "Contents" / "MacOS" / "mpv"
        }
    else:  # Linux et autres
        # Fallback aux exécutables système
        return {
            "ffmpeg": Path("ffmpeg"),
            "ffprobe": Path("ffprobe"),
            "mpv": Path("mpv")
        }


# Obtenir les chemins
BIN_PATHS = get_ffmpeg_paths()
FFMPEG_PATH = BIN_PATHS["ffmpeg"]
FFPROBE_PATH = BIN_PATHS["ffprobe"]
MPV_PATH = BIN_PATHS["mpv"]

# Vérifier l'existence des exécutables et ajouter les chemins au PATH si nécessaire
if FFMPEG_PATH.exists():
    os.environ["PATH"] = str(FFMPEG_PATH.parent) + os.pathsep + os.environ["PATH"]

# --------------------------------------------------
# Paramètres divers
# --------------------------------------------------
QT_LOGGING_RULES = "*.debug=true"