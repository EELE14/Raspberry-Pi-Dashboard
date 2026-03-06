from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import verify_token
from app.schemas.network import AuditEvent, AuditResponse
from app.services import audit

router = APIRouter(
    prefix="/audit",
    tags=["audit"],
    dependencies=[Depends(verify_token)],
)

_ALLOWED_TYPES = frozenset({"login_fail", "bot", "file", "system", "kill"})


@router.get("", response_model=AuditResponse, summary="Get audit log entries")

async def get_audit(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    type: str | None = Query(default=None),
) -> AuditResponse:
    

    if type is not None and type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type. Allowed values: {', '.join(sorted(_ALLOWED_TYPES))}",
        )
    
    total, events = await audit.get_events(limit=limit, offset=offset, action_type=type)
    return AuditResponse(
        total=total,
        events=[AuditEvent(**e) for e in events],
    )
