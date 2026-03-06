import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.auth import ws_auth
from app.config import get_settings
from app.services import update_manager

_logger = logging.getLogger("dashboard")

router = APIRouter(tags=["settings"])

# prevent simultaneous updates
_update_lock = asyncio.Lock()


@router.websocket("/settings/update/stream")
async def update_stream(
    websocket: WebSocket,
    token: str = Query(default="", max_length=1024),
    totp_session: str = Query(default="", max_length=512),
) -> None:
    settings = get_settings()
    if not await ws_auth(websocket, token, settings, totp_session):
        return

    await websocket.accept()

    async def send(msg: str) -> None:

        try:
            await websocket.send_text(msg)
        except Exception:
            pass


    if _update_lock.locked():
        await send("✗ Another update is already in progress. Try again shortly.")
        await websocket.close(code=1008)
        return

    async def run_cmd(
        cmd: list[str],
        cwd: str | None = None,
        _redact: str | None = None,
        timeout: float = 120.0,
    ) -> int:

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=cwd or None,
        )
        if proc.stdout is None:
            raise RuntimeError("subprocess stdout is None despite PIPE flag")

        async def _drain() -> int:
            async for raw_line in proc.stdout:  # type: ignore[union-attr]
                line = raw_line.decode(errors="replace").rstrip()
                if _redact:
                    line = line.replace(_redact, "***")
                await send(line)
            await proc.wait()
            return proc.returncode if proc.returncode is not None else 1

        try:
            return await asyncio.wait_for(_drain(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise

    try:
        async with _update_lock:
            cfg = update_manager.get_git_config()
            raw_token = update_manager.get_raw_token()
            repo_url: str = cfg["repo_url"]
            branch: str = cfg["branch"]
            working_dir: str = cfg["working_dir"]

            if not repo_url:
                await send("✗ No repository URL configured. Save your settings first.")
                await websocket.close(code=1008)
                return


            auth_url = repo_url
            if raw_token:
                try:
                    auth_url = update_manager.build_authenticated_url(repo_url, raw_token)
                except ValueError as exc:
                    await send(f"✗ {exc}")
                    await websocket.close(code=1008)
                    return

        
            await send(f"→ Pulling branch '{branch}' from {repo_url} …")

            # token not forwarded
            try:
                code = await run_cmd(
                    ["git", "pull", auth_url, branch],
                    cwd=working_dir,
                    _redact=auth_url,
                    timeout=60.0,
                )

            except asyncio.TimeoutError:
                await send("✗ git pull timed out after 60 seconds.")
                await websocket.close()
                return
            
            if code != 0:
                await send(f"✗ git pull failed (exit code {code}).")
                await websocket.close()
                return
            
            await send("✓ git pull complete.")

            # pip install
            req_file = Path(working_dir) / "requirements.txt"
            venv_pip = Path(working_dir) / ".venv" / "bin" / "pip"
            if req_file.exists() and venv_pip.exists():

                await send("→ Installing dependencies …")
                try:
                    code = await run_cmd(
                        [str(venv_pip), "install", "-r", str(req_file)],
                        cwd=working_dir,
                        timeout=180.0,
                    )

                except asyncio.TimeoutError:
                    await send("✗ pip install timed out after 180 seconds.")
                    await websocket.close()
                    return
                
                if code != 0:
                    await send(f"✗ pip install failed (exit code {code}).")
                    await websocket.close()
                    return
                
                await send("✓ Dependencies installed.")


            # restart
            await send("→ Restarting dashboard service …")
            await send("  The connection will drop momentarily — reconnecting automatically.")
            await asyncio.sleep(1.0)  
            await run_cmd(["sudo", "systemctl", "restart", "dashboard.service"])

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        _logger.error("update_stream unexpected error: %s", exc)
        await send(f"✗ Unexpected error: {exc}")
        try:
            await websocket.close()
        except Exception:
            pass
