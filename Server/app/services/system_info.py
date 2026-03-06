import platform
import time
from pathlib import Path

import psutil

from app.schemas.system import CpuInfo, DiskInfo, RamInfo, SystemStats
from app.services import stats_db

_THERMAL_PATH = Path("/sys/class/thermal/thermal_zone0/temp")


def _get_cpu() -> CpuInfo:


    return CpuInfo(percent=psutil.cpu_percent(interval=None))


def _get_ram() -> RamInfo:
    mem = psutil.virtual_memory()
    return RamInfo(
        total_mb=round(mem.total / 1024 / 1024, 1),
        used_mb=round(mem.used / 1024 / 1024, 1),
        available_mb=round(mem.available / 1024 / 1024, 1),
        percent=mem.percent,
    )


def _get_disk() -> DiskInfo:

    path = "/"
    if platform.system() == "Darwin":
        data_vol = Path("/System/Volumes/Data")
        if data_vol.exists():
            path = str(data_vol)
    disk = psutil.disk_usage(path)
    return DiskInfo(
        total_gb=round(disk.total / 1024 / 1024 / 1024, 2),
        used_gb=round(disk.used / 1024 / 1024 / 1024, 2),
        free_gb=round(disk.free / 1024 / 1024 / 1024, 2),
        percent=disk.percent,
    )


def _get_temperature() -> float | None:

    if _THERMAL_PATH.exists():
        try:
            raw = _THERMAL_PATH.read_text().strip()
            return round(int(raw) / 1000, 1)
        except (ValueError, OSError):
            pass
# fallback
    try:
        sensors = psutil.sensors_temperatures()
        for key in ("cpu_thermal", "cpu-thermal", "soc_thermal", "cpu"):
            if key in sensors and sensors[key]:
                return round(sensors[key][0].current, 1)
    except (AttributeError, OSError):
        pass

    return None


def _format_uptime(seconds: float) -> str:
    seconds = int(seconds)
    days, remainder = divmod(seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, secs = divmod(remainder, 60)

    parts: list[str] = []



    if days:
        parts.append(f"{days}d")

    if hours:
        parts.append(f"{hours}h")

    if minutes:
        parts.append(f"{minutes}m")

    parts.append(f"{secs}s")
    return " ".join(parts)




async def record_stats() -> None:

    s = get_all_stats()
    await stats_db.record(s.cpu.percent, s.ram.percent, s.temperature_celsius)


async def get_stats_history(minutes: int) -> list[dict]:

    return await stats_db.get_history(minutes)


def get_all_stats() -> SystemStats:
    boot_time = psutil.boot_time()
    
    uptime_seconds = max(0.0, time.time() - boot_time)

    return SystemStats(
        cpu=_get_cpu(),
        ram=_get_ram(),
        disk=_get_disk(),
        temperature_celsius=_get_temperature(),
        uptime_seconds=round(uptime_seconds, 1),
        uptime_human=_format_uptime(uptime_seconds),
    )
