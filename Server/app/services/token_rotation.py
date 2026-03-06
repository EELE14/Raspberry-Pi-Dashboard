import hashlib
import logging
import os
import re
import secrets
from pathlib import Path

from fastapi import HTTPException

from app.config import get_settings

_logger = logging.getLogger("dashboard")


def rotate_token() -> str:


    new_token = secrets.token_urlsafe(32)
    new_hash = hashlib.sha256(new_token.encode()).hexdigest()

    _persist_token_hash(new_hash)


    os.environ["API_TOKEN_HASH"] = new_hash


    get_settings.cache_clear()

    _logger.info("API token rotated successfully.")
    return new_token


def _persist_token_hash(new_hash: str) -> None:

    env_path = Path(".env")
    if not env_path.exists():
        raise HTTPException(
            status_code=500,
            detail=".env file not found — cannot persist new token hash.",
        )

    content = env_path.read_text(encoding="utf-8")

    new_content, substitutions = re.subn(
        r"(?im)^(API_TOKEN_HASH\s*=\s*).*$",
        f"API_TOKEN_HASH={new_hash}",
        content,
    )

    if substitutions == 0:
        new_content = content.rstrip("\n") + f"\nAPI_TOKEN_HASH={new_hash}\n"

    env_path.write_text(new_content, encoding="utf-8")
