import asyncio
import json
import logging
import re
from pathlib import Path

from fastapi import HTTPException, status

from app.config import Settings
from app.schemas.containers import (
    ContainerInfo,
    CreateContainerRequest,
    DockerStatus,
)
from app.services.subprocess_runner import run_subprocess

_logger = logging.getLogger("dashboard")


MANAGED_LABEL = "pi-dashboard.managed=true"
MANAGED_LABEL_KEY = "pi-dashboard.managed"

# this is long bc of slow builds/pulls on my pi3
BUILD_TIMEOUT = 1800  # 30 min 
PULL_TIMEOUT  = 1800  # 30 min 


_LOG_LINE_TIMEOUT = 60.0



_MEMORY_RE = re.compile(r"^\d+[kmgKMG]?$")
_PORT_RE   = re.compile(r"^(\d{1,5}):(\d{1,5})$")


# helpers


def _parse_container_info(raw: dict) -> ContainerInfo:
    """Convert a `docker ps --format '{{json .}}'` line into ContainerInfo."""
    name = raw.get("Names", "").lstrip("/").split(",")[0]
    state = raw.get("State", raw.get("Status", "unknown")).lower()


    if state.startswith("up"):
        state = "running"
    elif state.startswith("exited"):
        state = "exited"
    elif state.startswith("paused"):
        state = "paused"
    elif state.startswith("restarting"):
        state = "restarting"
    elif state.startswith("created"):
        state = "created"


    raw_ports = raw.get("Ports", "")
    ports: list[str] = []
    if raw_ports:

        for part in raw_ports.split(","):
            part = part.strip()
            if "->" in part:

                try:
                    host_side, container_side = part.split("->", 1)
                    host_port = host_side.split(":")[-1]
                    ports.append(f"{host_port}->{container_side}")

                except ValueError:
                    ports.append(part)



    return ContainerInfo(
        id=raw.get("ID", raw.get("Id", ""))[:12],
        name=name,
        image=raw.get("Image", ""),
        status=state,
        is_running=(state == "running"),
        ports=ports,
        created=raw.get("CreatedAt", raw.get("Created", "")),
    )


def _validate_ports(ports: list[str]) -> None:
    for p in ports:
        m = _PORT_RE.match(p)
        if not m:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid port mapping '{p}'. Expected format: 'host_port:container_port'.",
            )
        host, container = int(m.group(1)), int(m.group(2))
        if not (1 <= host <= 65535 and 1 <= container <= 65535):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Port values in '{p}' must be between 1 and 65535.",
            )


def _validate_volumes(volumes: list[str], file_manager_root: str) -> None:
    root_resolved = Path(file_manager_root).resolve()

    for v in volumes:
        parts = v.split(":", 2)

        if len(parts) < 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid volume '{v}'. Expected format: '/host/path:/container/path'.",
            )
        
        host_path = parts[0]
        if not host_path.startswith("/"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Volume host path '{host_path}' must be an absolute path.",
            )
        

        resolved = Path(host_path).resolve()
        if not (resolved == root_resolved or resolved.is_relative_to(root_resolved)):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Volume host path '{host_path}' must be within "
                    f"the file manager root ({file_manager_root})."
                ),
            )


async def is_managed(name: str) -> bool:

    code, stdout, _ = await run_subprocess(
        ["docker", "inspect", "--format",
        f'{{{{index .Config.Labels "{MANAGED_LABEL_KEY}"}}}}', name]
    )

    return code == 0 and stdout.strip() == "true"


async def _validate_managed(name: str) -> None:

    if not await is_managed(name):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{name}' not found or not managed by the dashboard.",
        )
    


