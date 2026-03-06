from fastapi import FastAPI

from .audit import setup_audit_handler
from .cors import setup_cors
from .ip_ban import IpBanMiddleware
from .rate_limit import setup_rate_limiting
from .totp import setup_totp_middleware

__all__ = [
    "IpBanMiddleware",
    "register_all",
    "setup_audit_handler",
    "setup_cors",
    "setup_rate_limiting",
    "setup_totp_middleware",
]


def register_all(app: FastAPI) -> None:

    setup_rate_limiting(app)

    setup_totp_middleware(app)

    app.add_middleware(IpBanMiddleware)

    setup_cors(app)

    setup_audit_handler(app)
