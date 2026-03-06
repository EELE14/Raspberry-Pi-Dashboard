import tarfile
import zipfile
from pathlib import Path

from fastapi import HTTPException

from app.services.file_manager import _safe_resolve

# limit set for my pi specifically
_MAX_EXTRACT_BYTES = 512 * 1024 * 1024  # 512 MB


def _check_zip_slip(member_path: str, dest_dir: Path) -> None:

    resolved = (dest_dir / member_path).resolve()
    try:
        resolved.relative_to(dest_dir.resolve())

    except ValueError:
        raise HTTPException(
            status_code=400, detail=f"Zip-slip attempt blocked: {member_path}"
        )


def _check_extract_size(total_bytes: int) -> None:
    if total_bytes > _MAX_EXTRACT_BYTES:
        mb = total_bytes // (1024 * 1024)
        limit_mb = _MAX_EXTRACT_BYTES // (1024 * 1024)

        raise HTTPException(
            status_code=413,
            detail=f"Archive would expand to {mb} MB which exceeds the {limit_mb} MB extraction limit.",
        )


def extract_archive(path: str, dest_dir: str | None, root: str) -> list[str]:
    safe_path = _safe_resolve(path, root)

    if not safe_path.exists() or not safe_path.is_file():
        raise HTTPException(status_code=404, detail="Archive not found.")

    dest = _safe_resolve(dest_dir, root) if dest_dir else safe_path.parent
    dest.mkdir(parents=True, exist_ok=True)

    name = safe_path.name.lower()
    extracted: list[str] = []

    if name.endswith(".zip"):
        with zipfile.ZipFile(safe_path, "r") as zf:

            _check_extract_size(sum(m.file_size for m in zf.infolist()))

            for member in zf.namelist():
                _check_zip_slip(member, dest)

            zf.extractall(dest)

            extracted = [str(dest / m) for m in zf.namelist()]

    elif name.endswith((".tar.gz", ".tgz", ".tar.bz2", ".tar.xz", ".tar")):
        mode = "r:*"
        with tarfile.open(safe_path, mode) as tf:
            members = tf.getmembers()
            _check_extract_size(sum(m.size for m in members if m.isreg()))

            for member in members:

                if member.name:
                    _check_zip_slip(member.name, dest)

            tf.extractall(dest)
            extracted = [str(dest / m.name) for m in members if m.name]

    else:
        raise HTTPException(status_code=400, detail="Unsupported archive format.")

    return extracted


def create_archive(
    source_paths: list[str],
    dest_path: str,
    fmt: str,
    root: str,
) -> str:
    safe_dest = _safe_resolve(dest_path, root)
    safe_dest.parent.mkdir(parents=True, exist_ok=True)

    safe_sources = [_safe_resolve(p, root) for p in source_paths]

    for src in safe_sources:

        if not src.exists():
            raise HTTPException(status_code=404, detail=f"Source not found: {src}")

    if fmt == "zip":
        with zipfile.ZipFile(safe_dest, "w", compression=zipfile.ZIP_DEFLATED) as zf:

            for src in safe_sources:
                if src.is_file():
                    zf.write(src, src.name)

                else:
                    for f in src.rglob("*"):
                        if f.is_file():
                            zf.write(f, f.relative_to(src.parent))

    elif fmt == "tar.gz":
        with tarfile.open(safe_dest, "w:gz") as tf:
            for src in safe_sources:
                tf.add(src, arcname=src.name)
                
    else:
        raise HTTPException(status_code=400, detail="Format must be 'zip' or 'tar.gz'.")

    return str(safe_dest)
