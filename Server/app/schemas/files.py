from typing import Literal

from pydantic import BaseModel, Field


class FileEntry(BaseModel):
    name: str
    path: str           # Absolute path on the Pi
    is_dir: bool
    size_bytes: int | None  # None for directories
    modified_at: float  # Unix timestamp


class DirectoryListing(BaseModel):
    path: str
    entries: list[FileEntry]


class FileContent(BaseModel):
    path: str
    content: str


class WriteRequest(BaseModel):
    path: str = Field(min_length=1)
    content: str = Field(max_length=1_048_576)  # 1 MB limit


class CreateDirRequest(BaseModel):
    path: str


class DeleteResponse(BaseModel):
    path: str
    deleted: bool


class UploadResponse(BaseModel):
    path: str        # Absolute path on the Pi where the file was written
    filename: str    # filename stripped of directory components
    size_bytes: int
    modified_at: float  # Unix timestamp 


class ExtractRequest(BaseModel):
    path: str
    dest_dir: str | None = None


class ExtractResponse(BaseModel):
    extracted: list[str]
    count: int


class CreateArchiveRequest(BaseModel):
    paths: list[str] = Field(min_length=1)  # at least one source path required
    dest_path: str = Field(min_length=1)
    format: Literal["zip", "tar.gz"]


class CreateArchiveResponse(BaseModel):
    path: str
