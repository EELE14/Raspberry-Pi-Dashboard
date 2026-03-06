import asyncio
import platform

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request

from app.auth import verify_token
from app.schemas.system import SystemStats
from app.services import audit, system_info

router = APIRouter(
    prefix="/system",
    tags=["system"],
    dependencies=[Depends(verify_token)],
)


@router.get("", response_model=SystemStats, summary="Get all system stats")
def get_system_stats() -> SystemStats:
    return system_info.get_all_stats()


@router.get("/history", summary="Get historical system stats")
async def get_history(
    minutes: int = Query(default=60, ge=1, le=1440),
) -> list[dict]:
    return await system_info.get_stats_history(minutes)

# this schedules sudo shutdown and returns 202 instantly so the response will be sent before shutdown, same for reboot
@router.post("/shutdown", status_code=202, summary="Shut down the system")
async def shutdown(background_tasks: BackgroundTasks, request: Request) -> dict[str, str]:

    async def _do_shutdown() -> None:
        await asyncio.sleep(1)

        if platform.system() != "Linux":
            return  
        
        proc = await asyncio.create_subprocess_exec(
            "sudo", "shutdown", "-h", "now",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )

        await proc.wait()

    await audit.log_event(audit.get_client_ip(request), "system", "shutdown initiated", 202)
    background_tasks.add_task(_do_shutdown)
    return {"status": "shutting_down"}


@router.post("/reboot", status_code=202, summary="Reboot the system")
async def reboot(background_tasks: BackgroundTasks, request: Request) -> dict[str, str]:

    async def _do_reboot() -> None:
        await asyncio.sleep(1)

        if platform.system() != "Linux":
            return 
        
        proc = await asyncio.create_subprocess_exec(
            "sudo", "shutdown", "-r", "now",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        
        await proc.wait()

    await audit.log_event(audit.get_client_ip(request), "system", "reboot initiated", 202)
    background_tasks.add_task(_do_reboot)
    return {"status": "rebooting"}
