# Todo : mpv_controller.py
# -*- coding: utf-8 -*-
import json
import socket
import subprocess
import threading
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from Core.logger_config import logger
from Core.os_detector import OSDetector

from yt_dlp import YoutubeDL

# Constants
PIPE_CONNECTION_TIMEOUT = 5
PIPE_RETRY_INTERVAL = 0.2
MPV_STOP_TIMEOUT = 2.0
COMMAND_TIMEOUT = 2.0
MAX_PIPE_CONNECTION_ATTEMPTS = 15

try:
    import win32file
    import pywintypes
    WINDOWS_NAMED_PIPES_AVAILABLE = True
except ImportError:
    WINDOWS_NAMED_PIPES_AVAILABLE = False


class MPVController:
    def __init__(self, mpv_exe: Path, max_volume: int = 200, ipc_name: str = "mpvsocket"):
        self.max_volume = max_volume
        self.mpv_exe = mpv_exe.resolve()
        self.ipc_name = ipc_name

        # Utilisation de OSDetector pour une détection multi-OS robuste
        self.os_detector = OSDetector()
        self.system = self.os_detector.system
        self.ipc_path = self.os_detector.get_ipc_path(ipc_name)

        self.process: Optional[subprocess.Popen] = None
        self._socket: Optional[socket.socket] = None
        self._win32_pipe = None  # Pour les named pipes Windows
        self._socket_lock = threading.RLock()
        self._req_id = 1
        self._req_id_lock = threading.Lock()
        self._debug = False

        self._validate_mpv_executable()

    def _validate_mpv_executable(self) -> None:
        """Vérifier que l'exécutable MPV existe et est valide"""
        if not self.mpv_exe.exists():
            raise FileNotFoundError(f"MPV executable not found: {self.mpv_exe}")
        if not self.mpv_exe.is_file():
            raise ValueError(f"MPV path is not a file: {self.mpv_exe}")

        # Vérification supplémentaire pour macOS (app bundle)
        if self.os_detector.is_macos() and ".app" in str(self.mpv_exe):
            actual_binary = self.mpv_exe / "Contents" / "MacOS" / "mpv"
            if not actual_binary.exists():
                raise FileNotFoundError(f"MPV app bundle is invalid: {self.mpv_exe}")

    # ------------------- Command Helpers -------------------
    def _next_request_id(self) -> int:
        """Générer un ID de requête unique avec sécurité des threads"""
        with self._req_id_lock:
            rid = self._req_id
            self._req_id = 1 if self._req_id > 1_000_000_000 else self._req_id + 1
            return rid

    @staticmethod
    def _build_command(command_list: List, request_id: Optional[int] = None) -> bytes:
        """Construire une commande JSON avec ID de requête optionnel"""
        cmd = {"command": command_list}
        if request_id is not None:
            cmd["request_id"] = request_id
        return (json.dumps(cmd) + "\n").encode("utf-8")

    # ------------------- Process Management -------------------
    def launch(self, url: str, window_id: int, extra_args: Optional[List[str]] = None) -> bool:
        """Lancer le processus MPV avec serveur IPC et qualité vidéo améliorée"""
        if self.process and self.process.poll() is None:
            logger.warning("MPV process already running")
            return False

        # Préparer l'exécutable MPV selon l'OS
        mpv_executable = str(self.mpv_exe)
        if self.os_detector.is_macos() and ".app" in mpv_executable:
            # Pour macOS, utiliser le binaire à l'intérieur du bundle
            mpv_executable = str(self.mpv_exe / "Contents" / "MacOS" / "mpv")

        # Arguments de base
        args = [
            mpv_executable,
            url,
            f"--wid={window_id}",
            "--no-terminal",
            f"--input-ipc-server={self.ipc_path}",
            "--msg-level=all=info",
            "--no-config",
            "--keep-open=yes"
        ]

        # Arguments pour améliorer la qualité vidéo
        quality_args = [
            "--hwdec=auto",  # Accélération matérielle si possible
            "--vo=gpu",  # Rendu GPU
            "--gpu-context=auto",  # Contexte GPU automatique
            "--scale=ewa_lanczos",  # Upscale net
            "--cscale=ewa_lanczos",  # Upscale chroma
            "--dscale=mitchell",  # Interpolation de résolution
            "--deband=yes",  # Suppression des bandes de couleur
            "--interpolation=yes",  # Fluidité améliorée
            "--profile=high-quality"  # Profil haute qualité
        ]

        # Ajout des arguments supplémentaires
        if extra_args:
            args.extend(extra_args)
        args.extend(quality_args)

        try:
            # Configuration spécifique à Windows
            startup_info = None
            creation_flags = 0

            if self.os_detector.is_windows():
                startup_info = subprocess.STARTUPINFO()
                startup_info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startup_info.wShowWindow = 0
                creation_flags = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP

            self.process = subprocess.Popen(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0,
                creationflags=creation_flags,
                startupinfo=startup_info
            )

            # Démarrer les lecteurs de sortie
            threading.Thread(target=self._read_output, args=('stdout',), daemon=True).start()
            threading.Thread(target=self._read_output, args=('stderr',), daemon=True).start()

            logger.info(f"MPV lancé avec PID: {self.process.pid}")
            return True

        except Exception as e:
            logger.error(f"Échec du lancement de MPV: {e}\n{traceback.format_exc()}")
            self.process = None
            return False

    def _read_output(self, stream_name: str):
        """Lecture des flux stdout/stderr sans écrire dans des fichiers"""
        stream = self.process.stdout if stream_name == "stdout" else self.process.stderr
        try:
            while self.process and self.process.poll() is None:
                chunk = stream.read(4096)
                if not chunk:
                    continue
                text = chunk.decode("utf-8", errors="replace").strip()
                if self._debug:
                    logger.debug(f"[MPV-{stream_name}] {text}")
        except Exception as e:
            logger.error(f"Erreur du lecteur de sortie: {e}")

    def stop(self) -> None:
        """Arrêter le processus MPV en toute sécurité"""
        if not self.process:
            return

        try:
            # Arrêt gracieux
            self.send_command(["quit"])
            try:
                self.process.wait(MPV_STOP_TIMEOUT)
            except subprocess.TimeoutExpired:
                logger.warning("Forcer l'arrêt du processus MPV")
                self.process.terminate()
                self.process.wait(0.5)
        except Exception as e:
            logger.error(f"Erreur d'arrêt: {e}")
        finally:
            self.process = None
            self._close_socket()
            logger.info("MPV arrêté")

    # ------------------- IPC Communication -------------------
    def _ensure_socket_connection(self) -> bool:
        """Établir une connexion socket avec logique de réessai"""
        if self._socket or self._win32_pipe:
            return True

        # Attendre que le socket soit disponible
        for attempt in range(1, MAX_PIPE_CONNECTION_ATTEMPTS + 1):
            try:
                if self.os_detector.is_windows() and WINDOWS_NAMED_PIPES_AVAILABLE:
                    # Utiliser les named pipes Windows avec pywin32
                    self._win32_pipe = win32file.CreateFile(
                        self.ipc_path,
                        win32file.GENERIC_READ | win32file.GENERIC_WRITE,
                        0,
                        None,
                        win32file.OPEN_EXISTING,
                        0,
                        None
                    )
                    return True
                elif self.os_detector.is_windows():
                    # Fallback: utiliser TCP
                    if ":" in self.ipc_path:
                        host, port_str = self.ipc_path.split(":")
                        port = int(port_str)
                    else:
                        host = "127.0.0.1"
                        port = 12345

                    self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    self._socket.connect((host, port))
                else:
                    # Sur Unix, on utilise un socket de domaine Unix
                    self._socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                    self._socket.connect(self.ipc_path)

                return True
            except (socket.error, ConnectionRefusedError, ValueError, pywintypes.error) as e:
                if attempt < MAX_PIPE_CONNECTION_ATTEMPTS:
                    time.sleep(PIPE_RETRY_INTERVAL * (1.5 ** attempt))
                else:
                    logger.error(f"Échec de la connexion au socket: {e}")
                    return False
        return False

    def _close_socket(self) -> None:
        """Fermer en toute sécurité le socket"""
        if self._socket:
            try:
                self._socket.close()
            except Exception as e:
                logger.error(f"Erreur de fermeture du socket: {e}")
            finally:
                self._socket = None

        if self._win32_pipe:
            try:
                win32file.CloseHandle(self._win32_pipe)
            except Exception as e:
                logger.error(f"Erreur de fermeture du pipe Windows: {e}")
            finally:
                self._win32_pipe = None

    def _send_data(self, data: bytes) -> bool:
        """Envoyer des données via le canal approprié"""
        try:
            if self.os_detector.is_windows() and self._win32_pipe:
                win32file.WriteFile(self._win32_pipe, data)
                return True
            elif self._socket:
                self._socket.sendall(data)
                return True
            else:
                logger.error("Aucun canal de communication disponible")
                return False
        except Exception as e:
            logger.error(f"Erreur d'envoi de données: {e}")
            self._close_socket()
            return False

    def _receive_data(self, timeout: float) -> Optional[bytes]:
        """Recevoir des données via le canal approprié"""
        try:
            if self.os_detector.is_windows() and self._win32_pipe:
                result, data = win32file.ReadFile(self._win32_pipe, 4096)
                return data
            elif self._socket:
                self._socket.settimeout(timeout)
                return self._socket.recv(4096)
            else:
                return None
        except Exception as e:
            logger.error(f"Erreur de réception de données: {e}")
            self._close_socket()
            return None

    # ------------------- Command Execution -------------------
    def send_command(self, command_list: List) -> None:
        """Envoyer une commande sans attendre de réponse"""
        if not self.process or self.process.poll() is not None:
            logger.warning("Commande ignorée: MPV ne fonctionne pas")
            return

        self._send_socket_command(command_list)

    def send_command_with_response(self, command_list: List, timeout: float = COMMAND_TIMEOUT) -> Optional[Dict]:
        """Envoyer une commande et attendre une réponse"""
        if not self.process or self.process.poll() is not None:
            logger.warning("Commande avec réponse ignorée: MPV ne fonctionne pas")
            return None

        return self._send_socket_command(command_list, True, timeout)

    def _send_socket_command(self,
                             command_list: List,
                             expect_response: bool = False,
                             timeout: float = COMMAND_TIMEOUT) -> Optional[Dict]:
        """Exécution de commande via socket (multi-OS)"""
        with self._socket_lock:
            if not self._ensure_socket_connection():
                logger.error("Échec de la connexion au socket")
                return None

            request_id = self._next_request_id() if expect_response else None
            cmd_data = self._build_command(command_list, request_id)

            try:
                if not self._send_data(cmd_data):
                    logger.error("Échec de l'envoi de la commande")
                    return None

                if self._debug:
                    logger.debug(f"Commande envoyée: {command_list}")
            except Exception as e:
                logger.error(f"Erreur d'écriture: {e}")
                self._close_socket()
                return None

            if not expect_response:
                return None

            return self._read_socket_response(request_id, timeout)

    def _read_socket_response(self, request_id: int, timeout: float) -> Optional[Dict]:
        """Lire la réponse du socket"""
        buffer = b""
        deadline = time.time() + timeout

        while time.time() < deadline:
            try:
                chunk = self._receive_data(timeout)
                if not chunk:
                    time.sleep(0.01)
                    continue

                buffer += chunk
                responses = buffer.split(b"\n")
                buffer = responses.pop()  # Garder la ligne incomplète

                for resp in responses:
                    try:
                        obj = json.loads(resp.decode('utf-8'))
                        if obj.get("request_id") == request_id:
                            return obj
                    except json.JSONDecodeError:
                        continue
            except socket.timeout:
                break
            except Exception as e:
                logger.error(f"Erreur de lecture: {e}")
                break
        return None

    # ------------------- Property Accessors -------------------
    def get_property(self, prop: str) -> Any:
        """Obtenir la valeur d'une propriété MPV"""
        resp = self.send_command_with_response(["get_property", prop])
        return resp.get("data") if resp else None

    def set_property(self, prop: str, value: Any) -> None:
        """Définir la valeur d'une propriété MPV"""
        self.send_command(["set_property", prop, value])

    # ------------------- Player Controls -------------------
    def seek_forward(self, seconds: int = 10) -> None:
        self.send_command(["seek", seconds, "relative"])

    def seek_backward(self, seconds: int = 10) -> None:
        self.send_command(["seek", -seconds, "relative"])

    def seek_to(self, seconds: float) -> None:
        self.set_property("time-pos", float(seconds))

    def toggle_play_pause(self) -> None:
        self.send_command(["cycle", "pause"])

    def set_volume(self, volume: int) -> None:
        self.set_property("volume", max(0, min(self.max_volume, volume)))

    def get_volume(self) -> float:
        return float(self.get_property("volume") or 0)

    def set_mute(self, muted: bool) -> None:
        self.set_property("mute", muted)

    def get_mute(self) -> bool:
        return bool(self.get_property("mute") or False)

    def set_audio_track(self, aid: int) -> None:
        self.set_property("aid", aid)

    def set_subtitle_track(self, sid: int, secondary: bool = False) -> None:
        prop = "secondary-sid" if secondary else "sid"
        self.set_property(prop, "no" if sid == -1 else sid)

    def get_track_list(self) -> List[Dict]:
        return self.get_property("track-list") or []

    def get_chapter_list(self) -> List[Dict]:
        return self.get_property("chapter-list") or []

    def get_time_pos(self) -> Optional[float]:
        try:
            return float(self.get_property("time-pos") or 0)
        except (TypeError, ValueError):
            return None

    def get_duration(self) -> Optional[float]:
        try:
            return float(self.get_property("duration") or 0)
        except (TypeError, ValueError):
            return None

    # ------------------- YouTube Integration -------------------
    @staticmethod
    def get_youtube_info(url: str) -> Tuple[List[Dict], Optional[float]]:
        """Extraire les chapitres YouTube en ignorant les playlists"""
        # Si l'URL est un chemin de fichier local, on retourne vide
        if not url.startswith(('http://', 'https://', 'ftp://', 'rtmp://')):
            # C'est probablement un fichier local
            logger.debug("URL est un fichier local, pas d'info YouTube à extraire: %s", url)
            return [], None

        ydl_opts = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "cachedir": False,
            "extract_flat": True,  # Ignorer les playlists
        }
        try:
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

                # Gestion spéciale pour les entrées de playlist
                if info.get('_type') == 'playlist':
                    entries = info.get('entries', [])
                    if entries:
                        # Prendre la première vidéo de la playlist
                        info = entries[0]

                chapters = info.get("chapters") or []
                duration = info.get("duration")
                return chapters, float(duration) if duration else None
        except Exception as e:
            logger.error(f"Erreur d'information YouTube: {e}")
            return [], None

    @staticmethod
    def get_youtube_chapters(url: str) -> List[Dict]:
        chapters, _ = MPVController.get_youtube_info(url)
        return chapters