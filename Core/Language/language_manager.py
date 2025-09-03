# Todo : language_manager.py
import json
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from pathlib import Path
import sqlite3
from deep_translator import GoogleTranslator
from Core.Language.Textes.Auth.auth_texts import auth_texts
from Core.Language.Textes.Lecteur.lecteur_texts import lecteur_texts
from Core.Language.Textes.Nav.nav_texts import nav_texts
from Core.Language.Textes.dialogs_texts import dialogs_texts
from Core.Language.Textes.window_texts import window_texts
from Core.settings import DB_LANG_PATH
from Core.logger_config import logger
from Core.os_detector import OSDetector

# --- Textes de base ---
base_texts = {
    "auth": auth_texts,
    "main_window": window_texts,
    "nav_labels": nav_texts,
    "dialogs": dialogs_texts,
    "lecteur_labels": lecteur_texts
}

languages = ["fr", "en", "es"]
translations = {}
TRANSLATIONS_CACHE_DIR = Path(__file__).parent / "translations_cache"
TRANSLATIONS_CACHE_DIR.mkdir(exist_ok=True)


def get_cache_path(lang: str) -> Path:
    return TRANSLATIONS_CACHE_DIR / f"{lang}.json"


def load_cached_translations(lang: str):
    cache_path = get_cache_path(lang)
    if cache_path.exists():
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Erreur lecture cache {lang}: {e}")
    return None


def save_translations_to_cache(lang: str, data: dict):
    try:
        cache_path = get_cache_path(lang)
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"Erreur écriture cache {lang}: {e}")


# --- Traduction récursive ---
def translate_value(args):
    k, v, src, target = args
    try:
        return k, GoogleTranslator(source=src, target=target).translate(v, timeout=3)
    except Exception as e:
        logger.debug(f"Erreur traduction {k}: {e}")
        return k, v  # Fallback


def translate_dict(d, src="fr", target="en"):
    result = {}
    items = []

    for k, v in d.items():
        if isinstance(v, dict):
            result[k] = translate_dict(v, src, target)
        else:
            items.append((k, v, src, target))

    # Traiter les éléments en parallèle
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(translate_value, item) for item in items]
        for i, future in enumerate(futures):
            try:
                k, translated_value = future.result(timeout=5)
                result[k] = translated_value
            except TimeoutError:
                logger.debug(f"Timeout pour la clé: {items[i][0]}")
                result[items[i][0]] = items[i][1]  # Valeur originale

    return result


# --- Charger / recharger les traductions ---
def reload_translations():
    logger.info("Chargement des traductions")
    global translations

    # Toujours charger le français depuis les textes de base
    translations["fr"] = base_texts
    save_translations_to_cache("fr", base_texts)
    logger.debug("Textes français chargés et sauvegardés en cache")

    for lang in languages:
        if lang == "fr":
            continue  # Déjà traité

        # Essayer de charger depuis le cache
        cached = load_cached_translations(lang)
        if cached:
            translations[lang] = cached
            logger.debug(f"Traductions {lang} chargées depuis le cache")
        else:
            # Traduire et sauvegarder en cache
            try:
                logger.info(f"Traduction vers {lang} en cours...")
                translations[lang] = translate_dict(base_texts, "fr", lang)
                save_translations_to_cache(lang, translations[lang])
                logger.info(f"Traductions {lang} sauvegardées en cache")
            except Exception as e:
                logger.error(f"Erreur lors de la traduction {lang}: {e}")
                translations[lang] = base_texts  # Fallback vers le français


# --- Gestion DB ---
def _get_system_lang() -> str:
    """Utilise OSDetector pour détecter la langue du système"""
    os_detector = OSDetector()
    return os_detector.get_system_language(languages)


def init_db():
    try:
        conn = sqlite3.connect(DB_LANG_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)

        # FORCER la mise à jour avec la langue système à chaque initialisation
        system_lang = _get_system_lang()
        logger.info(f"Langue système détectée: {system_lang}")

        cursor.execute("""
            INSERT OR REPLACE INTO settings (key, value)
            VALUES ('lang', ?)
        """, (system_lang,))

        conn.commit()
        conn.close()
        logger.info(f"Base de données initialisée avec la langue: {system_lang}")
    except Exception as e:
        logger.error(f"Erreur lors de l'initialisation de la base de données: {e}")


def get_lang() -> str:
    try:
        conn = sqlite3.connect(DB_LANG_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key='lang'")
        row = cursor.fetchone()
        conn.close()

        if row:
            lang = row[0]
            return lang
        else:
            system_lang = _get_system_lang()
            logger.info(f"Aucune langue en base, utilisation de la langue système: {system_lang}")
            return system_lang
    except Exception as e:
        logger.error(f"Erreur lors de la récupération de la langue: {e}")
        return _get_system_lang()


# Charger les traductions
reload_translations()