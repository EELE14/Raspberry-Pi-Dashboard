import hashlib
import hmac

from fastapi import Depends, HTTPException, Query, Security, WebSocket, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings

_bearer = HTTPBearer(auto_error=True)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _tokens_match(incoming: str, stored_hash: str) -> bool:

    return hmac.compare_digest(_hash_token(incoming), stored_hash)


def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(_bearer),
    settings: Settings = Depends(get_settings),
) -> None:
# fastapi dependency
    if not _tokens_match(credentials.credentials, settings.api_token_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def verify_token_query(
    token: str = Query(default="", max_length=1024),
    settings: Settings = Depends(get_settings),
) -> None:

    if not _tokens_match(token, settings.api_token_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API token.",
        )


async def ws_auth(
    websocket: WebSocket,
    token: str = "",
    settings: Settings = Depends(get_settings),
    totp_session: str = "",
) -> bool:

# websocket auth helper
    if not _tokens_match(token, settings.api_token_hash):
        await websocket.close(code=1008, reason="Invalid or missing API token.")
        return False


    from app.services import totp_service 

    if totp_service.is_enabled() and not totp_service.validate_session(totp_session):
        await websocket.close(
            code=1008,
            reason="TOTP session required. Please re-enter your 2FA code.",
        )
        return False

    return True
