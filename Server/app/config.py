from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        populate_by_name=True,
    )

# override limits in env
    api_token_hash: str




    bots_str: str = Field(default="", alias="bots")



    file_manager_root: str = "/home/pi"



    service_dir: str = "/etc/systemd/system"



    port: int = 8080



    enable_docs: bool = False




    cors_origins_str: str = Field(default="", alias="cors_origins")



    max_terminal_sessions: int = 3



    upload_max_mb: int = 50


    audit_max_rows: int = 10_000



    ban_duration_minutes: int = 60


    brute_force_threshold: int = 10


    brute_force_window_seconds: int = 300



    @property
    def upload_max_bytes(self) -> int:
        return self.upload_max_mb * 1024 * 1024

    @property
    def bots(self) -> list[str]:
        return [b.strip() for b in self.bots_str.split(",") if b.strip()]

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_str.split(",") if o.strip()]

    @property
    def bot_service_names(self) -> list[str]:
        return [f"{b}.service" for b in self.bots]


@lru_cache
def get_settings() -> Settings:
    return Settings()