async def _inspect_container(name: str) -> ContainerInfo:

    code, stdout, _ = await run_subprocess(
        ["docker", "inspect", "--format", "{{json .}}", name]
    )


    if code != 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Container '{name}' not found.",
        )
    

    try:
        data = json.loads(stdout)
    
    except json.JSONDecodeError as exc:
        _logger.error("Failed to parse docker inspect output for '%s': %s", name, exc)


        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to parse Docker inspect output.",
        )
    
    if isinstance(data, list):
        data = data[0]

    cfg = data.get("Config", {})
    state = data.get("State", {})
    net_settings = data.get("NetworkSettings", {})


# build port list
    ports: list[str] = []
    for container_port, bindings in (net_settings.get("Ports") or {}).items():
        if bindings:
            for b in bindings:
                host_port = b.get("HostPort", "")
                if host_port:
                    ports.append(f"{host_port}->{container_port}")

    running = state.get("Running", False)
    status_str = "running" if running else state.get("Status", "unknown").lower()

    return ContainerInfo(
        id=data.get("Id", "")[:12],
        name=data.get("Name", "").lstrip("/"),
        image=cfg.get("Image", ""),
        status=status_str,
        is_running=running,
        ports=ports,
        created=data.get("Created", ""),
    )


# public API

async def get_docker_status() -> DockerStatus:


    errors: list[str] = []

    # is docker binary present
    code, _, _ = await run_subprocess(["docker", "--version"])
    if code != 0:
        return DockerStatus(
            installed=False,
            daemon_reachable=False,
            permission_ok=False,
            client_version=None,
            server_version=None,
            arch=None,
            errors=["Docker is not installed. Run: curl -fsSL https://get.docker.com | sudo sh"],
        )

    # test daemon
    code, stdout, stderr = await run_subprocess(["docker", "info", "--format", "{{json .}}"])

    if code != 0:
        perm_denied = "permission denied" in stderr.lower() or "Got permission denied" in stderr
        if perm_denied:
            return DockerStatus(
                installed=True,
                daemon_reachable=False,
                permission_ok=False,
                client_version=None,
                server_version=None,
                arch=None,
                errors=[
                    "Permission denied on Docker socket. "
                    "Run: sudo usermod -aG docker pi && sudo reboot"
                ],
            )
        
        return DockerStatus(
            installed=True,
            daemon_reachable=False,
            permission_ok=True,
            client_version=None,
            server_version=None,
            arch=None,
            errors=["Docker daemon is not running. Run: sudo systemctl start docker"],
        )

    client_version: str | None = None
    server_version: str | None = None
    arch: str | None = None

    try:
        info = json.loads(stdout)
        client_info = info.get("ClientInfo") or {}
        client_version = client_info.get("Version") or info.get("ClientVersion")
        server_version = info.get("ServerVersion")
        arch = info.get("Architecture")
        if arch is None:

            _, uname_out, _ = await run_subprocess(["uname", "-m"])
            arch = uname_out.strip() or None

    except (json.JSONDecodeError, KeyError) as exc:
        errors.append(f"Could not parse docker info output: {exc}")

    return DockerStatus(
        installed=True,
        daemon_reachable=True,
        permission_ok=True,
        client_version=client_version,
        server_version=server_version,
        arch=arch,
        errors=errors,
    )


async def list_containers() -> list[ContainerInfo]:

    code, stdout, stderr = await run_subprocess([
        "docker", "ps", "-a",
        "--filter", f"label={MANAGED_LABEL}",
        "--format", "{{json .}}",
    ])

    if code != 0:
        _logger.error("docker ps failed: %s", stderr)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Docker daemon unavailable.",
        )

    containers: list[ContainerInfo] = []
    for line in stdout.splitlines():
        line = line.strip()

        if not line:
            continue
        try:
            containers.append(_parse_container_info(json.loads(line)))
        except (json.JSONDecodeError, KeyError) as exc:
            _logger.warning("Failed to parse container line: %s — %s", line, exc)

    return containers


async def get_container(name: str) -> ContainerInfo:

    await _validate_managed(name)
    return await _inspect_container(name)


