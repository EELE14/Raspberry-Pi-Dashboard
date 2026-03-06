from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.auth import verify_token
from app.middleware.rate_limit import limiter
from app.services import totp_service

router = APIRouter(prefix="/auth", tags=["auth"])


# schemas


class TotpStatus(BaseModel):
    enabled: bool


class TotpSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class TotpCodeRequest(BaseModel):
    code: str = Field(pattern=r"^\d{6}$", description="6-digit TOTP code")


class TotpSessionResponse(BaseModel):
    session_token: str


class TotpDisableResponse(BaseModel):
    disabled: bool


# endpoints



# public, no auth
@router.get(
    "/totp/status",
    response_model=TotpStatus,
    summary="Check whether TOTP 2FA is enabled",
)
def totp_status() -> TotpStatus:
    return TotpStatus(enabled=totp_service.is_enabled())


@router.get(
    "/totp/setup",
    response_model=TotpSetupResponse,
    dependencies=[Depends(verify_token)],
    summary="Generate a pending TOTP secret (not yet active)",
)
def totp_setup() -> TotpSetupResponse:

    secret = totp_service.generate_pending_secret()

    uri = totp_service.get_otpauth_uri(secret)

    return TotpSetupResponse(secret=secret, otpauth_uri=uri)


@router.post(
    "/totp/setup/confirm",
    response_model=TotpSessionResponse,

    dependencies=[Depends(verify_token)],

    summary="Confirm the pending secret and enable TOTP",
)
@limiter.limit("10/minute")
def totp_setup_confirm(request: Request, body: TotpCodeRequest) -> TotpSessionResponse:

    if totp_service.is_enabled():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="TOTP is already enabled. Disable it first.",
        )
    
    secret = totp_service.get_secret()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending TOTP setup. Call GET /api/auth/totp/setup first.",
        )
    
    if not totp_service.verify_code(secret, body.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid TOTP code. Check the time on your authenticator and try again.",
        )
    
    totp_service.enable(secret)

    session_token = totp_service.create_session()

    return TotpSessionResponse(session_token=session_token)


@router.post(
    "/totp/verify",
    response_model=TotpSessionResponse,
    dependencies=[Depends(verify_token)],
    summary="Verify a TOTP code and receive a session token",
)
@limiter.limit("10/minute")
def totp_verify(request: Request, body: TotpCodeRequest) -> TotpSessionResponse:

    if not totp_service.is_enabled():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TOTP is not enabled on this server.",
        )
    
    secret = totp_service.get_secret()
    if not totp_service.verify_code(secret, body.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid TOTP code.",
        )
    
    session_token = totp_service.create_session()

    return TotpSessionResponse(session_token=session_token)

# requires valid totp session
@router.delete(
    "/totp",
    response_model=TotpDisableResponse,
    dependencies=[Depends(verify_token)],
    summary="Disable TOTP 2FA",
)

def totp_disable(request: Request) -> TotpDisableResponse:


    session = request.headers.get("X-TOTP-Session", "")
    if not totp_service.validate_session(session):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid TOTP session (X-TOTP-Session header) is required to disable 2FA.",
        )
    
    totp_service.disable()
    
    return TotpDisableResponse(disabled=True)
