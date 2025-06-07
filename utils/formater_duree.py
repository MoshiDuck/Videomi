import logging
from typing import Union


def formater_duree(secondes: Union[int, float]) -> str:
    if not isinstance(secondes, (int, float)):
        return "00:00:00"
    try:
        heures = int(secondes // 3600)
        minutes = int((secondes % 3600) // 60)
        secs = int(secondes % 60)
        return f"{heures:02d}:{minutes:02d}:{secs:02d}"
    except (ValueError, TypeError) as e:
        logging.warning(f"Erreur de formatage de durée : {e}")
        return "00:00:00"