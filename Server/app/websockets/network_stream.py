import asyncio
import json
import logging
from datetime import datetime, timezone

import psutil
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.auth import ws_auth
from app.config import get_settings
from app.services.session_counter import SessionCounter

_logger = logging.getLogger("dashboard")

router = APIRouter(tags=["network"])

_sessions = SessionCounter()


def get_active_sessions() -> int:

    return _sessions.count


@router.websocket("/network/stream")
async def network_stream(
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

    prev_counters: dict[str, tuple[int, int]] = {}

    try:
        while True:
            counters = psutil.net_io_counters(pernic=True)
            ts = datetime.now(timezone.utc).isoformat()

            interfaces = []
            for name, cnt in counters.items():
                prev = prev_counters.get(name, (cnt.bytes_sent, cnt.bytes_recv))
                sent_s = max(0, cnt.bytes_sent - prev[0])
                recv_s = max(0, cnt.bytes_recv - prev[1])
                prev_counters[name] = (cnt.bytes_sent, cnt.bytes_recv)
                interfaces.append(
                    {"name": name, "bytes_sent_s": sent_s, "bytes_recv_s": recv_s}
                )

            await websocket.send_text(
                json.dumps({"ts": ts, "interfaces": interfaces})
            )
            await asyncio.sleep(1)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception as exc:
        _logger.error("network_stream error: %s", exc)
    finally:
        _sessions.decrement()
