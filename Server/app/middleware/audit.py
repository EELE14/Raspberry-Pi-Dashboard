import logging
from fastapi import FastAPI, Request, Response
from fastapi.exception_handlers import http_exception_handler as _default_handler
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.services import audit as audit_service
from app.services import ip_ban

logger = logging.getLogger("dashboard")


def setup_audit_handler(app: FastAPI) -> None:


    @app.exception_handler(StarletteHTTPException)

    async def _handler(request: Request, exc: StarletteHTTPException) -> Response:
        if exc.status_code == 401:
            ip = audit_service.get_client_ip(request)
            path = request.url.path
            await audit_service.log_event(
                ip, "login_fail", f"401 on {request.method} {path}", 401
            )


            try:
                await ip_ban.record_failure(ip)
            except Exception as exc_inner:  
                logger.warning("ip_ban.record_failure failed: %s", exc_inner)

        return await _default_handler(request, exc)