async def create_container(req: CreateContainerRequest, settings: Settings) -> ContainerInfo:


    root = settings.file_manager_root



    code, _, _ = await run_subprocess(["docker", "inspect", req.name])
    if code == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A container named '{req.name}' already exists.",
        )

    _validate_ports(req.ports)
    _validate_volumes(req.volumes, root)

    if req.memory and not _MEMORY_RE.match(req.memory):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid memory format '{req.memory}'. Use e.g. '256m' or '1g'.",
        )

    if req.workdir and not req.workdir.startswith("/"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="workdir must be an absolute path.",
        )




    if req.dockerfile_path:
        dockerfile = Path(req.dockerfile_path)
        if not dockerfile.is_absolute() or not dockerfile.is_file():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"dockerfile_path '{req.dockerfile_path}' must be an existing file.",
            )
        root_resolved = Path(root).resolve()
        dockerfile_resolved = dockerfile.resolve()
        if not dockerfile_resolved.is_relative_to(root_resolved):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"dockerfile_path must be within {root}.",
            )

        if req.context_path and not Path(req.context_path).is_absolute():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="context_path must be an absolute path.",
            )
        context = Path(req.context_path) if req.context_path else dockerfile.parent
        context_resolved = context.resolve()
        if not (context_resolved == root_resolved or context_resolved.is_relative_to(root_resolved)):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"context_path must be within {root}.",
            )

        image_tag = f"pi-dashboard/{req.name}:latest"
        _logger.info("[%s] Building image from %s …", req.name, req.dockerfile_path)
        build_cmd = [
            "docker", "build",
            "-t", image_tag,
            "-f", str(dockerfile),
            str(context),
        ]
        proc = await asyncio.create_subprocess_exec(
            *build_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,  # merge stderr into stdout (BuildKit writes errors to stdout)
        )
        try:
            output_bytes, _ = await asyncio.wait_for(proc.communicate(), timeout=BUILD_TIMEOUT)
        except asyncio.TimeoutError:
            proc.kill()
            try:
                await asyncio.wait_for(proc.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                pass
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="docker build timed out after 30 minutes.",
            )
        if proc.returncode != 0:
            err = output_bytes.decode(errors="replace").strip()
            _logger.error("[%s] docker build failed: %s", req.name, err)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"docker build failed: {err[:400]}",
            )

    else:
        image_tag = req.image  
        
        # Pull the image if it isnt already present locally
        code, _, _ = await run_subprocess(["docker", "image", "inspect", image_tag])
        if code != 0:
            _logger.info("[%s] Pulling image %s …", req.name, image_tag)
            proc = await asyncio.create_subprocess_exec(
                "docker", "pull", image_tag,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )

            try:
                _, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=PULL_TIMEOUT)
            except asyncio.TimeoutError:
                proc.kill()

                try:
                    await asyncio.wait_for(proc.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    pass
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail=f"docker pull '{image_tag}' timed out after 30 minutes.",
                )
            

            if proc.returncode != 0:
                err = stderr_bytes.decode(errors="replace").strip()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"docker pull failed: {err[:400]}",
                )

    # run container

    run_cmd = [
        "docker", "run", "-d",
        "--name", req.name,
        "--label", MANAGED_LABEL,
        "--restart", req.restart.value,
    ]


    for port in req.ports:
        run_cmd += ["-p", port]

    for vol in req.volumes:
        run_cmd += ["-v", vol]

    for key, val in req.env.items():
        run_cmd += ["-e", f"{key}={val}"]

    if req.memory:
        run_cmd += ["--memory", req.memory]

    if req.cpus is not None:
        run_cmd += ["--cpus", str(req.cpus)]

    if req.workdir:
        run_cmd += ["-w", req.workdir]
    run_cmd.append(image_tag)

    if req.command:
        run_cmd.extend(req.command)




    code, _, stderr = await run_subprocess(run_cmd, timeout=30.0)
    if code != 0:
        # cleanup image on fail
        if req.dockerfile_path:
            await run_subprocess(["docker", "rmi", image_tag])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"docker run failed: {stderr[:400]}",
        )

    _logger.info("[%s] Container created successfully.", req.name)
    return await _inspect_container(req.name)


