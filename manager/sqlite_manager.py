import sqlite3
import threading


class SQLiteManager:
    def __init__(self, db_path: str):
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        for pragma in (
            "PRAGMA foreign_keys = ON",
            "PRAGMA journal_mode = WAL",
            "PRAGMA synchronous = NORMAL",
        ):
            self._conn.execute(pragma)

    def execute(self, sql: str, params: tuple = ()):  # type hint added
        with self._lock:
            cur = self._conn.execute(sql, params)
            self._conn.commit()
            return cur

    def executemany(self, sql: str, seq_of_params):
        with self._lock:
            cur = self._conn.executemany(sql, seq_of_params)
            self._conn.commit()
            return cur

    def query(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with self._lock:
            cur = self._conn.execute(sql, params)
            return cur.fetchall()

    def close(self):
        with self._lock:
            self._conn.close()