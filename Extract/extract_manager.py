# src/extractors/extractor_manager.py

import mimetypes
from pathlib import Path
from typing import Callable, Dict, List, Any


class ExtractManager:
    def __init__(self):
        self._extractors: Dict[str, Callable[[Dict[str, Any], str], None]] = {}
        self.categories: Dict[str, List[str]] = {}

    def register_cat(self, cat: str, extensions: List[str]):
        """Enregistre une catégorie avec une liste d'extensions (normalisées en .ext)"""
        self.categories[cat] = [
            ext.lower() if ext.startswith('.') else f'.{ext.lower()}'
            for ext in extensions
        ]

    def register_extractor(self, exts: List[str]):
        """Décorateur pour enregistrer un extracteur associé à une ou plusieurs extensions"""
        def decorator(fn):
            for ext in exts:
                norm_ext = ext.lower() if ext.startswith('.') else f'.{ext.lower()}'
                self._extractors[norm_ext] = fn
            return fn
        return decorator

    def extract(self, file_path: str) -> Dict[str, Any]:
        """Extrait les métadonnées d'un fichier et applique l'extracteur si disponible"""
        path = Path(file_path)
        ext = path.suffix.lower()

        category = "Autres"
        for cat, exts in self.categories.items():
            if ext in exts:
                category = cat
                break

        meta = {
            'cat': category,
            'path': str(path),
            'size_bytes': path.stat().st_size,
            'mime': mimetypes.guess_type(file_path)[0] or 'unknown'
        }

        extractor = self._extractors.get(ext)
        if extractor:
            try:
                extractor(meta, file_path)
                meta['extracted_with'] = extractor.__name__
            except Exception as e:
                meta[f'{ext[1:]}_error'] = str(e)
        else:
            meta['note'] = 'Aucun extracteur dédié pour cette extension.'

        return meta


# Instanciation unique du gestionnaire
manager = ExtractManager()
