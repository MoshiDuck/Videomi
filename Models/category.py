class CatManager:
    CATEGORIES = {
        'videos': ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.mpeg',
                   '.mpg', '.webm', '.vob', '.ogv', '.3gp'],
        'musiques': ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma',
                     '.m4a', '.alac'],
        'images': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff',
                   '.svg', '.webp', '.heic'],
        'documents': ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt',
                      '.pptx', '.txt', '.rtf', '.odt', '.ods', '.odp',
                      '.tex', '.wpd', '.pages', '.md', '.csv', '.tsv',
                      '.epub', '.mobi', '.azw', '.azw3', '.djvu'],
        'archives': ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
                     '.xz', '.lz', '.iso', '.cab', '.arj', '.z',
                     '.tgz', '.tbz2', '.txz', '.lzma'],
    }

    _EXT_TO_CAT = {ext: cat for cat, exts in CATEGORIES.items() for ext in exts}

    @staticmethod
    def sanitize_key(key: str) -> str:
        import re
        return re.sub(r'[^a-z0-9_-]', '_', key.strip().lower())

    @classmethod
    def get_category(cls, extension: str) -> str:
        ext = extension.lower()
        if not ext.startswith('.'):
            ext = f'.{ext}'
        return cls._EXT_TO_CAT.get(ext, 'autres')

    @classmethod
    def get_all_categories(cls):
        return list(cls.CATEGORIES.keys())
