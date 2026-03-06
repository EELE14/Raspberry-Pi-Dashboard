import json

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.services import audit
from app.services import ip_ban as ip_ban_service

# rejects IPs with 403 without other processing
class IpBanMiddleware(BaseHTTPMiddleware):

    async def dispatch(self, request: Request, call_next) -> Response:
        ip = audit.get_client_ip(request)
        banned, reason = ip_ban_service.is_banned(ip)
        if banned:


            # no json injection
            body = json.dumps(
                {"detail": f"Your IP address has been banned: {reason}"}
            )
            return Response(
                content=body, status_code=403, media_type="application/json"
            )
        return await call_next(request)
