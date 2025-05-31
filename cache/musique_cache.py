import json
import logging
from pathlib import Path
from typing import Any

class MusiqueCache:
    """
    Gère la lecture et l'écriture du cache musique_info sur disque au format JSON.
    """

    def __init__(self, cache_path: str | Path):
        self.cache_path = Path(cache_path)
        self.data: dict[str, dict[str, Any]] = self._load_cache()

    def _load_cache(self) -> dict[str, dict[str, Any]]:
        if not self.cache_path.exists():
            return {}

        try:
            with open(self.cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logging.error(f"Erreur lors du chargement du cache musique : {e}")
            return {}

    def save(self) -> None:
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.cache_path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logging.error(f"Erreur lors de l'enregistrement du cache musique : {e}")

    def get(self, chemin: str) -> dict[str, Any] | None:
        return self.data.get(chemin)

    def update(self, chemin: str, info: dict[str, Any]) -> None:
        self.data[chemin] = info

    def bulk_update(self, new_data: dict[str, dict[str, Any]]) -> None:
        self.data.update(new_data)

    def contains(self, chemin: str) -> bool:
        return chemin in self.data

    def clear(self) -> None:
        self.data.clear()
        self.save()
