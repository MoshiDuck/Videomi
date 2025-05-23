from config.config import VIDEO_EXTENSIONS
from database.video_database import VideoDataBase
from database.metadata_utils import process_video
from indexer.indexer import Indexer

def video_indexer():
    db = VideoDataBase()
    return Indexer(
        db=db,
        extensions=VIDEO_EXTENSIONS,
        name_folder="videos",
        process_func=process_video,
    )