from pydantic import BaseModel, Field


class BotStatus(BaseModel):
    name: str
    service: str
    status: str  # "active", "inactive", "failed", "unknown"
    is_running: bool


class BotStatusList(BaseModel):
    bots: list[BotStatus]


class BotActionResponse(BaseModel):
    name: str
    action: str  # "start" ; "stop" ; "restart"
    success: bool
    message: str


class BotLogsResponse(BaseModel):
    name: str
    lines: int
    logs: str


class CreateBotRequest(BaseModel):
    name: str = Field(
        pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$",
        description="Service name: starts with letter/digit, then letters/digits/underscore/dash (1-32 chars)",
    )
    exec_start: str = Field(
        max_length=512,
        description="Absolute path to the executable, e.g. /home/pi/bots/mybot/run.sh",
    )
    description: str = Field(
        default="",
        max_length=128,
        description="Human-readable service description shown in systemctl status",
    )
    auto_start: bool = Field(
        default=False,
        description="Automatically start the service after creation (default: false)",
    )
    venv_path: str | None = Field(
        default=None,
        max_length=256,
        description="If set, a Python venv is created at this absolute path before the service is registered.",
    )
    install_requirements: bool = Field(
        default=False,
        description="If true, runs pip install -r requirements.txt in the script directory after venv creation.",
    )


class DeleteBotResponse(BaseModel):
    name: str
    deleted: bool
