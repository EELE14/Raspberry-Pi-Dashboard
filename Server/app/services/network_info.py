import logging
import socket as _socket

import psutil

from app.schemas.network import (
    NetworkInterface,
    NetworkStats,
    PortEntry,
    PortList,
    ProcessInfo,
    ProcessList,
)

_logger = logging.getLogger("dashboard")


def get_network_snapshot() -> NetworkStats:
    addrs = psutil.net_if_addrs()
    stats = psutil.net_if_stats()
    counters = psutil.net_io_counters(pernic=True)

    interfaces: list[NetworkInterface] = []
    for name, addr_list in addrs.items():
        ip: str | None = None
        mac: str | None = None
        for addr in addr_list:
            if addr.family.name == "AF_INET" and not ip:
                ip = addr.address
            if addr.family.name == "AF_PACKET" and not mac:
                mac = addr.address
            # macOS uses AF_LINK for MAC
            if addr.family.name == "AF_LINK" and not mac:
                mac = addr.address

        st = stats.get(name)
        cnt = counters.get(name)
        interfaces.append(
            NetworkInterface(
                name=name,
                ip=ip,
                mac=mac,
                is_up=st.isup if st else False,
                speed_mb=st.speed if st else 0,
                bytes_sent=cnt.bytes_sent if cnt else 0,
                bytes_recv=cnt.bytes_recv if cnt else 0,
            )
        )

    return NetworkStats(interfaces=interfaces)


def get_processes(limit: int = 30) -> ProcessList:
    procs: list[ProcessInfo] = []
    try:
        for p in psutil.process_iter(
            ["pid", "name", "username", "cpu_percent", "memory_percent", "status"]
        ):
            try:
                info = p.info
                if info["pid"] is None or info["pid"] <= 1:
                    continue
                procs.append(
                    ProcessInfo(
                        pid=info["pid"],
                        name=info["name"] or "",
                        username=info["username"] or "",
                        cpu_percent=round(info["cpu_percent"] or 0.0, 1),
                        memory_percent=round(info["memory_percent"] or 0.0, 2),
                        status=info["status"] or "",
                    )
                )
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except Exception as exc:
        _logger.warning("process_iter failed: %s", exc)

    procs.sort(key=lambda p: p.cpu_percent, reverse=True)
    return ProcessList(processes=procs[:limit])


def get_ports() -> PortList:

    pid_to_name: dict[int, str] = {}
    try:
        for p in psutil.process_iter(["pid", "name"]):
            try:
                if p.pid:
                    pid_to_name[p.pid] = p.info["name"] or ""
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except Exception:
        pass

    entries: list[PortEntry] = []
    try:
        for c in psutil.net_connections(kind="inet"):
            if not c.laddr:
                continue
            proto = "tcp" if c.type == _socket.SOCK_STREAM else "udp"
            remote_addr = c.raddr.ip if c.raddr else ""
            remote_port: int | None = c.raddr.port if c.raddr else None
            pid: int | None = c.pid if c.pid else None
            process_name = pid_to_name.get(pid, "") if pid else ""
            status = c.status if c.status else "NONE"
            entries.append(
                PortEntry(
                    protocol=proto,
                    local_addr=c.laddr.ip,
                    local_port=c.laddr.port,
                    remote_addr=remote_addr,
                    remote_port=remote_port,
                    status=status,
                    pid=pid,
                    process_name=process_name,
                )
            )
    except Exception as exc:
        _logger.warning("net_connections failed: %s", exc)


    entries.sort(key=lambda e: (e.status != "LISTEN", e.local_port))
    return PortList(ports=entries)
