import logging
import os
import stat
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from app.auth import verify_token
from app.schemas.security import (
    BannedIp,
    BannedIpList,
    ChecklistItem,
    ManualBanRequest,
    SecurityChecklist,
    SecurityStats,
    TokenRotateResponse,
)
from app.services import audit as audit_service
from app.services import ip_ban, token_rotation
from app.websockets import network_stream, system_stream, terminal

_logger = logging.getLogger("dashboard")

router = APIRouter(
    prefix="/security",
    tags=["security"],
    dependencies=[Depends(verify_token)],
)


# stats
@router.get("/stats", response_model=SecurityStats, summary="Security overview stats")
async def get_security_stats() -> SecurityStats:
    fails_1h = await audit_service.count_login_fails_since(1)
    fails_24h = await audit_service.count_login_fails_since(24)
    banned = ip_ban.get_banned_ips()
    return SecurityStats(
        login_fails_1h=fails_1h,
        login_fails_24h=fails_24h,
        banned_ips_count=len(banned),
        terminal_sessions=terminal.get_active_sessions(),
        system_stream_sessions=system_stream.get_active_sessions(),
        network_stream_sessions=network_stream.get_active_sessions(),
    )


# checklist thing
@router.get("/checklist", response_model=SecurityChecklist, summary="Security checklist")
async def get_security_checklist() -> SecurityChecklist:
    items: list[ChecklistItem] = []

    # env perms
    env_path = Path(".env")
    if env_path.exists():
        mode = os.stat(env_path).st_mode
        ok = not bool(
            mode & (
                stat.S_IRGRP | stat.S_IWGRP | stat.S_IXGRP |
                stat.S_IROTH | stat.S_IWOTH | stat.S_IXOTH
            )
        )
        items.append(ChecklistItem(
            id="env_permissions",
            label=".env file permissions",
            ok=ok,
            detail=(
                f"Permissions are {oct(mode & 0o777)} (rw-------)" if ok
                else f"Permissions are {oct(mode & 0o777)} — run: chmod 600 .env"
            ),
        ))
    else:
        items.append(ChecklistItem(
            id="env_permissions",
            label=".env file permissions",
            ok=False,
            detail=".env file not found",
        ))

    # login fails
    fails_1h = await audit_service.count_login_fails_since(1)
    ok = fails_1h < 5
    items.append(ChecklistItem(
        id="login_fails",
        label="Recent login failures",
        ok=ok,
        detail=(
            f"No suspicious activity (0 fails in last hour)" if fails_1h == 0
            else f"{fails_1h} failed login attempts in the last hour"
            + ("" if ok else " — possible brute force")
        ),
    ))

    # auto bans
    auto_bans = [r for r in ip_ban.get_banned_ips() if "Auto-banned" in r.reason]
    ok = len(auto_bans) == 0
    items.append(ChecklistItem(
        id="auto_bans",
        label="Brute-force auto-bans",
        ok=ok,
        detail=(
            "No active auto-bans" if ok
            else f"{len(auto_bans)} IP(s) auto-banned for brute force"
        ),
    ))

    # terminal sessions
    term_sessions = terminal.get_active_sessions()
    ok = term_sessions < 2
    items.append(ChecklistItem(
        id="terminal_sessions",
        label="Active terminal sessions",
        ok=ok,
        detail=(
            f"{term_sessions} active session(s)" +
            ("" if ok else " — unusually high number of concurrent terminals")
        ),
    ))

    # audit size
    row_count = await audit_service.get_row_count()
    ok = row_count < 9_000
    items.append(ChecklistItem(
        id="audit_db",
        label="Audit log size",
        ok=ok,
        detail=f"{row_count:,} / 10,000 rows" + ("" if ok else " — approaching pruning limit"),
    ))

    score = int(sum(1 for item in items if item.ok) / len(items) * 100) if items else 0
    return SecurityChecklist(items=items, score=score)


# banned IPs
@router.get("/banned-ips", response_model=BannedIpList, summary="List banned IPs")
def get_banned_ips() -> BannedIpList:
    bans = ip_ban.get_banned_ips()
    return BannedIpList(bans=[
        BannedIp(
            ip=r.ip,
            reason=r.reason,
            banned_at=r.banned_at,
            expires_at=r.expires_at,
        )
        for r in bans
    ])


@router.delete(
    "/banned-ips/{ip}",
    summary="Unban an IP address",
)
async def unban_ip(ip: str) -> dict:
    removed = await ip_ban.unban_ip(ip)
    if not removed:
        raise HTTPException(status_code=404, detail=f"IP '{ip}' is not in the ban list.")
    return {"ip": ip, "unbanned": True}


@router.post("/ban-ip", response_model=BannedIp, summary="Manually ban an IP address")
async def manual_ban_ip(req: ManualBanRequest) -> BannedIp:
    record = await ip_ban.ban_ip(req.ip, req.reason, req.duration_minutes)
    return BannedIp(
        ip=record.ip,
        reason=record.reason,
        banned_at=record.banned_at,
        expires_at=record.expires_at,
    )


# token rotation
@router.post(
    "/rotate-token",
    response_model=TokenRotateResponse,
    summary="Generate a new API token (invalidates the current one)",
)
async def rotate_token() -> TokenRotateResponse:
    """
    Generates a new cryptographically random API token, updates the .env file,
    clears the settings cache, and returns the new raw token exactly once.

    The old token is immediately invalidated. The caller must save the new token —
    it cannot be retrieved again.
    """
    new_token = token_rotation.rotate_token()
    return TokenRotateResponse(token=new_token)
