# Todo : i18n.py
from Core.Language.language_manager import get_lang
from Core.logger_config import logger

# Variable pour stocker les traductions en cache
_cached_translations = None

def _load_translations():
    """
    Charge les traductions de manière dynamique pour éviter les imports circulaires.
    """
    global _cached_translations
    if _cached_translations is None:
        from Core.Language.language_manager import translations
        _cached_translations = translations
        logger.debug(f"Traductions chargées: {list(_cached_translations.keys())}")
    return _cached_translations

def get_text(path: str, lang: str = None):
    """
    Récupérer le texte selon le chemin hiérarchique et la langue courante.
    """
    if lang is None:
        lang = get_lang()

    logger.debug(f"Demande de texte: {path}, langue: {lang}")

    # Charger les traductions de manière dynamique
    translations = _load_translations()

    # Fallback à l'anglais si la langue n'est pas disponible
    lang_data = translations.get(lang, translations.get("en", {}))

    # Parcourir le chemin hiérarchique
    keys = path.split(".")
    current_level = lang_data

    for key in keys:
        if isinstance(current_level, dict) and key in current_level:
            current_level = current_level[key]
        else:
            logger.debug(f"Clé non trouvée: {key}")
            # Fallback à l'anglais si la clé n'est pas trouvée
            if lang != "en":
                return get_text(path, "en")
            return None

    # Retourner la valeur finale si ce n'est pas un dictionnaire
    result = current_level if not isinstance(current_level, dict) else None
    logger.debug(f"Résultat: {result}")
    return result