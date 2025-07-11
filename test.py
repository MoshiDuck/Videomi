import multiprocessing
import re
import subprocess
from pathlib import Path

from pyOneFichierClient.OneFichierAPI.py1FichierClient import FichierClient

# Configuration de base
BASE_DIR = Path(__file__).resolve().parent
FFMPEG_PATH = BASE_DIR / "Ressource" / "ffmpeg" / "bin" / "ffmpeg.exe"
FFPROBE_PATH = BASE_DIR / "Ressource" / "ffmpeg" / "bin" / "ffprobe.exe"
# Chemin vers mpv portable intégré
MPV_PATH = BASE_DIR / "Ressource" / "mpv" / "mpv.exe"

# Vérifier l'existence de mpv
if not MPV_PATH.exists():
    raise FileNotFoundError(f"mpv non trouvé à {MPV_PATH}")

# Configuration 1fichier
API_KEY = "VqRfSWgCcbCqSytOBeoUsNL83Hg8nd0t"
client = FichierClient(APIkey=API_KEY, be_nice=True)

# yt-dlp
try:
    import yt_dlp
    HAS_YTDLP = True
except ImportError:
    HAS_YTDLP = False
    print("yt-dlp non installé : le streaming YouTube est désactivé.")
AFF_ID = "5091183"

def is_1fichier_url(url: str) -> bool:
    return "1fichier.com" in url


def is_supported_by_ytdlp(url: str) -> bool:
    known_domains = [
        "youtube.com", "youtu.be",
        "dailymotion.com", "dai.ly",
        "vimeo.com", "twitch.tv",
        "soundcloud.com", "facebook.com",
        "twitter.com", "instagram.com",
        "crunchyroll.com", "netflix.com",
    ]
    return any(domain in url for domain in known_domains)



def extract_1fichier_direct_link(url: str) -> str | None:
    match = re.search(r"1fichier\.com/\?\s*([a-z0-9]+)", url, re.IGNORECASE)
    if not match:
        print("❌ ID de fichier introuvable dans l'URL :", url)
        return None
    file_id = match.group(1)
    canonical_url = f"https://1fichier.com/?{file_id}"
    try:
        return client.get_download_link(canonical_url, cdn=True)
    except Exception as e:
        print("Erreur 1fichier :", type(e).__name__, e)
        return None


def extract_stream_url_with_yt_dlp(url: str, cookies: str = None) -> str | None:
    if not HAS_YTDLP:
        print("yt-dlp est requis pour le streaming de cette plateforme.")
        return None
    try:
        ydl_opts = {
            'quiet': True,
            'format': 'best[ext=mp4]/best'
        }
        if cookies:
            ydl_opts['cookiefile'] = cookies
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info.get('url')
    except Exception as e:
        print("Erreur extraction yt-dlp :", type(e).__name__, e)
        return None


def play_with_mpv(stream_url: str):
    print(f"\n🎬 Lecture avec mpv : {stream_url}")
    cmd = [str(MPV_PATH), stream_url]
    # Pour des options supplémentaires, on peut ajouter:
    # cmd += ['--cache=yes', '--cache-secs=60', '--hwdec=auto-safe']
    subprocess.run(cmd)



def generate_thumbnail(video_url: str, thumb_path: str, percent: float = 0.15):
    # Si l'URL contient déjà ton ID d'affiliation, on ne crée pas de miniature
    if re.search(r"[?&]af=" + re.escape(AFF_ID), video_url):
        print(f"[Thumbnail] Skip: affiliation ID {AFF_ID} detected in URL")
        return None

    # 1. Récupérer la durée via ffprobe
    cmd_probe = [
        str(FFPROBE_PATH), '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        video_url
    ]
    proc = subprocess.run(cmd_probe, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe error: {proc.stderr.strip()}")
    duration = float(proc.stdout.strip())

    # 2. Calculer le timestamp
    timestamp = duration * percent

    # 3. Filtre crop+scale 16:9 → 320x180
    filt = ("crop='if(gt(iw/ih\\,16/9)\\,ih*16/9\\,iw)':"
            "if(gt(iw/ih\\,16/9)\\,ih\\,iw*9/16),"
            "scale=320:180")
    num_threads = str(multiprocessing.cpu_count())

    # 4. Extraire la frame
    cmd_ff = [
        str(FFMPEG_PATH), '-hide_banner', '-loglevel', 'error',
        '-hwaccel', 'auto',
        '-ss', str(timestamp),
        '-i', video_url,
        '-vf', filt,
        '-vframes', '1',
        '-qscale:v', '2',
        '-preset', 'ultrafast',
        '-threads', num_threads,
        '-nostdin', '-y', thumb_path
    ]
    proc2 = subprocess.run(cmd_ff, capture_output=True, text=True)
    if proc2.returncode != 0:
        raise RuntimeError(f"ffmpeg error: {proc2.stderr.strip()}")

    return thumb_path


def main():
    print("🔗 Entre un lien 1fichier.com, YouTube, Dailymotion, Vimeo, Twitch, etc. :")
    url = input("Lien à lire : ").strip()

    if is_1fichier_url(url):
        stream_url = extract_1fichier_direct_link(url)
    elif HAS_YTDLP and is_supported_by_ytdlp(url):
        cookies = None
        if any(d in url for d in ("netflix.com", "crunchyroll.com")):
            cookies = input("Chemin vers le fichier cookies.txt (optionnel) : ").strip() or None
        stream_url = extract_stream_url_with_yt_dlp(url, cookies)
    else:
        print("❌ Lien non reconnu ou non supporté.")
        return

    if not stream_url:
        print("⚠️ Impossible d'extraire le lien de streaming.")
        return

    play_with_mpv(stream_url)


if __name__ == "__main__":
    main()
