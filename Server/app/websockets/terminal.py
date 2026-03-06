import asyncio
import json

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from app.auth import ws_auth
from app.config import Settings, get_settings
from app.services.session_counter import SessionCounter
from app.services.terminal import (
    apply_resize,
    create_pty_process,
    pump_pty_to_queue,
    terminate_process,
    write_input,
)

router = APIRouter(tags=["terminal"])

# maximum queued output chunks before dropping
_QUEUE_SIZE = 512


# each sessions spawns back process
_sessions = SessionCounter(max_sessions=get_settings().max_terminal_sessions)


def get_active_sessions() -> int:
    return _sessions.count


@router.websocket("/terminal")
async def terminal_ws(
    websocket: WebSocket,
    token: str = Query(default="", max_length=1024),
    totp_session: str = Query(default="", max_length=512),
    cols: int = Query(default=80, ge=1, le=500),
    rows: int = Query(default=24, ge=1, le=200),
    settings: Settings = Depends(get_settings),
) -> None:


    # auth
    authenticated = await ws_auth(websocket, token, settings, totp_session)
    if not authenticated:
        return  

    # limit check
    if _sessions.at_limit():
        await websocket.close(code=1008, reason="Too many active terminal sessions.")
        return



    _sessions.increment()

    try:
        await websocket.accept()
    except Exception:
        _sessions.decrement()
        return


    try:
        proc, master_fd = await create_pty_process(cols=cols, rows=rows)
    except Exception:
        _sessions.decrement()
        try:
            await websocket.close(code=1011, reason="Failed to start shell.")
        except Exception:
            pass
        return

    
    output_queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=_QUEUE_SIZE)

    # two concurrent tasks:
    # 1: PTY > WebSocket (terminal output to browser)
    pump_task = asyncio.create_task(
        pump_pty_to_queue(master_fd, output_queue),
        name="pty-pump",
    )
    # 2: WebSocket > PTY (keyboard input + resize from browser)
    ws_task = asyncio.create_task(
        _ws_to_pty(websocket, master_fd, output_queue),
        name="ws-input",
    )

    try:


        done, pending = await asyncio.wait(
            {pump_task, ws_task},
            return_when=asyncio.FIRST_COMPLETED,
        )


        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:
                pass  

    except Exception:

        pump_task.cancel()
        ws_task.cancel()

    finally:
        _sessions.decrement()
        await terminate_process(proc, master_fd)
        try:
            await websocket.close()
        except Exception:
            pass


async def _ws_to_pty(
    websocket: WebSocket,
    master_fd: int,
    output_queue: asyncio.Queue[bytes | None],
) -> None:

    # Start a background sender that drains the output queue
    sender_task = asyncio.create_task(_drain_output(websocket, output_queue))

    try:
        async for raw in websocket.iter_text():
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            if msg_type == "input":
                data = msg.get("data", "")

                if isinstance(data, str) and 1 <= len(data) <= 4096:
                    write_input(master_fd, data)

            elif msg_type == "resize":
                try:
                    new_cols = int(msg["cols"])
                    new_rows = int(msg["rows"])

                    if 1 <= new_cols <= 500 and 1 <= new_rows <= 200:
                        await asyncio.to_thread(apply_resize, master_fd, new_cols, new_rows)
                except (KeyError, ValueError, TypeError):
                    pass

    except WebSocketDisconnect:
        pass
    finally:
        sender_task.cancel()
        try:
            await sender_task
        except (asyncio.CancelledError, Exception):
            pass


async def _drain_output(
    websocket: WebSocket,
    queue: asyncio.Queue[bytes | None],
) -> None:


    while True:
        chunk = await queue.get()
        if chunk is None:
            
            try:
                await websocket.send_text("\r\n[Process exited]\r\n")
            except Exception:
                pass
            return
        try:
            await websocket.send_bytes(chunk)
        except Exception:
            return