async def start_container(name: str) -> tuple[bool, str]:
    await _validate_managed(name)
    code, _, stderr = await run_subprocess(["docker", "start", name])
    return code == 0, stderr if code != 0 else "Container started."


async def stop_container(name: str) -> tuple[bool, str]:
    await _validate_managed(name)
    code, _, stderr = await run_subprocess(["docker", "stop", name])
    return code == 0, stderr if code != 0 else "Container stopped."


async def restart_container(name: str) -> tuple[bool, str]:
    await _validate_managed(name)
    code, _, stderr = await run_subprocess(["docker", "restart", name])
    return code == 0, stderr if code != 0 else "Container restarted."


async def remove_container(name: str) -> None:
    await _validate_managed(name)



    await run_subprocess(["docker", "stop", name])

    code, _, stderr = await run_subprocess(["docker", "rm", name])
    if code != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove container: {stderr}",
        )



    local_image = f"pi-dashboard/{name}:latest"
    img_code, _, _ = await run_subprocess(["docker", "image", "inspect", local_image])
    if img_code == 0:
        await run_subprocess(["docker", "rmi", local_image])

    _logger.info("[%s] Container removed.", name)


async def get_container_logs(name: str, tail: int = 200) -> str:
    """Return the last N log lines from a managed container (stdout + stderr merged)."""
    await _validate_managed(name)

    proc = await asyncio.create_subprocess_exec(
        "docker", "logs", "--tail", str(tail), name,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,  # merge stderr into stdout
    )
    try:
        stdout_bytes, _ = await asyncio.wait_for(proc.communicate(), timeout=15.0)
    except asyncio.TimeoutError:
        proc.kill()
        try:
            await asyncio.wait_for(proc.wait(), timeout=2.0)
        except asyncio.TimeoutError:
            pass
        return "[Log retrieval timed out]"

    return stdout_bytes.decode(errors="replace")


