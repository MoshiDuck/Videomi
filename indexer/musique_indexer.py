from config.config import AUDIO_EXTENSIONS
from database.musique_database import MusicDataBase, process_music
from indexer.indexer import Indexer


def musique_indexer():
    db = MusicDataBase()
    return Indexer(
        db=db,
        extensions=AUDIO_EXTENSIONS,
        name_folder="music",
        process_func=process_music,
    )