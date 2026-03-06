import asyncio
import os

import psutil
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth import verify_token
from app.schemas.network import KillResponse, NetworkStats, PortList, ProcessList
from app.services import audit, network_info


_DASHBOARD_USER: str = psutil.Process(os.getpid()).username()

router = APIRouter(
    prefix="/network",
    tags=["network"],
    dependencies=[Depends(verify_token)],
)


@router.get("", response_model=NetworkStats, summary="Get network interface stats")
async def get_network() -> NetworkStats:

    return await asyncio.to_thread(network_info.get_network_snapshot)


@router.get("/processes", response_model=ProcessList, summary="List top processes by CPU")
async def get_processes() -> ProcessList:

    return await asyncio.to_thread(network_info.get_processes)


@router.get("/ports", response_model=PortList, summary="List open ports and connections")
async def get_ports() -> PortList:

    return await asyncio.to_thread(network_info.get_ports)


@router.delete(
    "/processes/{pid}",
    response_model=KillResponse,
    summary="Kill a process by PID",
)
async def kill_process(pid: int, request: Request) -> KillResponse:
    if pid < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refusing to kill system process (PID < 100).",
        )
    
    ip = audit.get_client_ip(request)

    try:
        proc = psutil.Process(pid)
        name = proc.name()
        try:
            proc_user = proc.username()
        except psutil.AccessDenied:
            raise HTTPException(status_code=403, detail=f"Access denied for PID {pid}.")
        if proc_user != _DASHBOARD_USER:
            raise HTTPException(
                status_code=403,
                detail=f"Cannot kill process owned by '{proc_user}': only processes owned by '{_DASHBOARD_USER}' may be terminated.",
            )
        
        proc.terminate()
        try:
            await asyncio.to_thread(proc.wait, 3)
        except psutil.TimeoutExpired:
            proc.kill()
        await audit.log_event(ip, "kill", f"killed process {name} (PID {pid})", 200)
        return KillResponse(pid=pid, killed=True)
    
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"Process {pid} not found.")
    
    except psutil.AccessDenied:
        raise HTTPException(status_code=403, detail=f"Access denied for PID {pid}.")
