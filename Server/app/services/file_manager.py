import re
import shutil
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.config import get_settings as _get_settings
from app.schemas.files import DeleteResponse, DirectoryListing, FileContent, FileEntry, UploadResponse

_UNSAFE_FILENAME_CHARS = re.compile(r"[\x00-\x1f\x7f/\\]")


# override in .env
_UPLOAD_MAX_BYTES: int = _get_settings().upload_max_bytes


def _safe_resolve(raw_path: str, root: str) -> Path:




    root_path = Path(root).resolve()
    try:
        raw = Path(raw_path)


        target = (raw if raw.is_absolute() else root_path / raw).resolve()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid path.",
        )


    try:
        target.relative_to(root_path)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: path is outside the allowed directory.",
        )
    return target


def list_dir(raw_path: str, root: str) -> DirectoryListing:
    target = _safe_resolve(raw_path, root)

    if not target.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Path not found.")
    if not target.is_dir():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path is not a directory.")

    entries: list[FileEntry] = []
    for item in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        try:



            stat_info = item.stat()
        except OSError:
            try:
                stat_info = item.lstat()
            except OSError:
                continue  


        entries.append(
            FileEntry(
                name=item.name,
                path=str(item),
                is_dir=item.is_dir(),
                size_bytes=stat_info.st_size if item.is_file() else None,
                modified_at=stat_info.st_mtime,
            )
        )

    return DirectoryListing(path=str(target), entries=entries)


def read_file(raw_path: str, root: str) -> FileContent:
    target = _safe_resolve(raw_path, root)

    if not target.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    
    if not target.is_file():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path is not a file.")

    try:
        content = target.read_text(encoding="utf-8", errors="replace")
    except OSError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="File operation failed.")

    return FileContent(path=str(target), content=content)


def write_file(raw_path: str, content: str, root: str) -> FileContent:


    target = _safe_resolve(raw_path, root)

    if target.is_dir():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path is a directory.")

    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        target.write_text(content, encoding="utf-8")

    except OSError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="File operation failed.")

    return FileContent(path=str(target), content=content)


def create_dir(raw_path: str, root: str) -> DirectoryListing:
    target = _safe_resolve(raw_path, root)

    if target.exists():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Path already exists.")

    try:
        target.mkdir(parents=True, exist_ok=False)
    except OSError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="File operation failed.")

    return DirectoryListing(path=str(target), entries=[])


def delete_path(raw_path: str, root: str) -> DeleteResponse:
    target = _safe_resolve(raw_path, root)

    # Prevent deleting the root
    if str(target) == str(Path(root).resolve()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete the root directory.",
        )

    if not target.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Path not found.")




    raw = Path(raw_path)
    pre_resolved = raw if raw.is_absolute() else Path(root).resolve() / raw

    try:
        try:

            pre_resolved.unlink()

        except (IsADirectoryError, NotADirectoryError):

            shutil.rmtree(target)
    except OSError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="File operation failed.")

    return DeleteResponse(path=str(target), deleted=True)


async def upload_file(dir_path: str, file: UploadFile, root: str) -> UploadResponse:
    target_dir = _safe_resolve(dir_path, root)

    if not target_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target directory not found.")
    if not target_dir.is_dir():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target path is not a directory.")



    raw_name = Path(file.filename or "upload").name
    filename = _UNSAFE_FILENAME_CHARS.sub("", raw_name)


    if not filename or filename in (".", ".."):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid filename.")



    target = _safe_resolve(str(target_dir / filename), root)

    tmp_path = target.with_name(f".{target.name}.upload_tmp")
    size = 0
    try:
        with tmp_path.open("wb") as f:
            while True:
                chunk = await file.read(65536)
                if not chunk:
                    break
                size += len(chunk)
                if size > _UPLOAD_MAX_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds the {_UPLOAD_MAX_BYTES // (1024 * 1024)} MB upload limit.",
                    )
                f.write(chunk)
        tmp_path.replace(target)
    except HTTPException:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise
    except OSError:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="File operation failed.")

    return UploadResponse(
        path=str(target),
        filename=filename,
        size_bytes=size,
        modified_at=target.stat().st_mtime,
    )
