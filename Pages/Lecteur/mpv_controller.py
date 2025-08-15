# -*- coding: utf-8 -*-
# ---------- FILE: mpv_controller.py ----------
import json
import logging
import platform
import socket
import subprocess
import threading
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import pywintypes
    import win32file
    import win32pipe
except ImportError:
    if platform.system() == "Windows":
        logging.warning("pywin32 modules not available")
from yt_dlp import YoutubeDL

# Constants
PIPE_CONNECTION_TIMEOUT = 5
PIPE_RETRY_INTERVAL = 0.2
MPV_STOP_TIMEOUT = 2.0
COMMAND_TIMEOUT = 2.0
MAX_PIPE_CONNECTION_ATTEMPTS = 15
LOG_DIR = Path.cwd()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / 'mpv_controller.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('MPVController')


class MPVController:
    def __init__(self, mpv_exe: Path, ipc_name: str = "mpvsocket"):
        self.mpv_exe = mpv_exe.resolve()
        self.ipc_name = ipc_name
        self.process: Optional[subprocess.Popen] = None
        self.system = platform.system()
        self.ipc_path = self._get_ipc_path()

        self._pipe_handle = None
        self._pipe_lock = threading.RLock()
        self._req_id = 1
        self._req_id_lock = threading.Lock()
        self._debug = False

        self._validate_mpv_executable()

    def _get_ipc_path(self) -> str:
        """Determine IPC path based on OS"""
        if self.system == "Windows":
            return rf"\\.\pipe\{self.ipc_name}"
        return f"/tmp/{self.ipc_name}"

    def _validate_mpv_executable(self) -> None:
        """Verify MPV executable exists"""
        if not self.mpv_exe.exists():
            raise FileNotFoundError(f"MPV executable not found: {self.mpv_exe}")
        if not self.mpv_exe.is_file():
            raise ValueError(f"MPV path is not a file: {self.mpv_exe}")

    # ------------------- Command Helpers -------------------
    def _next_request_id(self) -> int:
        """Generate unique request ID with thread safety"""
        with self._req_id_lock:
            rid = self._req_id
            self._req_id = 1 if self._req_id > 1_000_000_000 else self._req_id + 1
            return rid

    @staticmethod
    def _build_command(command_list: List, request_id: Optional[int] = None) -> bytes:
        """Construct JSON command with optional request ID"""
        cmd = {"command": command_list}
        if request_id is not None:
            cmd["request_id"] = request_id
        return (json.dumps(cmd) + "\n").encode("utf-8")

    # ------------------- Process Management -------------------
    def launch(self, url: str, window_id: int, extra_args: Optional[List[str]] = None) -> bool:
        """Launch MPV process with IPC server"""
        if self.process and self.process.poll() is None:
            logger.warning("MPV process already running")
            return False

        args = [
            str(self.mpv_exe),
            url,
            f"--wid={window_id}",
            "--no-terminal",
            f"--input-ipc-server={self.ipc_path}",
            f"--log-file={LOG_DIR / 'mpv.log'}",
            "--msg-level=all=info",
            "--no-config",
            "--keep-open=yes"
        ]

        if extra_args:
            args.extend(extra_args)

        try:
            startup_info = None
            creation_flags = 0
            if self.system == "Windows":
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

            # Start output readers
            threading.Thread(target=self._read_output, args=('stdout',), daemon=True).start()
            threading.Thread(target=self._read_output, args=('stderr',), daemon=True).start()

            logger.info(f"MPV launched with PID: {self.process.pid}")
            return True

        except Exception as e:
            logger.error(f"Failed to launch MPV: {e}\n{traceback.format_exc()}")
            self.process = None
            return False

    def _read_output(self, stream_name: str) -> None:
        """Read and log process output streams"""
        stream = self.process.stdout if stream_name == 'stdout' else self.process.stderr
        log_file = open(LOG_DIR / f'mpv_{stream_name}.log', 'ab', buffering=0)

        try:
            while self.process and self.process.poll() is None:
                chunk = stream.read(4096)
                if not chunk:
                    time.sleep(0.1)
                    continue
                log_file.write(chunk)
                log_file.flush()
                if self._debug:
                    logger.debug(f"[MPV-{stream_name}] {chunk.decode('utf-8', errors='replace').strip()}")
        except Exception as e:
            logger.error(f"Output reader error: {e}")
        finally:
            log_file.close()

    def stop(self) -> None:
        """Terminate MPV process safely"""
        if not self.process:
            return

        try:
            # Graceful shutdown
            self.send_command(["quit"])
            try:
                self.process.wait(MPV_STOP_TIMEOUT)
            except subprocess.TimeoutExpired:
                logger.warning("Force terminating MPV process")
                self.process.terminate()
                self.process.wait(0.5)
        except Exception as e:
            logger.error(f"Stop error: {e}")
        finally:
            self.process = None
            self._close_pipe_handle()
            logger.info("MPV terminated")

    # ------------------- IPC Communication -------------------
    def _ensure_pipe_connection(self) -> bool:
        """Establish pipe connection with retry logic"""
        if self.system == "Windows":
            return self._ensure_windows_pipe()
        return self._ensure_unix_socket()

    def _ensure_windows_pipe(self) -> bool:
        """Windows named pipe connection with exponential backoff"""
        if self._pipe_handle:
            return True

        for attempt in range(1, MAX_PIPE_CONNECTION_ATTEMPTS + 1):
            try:
                try:
                    win32pipe.WaitNamedPipe(self.ipc_path, int(PIPE_RETRY_INTERVAL * 1000))
                except pywintypes.error:
                    pass

                handle = win32file.CreateFile(
                    self.ipc_path,
                    win32file.GENERIC_READ | win32file.GENERIC_WRITE,
                    0, None,
                    win32file.OPEN_EXISTING,
                    0, None
                )
                self._pipe_handle = handle
                return True
            except pywintypes.error as e:
                if e.winerror not in (2, 231, 109):  # FILE_NOT_FOUND, BROKEN_PIPE, BAD_PIPE
                    logger.error(f"Pipe connection error: {e}")
                    break
                time.sleep(PIPE_RETRY_INTERVAL * (1.5 ** attempt))
        return False

    def _ensure_unix_socket(self) -> bool:
        """Unix domain socket connection test"""
        if not Path(self.ipc_path).exists():
            time.sleep(PIPE_RETRY_INTERVAL)
            return False
        return True

    def _close_pipe_handle(self) -> None:
        """Safely close Windows pipe handle"""
        if not self._pipe_handle:
            return

        try:
            win32file.CloseHandle(self._pipe_handle)
        except Exception as e:
            logger.error(f"Pipe close error: {e}")
        finally:
            self._pipe_handle = None

    # ------------------- Command Execution -------------------
    def send_command(self, command_list: List) -> None:
        """Send command without expecting response"""
        if not self.process or self.process.poll() is not None:
            logger.warning("Command skipped: MPV not running")
            return

        if self.system == "Windows":
            self._send_windows_command(command_list)
        else:
            self._send_unix_command(command_list)

    def send_command_with_response(self, command_list: List, timeout: float = COMMAND_TIMEOUT) -> Optional[Dict]:
        """Send command and wait for response"""
        if not self.process or self.process.poll() is not None:
            logger.warning("Command with response skipped: MPV not running")
            return None

        if self.system == "Windows":
            return self._send_windows_command(command_list, True, timeout)
        return self._send_unix_command(command_list, True, timeout)

    def _send_windows_command(self,
                              command_list: List,
                              expect_response: bool = False,
                              timeout: float = COMMAND_TIMEOUT) -> Optional[Dict]:
        """Windows-specific command execution"""
        with self._pipe_lock:
            if not self._ensure_windows_pipe():
                logger.error("Windows pipe connection failed")
                return None

            request_id = self._next_request_id() if expect_response else None
            cmd_data = self._build_command(command_list, request_id)

            try:
                win32file.WriteFile(self._pipe_handle, cmd_data)
                if self._debug:
                    logger.debug(f"Sent command: {command_list}")
            except Exception as e:
                logger.error(f"Write error: {e}")
                self._close_pipe_handle()
                return None

            if not expect_response:
                return None

            return self._read_windows_response(request_id, timeout)

    def _read_windows_response(self, request_id: int, timeout: float) -> Optional[Dict]:
        """Read response from Windows pipe"""
        buffer = b""
        deadline = time.time() + timeout

        while time.time() < deadline:
            try:
                hr, data = win32file.ReadFile(self._pipe_handle, 4096, None)
                if not data:
                    time.sleep(0.01)
                    continue

                buffer += data
                responses = buffer.split(b"\n")
                buffer = responses.pop()  # Keep incomplete line

                for resp in responses:
                    try:
                        obj = json.loads(resp.decode('utf-8'))
                        if obj.get("request_id") == request_id:
                            return obj
                    except json.JSONDecodeError:
                        continue
            except pywintypes.error as e:
                if e.winerror != 232:  # No more data
                    logger.error(f"Read error: {e}")
                    break
                time.sleep(0.01)
        return None

    def _send_unix_command(self,
                           command_list: List,
                           expect_response: bool = False,
                           timeout: float = COMMAND_TIMEOUT) -> Optional[Dict]:
        """Unix-specific command execution"""
        if not self._ensure_unix_socket():
            logger.error("Unix socket not available")
            return None

        request_id = self._next_request_id() if expect_response else None
        cmd_data = self._build_command(command_list, request_id)

        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
                sock.settimeout(timeout)
                sock.connect(self.ipc_path)
                sock.sendall(cmd_data)

                if not expect_response:
                    return None

                return self._read_unix_response(sock, request_id, timeout)
        except Exception as e:
            logger.error(f"Unix command error: {e}")
            return None

    @staticmethod
    def _read_unix_response(sock: socket.socket,
                            request_id: int,
                            timeout: float) -> Optional[Dict]:
        """Read response from Unix socket"""
        buffer = b""
        deadline = time.time() + timeout

        while time.time() < deadline:
            try:
                sock.settimeout(deadline - time.time())
                chunk = sock.recv(4096)
                if not chunk:
                    break

                buffer += chunk
                lines = buffer.split(b"\n")
                buffer = lines.pop()

                for line in lines:
                    try:
                        obj = json.loads(line)
                        if obj.get("request_id") == request_id:
                            return obj
                    except json.JSONDecodeError:
                        continue
            except (socket.timeout, BlockingIOError):
                break
            except Exception as e:
                logger.error(f"Response read error: {e}")
                break
        return None

    # ------------------- Property Accessors -------------------
    def get_property(self, prop: str) -> Any:
        """Get MPV property value"""
        resp = self.send_command_with_response(["get_property", prop])
        return resp.get("data") if resp else None

    def set_property(self, prop: str, value: Any) -> None:
        """Set MPV property value"""
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
        self.set_property("volume", max(0, min(100, volume)))

    def get_volume(self) -> float:
        return float(self.get_property("volume") or 0)

    def set_mute(self, muted: bool) -> None:
        self.set_property("mute", muted)

    def get_mute(self) -> bool:
        return bool(self.get_property("mute") or False)

    def set_audio_track(self, aid: int) -> None:
        self.set_property("aid", aid)

    def set_subtitle_track(self, sid: int) -> None:
        self.set_property("sid", "no" if sid == -1 else sid)

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
        """Extract YouTube video chapters and duration"""
        ydl_opts = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "cachedir": False,
        }
        try:
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                chapters = info.get("chapters") or []
                duration = info.get("duration")
                return chapters, float(duration) if duration else None
        except Exception as e:
            logger.error(f"YouTube info error: {e}")
            return [], None

    @staticmethod
    def get_youtube_chapters(url: str) -> List[Dict]:
        chapters, _ = MPVController.get_youtube_info(url)
        return chapters