# Todo : logger_config.py
import logging
import sys

# Codes ANSI pour les couleurs
COLOR_RESET = "\033[0m"
COLOR_MAP = {
    "DEBUG": "\033[94m",    # Bleu clair
    "INFO": "\033[92m",     # Vert
    "WARNING": "\033[93m",  # Jaune
    "ERROR": "\033[91m",    # Rouge
    "CRITICAL": "\033[95m", # Magenta
}


class ColoredFormatter(logging.Formatter):
    """Formatter qui ajoute des couleurs selon le niveau du log."""
    def format(self, record):
        color = COLOR_MAP.get(record.levelname, COLOR_RESET)
        record.levelname = f"{color}{record.levelname}{COLOR_RESET}"
        return super().format(record)


def setup_logger(level=logging.INFO) -> logging.Logger:
    """
    Configure et retourne le logger principal de l'application.
    Évite la duplication des handlers si déjà configuré.
    """
    _logger = logging.getLogger()  # logger racine de l'application

    if not _logger.handlers:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(level)

        formatter = ColoredFormatter(
            "[%(asctime)s][%(levelname)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        console_handler.setFormatter(formatter)

        _logger.addHandler(console_handler)
        _logger.setLevel(level)

    return _logger


# Logger par défaut de l’application
logger = setup_logger()
