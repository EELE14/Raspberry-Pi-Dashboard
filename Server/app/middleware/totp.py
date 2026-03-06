from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# these are either public (health) or related to verification
_TOTP_EXEMPT: frozenset[str] = frozenset(
    [
        "/api/auth/totp/status",
        "/api/auth/totp/setup",
        "/api/auth/totp/setup/confirm",
        "/api/auth/totp/verify",
        "/api/health",
    ]
)

# prevents bypass with trailing slash or case variation
def _normalise_path(path: str) -> str:

    p = path.rstrip("/") or "/"

    return p.lower()


class TotpMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:

        from app.services import totp_service


        if not totp_service.is_enabled():
            return await call_next(request)

        # this is for cors preflight
        if request.method == "OPTIONS":
            return await call_next(request)



        normalised = _normalise_path(request.url.path)
        if normalised in _TOTP_EXEMPT:
            return await call_next(request)

        # only intercepts bearer auth requests
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return await call_next(request)

        # require valid token
        session = request.headers.get("X-TOTP-Session", "")
        if not totp_service.validate_session(session):
            return JSONResponse(
                status_code=401,
                content={
                    "detail": (
                        "TOTP session required. "
                        "Please re-enter your 2FA code."
                    )
                },
            )

        return await call_next(request)


def setup_totp_middleware(app: FastAPI) -> None:



    app.add_middleware(TotpMiddleware)
