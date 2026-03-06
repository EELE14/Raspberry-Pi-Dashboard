import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path

import aiosqlite

STATS_DB_PATH = Path(__file__).parent.parent.parent / "stats.db"



_write_lock = asyncio.Lock()


async def init_db() -> None:

    async with aiosqlite.connect(STATS_DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS system_stats (
                ts   TEXT NOT NULL,
                cpu  REAL NOT NULL,
                ram  REAL NOT NULL,
                temp REAL
            )
        """)

        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_ss_ts ON system_stats(ts DESC)"
        )
        await db.commit()

# this also deletes data beyond 24 hours old
async def record(cpu: float, ram: float, temp: float | None) -> None:

    ts = datetime.now(timezone.utc).isoformat()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    async with _write_lock:
        async with aiosqlite.connect(STATS_DB_PATH) as db:
            await db.execute(
                "INSERT INTO system_stats (ts, cpu, ram, temp) VALUES (?, ?, ?, ?)",
                (ts, cpu, ram, temp),
            )

            await db.execute("DELETE FROM system_stats WHERE ts < ?", (cutoff,))
            await db.commit()


async def get_history(minutes: int) -> list[dict]:

    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
    async with aiosqlite.connect(STATS_DB_PATH) as db:
        async with db.execute(
            "SELECT ts, cpu, ram, temp FROM system_stats "
            "WHERE ts >= ? ORDER BY ts ASC",
            (cutoff,),
        ) as cursor:
            rows = await cursor.fetchall()

    if not rows:
        return []
    step = max(1, len(rows) // 500)
    return [
        {"ts": r[0], "cpu": r[1], "ram": r[2], "temp": r[3]}
        for r in rows[::step]
    ]
