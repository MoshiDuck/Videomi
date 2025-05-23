import os

from fonction.def_get_metadata import get_metadata

def process_video(file_path, db):
    from database.miniature_video_database import MiniatureVideoDataBase

    name, _ = os.path.splitext(os.path.basename(file_path))
    thumbnail_path = os.path.join(
        os.path.dirname(__file__), "data", "miniature", "videos", f"{name}.jpg"
    )

    already_indexed = file_path in db.get_all_video_paths()
    has_thumbnail = os.path.exists(thumbnail_path)


    if not already_indexed:
        data = get_metadata(file_path)
        format_data = data.get("format", {})
        streams = data.get("streams", [])

        title = format_data.get("tags", {}).get("title", os.path.basename(file_path))
        duration = float(format_data.get("duration", 0.0))

        video_id = db.insert_video(file_path, title, duration)
        for stream in streams:
            codec = stream.get("codec_name", "")
            lang = stream.get("tags", {}).get("language", "und")
            codec_type = stream.get("codec_type", "")
            track_title = stream.get("tags", {}).get("title", "")
            if codec_type == "audio":
                db.insert_audio(video_id, lang, codec, track_title)
            elif codec_type == "subtitle":
                db.insert_subtitle(video_id, lang, codec, track_title)

    if not has_thumbnail:
        MiniatureVideoDataBase(db).generate_thumbnail(file_path)
