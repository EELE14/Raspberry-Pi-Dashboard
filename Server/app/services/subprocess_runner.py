import asyncio
import logging

from fastapi import HTTPException, status

_logger = logging.getLogger("dashboard")

# timeout slow for my pi
CMD_TIMEOUT: float = 15.0


async def run_subprocess(
    cmd: list[str],
    *,
    timeout: float = CMD_TIMEOUT,
) -> tuple[int, str, str]:

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:

        return 127, "", f"Command not found: {cmd[0]}"

    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        try:
            await asyncio.wait_for(proc.wait(), timeout=2.0)
        except asyncio.TimeoutError:
            pass 
        _logger.error("Command timed out after %.0f s: %s", timeout, cmd)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"System command timed out after {timeout:.0f} s.",
        )
    return proc.returncode, stdout.decode(errors="replace").strip(), stderr.decode(errors="replace").strip()
