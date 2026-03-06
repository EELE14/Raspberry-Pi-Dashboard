from pydantic import BaseModel, Field

# doesnt return the actual token value
class GitConfig(BaseModel):
    repo_url: str
    branch: str
    working_dir: str
    has_token: bool  


class GitConfigSave(BaseModel):
    repo_url: str = Field(max_length=512)
    branch: str = Field(default="main", max_length=128)
    working_dir: str = Field(max_length=512)
    # None  > keep existing token unchanged
    # ""    > clear the stored token
    # str   > replace with new token
    access_token: str | None = None


class SaveConfigResponse(BaseModel):
    saved: bool
    has_token: bool
