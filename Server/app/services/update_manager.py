import json
import logging
import re
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException, status

# validation heloeprs

def _validate_repo_url(url: str) -> None:

    if url.startswith("https://") or url.startswith("git@"):
        return
    
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            "Repository URL must be an HTTPS URL (https://…) "
            "or an SSH remote (git@…). "
            "Local paths and file:// URLs are not permitted."
        ),
    )


def _validate_working_dir(path: str) -> None:

    if not path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Working directory must not be empty.",
        )
    if not path.startswith("/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Working directory must be an absolute path starting with '/'.",
        )

_logger = logging.getLogger("dashboard")

_CONFIG_PATH = Path("config.json")

_DEFAULTS: dict[str, str] = {
    "repo_url": "",
    "branch": "main",
    "working_dir": "/home/pi/dashboard",
    "access_token": "",
}


# helpers

def _read_raw() -> dict:
    if not _CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _logger.warning("Failed to read config.json: %s", exc)
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
        _logger.error("Failed to write config.json: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save configuration.",
        )

# public api

def get_git_config() -> dict:

    data = _read_raw()
    return {
        "repo_url": data.get("repo_url", _DEFAULTS["repo_url"]),
        "branch": data.get("branch", _DEFAULTS["branch"]),
        "working_dir": data.get("working_dir", _DEFAULTS["working_dir"]),
        "has_token": bool(data.get("access_token")),
    }


def save_git_config(
    repo_url: str,
    branch: str,
    working_dir: str,
    access_token: str | None,
) -> None:


    clean_url = repo_url.strip()
    clean_dir = working_dir.strip()

    if clean_url:
        _validate_repo_url(clean_url)
    _validate_working_dir(clean_dir)

    data = _read_raw()
    data["repo_url"] = clean_url
    data["branch"] = branch.strip() or "main"
    data["working_dir"] = clean_dir
    if access_token is not None:

        data["access_token"] = access_token.strip()
    _write_raw(data)


def get_raw_token() -> str | None:

    token = _read_raw().get("access_token", "")
    return token if token else None


def build_authenticated_url(repo_url: str, token: str) -> str:

    if not repo_url.startswith("https://"):
        raise ValueError(
            "Only HTTPS repository URLs are supported for token authentication. "
            "For SSH remotes, configure an SSH key on the Pi instead."
        )

    return re.sub(r"^https://", f"https://x-access-token:{quote(token, safe='')}@", repo_url, count=1)
