# TODO: main.py
import sys

import pythoncom
import faulthandler
from Core.init import Init
from Core.logger_config import logger

# Active faulthandler pour TOUS les threads (très utile en environnement multithread)
faulthandler.enable(all_threads=True)

# Initialise COM pour le thread principal en mode multithread (MTA : Multi-Threaded Apartment)
# Sans cette initialisation, certaines API Windows ou objets COM ne fonctionneront pas correctement
pythoncom.CoInitializeEx(pythoncom.COINIT_MULTITHREADED)

if __name__ == "__main__":
    try:
        init = Init()
        init.run()
    except Exception as e:
        logger.exception("Crash non géré dans le main")
        sys.exit(1)
    finally:
        # Nettoyage COM
        pythoncom.CoUninitialize()

# TODO: Implémenter la gestion des erreurs ici
# FIXME: Corriger le bug de thread bloqué
