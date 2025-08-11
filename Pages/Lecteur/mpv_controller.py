# ---------- FILE: mpv_controller.py ----------
# (version légèrement inchangée — conserve vos méthodes yt_dlp existantes)
import json
import platform
import socket
import subprocess
import time
from pathlib import Path
import threading
import traceback

import pywintypes
import win32file
import win32pipe
from yt_dlp import YoutubeDL

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MPV_DIR = PROJECT_ROOT / "Ressource" / "mpv"
MPV_EXE = MPV_DIR / "mpv.exe"


class MPVController:
    """
    Encapsulation du lancement et de l'IPC mpv (Windows named pipe / Unix domain socket).
    Version inchangée fonctionnellement pour vos besoins — conserve get_youtube_info/get_youtube_chapters.
    """

    def __init__(self, mpv_exe: Path = MPV_EXE, ipc_name: str = "mpvsocket"):
        self.mpv_exe = str(mpv_exe)
        self.ipc_name = ipc_name
        self.process: subprocess.Popen | None = None
        self.ipc_path = None
        self.system = platform.system()

        if self.system == "Windows":
            self.ipc_path = r"\\.\pipe\{}".format(self.ipc_name)
        else:
            self.ipc_path = f"/tmp/{self.ipc_name}"

        # pipe handle reuse (Windows)
        self._pipe_handle = None
        self._pipe_lock = threading.Lock()
        # debug flags
        self._pipe_verbose = False
        self._debug = True

        self._req_id = 1
        self._req_id_lock = threading.Lock()

    def _next_request_id(self):
        with self._req_id_lock:
            rid = self._req_id
            self._req_id += 1
            # wrap-around safety
            if self._req_id > 1_000_000_000:
                self._req_id = 1
            return rid

    # ---------- contrôle de lecture ----------
    def seek_forward(self, seconds=10):
        self.send_command(["seek", seconds, "relative"])

    def seek_backward(self, seconds=10):
        self.send_command(["seek", -seconds, "relative"])

    def seek_to(self, seconds: float):
        try:
            # seek absolu via set_property "time-pos"
            self.set_property("time-pos", float(seconds))
        except Exception as e:
            print(f"MPVController.seek_to erreur: {e}")

    def toggle_play_pause(self):
        self.send_command(["cycle", "pause"])

    # ---------- lancement / arrêt mpv ----------
    def launch(self, url: str, window_id: str, extra_args: list | None = None) -> bool:
        log_file = str(Path.cwd() / "mpv_debug.log")
        args = [
            self.mpv_exe,
            url,
            f"--wid={window_id}",
            "--no-terminal",
            f"--input-ipc-server={self.ipc_path}",
            f"--log-file={log_file}",
            "--msg-level=all=info",
            "--no-config",
        ]
        if extra_args:
            args[1:1] = extra_args

        if not Path(self.mpv_exe).exists():
            print(f"mpv executable introuvable: {self.mpv_exe}")
            return False

        def _reader_thread(pipe, name):
            try:
                with open(Path.cwd() / "mpv_stdout_stderr.log", "ab") as f:
                    while True:
                        chunk = pipe.read(4096)
                        if not chunk:
                            break
                        f.write(chunk)
                        f.flush()
                        try:
                            print(f"[mpv-{name}] {chunk.decode('utf-8', errors='ignore').strip()}")
                        except Exception:
                            pass
            except Exception as e:
                print(f"Erreur reader_thread {name}: {e}")
                traceback.print_exc()

        try:
            creationflags = 0
            startupinfo = None

            self.process = subprocess.Popen(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=False,
                creationflags=creationflags,
                startupinfo=startupinfo
            )

            threading.Thread(target=_reader_thread, args=(self.process.stdout, "out"), daemon=True).start()
            threading.Thread(target=_reader_thread, args=(self.process.stderr, "err"), daemon=True).start()

            self._close_pipe_handle()

            return True
        except Exception as e:
            print(f"Erreur lancement MPV : {e}")
            traceback.print_exc()
            self.process = None
            return False

    def stop(self, timeout: float = 2.0):
        if not self.process:
            self._close_pipe_handle()
            return
        try:
            self.process.terminate()
            self.process.wait(timeout=timeout)
        except Exception as e:
            print(f"Erreur arrêt mpv (terminate): {e}")
            try:
                self.process.kill()
            except Exception as e2:
                print(f"Erreur kill mpv: {e2}")
        finally:
            self.process = None
            self._close_pipe_handle()

    def restart(self, url: str, window_id: str):
        self.stop()
        time.sleep(0.05)
        return self.launch(url, window_id)

    # ---------- envoi de commandes (sans / avec réponse) ----------
    def send_command(self, command_list: list):
        if self.system == "Windows":
            self._send_mpv_command_windows(command_list)
        else:
            self._send_mpv_command_unix(command_list)

    def send_command_with_response(self, command_list: list, timeout: float = 2.0):
        if self.system == "Windows":
            return self._send_mpv_command_windows_with_response(command_list, timeout=timeout)
        else:
            return self._send_mpv_command_unix_with_response(command_list, timeout=timeout)

    # ---- helpers Windows ----
    def _ensure_pipe_handle_windows(self, max_tries=8, sleep_between=0.15):
        if self._pipe_handle:
            return self._pipe_handle

        for attempt in range(1, max_tries + 1):
            try:
                try:
                    win32pipe.WaitNamedPipe(self.ipc_path, int(sleep_between * 1000))
                except Exception:
                    pass

                handle = win32file.CreateFile(
                    self.ipc_path,
                    win32file.GENERIC_READ | win32file.GENERIC_WRITE,
                    0, None,
                    win32file.OPEN_EXISTING,
                    0, None
                )
                self._pipe_handle = handle
                return handle
            except pywintypes.error as e:
                code = getattr(e, "winerror", None)
                if code in (2, 231):
                    time.sleep(sleep_between)
                    continue
                else:
                    if self._pipe_verbose:
                        print(f"CreateFile non-retryable: {e}")
                    return None

        if self._pipe_verbose:
            print("All CreateFile attempts failed")
        return None

    def _close_pipe_handle(self):
        try:
            if self._pipe_handle:
                try:
                    win32file.CloseHandle(self._pipe_handle)
                except Exception:
                    pass
        finally:
            self._pipe_handle = None

    def _send_mpv_command_windows(self, command_list: list):
        with self._pipe_lock:
            handle = self._ensure_pipe_handle_windows()
            if not handle:
                if self._pipe_verbose:
                    print("Impossible d'ouvrir le pipe mpv (write-only).")
                return
            try:
                cmd = {"command": command_list}
                data = (json.dumps(cmd) + "\n").encode("utf-8")
                win32file.WriteFile(handle, data)
            except Exception as e:
                if self._pipe_verbose:
                    print(f"Erreur écriture pipe mpv: {e}")
                    traceback.print_exc()
                self._close_pipe_handle()

    def _send_mpv_command_windows_with_response(self, command_list: list, timeout: float = 2.0):
        with self._pipe_lock:
            handle = self._ensure_pipe_handle_windows()
            if not handle:
                if self._pipe_verbose:
                    print("Impossible d'ouvrir le pipe mpv (read/write).")
                return None

            rid = self._next_request_id()
            try:
                cmd = {"command": command_list, "request_id": rid}
                data = (json.dumps(cmd) + "\n").encode("utf-8")
                win32file.WriteFile(handle, data)
            except Exception as e:
                if self._pipe_verbose:
                    print(f"Erreur écriture pipe mpv: {e}")
                    traceback.print_exc()
                self._close_pipe_handle()
                return None

            start = time.time()
            buffer = b""
            while True:
                if (time.time() - start) > timeout:
                    if self._pipe_verbose:
                        print(f"Timeout waiting for response request_id={rid}")
                    return None
                try:
                    hr, chunk = win32file.ReadFile(handle, 4096, None)
                except Exception:
                    time.sleep(0.01)
                    continue
                if not chunk:
                    time.sleep(0.01)
                    continue
                buffer += chunk
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    try:
                        text = line.decode("utf-8", errors="ignore").strip()
                        if not text:
                            continue
                        obj = json.loads(text)
                    except Exception:
                        continue

                    if "event" in obj and self._pipe_verbose:
                        continue

                    if obj.get("request_id") == rid:
                        return obj

    # ---- helpers Unix ----
    def _send_mpv_command_unix(self, command_list: list):
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
                client.connect(self.ipc_path)
                cmd = {"command": command_list}
                client.send((json.dumps(cmd) + "\n").encode())
        except Exception as e:
            print(f"Erreur envoi commande MPV Unix: {e}")
            traceback.print_exc()

    def _send_mpv_command_unix_with_response(self, command_list: list, timeout: float = 2.0):
        rid = self._next_request_id()
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
                client.settimeout(timeout)
                client.connect(self.ipc_path)
                cmd = {"command": command_list, "request_id": rid}
                client.send((json.dumps(cmd) + "\n").encode())
                response_bytes = b""
                start = time.time()
                while True:
                    if (time.time() - start) > timeout:
                        if self._pipe_verbose:
                            print(f"Timeout waiting for response request_id={rid} (unix)")
                        return None
                    try:
                        chunk = client.recv(4096)
                    except socket.timeout:
                        return None
                    if not chunk:
                        time.sleep(0.01)
                        continue
                    response_bytes += chunk
                    while b"\n" in response_bytes:
                        line, response_bytes = response_bytes.split(b"\n", 1)
                        try:
                            text = line.decode("utf-8", errors="ignore").strip()
                            if not text:
                                continue
                            obj = json.loads(text)
                        except Exception:
                            continue

                        if "event" in obj:
                            continue

                        if obj.get("request_id") == rid:
                            return obj

        except Exception as e:
            if self._pipe_verbose:
                print(f"Erreur envoi/lecture mpv Unix: {e}")
                traceback.print_exc()
            return None

    # ---------- propriétés mpv ----------
    def get_property(self, prop: str):
        resp = self.send_command_with_response(["get_property", prop])
        if resp and "data" in resp:
            return resp["data"]
        return None

    def set_property(self, prop: str, value):
        self.send_command(["set_property", prop, value])

    def get_chapter_list(self):
        resp = self.send_command_with_response(["get_property", "chapter-list"])
        if resp and "data" in resp:
            return resp["data"]
        return None

    def get_time_pos(self):
        try:
            v = self.get_property("time-pos")
            if v is None:
                return None
            return float(v)
        except Exception as e:
            print(f"MPVController.get_time_pos erreur: {e}")
            traceback.print_exc()
            return None

    def get_duration(self):
        try:
            v = self.get_property("duration")
            if v is None:
                return None
            return float(v)
        except Exception as e:
            print(f"MPVController.get_duration erreur: {e}")
            traceback.print_exc()
            return None

    @staticmethod
    def get_youtube_info(url: str):
        ydl_opts = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "cachedir": False,
        }
        try:
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                chapters = info.get("chapters", []) or []
                duration = info.get("duration", None)
                if duration is not None:
                    try:
                        duration = float(duration)
                    except Exception:
                        duration = None
                return chapters, duration
        except Exception as e:
            print(f"Erreur extraction yt info: {e}")
            traceback.print_exc()
            return [], None

    @staticmethod
    def get_youtube_chapters(url: str):
        ydl_opts = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "cachedir": False,
        }
        try:
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                chapters = info.get("chapters", []) or []
                return chapters
        except Exception as e:
            print(f"Erreur extraction yt chapters: {e}")
            traceback.print_exc()
            return []