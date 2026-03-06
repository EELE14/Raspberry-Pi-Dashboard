import re
from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator

_ENV_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class RestartPolicy(str, Enum):
    no = "no"
    always = "always"
    on_failure = "on-failure"
    unless_stopped = "unless-stopped"


class CreateContainerRequest(BaseModel):
    name: str = Field(
        pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$",
        max_length=64,
        description="Container name: starts with letter/digit, then letters/digits/underscore/dash (1-64 chars)",
    )

    image: str | None = Field(
        default=None,
        max_length=256,
        description="Docker image to run, e.g. 'nginx:latest'. Mutually exclusive with dockerfile_path.",
    )

    dockerfile_path: str | None = Field(
        default=None,
        max_length=512,
        description="Absolute path to a Dockerfile within the file manager root. Mutually exclusive with image.",
    )

    context_path: str | None = Field(
        default=None,
        max_length=512,
        description="Build context directory. Defaults to the directory containing dockerfile_path.",
    )

    ports: list[str] = Field(
        default_factory=list,
        description="Port mappings in 'host_port:container_port' format, e.g. ['8080:80'].",
    )

    volumes: list[str] = Field(
        default_factory=list,
        description="Volume mounts in 'host_path:container_path' format. Host path must be within file_manager_root.",
    )

    env: dict[str, str] = Field(
        default_factory=dict,
        description="Environment variables as key-value pairs.",
    )

    restart: RestartPolicy = Field(
        default=RestartPolicy.on_failure,
        description="Container restart policy.",
    )

    command: list[str] | None = Field(
        default=None,
        description="Override the default CMD of the image.",
    )
    
    workdir: str | None = Field(
        default=None,
        max_length=512,
        description="Override the working directory inside the container (must be an absolute path).",
    )

    memory: str | None = Field(
        default=None,
        max_length=16,
        description="Memory limit, e.g. '256m' or '1g'. No limit if omitted.",
    )

    cpus: float | None = Field(
        default=None,
        gt=0,
        le=32.0,
        description="CPU quota, e.g. 0.5 for half a CPU. No limit if omitted.",
    )

    @field_validator("env")
    @classmethod
    def validate_env_keys(cls, v: dict[str, str]) -> dict[str, str]:
        for key in v:

            if not _ENV_KEY_RE.match(key):
                raise ValueError(
                    f"Invalid environment variable name '{key}'. "
                    "Keys must match ^[A-Za-z_][A-Za-z0-9_]*$."
                )
            
        return v

    @model_validator(mode="after")
    def check_image_or_dockerfile(self) -> "CreateContainerRequest":

        has_image = bool(self.image and self.image.strip())
        has_dockerfile = bool(self.dockerfile_path and self.dockerfile_path.strip())

        if not has_image and not has_dockerfile:
            raise ValueError("Either 'image' or 'dockerfile_path' must be provided.")
        
        if has_image and has_dockerfile:
            raise ValueError("Only one of 'image' or 'dockerfile_path' may be set, not both.")
        
        return self


class ContainerInfo(BaseModel):
    id: str                  # short 12-char container ID
    name: str
    image: str
    status: str              # "running" ; "exited" ; "paused" ; "restarting" ; "created"
    is_running: bool
    ports: list[str]         # ["8080->80/tcp"]
    created: str             # ISO timestamp string from Docker


class ContainerActionResponse(BaseModel):
    name: str
    action: str              # "start" ; "stop" ; "restart"
    success: bool
    message: str


class ContainerLogsResponse(BaseModel):
    name: str
    lines: int
    logs: str


class DockerStatus(BaseModel):
    installed: bool
    daemon_reachable: bool
    permission_ok: bool
    client_version: str | None
    server_version: str | None
    arch: str | None
    errors: list[str]