async def stream_container_logs(name: str):

    await _validate_managed(name)
    proc = await asyncio.create_subprocess_exec(
        "docker", "logs", "-f", "--tail", "50", name,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,  # merge container stderr into the stream
    )
    try:
        while True:
            try:
                raw_line = await asyncio.wait_for(
                    proc.stdout.readline(), timeout=_LOG_LINE_TIMEOUT
                )
            except asyncio.TimeoutError:
                break
            if not raw_line:
                break
            yield raw_line.decode(errors="replace").rstrip("\n")
    finally:
        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=2.0)
        except asyncio.TimeoutError:
            proc.kill()
            try:
                await asyncio.wait_for(proc.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                pass

# stream container creation

_CTRL = "\x01"  # prefix byte for control json messages


def _ctrl(obj: dict) -> str:
    return _CTRL + json.dumps(obj)


async def _stream_proc(proc: asyncio.subprocess.Process, line_timeout: float = 300.0):


    assert proc.stdout is not None
    while True:
        try:
            raw = await asyncio.wait_for(proc.stdout.readline(), timeout=line_timeout)
        except asyncio.TimeoutError:
            proc.kill()
            try:
                await asyncio.wait_for(proc.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                pass
            raise
        if not raw:
            break
        yield raw.decode(errors="replace")
    try:
        await asyncio.wait_for(proc.wait(), timeout=10.0)
    except asyncio.TimeoutError:
        proc.kill()


async def create_container_stream(req: CreateContainerRequest, settings: Settings):




    root = settings.file_manager_root

    # name conflict check
    code, _, _ = await run_subprocess(["docker", "inspect", req.name])
    if code == 0:
        yield _ctrl({"type": "error", "message": f"A container named '{req.name}' already exists."})
        return

    #validations
    try:
        _validate_ports(req.ports)
        _validate_volumes(req.volumes, root)
    except HTTPException as exc:
        yield _ctrl({"type": "error", "message": exc.detail})
        return

    if req.memory and not _MEMORY_RE.match(req.memory):
        yield _ctrl({"type": "error", "message": f"Invalid memory format '{req.memory}'. Use e.g. '256m' or '1g'."})
        return

    if req.workdir and not req.workdir.startswith("/"):
        yield _ctrl({"type": "error", "message": "workdir must be an absolute path."})
        return

    # build or pull image
    if req.dockerfile_path:
        dockerfile = Path(req.dockerfile_path)
        if not dockerfile.is_absolute() or not dockerfile.is_file():
            yield _ctrl({"type": "error", "message": f"dockerfile_path '{req.dockerfile_path}' must be an existing absolute file path."})
            return

        root_resolved = Path(root).resolve()
        if not dockerfile.resolve().is_relative_to(root_resolved):
            yield _ctrl({"type": "error", "message": f"dockerfile_path must be within {root}."})
            return

        if req.context_path and not Path(req.context_path).is_absolute():
            yield _ctrl({"type": "error", "message": "context_path must be an absolute path."})
            return

        context = Path(req.context_path) if req.context_path else dockerfile.parent
        context_resolved = context.resolve()
        if not (context_resolved == root_resolved or context_resolved.is_relative_to(root_resolved)):
            yield _ctrl({"type": "error", "message": f"context_path must be within {root}."})
            return

        image_tag = f"pi-dashboard/{req.name}:latest"
        yield f"==> Building image {image_tag} ...\n"
        proc = await asyncio.create_subprocess_exec(
            "docker", "build", "--progress=plain",
            "-t", image_tag, "-f", str(dockerfile), str(context),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )


        try:
            async for line in _stream_proc(proc):
                yield line
        except asyncio.TimeoutError:
            yield _ctrl({"type": "error", "message": "docker build timed out (no output for 5 minutes)."})
            return

        if proc.returncode != 0:
            yield _ctrl({"type": "error", "message": "docker build failed — see output above."})
            return

    else:
        image_tag = req.image  

        code, _, _ = await run_subprocess(["docker", "image", "inspect", image_tag])
        if code != 0:
            yield f"==> Pulling image {image_tag} ...\n"
            proc = await asyncio.create_subprocess_exec(
                "docker", "pull", image_tag,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )

            try:
                async for line in _stream_proc(proc):
                    yield line

            except asyncio.TimeoutError:
                yield _ctrl({"type": "error", "message": "docker pull timed out (no output for 5 minutes)."})
                return

            if proc.returncode != 0:
                yield _ctrl({"type": "error", "message": "docker pull failed — see output above."})
                return
        else:
            yield f"==> Image {image_tag} already present locally.\n"

    # run
    yield "==> Starting container ...\n"
    run_cmd = [
        "docker", "run", "-d",
        "--name", req.name,
        "--label", MANAGED_LABEL,
        "--restart", req.restart.value,
    ]


    for port in req.ports:
        run_cmd += ["-p", port]

    for vol in req.volumes:
        run_cmd += ["-v", vol]
    for key, val in req.env.items():

        run_cmd += ["-e", f"{key}={val}"]

    if req.memory:
        run_cmd += ["--memory", req.memory]

    if req.cpus is not None:
        run_cmd += ["--cpus", str(req.cpus)]

    if req.workdir:
        run_cmd += ["-w", req.workdir]
    run_cmd.append(image_tag)

    if req.command:
        run_cmd.extend(req.command)

        

    code, _, stderr = await run_subprocess(run_cmd, timeout=30.0)
    if code != 0:
        if req.dockerfile_path:
            await run_subprocess(["docker", "rmi", image_tag])
        yield _ctrl({"type": "error", "message": f"docker run failed: {stderr[:400]}"})
        return

    _logger.info("[%s] Container created via stream.", req.name)
    container = await _inspect_container(req.name)
    yield _ctrl({"type": "done", "container": container.model_dump()})
