import asyncio
import logging

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from app.auth import ws_auth
from app.config import Settings, get_settings
from app.services import systemd

_logger = logging.getLogger("dashboard")

router = APIRouter(tags=["bots"])


@router.websocket("/bots/{bot_name}/logs/stream")
async def stream_bot_logs(
    websocket: WebSocket,
    bot_name: str,
    token: str = Query(default="", max_length=1024),
    totp_session: str = Query(default="", max_length=512),
    settings: Settings = Depends(get_settings),
) -> None:


    authenticated = await ws_auth(websocket, token, settings, totp_session)
    if not authenticated:
        return 



    if bot_name not in settings.bots:
        await websocket.close(code=1008, reason=f"Bot '{bot_name}' is not configured.")
        return

    await websocket.accept()

    try:
        async for line in systemd.stream_logs(bot_name, settings):
            await websocket.send_text(line)
    except WebSocketDisconnect:

        pass
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        _logger.error("log_stream error for bot '%s': %s", bot_name, exc)
        try:
            await websocket.send_text("[ERROR] Log stream closed unexpectedly.")
            await websocket.close(code=1011)
        except Exception:
            pass
