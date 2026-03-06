import asyncio
import json
import logging

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.auth import ws_auth
from app.config import Settings, get_settings
from app.schemas.containers import CreateContainerRequest
from app.services import docker_manager

_logger = logging.getLogger("dashboard")

router = APIRouter(tags=["containers"])


@router.websocket("/containers/{name}/logs/stream")
async def stream_container_logs(
    websocket: WebSocket,
    name: str,
    token: str = Query(default="", max_length=1024),
    totp_session: str = Query(default="", max_length=512),
    settings: Settings = Depends(get_settings),
) -> None:

    authenticated = await ws_auth(websocket, token, settings, totp_session)
    if not authenticated:
        return  # ws_auth already closed the connection with 1008

    await websocket.accept()

    if not await docker_manager.is_managed(name):
        await websocket.close(code=4004, reason=f"Container '{name}' not found or not managed.")
        return

    try:
        async for line in docker_manager.stream_container_logs(name):
            await websocket.send_text(line)
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        _logger.error("container_log_stream error for '%s': %s", name, exc)
        try:
            await websocket.send_text("[ERROR] Log stream closed unexpectedly.")
            await websocket.close(code=1011)
        except Exception:
            pass

@router.websocket("/containers/build")
async def container_build_stream(
    websocket: WebSocket,
    token: str = Query(default="", max_length=1024),
    totp_session: str = Query(default="", max_length=512),
    settings: Settings = Depends(get_settings),
) -> None:

    authenticated = await ws_auth(websocket, token, settings, totp_session)
    if not authenticated:
        return  # ws_auth closed with 1008

    await websocket.accept()


    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
        data = json.loads(raw)
        req = CreateContainerRequest(**data)
    except asyncio.TimeoutError:
        await websocket.close(code=4400, reason="Timeout waiting for create payload.")
        return
    except (json.JSONDecodeError, ValidationError, Exception) as exc:
        try:
            await websocket.send_text(
                "\x01" + json.dumps({"type": "error", "message": str(exc)})
            )
            await websocket.close(code=4400)
        except Exception:
            pass
        return

    try:
        async for msg in docker_manager.create_container_stream(req, settings):
            await websocket.send_text(msg)
    except WebSocketDisconnect:
        _logger.info("Client disconnected during container build for '%s'.", req.name)
    except Exception as exc:
        _logger.error("container_build_stream error for '%s': %s", req.name, exc)
        try:
            await websocket.send_text(
                "\x01" + json.dumps({"type": "error", "message": str(exc)})
            )
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
