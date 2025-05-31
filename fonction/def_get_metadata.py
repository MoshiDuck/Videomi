import json
import subprocess

from config.config import FFPROBE_PATH


def get_metadata(file_path):
    cmd = [
        FFPROBE_PATH,
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe error for {file_path}: {result.stderr}")
    return json.loads(result.stdout)