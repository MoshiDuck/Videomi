from Extract.extract_manager import manager
import json
import subprocess
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent
FFPROBE_PATH = BASE_DIR / "Ressource" / "ffmpeg" / "bin" / "ffprobe.exe"

@manager.register_extractor(['.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv',
            '.mpeg', '.mpg', '.webm', '.vob', '.ogv', '.3gp',
            '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma',
            '.m4a', '.alac'])
def extract_media(meta, file_path):
    fp = Path(FFPROBE_PATH)
    if not fp.is_file():
        meta['ffprobe_error'] = f"Executable non trouvé : {FFPROBE_PATH}"
        return
    cmd = [FFPROBE_PATH, '-v', 'quiet', '-print_format', 'json',
           '-show_format', '-show_streams', file_path]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode == 0:
        meta['ffprobe'] = json.loads(proc.stdout)
    else:
        meta['ffprobe_error'] = proc.stderr.strip()