import asyncio
import logging
from pathlib import Path

from fastapi import HTTPException, status

from app.config import Settings
from app.services.subprocess_runner import run_subprocess

_logger = logging.getLogger("dashboard")


_LOG_LINE_TIMEOUT = 60.0


async def _install_requirements_if_present(bot_name: str, settings: Settings) -> None:

    service_file = Path(settings.service_dir) / f"{bot_name}.service"

    working_dir: str | None = None
    exec_binary: str | None = None
    exec_script: str | None = None  


    try:
        for line in service_file.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped.startswith("WorkingDirectory="):
                working_dir = stripped.split("=", 1)[1].strip()
            elif stripped.startswith("ExecStart="):
                parts = stripped.split("=", 1)[1].strip().split()

                exec_binary = parts[0].lstrip("-+@:!")
                if len(parts) > 1 and parts[1].startswith("/"):
                    exec_script = parts[1]
    except OSError:

        return

    if not exec_binary:
        return




    req_file: Path | None = None
    for candidate_dir in filter(None, [working_dir, str(Path(exec_script).parent) if exec_script else None]):
        candidate = Path(candidate_dir) / "requirements.txt"
        if candidate.is_file():
            req_file = candidate
            break
    if req_file is None:
        return


    bin_dir = Path(exec_binary).parent
    pip = bin_dir / "pip"
    if not pip.is_file():
        pip = bin_dir / "pip3"
    if not pip.is_file():
        _logger.info(
            "[%s] requirements.txt found but no pip/pip3 in %s — skipping install.",
            bot_name, bin_dir,
        )
        return


    venv_root = bin_dir.parent
    if not (venv_root / "pyvenv.cfg").is_file():
        _logger.warning(
            "[%s] pip at %s does not appear to be inside a venv (no pyvenv.cfg) — skipping install.",
            bot_name, pip,
        )
        return

    _logger.info("[%s] Installing requirements from %s …", bot_name, req_file)
    proc = await asyncio.create_subprocess_exec(
        str(pip), "install", "-r", str(req_file),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=300)
    except asyncio.TimeoutError:
        proc.kill()

        try:
            await asyncio.wait_for(proc.wait(), timeout=2.0)
        except asyncio.TimeoutError:
            pass
        _logger.warning("[%s] pip install timed out after 300 s.", bot_name)
        return

    if proc.returncode != 0:
        _logger.warning(
            "[%s] pip install failed (rc=%d): %s",
            bot_name, proc.returncode,
            stderr_bytes.decode(errors="replace").strip(),
        )
    else:
        _logger.info("[%s] requirements.txt installed successfully.", bot_name)


def _validate_bot(bot_name: str, settings: Settings) -> None:
    if bot_name not in settings.bots:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bot '{bot_name}' is not configured.",
        )


async def get_status(bot_name: str, settings: Settings) -> str:
    _validate_bot(bot_name, settings)
    _, stdout, _ = await run_subprocess(
        ["sudo", "systemctl", "is-active", f"{bot_name}.service"]
    )

    return stdout or "unknown"


async def start_bot(bot_name: str, settings: Settings) -> tuple[bool, str]:
    """Starts a bot service. Returns (success, message)."""
    _validate_bot(bot_name, settings)
    await _install_requirements_if_present(bot_name, settings)
    code, _, stderr = await run_subprocess(
        ["sudo", "systemctl", "start", f"{bot_name}.service"]
    )
    return code == 0, stderr if code != 0 else "Service started."


async def stop_bot(bot_name: str, settings: Settings) -> tuple[bool, str]:
    """Stops a bot service. Returns (success, message)."""
    _validate_bot(bot_name, settings)
    code, _, stderr = await run_subprocess(
        ["sudo", "systemctl", "stop", f"{bot_name}.service"]
    )
    return code == 0, stderr if code != 0 else "Service stopped."


async def restart_bot(bot_name: str, settings: Settings) -> tuple[bool, str]:
    """Restarts a bot service. Returns (success, message)."""
    _validate_bot(bot_name, settings)
    await _install_requirements_if_present(bot_name, settings)
    code, _, stderr = await run_subprocess(
        ["sudo", "systemctl", "restart", f"{bot_name}.service"]
    )
    return code == 0, stderr if code != 0 else "Service restarted."


async def get_logs(bot_name: str, settings: Settings, lines: int = 100) -> str:
    """Returns the last N lines of a bot's journal log."""
    _validate_bot(bot_name, settings)
    _, stdout, _ = await run_subprocess(
        [
            "sudo",
            "journalctl",
            "-u",
            f"{bot_name}.service",
            "-n",
            str(lines),
            "--no-pager",
            "--output=short-precise",
        ]
    )
    return stdout


async def stream_logs(bot_name: str, settings: Settings):

    _validate_bot(bot_name, settings)
    proc = await asyncio.create_subprocess_exec(
        "sudo",
        "journalctl",
        "-u",
        f"{bot_name}.service",
        "-f",
        "--no-pager",
        "--output=short-precise",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        while True:
            try:
                raw_line = await asyncio.wait_for(
                    proc.stdout.readline(), timeout=_LOG_LINE_TIMEOUT
                )
            except asyncio.TimeoutError:

                break
            if not raw_line:

                break
            yield raw_line.decode(errors="replace").rstrip("\n")
    finally:
        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=2.0)
        except asyncio.TimeoutError:
            proc.kill()

            try:
                await asyncio.wait_for(proc.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                pass
