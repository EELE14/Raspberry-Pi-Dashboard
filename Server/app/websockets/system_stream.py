import asyncio
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.auth import ws_auth
from app.config import get_settings
from app.services.session_counter import SessionCounter
from app.services.system_info import get_all_stats

_logger = logging.getLogger("dashboard")

router = APIRouter(tags=["system"])

_sessions = SessionCounter()


def get_active_sessions() -> int:

    return _sessions.count


@router.websocket("/system/stream")
async def system_stream(
    websocket: WebSocket,
    token: str = Query(default="", max_length=1024),
    totp_session: str = Query(default="", max_length=512),
) -> None:
    settings = get_settings()
    if not await ws_auth(websocket, token, settings, totp_session):
        return

    _sessions.increment()
    try:
        await websocket.accept()
    except Exception:
        _sessions.decrement()
        return

    try:
        while True:
            stats = await asyncio.to_thread(get_all_stats)
            await websocket.send_text(stats.model_dump_json())
            await asyncio.sleep(2)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception as exc:
        _logger.error("system_stream error: %s", exc)
    finally:
        _sessions.decrement()
