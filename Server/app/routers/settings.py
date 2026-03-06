from fastapi import APIRouter, Depends

from app.auth import verify_token
from app.schemas.settings import GitConfig, GitConfigSave, SaveConfigResponse
from app.services import update_manager

router = APIRouter(
    prefix="/settings",
    tags=["settings"],
    dependencies=[Depends(verify_token)],
)


@router.get("/git", response_model=GitConfig, summary="Get git update configuration")
def get_git_config() -> GitConfig:

    cfg = update_manager.get_git_config()
    return GitConfig(**cfg)


@router.put("/git", response_model=SaveConfigResponse, summary="Save git update configuration")
def save_git_config(body: GitConfigSave) -> SaveConfigResponse:

    update_manager.save_git_config(
        repo_url=body.repo_url,
        branch=body.branch,
        working_dir=body.working_dir,
        access_token=body.access_token,
    )
    cfg = update_manager.get_git_config()
    
    return SaveConfigResponse(saved=True, has_token=cfg["has_token"])
