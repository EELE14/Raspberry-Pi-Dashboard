from datetime import datetime

from pydantic import BaseModel, Field


class BannedIp(BaseModel):
    ip: str
    reason: str
    banned_at: datetime
    expires_at: datetime | None


class BannedIpList(BaseModel):
    bans: list[BannedIp]


class SecurityStats(BaseModel):
    login_fails_1h: int
    login_fails_24h: int
    banned_ips_count: int
    terminal_sessions: int
    system_stream_sessions: int
    network_stream_sessions: int


class ChecklistItem(BaseModel):
    id: str
    label: str
    ok: bool
    detail: str


class SecurityChecklist(BaseModel):
    items: list[ChecklistItem]
    score: int  # 0–100


class TokenRotateResponse(BaseModel):
    token: str  # Raw token, shown once


class ManualBanRequest(BaseModel):
    ip: str = Field(min_length=1, max_length=45)          # max IPv6 length
    reason: str = Field(default="Manual ban", max_length=200)
    duration_minutes: int | None = Field(default=None, ge=1, le=525_600)  # max 1 year
