import asyncio
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import aiosqlite
from fastapi import Request

from app.config import get_settings as _get_settings

_logger = logging.getLogger("dashboard")

DB_PATH = Path(__file__).parent.parent.parent / "audit.db"

_lock = asyncio.Lock()



# override in .env
_MAX_AUDIT_ROWS: int = _get_settings().audit_max_rows


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:

        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ts          TEXT    NOT NULL,
                ip          TEXT    NOT NULL,
                action_type TEXT    NOT NULL,
                detail      TEXT    NOT NULL,
                status      INTEGER NOT NULL
            )
        """)

        await db.execute("CREATE INDEX IF NOT EXISTS idx_ts ON audit_log(ts DESC)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_type ON audit_log(action_type)")
        await db.commit()

    await _prune_old_events()

# prevents infinite growth
async def _prune_old_events() -> None:

    try:
        async with _lock:
            async with aiosqlite.connect(DB_PATH) as db:

                await db.execute(
                    "DELETE FROM audit_log WHERE id NOT IN "
                    "(SELECT id FROM audit_log ORDER BY ts DESC LIMIT ?)",
                    (_MAX_AUDIT_ROWS,),
                )

                await db.commit()

    except Exception as exc:
        _logger.warning("Audit pruning failed: %s", exc)


async def log_event(ip: str, action_type: str, detail: str, status: int) -> None:
    ts = datetime.now(timezone.utc).isoformat()

    detail = detail[:512]

    try:
        async with _lock:
            async with aiosqlite.connect(DB_PATH) as db:

                await db.execute(
                    "INSERT INTO audit_log (ts, ip, action_type, detail, status) VALUES (?, ?, ?, ?, ?)",
                    (ts, ip, action_type, detail, status),
                )

                await db.commit()

    except Exception as exc:
        # log locally but dont raise
        _logger.error("Failed to write audit event: %s", exc)


async def get_events(
        
    limit: int = 100,
    offset: int = 0,
    action_type: str | None = None,
) -> tuple[int, list[dict]]:
    where = "WHERE action_type = ?" if action_type else ""
    params_count = (action_type,) if action_type else ()
    params_rows = (action_type, limit, offset) if action_type else (limit, offset)

    async with aiosqlite.connect(DB_PATH) as db:

        db.row_factory = aiosqlite.Row
        cur = await db.execute(f"SELECT COUNT(*) FROM audit_log {where}", params_count)
        row = await cur.fetchone()
        total = row[0] if row else 0


        cur = await db.execute(
            f"SELECT id, ts, ip, action_type, detail, status FROM audit_log {where} ORDER BY ts DESC LIMIT ? OFFSET ?",
            params_rows,
        )

        rows = await cur.fetchall()

    events = [dict(r) for r in rows]

    return total, events


def get_client_ip(request: Request) -> str:
    cf_ip = request.headers.get("CF-Connecting-IP", "").strip()
    if cf_ip:

        return cf_ip
    forwarded = request.headers.get("X-Forwarded-For", "")
    for part in forwarded.split(","):
        ip = part.strip()

        if ip:
            return ip
        
    return request.client.host if request.client else "unknown"


async def count_login_fails_since(hours: int) -> int:

    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "SELECT COUNT(*) FROM audit_log WHERE action_type = 'login_fail' AND ts >= ?",
            (since,),
        )

        row = await cur.fetchone()
        return row[0] if row else 0


async def get_row_count() -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT COUNT(*) FROM audit_log")
        row = await cur.fetchone()
        
        return row[0] if row else 0
