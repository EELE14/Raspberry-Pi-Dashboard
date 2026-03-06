import asyncio
import logging
import re
import shutil
from pathlib import Path

from fastapi import HTTPException, status

from app.config import Settings, get_settings
from app.schemas.bots import BotStatus
from app.services.subprocess_runner import CMD_TIMEOUT, run_subprocess

_logger = logging.getLogger("dashboard")


# naming scheme
_BOT_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$")

_SERVICE_TEMPLATE = """\
[Unit]
Description={description}
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=2

[Service]
Type=simple
User=pi
WorkingDirectory={working_dir}
ExecStart={exec_start}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
"""


# helpers

def _validate_bot_name(name: str) -> None:
    if not _BOT_NAME_RE.match(name):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Bot name must start with a letter or digit and contain only "
                "letters, digits, underscores, and dashes (1-32 characters)."
            ),
        )


def _sanitize_exec_start(raw: str) -> str:
    return re.sub(r"[\x00-\x1f\x7f]", "", raw.strip())


def _validate_venv_path(path: str, root: str) -> None:
    if not path.startswith("/"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="venv_path must be an absolute path (e.g. /home/pi/bots/mybot/.venv).",
        )
    
    from pathlib import PurePosixPath

    try:
        PurePosixPath(path).relative_to(root)

    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"venv_path must be within {root}.",
        )


def _sanitize_description(raw: str) -> str:
    return re.sub(r"[%\x00-\x1f\x7f]", "", raw.strip())[:128]


def _service_file_path(name: str, service_dir: str) -> str:
    return f"{service_dir}/{name}.service"


# public api


def make_bot_status(name: str, state: str) -> BotStatus:

    return BotStatus(
        name=name,
        service=f"{name}.service",
        status=state,
        is_running=state == "active",
    )

async def add_bot(
    name: str,
    exec_start: str,
    description: str,
    settings: Settings,
    venv_path: str | None = None,
    install_requirements: bool = False,
) -> None:

    _validate_bot_name(name)

    if name in settings.bots:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Bot '{name}' is already configured.",
        )

    
    exec_start = _sanitize_exec_start(exec_start)
    if not exec_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="exec_start is required.",
        )
    
    exec_parts = exec_start.split()
    exec_binary = exec_parts[0]

    if not Path(exec_binary).is_absolute():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="exec_start must begin with an absolute path (e.g. /home/pi/bots/run.sh).",
        )
    

    if len(exec_parts) > 1:
        second = exec_parts[1]
        if ("/" in second or "." in second) and not Path(second).is_absolute():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Script path '{second}' must be absolute (start with /).",
            )

    
    if venv_path:
        venv_path = venv_path.strip()
        _validate_venv_path(venv_path, settings.file_manager_root)
        if not Path(venv_path).exists():
            proc = await asyncio.create_subprocess_exec(
                "python3", "-m", "venv", venv_path,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )

            try:
                _, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=60)

            except asyncio.TimeoutError:
                proc.kill()

                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="Timed out creating Python venv.",
                )
            

            if proc.returncode != 0:
                err = stderr_bytes.decode().strip()
                _logger.error("venv creation failed for '%s': %s", venv_path, err)


                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to create venv at {venv_path}.",
                )


        if install_requirements:
            script_dir = str(Path(exec_start.split()[0]).parent) if exec_start else ""
            req_file = Path(script_dir) / "requirements.txt" if script_dir else None
            if req_file and req_file.is_file():
                pip = str(Path(venv_path) / "bin" / "pip")

                proc = await asyncio.create_subprocess_exec(
                    pip, "install", "-r", str(req_file),
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.PIPE,
                )

                try:
                    _, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=300)

                except asyncio.TimeoutError:
                    proc.kill()
                    raise HTTPException(
                        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                        detail="Timed out installing requirements.txt.",
                    )
                

                if proc.returncode != 0:
                    err = stderr_bytes.decode().strip()
                    _logger.error("pip install failed for '%s': %s", name, err)


                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to install requirements.txt.",
                    )
                
            else:
                _logger.warning("install_requirements=True but no requirements.txt found in %s", script_dir)


    description = _sanitize_description(description) or f"{name} service"

    working_dir = (
        str(Path(exec_parts[1]).parent)
        if len(exec_parts) > 1 and Path(exec_parts[1]).is_absolute()
        else str(Path(exec_binary).parent)
    )

    service_content = _SERVICE_TEMPLATE.format(
        description=description,
        working_dir=working_dir,
        exec_start=exec_start,
    )

    service_file = _service_file_path(name, settings.service_dir)

    # refuses to overwrite existing files (ssh.service etc)
    if Path(service_file).exists():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Service file '{service_file}' already exists on the system.",
        )


    def _cleanup_venv() -> None:
        if venv_path and Path(venv_path).exists():
            shutil.rmtree(venv_path, ignore_errors=True)

    try:

        proc = await asyncio.create_subprocess_exec(
            "sudo", "tee", service_file,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr_bytes = await asyncio.wait_for(
                proc.communicate(service_content.encode("utf-8")), timeout=CMD_TIMEOUT
            )


        except asyncio.TimeoutError:
            proc.kill()
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Timed out writing service file.",
            )
        

        if proc.returncode != 0:
            err = stderr_bytes.decode().strip()
            _logger.error("sudo tee failed for '%s': %s", service_file, err)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to write service file.",
            )

        # systemd reload
        code, _, _ = await run_subprocess(["sudo", "systemctl", "daemon-reload"])
        if code != 0:
            await run_subprocess(["sudo", "rm", "-f", service_file])
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to reload systemd daemon.",
            )
        
    except Exception:
        _cleanup_venv()
        raise


    await run_subprocess(["sudo", "systemctl", "enable", f"{name}.service"])


    _update_env_bots(name, add=True)
    get_settings.cache_clear()


async def remove_bot(name: str, settings: Settings) -> None:

    _validate_bot_name(name)

    if name not in settings.bots:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bot '{name}' is not configured.",
        )

    service_file = _service_file_path(name, settings.service_dir)


    await run_subprocess(["sudo", "systemctl", "stop", f"{name}.service"])
    await run_subprocess(["sudo", "systemctl", "disable", f"{name}.service"])
    await run_subprocess(["sudo", "rm", "-f", service_file])
    await run_subprocess(["sudo", "systemctl", "daemon-reload"])

    _update_env_bots(name, add=False)
    get_settings.cache_clear()


# env management

def _update_env_bots(bot_name: str, add: bool) -> None:


    env_path = Path(".env")
    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()



    current_bots: list[str] = []

    for line in lines:
        stripped = line.strip()

        if stripped.upper().startswith("BOTS="):
            val = stripped[5:].strip()
            current_bots = [b.strip() for b in val.split(",") if b.strip()]
            break

    if add:
        if bot_name not in current_bots:
            current_bots.append(bot_name)

    else:
        current_bots = [b for b in current_bots if b != bot_name]

    new_bots_line = f"BOTS={','.join(current_bots)}"


    updated = False
    for i, line in enumerate(lines):
        if line.strip().upper().startswith("BOTS="):
            lines[i] = new_bots_line
            updated = True
            break

    if not updated:
        lines.append(new_bots_line)


    tmp = env_path.with_name(".env.tmp")
    try:
        tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
        tmp.replace(env_path)
    except OSError:
        try:
            tmp.unlink()
        except OSError:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist configuration.",
        )
