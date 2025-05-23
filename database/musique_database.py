import os
import subprocess
import sqlite3

from config.config import THUMBNAIL_MUSIC_DIR, FFMPEG_PATH
from fonction.def_format_duration import format_duration
from fonction.def_get_metadata import get_metadata

os.makedirs(THUMBNAIL_MUSIC_DIR, exist_ok=True)

class MusicDataBase:
    def __init__(self, db_path=None):
        if db_path is None:
            data_dir = os.path.join(os.path.dirname(__file__), "data")
            os.makedirs(data_dir, exist_ok=True)
            db_path = os.path.join(data_dir, "music.db")

        self.db_path = db_path
        self._create_tables_once()

    def _create_tables_once(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS music (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    path TEXT UNIQUE NOT NULL,
                    title TEXT,
                    artist TEXT,
                    album TEXT,
                    duration REAL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS music_streams (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    music_id INTEGER,
                    codec TEXT,
                    channels INTEGER,
                    sample_rate INTEGER,
                    language TEXT,
                    FOREIGN KEY(music_id) REFERENCES music(id) ON DELETE CASCADE
                )
            """)

    def _connect(self):
        return sqlite3.connect(self.db_path)

    def get_all_music_paths(self):
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT path FROM music")
            return set(row[0] for row in cursor.fetchall())

    def remove_music_by_path(self, path):
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM music WHERE path = ?", (path,))
            conn.commit()

    def insert_music(self, path, title, artist, album, duration):
        """Insère musique avec durée en secondes."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR IGNORE INTO music (path, title, artist, album, duration)
                VALUES (?, ?, ?, ?, ?)
            """, (path, title, artist, album, duration))
            conn.commit()
            # Retourne l'id inséré ou existant
            cursor.execute("SELECT id FROM music WHERE path = ?", (path,))
            row = cursor.fetchone()
            return row[0] if row else None

    def insert_stream(self, music_id, codec, channels, sample_rate, language):
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO music_streams (music_id, codec, channels, sample_rate, language)
                VALUES (?, ?, ?, ?, ?)
            """, (music_id, codec, channels, sample_rate, language))
            conn.commit()

    def get_all_for_display(self):
        """
        Renvoie une liste de dicts pour l'affichage :
        { id, path, title, artist, album, duration (HH:MM:SS), thumbnail_path }
        """
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, path, title, artist, album, duration FROM music")
            rows = cursor.fetchall()

        result = []
        for id_, path, title, artist, album, raw_duration in rows:
            name, _ = os.path.splitext(os.path.basename(path))
            thumbnail_path = os.path.join(THUMBNAIL_MUSIC_DIR, f"{name}.png")
            if not os.path.exists(thumbnail_path):
                thumbnail_path = None

            result.append({
                "id": id_,
                "path": path,
                "title": title or name,
                "artist": artist or "",
                "album": album or "",
                "duration": format_duration(raw_duration),
                "thumbnail_path": thumbnail_path
            })
        return result


def extract_album_art_ffmpeg(audio_path, output_image_path):
    """
    Extrait pochette intégrée (si présente) avec ffmpeg.
    """
    cmd = [
        FFMPEG_PATH,
        "-y",
        "-i", audio_path,
        "-an",
        "-vcodec", "copy",
        output_image_path
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode == 0 and os.path.exists(output_image_path):
        return True
    else:
        if os.path.exists(output_image_path):
            os.remove(output_image_path)
        return False


def process_music(file_path, db: MusicDataBase):
    data = get_metadata(file_path)
    format_data = data.get("format", {})
    streams = data.get("streams", [])
    tags = format_data.get("tags", {})

    title = tags.get("title", os.path.basename(file_path))
    artist = tags.get("artist", "")
    album = tags.get("album", "")
    duration = float(format_data.get("duration", 0.0))

    music_id = db.insert_music(file_path, title, artist, album, duration)

    # Extraction pochette intégrée
    filename = os.path.basename(file_path)
    name, _ = os.path.splitext(filename)
    output_path = os.path.join(THUMBNAIL_MUSIC_DIR, f"{name}.png")
    if not os.path.exists(output_path):
        _ = extract_album_art_ffmpeg(file_path, output_path)

    # insertion flux audio
    for stream in streams:
        if stream.get("codec_type") == "audio":
            db.insert_stream(
                music_id,
                stream.get("codec_name", ""),
                stream.get("channels", 0),
                int(stream.get("sample_rate", 0)),
                stream.get("tags", {}).get("language", "und")
            )
