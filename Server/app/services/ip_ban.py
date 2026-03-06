import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.config import get_settings as _get_settings

_logger = logging.getLogger("dashboard")

# override all in env
_s = _get_settings()

_BAN_DURATION_MINUTES = _s.ban_duration_minutes

_BRUTE_FORCE_THRESHOLD = _s.brute_force_threshold

_BRUTE_FORCE_WINDOW_SECONDS = _s.brute_force_window_seconds
del _s 

_lock = asyncio.Lock()



@dataclass
class BanRecord:
    ip: str
    reason: str
    banned_at: datetime
    expires_at: datetime | None  # None = permanent ban



_bans: dict[str, BanRecord] = {}
_failures: dict[str, list[float]] = {}   # IP > list of failure timestamps




# public api
def is_banned(ip: str) -> tuple[bool, str]:


    record = _bans.get(ip)
    if record is None:
        return False, ""
    if record.expires_at is not None and datetime.now(timezone.utc) >= record.expires_at:
        return False, ""
    return True, record.reason


async def record_failure(ip: str) -> None:


    now = datetime.now(timezone.utc).timestamp()
    window_start = now - _BRUTE_FORCE_WINDOW_SECONDS

    async with _lock:
        times = _failures.get(ip)
        if times is None:
            times = []
            _failures[ip] = times


        times[:] = [t for t in times if t >= window_start]
        times.append(now)

        if len(times) >= _BRUTE_FORCE_THRESHOLD and ip not in _bans:
            expires = datetime.now(timezone.utc) + timedelta(minutes=_BAN_DURATION_MINUTES)
            _bans[ip] = BanRecord(
                ip=ip,
                reason=(
                    f"Auto-banned: {len(times)} failed login attempts "
                    f"within {_BRUTE_FORCE_WINDOW_SECONDS // 60} minutes"
                ),
                banned_at=datetime.now(timezone.utc),
                expires_at=expires,
            )
            _logger.warning(
                "IP %s auto-banned for brute force (%d failures in window)", ip, len(times)
            )


async def ban_ip(
    ip: str,
    reason: str = "Manual ban",
    duration_minutes: int | None = None,
) -> BanRecord:

    now = datetime.now(timezone.utc)
    expires = (now + timedelta(minutes=duration_minutes)) if duration_minutes else None
    record = BanRecord(ip=ip, reason=reason, banned_at=now, expires_at=expires)

    async with _lock:
        _bans[ip] = record
    _logger.info("IP %s manually banned: %s (expires: %s)", ip, reason, expires)
    return record


async def unban_ip(ip: str) -> bool:

    async with _lock:
        if ip in _bans:
            del _bans[ip]
            _failures.pop(ip, None)
            _logger.info("IP %s unbanned", ip)
            return True
    return False


def get_banned_ips() -> list[BanRecord]:

    now = datetime.now(timezone.utc)
    return [
        record
        for record in _bans.values()
        if record.expires_at is None or record.expires_at > now
    ]


async def cleanup_expired() -> int:



    now = datetime.now(timezone.utc)
    async with _lock:
        expired = [
            ip for ip, r in _bans.items()
            if r.expires_at is not None and r.expires_at <= now
        ]
        for ip in expired:
            del _bans[ip]
    return len(expired)
