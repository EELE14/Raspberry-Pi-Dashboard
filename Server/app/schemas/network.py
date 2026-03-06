from pydantic import BaseModel


class NetworkInterface(BaseModel):
    name: str
    ip: str | None
    mac: str | None
    is_up: bool
    speed_mb: int
    bytes_sent: int
    bytes_recv: int


class NetworkStats(BaseModel):
    interfaces: list[NetworkInterface]


class ProcessInfo(BaseModel):
    pid: int
    name: str
    username: str
    cpu_percent: float
    memory_percent: float
    status: str


class ProcessList(BaseModel):
    processes: list[ProcessInfo]


class KillResponse(BaseModel):
    pid: int
    killed: bool


class PortEntry(BaseModel):
    protocol: str        # "tcp" ; "udp"
    local_addr: str
    local_port: int
    remote_addr: str     # "" when listening
    remote_port: int | None
    status: str          # "LISTEN" ; "ESTABLISHED" ; "TIME_WAIT" ; "NONE" etc.
    pid: int | None
    process_name: str    # "" when inaccessible


class PortList(BaseModel):
    ports: list[PortEntry]


class AuditEvent(BaseModel):
    id: int
    ts: str
    ip: str
    action_type: str
    detail: str
    status: int


class AuditResponse(BaseModel):
    total: int
    events: list[AuditEvent]
