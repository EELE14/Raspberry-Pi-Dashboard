from fastapi import APIRouter, Depends, Query, Request, status

from app.auth import verify_token
from app.config import Settings, get_settings
from app.schemas.containers import (
    ContainerActionResponse,
    ContainerInfo,
    ContainerLogsResponse,
    CreateContainerRequest,
    DockerStatus,
)
from app.services import audit, docker_manager

router = APIRouter(
    prefix="/containers",
    tags=["containers"],
    dependencies=[Depends(verify_token)],
)


@router.get(
    "/status",
    response_model=DockerStatus,
    summary="Docker installation and daemon status",
)
async def docker_status() -> DockerStatus:
    return await docker_manager.get_docker_status()


@router.get(
    "",
    response_model=list[ContainerInfo],
    summary="List all dashboard-managed containers",
)
async def list_containers() -> list[ContainerInfo]:
    return await docker_manager.list_containers()


@router.post(
    "",
    response_model=ContainerInfo,
    status_code=status.HTTP_201_CREATED,
    summary="Create and start a new managed container",
    description=(
        "Creates a container from a Docker image or a Dockerfile. "
        "The container is labelled so it can be identified as dashboard-managed. "
        "If an image is used and not present locally, it is pulled automatically "
        "(this may take several minutes on a slow connection)."
    ),
)


async def create_container(
    body: CreateContainerRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> ContainerInfo:
    info = await docker_manager.create_container(body, settings)
    await audit.log_event(
        audit.get_client_ip(request), "container", f"created container {body.name}", 201
    )

    return info


@router.get(
    "/{name}",
    response_model=ContainerInfo,
    summary="Get status of a single managed container",
)
async def get_container(name: str) -> ContainerInfo:
    return await docker_manager.get_container(name)


@router.post(
    "/{name}/start",
    response_model=ContainerActionResponse,
    summary="Start a managed container",
)
async def start_container(name: str, request: Request) -> ContainerActionResponse:

    success, message = await docker_manager.start_container(name)

    await audit.log_event(audit.get_client_ip(request), "container", f"started {name}", 200 if success else 500)

    return ContainerActionResponse(name=name, action="start", success=success, message=message)


@router.post(
    "/{name}/stop",
    response_model=ContainerActionResponse,
    summary="Stop a managed container",
)
async def stop_container(name: str, request: Request) -> ContainerActionResponse:

    success, message = await docker_manager.stop_container(name)

    await audit.log_event(audit.get_client_ip(request), "container", f"stopped {name}", 200 if success else 500)

    return ContainerActionResponse(name=name, action="stop", success=success, message=message)


@router.post(
    "/{name}/restart",
    response_model=ContainerActionResponse,
    summary="Restart a managed container",
)
async def restart_container(name: str, request: Request) -> ContainerActionResponse:
    success, message = await docker_manager.restart_container(name)

    await audit.log_event(audit.get_client_ip(request), "container", f"restarted {name}", 200 if success else 500)
    
    return ContainerActionResponse(name=name, action="restart", success=success, message=message)


@router.delete(
    "/{name}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Stop and remove a managed container",
)
async def remove_container(name: str, request: Request) -> None:
    await docker_manager.remove_container(name)
    await audit.log_event(audit.get_client_ip(request), "container", f"removed container {name}", 204)


@router.get(
    "/{name}/logs",
    response_model=ContainerLogsResponse,
    summary="Get last N log lines from a managed container",
)
async def get_container_logs(
    name: str,
    tail: int = Query(default=200, ge=1, le=2000, description="Number of log lines to return"),
) -> ContainerLogsResponse:
    logs = await docker_manager.get_container_logs(name, tail=tail)
    return ContainerLogsResponse(name=name, lines=len(logs.splitlines()), logs=logs)
