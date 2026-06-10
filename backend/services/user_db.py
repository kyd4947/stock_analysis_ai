"""
사용자 계정을 SQLite에 저장.
Railway 배포 시 데이터 유지: 환경변수 USER_DB_PATH=/data/users.db 설정 후
Railway 볼륨을 /data 경로에 마운트하세요. 없으면 재배포 시 초기화됩니다.
"""
import sqlite3
from dataclasses import dataclass
from typing import Optional
from backend.core.config import settings


@dataclass
class User:
    id: int
    email: str
    name: str
    hashed_password: str


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.USER_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                hashed_password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)


def create_user(email: str, name: str, hashed_password: str) -> Optional[User]:
    try:
        with _conn() as conn:
            cur = conn.execute(
                "INSERT INTO users (email, name, hashed_password) VALUES (?, ?, ?)",
                (email, name, hashed_password),
            )
            return User(id=cur.lastrowid, email=email, name=name, hashed_password=hashed_password)
    except sqlite3.IntegrityError:
        return None


def get_user_by_email(email: str) -> Optional[User]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            return User(id=row["id"], email=row["email"], name=row["name"], hashed_password=row["hashed_password"])
    return None


def get_user_by_id(user_id: int) -> Optional[User]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row:
            return User(id=row["id"], email=row["email"], name=row["name"], hashed_password=row["hashed_password"])
    return None
