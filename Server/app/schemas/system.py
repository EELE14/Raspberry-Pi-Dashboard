from pydantic import BaseModel


class CpuInfo(BaseModel):
    percent: float


class RamInfo(BaseModel):
    total_mb: float
    used_mb: float
    available_mb: float
    percent: float


class DiskInfo(BaseModel):
    total_gb: float
    used_gb: float
    free_gb: float
    percent: float


class SystemStats(BaseModel):
    cpu: CpuInfo
    ram: RamInfo
    disk: DiskInfo
    temperature_celsius: float | None
    uptime_seconds: float
    uptime_human: str
