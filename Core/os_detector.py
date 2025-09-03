# Todo : os_detector.py
import locale
import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Dict, List, Optional

from Core.logger_config import logger


class OSDetector:
    """Classe pour détecter et gérer les informations du système d'exploitation"""

    def __init__(self):
        self.system = platform.system()
        self.release = platform.release()
        self.version = platform.version()
        self.machine = platform.machine()
        self.architecture = platform.architecture()[0]
        self.detailed_info = self._get_detailed_info()

    def _get_detailed_info(self) -> Dict[str, str]:
        """Obtenir des informations détaillées sur le système"""
        info = {
            'system': self.system,
            'release': self.release,
            'version': self.version,
            'machine': self.machine,
            'architecture': self.architecture,
            'processor': platform.processor(),
        }

        # Informations supplémentaires selon l'OS
        if self.system == "Darwin":
            info.update(self._get_macos_info())
        elif self.system == "Windows":
            info.update(self._get_windows_info())
        elif self.system == "Linux":
            info.update(self._get_linux_info())

        return info

    @staticmethod
    def _get_macos_info() -> Dict[str, str]:
        """Obtenir des informations spécifiques à macOS"""
        mac_info = {}
        try:
            # Version macOS
            result = subprocess.run(['sw_vers'], capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                for line in result.stdout.split('\n'):
                    if 'ProductName:' in line:
                        mac_info['product_name'] = line.split(':')[1].strip()
                    elif 'ProductVersion:' in line:
                        mac_info['product_version'] = line.split(':')[1].strip()
                    elif 'BuildVersion:' in line:
                        mac_info['build_version'] = line.split(':')[1].strip()
        except Exception as e:
            logger.debug(f"Erreur lors de la récupération des infos macOS: {e}")

        return mac_info

    @staticmethod
    def _get_windows_info() -> Dict[str, str]:
        """Obtenir des informations spécifiques à Windows"""
        win_info = {}
        try:
            # Édition Windows
            result = subprocess.run(
                ['systeminfo'],
                capture_output=True,
                text=True,
                timeout=10,
                encoding='utf-8',
                errors='ignore'
            )
            if result.returncode == 0:
                for line in result.stdout.split('\n'):
                    if 'Nom du système d exploitation:' in line:
                        win_info['os_name'] = line.split(':')[1].strip()
                    elif 'Version du système:' in line:
                        win_info['os_version'] = line.split(':')[1].strip()
                    elif 'Type du système:' in line:
                        win_info['system_type'] = line.split(':')[1].strip()
        except Exception as e:
            logger.debug(f"Erreur lors de la récupération des infos Windows: {e}")

        return win_info

    def _get_linux_info(self) -> Dict[str, str]:
        """Obtenir des informations spécifiques à Linux"""
        linux_info = {}
        try:
            # Distribution Linux
            if os.path.exists('/etc/os-release'):
                with open('/etc/os-release', 'r') as f:
                    for line in f:
                        if line.startswith('PRETTY_NAME='):
                            linux_info['distribution'] = line.split('=')[1].strip().strip('"')
                            break

            # Version du noyau
            linux_info['kernel'] = self.release

        except Exception as e:
            logger.debug(f"Erreur lors de la récupération des infos Linux: {e}")

        return linux_info

    def get_system_language(self, languages: List[str] = None) -> str:
        """Détecter la langue du système d'exploitation"""
        if languages is None:
            languages = ["fr", "en", "es"]

        try:
            # 1. Méthode universelle: variables d'environnement
            lang = os.environ.get('LANG') or os.environ.get('LANGUAGE')
            if lang:
                lang_code = lang.split('_')[0].split('.')[0].lower()
                if lang_code in languages:
                    return lang_code

            # 2. Méthode spécifique selon l'OS
            if self.system == "Darwin":  # macOS
                try:
                    # Méthode 1: Commande defaults (méthode native macOS)
                    result = subprocess.run(
                        ['defaults', 'read', 'NSGlobalDomain', 'AppleLanguages'],
                        capture_output=True, text=True, timeout=5
                    )
                    if result.returncode == 0:
                        # Le résultat est une liste comme ["fr", "en", "es"]
                        import ast
                        langs = ast.literal_eval(result.stdout.strip())
                        if langs and isinstance(langs, list):
                            lang_code = langs[0].split('-')[0].lower()
                            if lang_code in languages:
                                return lang_code
                except Exception as e:
                    logger.debug(f"Erreur lecture préférences macOS: {e}")

            elif self.system == "Windows":
                try:
                    import ctypes
                    import winreg

                    # Méthode 1: API Windows
                    kernel32 = ctypes.windll.kernel32
                    lang_id = kernel32.GetUserDefaultUILanguage()
                    lang_map = {
                        1033: 'en', 1036: 'fr', 1034: 'es', 1031: 'de',
                        1040: 'it', 1041: 'ja', 2052: 'zh', 1049: 'ru'
                    }
                    if lang_id in lang_map:
                        return lang_map[lang_id]
                except Exception as e:
                    logger.debug(f"Erreur API Windows: {e}")

            # 3. Méthode de fallback universelle
            lang, _ = locale.getdefaultlocale()
            if lang:
                lang_code = lang.split('_')[0].lower()
                if lang_code in languages:
                    return lang_code

        except Exception as e:
            logger.error(f"Erreur lors de la détection de la langue: {e}")

        # Fallback à l'anglais par défaut
        return 'en'

    def get_ipc_path(self, ipc_name: str) -> str:
        """Déterminer le chemin IPC en fonction de l'OS"""
        if self.system == "Windows":
            # Retourner le format de named pipe Windows
            return rf"\\.\pipe\{ipc_name}"
        return f"/tmp/{ipc_name}"

    def is_windows(self) -> bool:
        """Vérifier si le système est Windows"""
        return self.system == "Windows"

    def is_macos(self) -> bool:
        """Vérifier si le système est macOS"""
        return self.system == "Darwin"

    def is_linux(self) -> bool:
        """Vérifier si le système est Linux"""
        return self.system == "Linux"

    def get_platform_info(self) -> Dict[str, str]:
        """Obtenir toutes les informations de la plateforme"""
        return self.detailed_info

    def get_ffmpeg_paths(self, ressources_dir: str) -> Dict[str, str]:
        """Obtenir les chemins vers ffmpeg et ffprobe selon l'OS"""
        from pathlib import Path

        if self.is_windows():
            ffmpeg_dir = Path(ressources_dir) / "Win" / "ffmpeg" / "bin"
            return {
                "ffmpeg": str(ffmpeg_dir / "ffmpeg.exe"),
                "ffprobe": str(ffmpeg_dir / "ffprobe.exe"),
                "mpv": str(Path(ressources_dir) / "Win" / "mpv" / "mpv.exe")
            }
        elif self.is_macos():
            return {
                "ffmpeg": str(Path(ressources_dir) / "MacOs" / "ffmpeg" / "ffmpeg"),
                "ffprobe": str(Path(ressources_dir) / "MacOs" / "ffmpeg" / "ffprobe"),
                "mpv": str(Path(ressources_dir) / "MacOs" / "mpv.app" / "Contents" / "MacOS" / "mpv")
            }
        else:  # Linux et autres
            # Fallback aux exécutables système
            return {
                "ffmpeg": "ffmpeg",
                "ffprobe": "ffprobe",
                "mpv": "mpv"
            }

    def find_mpv(self) -> Optional[Path]:
        """
        Trouve le chemin vers l'exécutable MPV selon l'OS.
        Cherche d'abord dans les chemins spécifiques, puis dans le PATH système.
        """
        try:
            # Chemins spécifiques selon l'OS
            if self.is_windows():
                # Chemins Windows communs
                windows_paths = [
                    Path("C:/Program Files/mpv/mpv.exe"),
                    Path("C:/Program Files (x86)/mpv/mpv.exe"),
                    Path(os.environ.get("PROGRAMFILES", "")) / "mpv/mpv.exe",
                    Path(os.environ.get("PROGRAMFILES(X86)", "")) / "mpv/mpv.exe",
                ]

                for path in windows_paths:
                    if path.exists():
                        return path.resolve()

            elif self.is_macos():
                # Chemins macOS communs
                mac_paths = [
                    Path("/Applications/mpv.app/Contents/MacOS/mpv"),
                    Path(os.path.expanduser("~/Applications/mpv.app/Contents/MacOS/mpv")),
                    Path("/usr/local/bin/mpv"),
                    Path("/opt/homebrew/bin/mpv"),
                ]

                for path in mac_paths:
                    if path.exists():
                        return path.resolve()

            else:  # Linux et autres
                # Chemins Linux communs
                linux_paths = [
                    Path("/usr/bin/mpv"),
                    Path("/usr/local/bin/mpv"),
                    Path("/snap/bin/mpv"),
                ]

                for path in linux_paths:
                    if path.exists():
                        return path.resolve()

            # Fallback: chercher dans le PATH système
            mpv_path = shutil.which("mpv")
            if mpv_path:
                return Path(mpv_path).resolve()

        except Exception as e:
            logger.error(f"Erreur lors de la recherche de MPV: {e}")

        return None