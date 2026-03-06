from fastapi import APIRouter, Depends, Query, Request, status

from app.auth import verify_token
from app.config import Settings, get_settings
from app.schemas.bots import BotActionResponse, BotLogsResponse, BotStatus, BotStatusList, CreateBotRequest, DeleteBotResponse
from app.services import audit, bot_manager, systemd
from app.services.bot_manager import make_bot_status

router = APIRouter(
    prefix="/bots",
    tags=["bots"],
    dependencies=[Depends(verify_token)],
)


@router.post(
    "",
    response_model=BotStatus,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new bot service",
    description="Creates and enables a systemd service. The bot is NOT started unless auto_start=true.",
)
async def create_bot(body: CreateBotRequest, request: Request, settings: Settings = Depends(get_settings)) -> BotStatus:
    await bot_manager.add_bot(body.name, body.exec_start, body.description, settings, body.venv_path, body.install_requirements)

    settings = get_settings()
    if body.auto_start:

        await systemd.start_bot(body.name, settings)

    state = await systemd.get_status(body.name, settings)

    await audit.log_event(audit.get_client_ip(request), "bot", f"created bot {body.name}", 201)

    return make_bot_status(body.name, state)


@router.delete("/{bot_name}", response_model=DeleteBotResponse, summary="Delete a bot service")
async def delete_bot(bot_name: str, request: Request, settings: Settings = Depends(get_settings)) -> DeleteBotResponse:

    await bot_manager.remove_bot(bot_name, settings)

    await audit.log_event(audit.get_client_ip(request), "bot", f"deleted bot {bot_name}", 200)

    return DeleteBotResponse(name=bot_name, deleted=True)


@router.get("", response_model=BotStatusList, summary="List all bots with status")

async def list_bots(settings: Settings = Depends(get_settings)) -> BotStatusList:

    statuses: list[BotStatus] = []
    for bot_name in settings.bots:
        state = await systemd.get_status(bot_name, settings)
        statuses.append(make_bot_status(bot_name, state))

    return BotStatusList(bots=statuses)


@router.get("/{bot_name}", response_model=BotStatus, summary="Get single bot status")
async def get_bot(bot_name: str, settings: Settings = Depends(get_settings)) -> BotStatus:

    state = await systemd.get_status(bot_name, settings)

    return make_bot_status(bot_name, state)


@router.post("/{bot_name}/start", response_model=BotActionResponse, summary="Start a bot")
async def start_bot(bot_name: str, request: Request, settings: Settings = Depends(get_settings)) -> BotActionResponse:

    success, message = await systemd.start_bot(bot_name, settings)
    await audit.log_event(audit.get_client_ip(request), "bot", f"started {bot_name}", 200)

    return BotActionResponse(name=bot_name, action="start", success=success, message=message)


@router.post("/{bot_name}/stop", response_model=BotActionResponse, summary="Stop a bot")
async def stop_bot(bot_name: str, request: Request, settings: Settings = Depends(get_settings)) -> BotActionResponse:

    success, message = await systemd.stop_bot(bot_name, settings)
    await audit.log_event(audit.get_client_ip(request), "bot", f"stopped {bot_name}", 200)

    return BotActionResponse(name=bot_name, action="stop", success=success, message=message)


@router.post("/{bot_name}/restart", response_model=BotActionResponse, summary="Restart a bot")
async def restart_bot(bot_name: str, request: Request, settings: Settings = Depends(get_settings)) -> BotActionResponse:

    success, message = await systemd.restart_bot(bot_name, settings)
    await audit.log_event(audit.get_client_ip(request), "bot", f"restarted {bot_name}", 200)

    return BotActionResponse(name=bot_name, action="restart", success=success, message=message)


@router.get("/{bot_name}/logs", response_model=BotLogsResponse, summary="Get last N log lines (REST)")
async def get_logs(
    bot_name: str,
    lines: int = Query(default=100, ge=1, le=1000),
    settings: Settings = Depends(get_settings),
    
) -> BotLogsResponse:
    log_output = await systemd.get_logs(bot_name, settings, lines=lines)
    return BotLogsResponse(name=bot_name, lines=lines, logs=log_output)
