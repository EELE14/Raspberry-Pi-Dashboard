import asyncio
import logging
import os
import stat
from contextlib import asynccontextmanager

import aiosqlite
from fastapi import FastAPI, Request

from app.config import get_settings as _get_settings
from app.middleware import register_all
from app.middleware.rate_limit import limiter
from app.routers import bots, files, system
from app.routers import audit as audit_router_module
from app.routers import auth as auth_router_module
from app.routers import containers as containers_router_module
from app.routers import network as network_router_module
from app.routers import security as security_router_module
from app.routers import settings as settings_router_module
from app.routers.files import raw_router
from app.services import audit, stats_db, system_info
from app.websockets import log_stream, terminal
from app.websockets import system_stream, network_stream, update_stream
from app.websockets import container_log_stream, container_exec

logger = logging.getLogger("dashboard")


def _configure_logging() -> None:

    log = logging.getLogger("dashboard")
    if log.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)-8s %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    log.setLevel(logging.INFO)
    log.addHandler(handler)
    log.propagate = False  


def _check_env_permissions() -> None:

    env_path = ".env"
    if not os.path.exists(env_path):
        return
    mode = os.stat(env_path).st_mode
    if mode & (
        stat.S_IRGRP | stat.S_IWGRP | stat.S_IXGRP
        | stat.S_IROTH | stat.S_IWOTH | stat.S_IXOTH
    ):
        logger.warning(
            "SECURITY: .env file has loose permissions (%s). Run: chmod 600 .env",
            oct(mode & 0o777),
        )
    else:
        logger.info(".env permissions OK (%s)", oct(mode & 0o777))


async def _stats_recorder() -> None:

    while True:
        try:
            await system_info.record_stats()
        except Exception as exc:
            logger.warning("Stats recording failed: %s", exc)
        await asyncio.sleep(10)


@asynccontextmanager
async def lifespan(_: FastAPI):

    _configure_logging()
    _check_env_permissions()

    await audit.init_db()

    await stats_db.init_db()

    recorder_task = asyncio.create_task(_stats_recorder())
    logger.info("Dashboard started.")
    yield
    recorder_task.cancel()
    try:
        await recorder_task
    except asyncio.CancelledError:
        pass
    logger.info("Dashboard shutting down — flushing WAL checkpoints.")
    for db_path in (audit.DB_PATH, stats_db.STATS_DB_PATH):
        try:
            async with aiosqlite.connect(db_path) as db:
                await db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except Exception as exc:
            logger.warning("WAL checkpoint failed for %s: %s", db_path.name, exc)



# application
_docs_url = "/docs" if _get_settings().enable_docs else None
_redoc_url = "/redoc" if _get_settings().enable_docs else None

app = FastAPI(
    title="PI Server Dashboard API",
    description=(
        "Remote management API for my Raspberry Pi — "
        "containers, system monitoring, file manager, terminal."
    ),
    version="1.0.0",
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    lifespan=lifespan,
)


register_all(app)

# routers
API_PREFIX = "/api"

app.include_router(bots.router, prefix=API_PREFIX)
app.include_router(system.router, prefix=API_PREFIX)
app.include_router(files.router, prefix=API_PREFIX)
app.include_router(raw_router, prefix=API_PREFIX)
app.include_router(audit_router_module.router, prefix=API_PREFIX)
app.include_router(auth_router_module.router, prefix=API_PREFIX)
app.include_router(network_router_module.router, prefix=API_PREFIX)
app.include_router(security_router_module.router, prefix=API_PREFIX)
app.include_router(settings_router_module.router, prefix=API_PREFIX)
app.include_router(containers_router_module.router, prefix=API_PREFIX)

# websockets
app.include_router(log_stream.router, prefix=API_PREFIX)
app.include_router(container_log_stream.router, prefix=API_PREFIX)
app.include_router(container_exec.router, prefix=API_PREFIX)
app.include_router(terminal.router, prefix=API_PREFIX)
app.include_router(system_stream.router, prefix=API_PREFIX)
app.include_router(network_stream.router, prefix=API_PREFIX)
app.include_router(update_stream.router, prefix=API_PREFIX)


# health check, no auth
@app.get("/api/health", tags=["health"], summary="Health check")
@limiter.limit("20/minute")
def health(request: Request) -> dict[str, str]:
    return {"status": "ok"}
