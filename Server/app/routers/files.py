import mimetypes

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse

from app.auth import verify_token, verify_token_query
from app.config import Settings, get_settings
from app.schemas.files import (
    CreateArchiveRequest,
    CreateArchiveResponse,
    CreateDirRequest,
    DeleteResponse,
    DirectoryListing,
    ExtractRequest,
    ExtractResponse,
    FileContent,
    UploadResponse,
    WriteRequest,
)
from app.services import audit, archive, file_manager

router = APIRouter(
    prefix="/files",
    tags=["files"],
    dependencies=[Depends(verify_token)],
)


@router.get("", response_model=DirectoryListing, summary="List directory contents")
def list_directory(
    path: str | None = Query(default=None, description="Absolute path to list (defaults to FILE_MANAGER_ROOT)"),
    settings: Settings = Depends(get_settings),
) -> DirectoryListing:
    
    return file_manager.list_dir(path or settings.file_manager_root, settings.file_manager_root)


@router.get("/read", response_model=FileContent, summary="Read file content")
def read_file(
    path: str = Query(..., description="Absolute path to the file"),
    settings: Settings = Depends(get_settings),
) -> FileContent:
    
    return file_manager.read_file(path, settings.file_manager_root)


@router.post("/write", response_model=FileContent, status_code=status.HTTP_201_CREATED, summary="Create or overwrite a file")
async def write_file(
    body: WriteRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> FileContent:
    
    result = file_manager.write_file(body.path, body.content, settings.file_manager_root)
    await audit.log_event(audit.get_client_ip(request), "file", f"wrote {body.path}", 201)
    return result


@router.post("/dir", response_model=DirectoryListing, status_code=status.HTTP_201_CREATED, summary="Create a directory")
def create_directory(
    body: CreateDirRequest,
    settings: Settings = Depends(get_settings),
) -> DirectoryListing:
    
    return file_manager.create_dir(body.path, settings.file_manager_root)


@router.delete("", response_model=DeleteResponse, summary="Delete a file or directory")
async def delete(
    path: str = Query(..., description="Absolute path to delete"),
    request: Request = None,
    settings: Settings = Depends(get_settings),
) -> DeleteResponse:
    
    result = file_manager.delete_path(path, settings.file_manager_root)
    await audit.log_event(audit.get_client_ip(request), "file", f"deleted {path}", 200)
    return result


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED, summary="Upload a file")
async def upload_file(
    path: str = Form(..., description="Absolute path to the target directory"),
    file: UploadFile = File(...),
    request: Request = None,
    settings: Settings = Depends(get_settings),
) -> UploadResponse:
    
    result = await file_manager.upload_file(path, file, settings.file_manager_root)
    await audit.log_event(audit.get_client_ip(request), "file", f"uploaded {result.filename} to {path}", 201)
    return result


@router.post("/extract", response_model=ExtractResponse, summary="Extract an archive")
async def extract_archive_endpoint(
    body: ExtractRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> ExtractResponse:
    
    extracted = archive.extract_archive(body.path, body.dest_dir, settings.file_manager_root)
    await audit.log_event(audit.get_client_ip(request), "file", f"extracted {body.path}", 200)
    return ExtractResponse(extracted=extracted, count=len(extracted))


@router.post("/archive", response_model=CreateArchiveResponse, summary="Create an archive")
async def create_archive_endpoint(
    body: CreateArchiveRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> CreateArchiveResponse:
    
    dest = archive.create_archive(body.paths, body.dest_path, body.format, settings.file_manager_root)
    await audit.log_event(audit.get_client_ip(request), "file", f"created archive {body.dest_path}", 200)
    return CreateArchiveResponse(path=dest)




# raw file serving, for images
raw_router = APIRouter(prefix="/files", tags=["files"])


@raw_router.get("/raw", summary="Serve raw file bytes (used for image preview)")
def serve_raw(
    path: str = Query(..., description="Absolute path to the file"),
    _: None = Depends(verify_token_query),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    
    safe = file_manager._safe_resolve(path, settings.file_manager_root)

    if not safe.exists() or not safe.is_file():

        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="File not found.")
    
    mime, _ = mimetypes.guess_type(str(safe))
    
    return FileResponse(str(safe), media_type=mime or "application/octet-stream")
