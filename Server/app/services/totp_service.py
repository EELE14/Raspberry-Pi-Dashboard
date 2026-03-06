from __future__ import annotations
import json
import logging
import secrets
import time
from pathlib import Path
from threading import Lock

import pyotp

logger = logging.getLogger("dashboard")



_CONFIG_PATH = Path("config.json")


def _read_raw() -> dict:
    if not _CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("totp_service: failed to read config.json: %s", exc)
        return {}


def _write_raw(data: dict) -> None:

    tmp = _CONFIG_PATH.with_name("config.json.tmp")
    try:
        tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
        tmp.chmod(0o600)  
        tmp.replace(_CONFIG_PATH)
    except OSError as exc:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        logger.error("totp_service: failed to write config.json: %s", exc)
        raise RuntimeError("Failed to persist TOTP configuration.") from exc




_cache_enabled: bool | None = None
_cache_secret: str | None = None
_cache_lock = Lock()


def _load_cache() -> None:
    global _cache_enabled, _cache_secret
    raw = _read_raw()
    _cache_enabled = bool(raw.get("totp_enabled", False))
    _cache_secret = raw.get("totp_secret", "") or ""


def _set_cache(secret: str, enabled: bool) -> None:
    global _cache_enabled, _cache_secret
    with _cache_lock:
        raw = _read_raw()
        raw["totp_secret"] = secret
        raw["totp_enabled"] = enabled
        _write_raw(raw)
        _cache_enabled = enabled
        _cache_secret = secret


def is_enabled() -> bool:
    with _cache_lock:
        if _cache_enabled is None:
            _load_cache()
        return _cache_enabled  # type: ignore[return-value]


def get_secret() -> str:
    with _cache_lock:
        if _cache_secret is None:
            _load_cache()
        return _cache_secret  # type: ignore[return-value]


# prevent same code from being accepted twice


_used_codes: dict[str, float] = {}
_used_codes_lock = Lock()


_USED_CODE_TTL = 90.0


def _prune_used_codes() -> None:
    cutoff = time.time() - _USED_CODE_TTL
    stale = [c for c, ts in _used_codes.items() if ts < cutoff]
    for c in stale:
        del _used_codes[c]




_sessions: dict[str, float] = {}  
_sessions_lock = Lock()

SESSION_TTL = 8 * 3600  # 8 hours


def _prune_sessions() -> None:
    now = time.time()
    expired = [t for t, exp in _sessions.items() if exp <= now]
    for t in expired:
        del _sessions[t]


# public api


def generate_pending_secret() -> str:

    new_secret = pyotp.random_base32()
    _set_cache(secret=new_secret, enabled=False)
    return new_secret


def get_otpauth_uri(secret: str) -> str:

    return pyotp.TOTP(secret).provisioning_uri(
        name="admin", issuer_name="PI Server"
    )


def verify_code(secret: str, code: str) -> bool:

    if not secret or not code:
        return False
    stripped = code.strip()
    with _used_codes_lock:
        _prune_used_codes()
        if stripped in _used_codes:
            logger.warning("TOTP: replay attempt for code %s…", stripped[:2])
            return False

        if bool(pyotp.TOTP(secret).verify(stripped, valid_window=1)):
            _used_codes[stripped] = time.time()
            return True
    return False


def enable(secret: str) -> None:
    _set_cache(secret=secret, enabled=True)
    logger.info("TOTP 2FA enabled.")


def disable() -> None:

    _set_cache(secret="", enabled=False)
    with _sessions_lock:
        _sessions.clear()
    with _used_codes_lock:
        _used_codes.clear()
    logger.info("TOTP 2FA disabled; all sessions invalidated.")


def create_session() -> str:

    token = secrets.token_urlsafe(32)
    with _sessions_lock:
        _prune_sessions()
        _sessions[token] = time.time() + SESSION_TTL
    return token


def validate_session(token: str) -> bool:

    if not token:
        return False
    with _sessions_lock:
        exp = _sessions.get(token)
        if exp is None:
            return False
        if exp <= time.time():
            del _sessions[token]
            return False
        return True
