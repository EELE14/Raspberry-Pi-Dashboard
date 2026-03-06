import { useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  File,
  ChevronRight,
  Home,
  Plus,
  Trash2,
  Upload,
  RefreshCw,
  Search,
  X,
  PackageOpen,
  Archive,
} from "lucide-react";
import {
  listDirectory,
  createDirectory,
  deletePath,
  uploadFile,
  extractArchive,
  createArchive,
} from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import type { FileEntry } from "../../types/api";
import Button from "../ui/Button";
import { cn } from "../../lib/utils";

interface FileBrowserProps {
  onFileSelect: (entry: FileEntry) => void;
  selectedPath?: string;
  rootPath?: string;
}

const ROOT = import.meta.env.VITE_FILE_ROOT ?? "/home/pi";

const ARCHIVE_EXTS = new Set(["zip", "tar", "gz", "tgz", "bz2", "xz"]);

function isArchive(name: string): boolean {
  const lower = name.toLowerCase();
  if (
    lower.endsWith(".tar.gz") ||
    lower.endsWith(".tar.bz2") ||
    lower.endsWith(".tar.xz")
  )
    return true;
  const ext = lower.split(".").pop() ?? "";
  return ARCHIVE_EXTS.has(ext);
}

export default function FileBrowser({
  onFileSelect,
  selectedPath,
  rootPath = ROOT,
}: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [newDirName, setNewDirName] = useState("");
  const [showNewDir, setShowNewDir] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveName, setArchiveName] = useState("archive.zip");
  const [archiveFormat, setArchiveFormat] = useState<"zip" | "tar.gz">("zip");
  const footerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (footerRef.current)
      footerRef.current.scrollLeft = footerRef.current.scrollWidth;
    setSearch("");
  }, [currentPath]);

  const { data, loading, refetch } = useApi(
    () => listDirectory(currentPath),
    [currentPath],
  );

  const crumbs = buildCrumbs(currentPath, rootPath);

  async function handleDelete(entry: FileEntry) {
    if (!window.confirm(`Delete "${entry.name}"?`)) return;
    setActionLoading(`delete-${entry.path}`);
    try {
      await deletePath(entry.path);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error deleting.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreateDir() {
    if (!newDirName.trim()) return;
    setActionLoading("mkdir");
    setError(null);
    try {
      await createDirectory(`${currentPath}/${newDirName.trim()}`);
      setNewDirName("");
      setShowNewDir(false);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error creating.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setActionLoading("upload");
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await uploadFile(currentPath, file);
      }
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error uploading.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleExtract(entry: FileEntry) {
    setActionLoading(`extract-${entry.path}`);
    setError(null);
    try {
      await extractArchive(entry.path);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error extracting.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreateArchive() {
    if (!archiveName.trim() || !data) return;
    setActionLoading("archive");
    setError(null);
    const paths = data.entries.filter((e) => !e.is_dir).map((e) => e.path);
    if (paths.length === 0) {
      setError("No files to archive.");
      setActionLoading(null);
      return;
    }
    const dest = `${currentPath}/${archiveName.trim()}`;
    try {
      await createArchive(paths, dest, archiveFormat);
      setShowArchiveModal(false);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error creating archive.");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[oklch(22%_0.01_260)] flex-wrap">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setCurrentPath(rootPath)}
          title="Home"
        >
          <Home size={13} />
        </Button>
        <Button size="sm" variant="ghost" onClick={refetch} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </Button>
        <div className="w-px h-4 bg-[oklch(25%_0.01_260)]" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowNewDir((v) => !v)}
          title="Create folder"
        >
          <Plus size={13} />
        </Button>
        <label
          title="Upload file"
          className={cn(
            "cursor-pointer inline-flex items-center gap-1.5 font-medium transition-colors",
            "px-2.5 py-1 text-xs rounded-md",
            "bg-transparent hover:bg-[oklch(20%_0.01_260)] text-[oklch(75%_0.01_260)]",
            actionLoading === "upload" && "opacity-50 pointer-events-none",
          )}
        >
          {actionLoading === "upload" ? (
            <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Upload size={13} />
          )}
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </label>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowArchiveModal(true)}
          title="Create archive from current directory"
          loading={actionLoading === "archive"}
        >
          <Archive size={13} />
        </Button>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[oklch(20%_0.01_260)]">
        <Search
          size={12}
          className="text-[oklch(40%_0.01_260)] flex-shrink-0"
        />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setSearch("")}
          placeholder="Search…"
          className="flex-1 text-xs bg-transparent text-[oklch(80%_0.01_260)] placeholder-[oklch(35%_0.01_260)] focus:outline-none"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="text-[oklch(40%_0.01_260)] hover:text-white transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* New folder input */}
      {showNewDir && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[oklch(13%_0.01_260)] border-b border-[oklch(22%_0.01_260)]">
          <input
            autoFocus
            type="text"
            value={newDirName}
            onChange={(e) => setNewDirName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateDir();
              if (e.key === "Escape") setShowNewDir(false);
            }}
            placeholder="Folder name…"
            className="flex-1 text-sm px-2 py-1 rounded bg-[oklch(11%_0.01_260)] border border-[oklch(25%_0.01_260)] text-white placeholder-[oklch(35%_0.01_260)] focus:outline-none focus:border-[oklch(65%_0.18_250)]"
          />
          <Button
            size="sm"
            variant="primary"
            onClick={handleCreateDir}
            loading={actionLoading === "mkdir"}
          >
            Create
          </Button>
        </div>
      )}

      {/* Create archive modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-[oklch(14%_0.01_260)] border border-[oklch(22%_0.01_260)] shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-[oklch(65%_0.18_250)]/15">
                <Archive size={22} className="text-[oklch(65%_0.18_250)]" />
              </div>
              <p className="text-base font-semibold text-white">
                Create Archive
              </p>
            </div>
            <p className="text-sm text-[oklch(50%_0.01_260)] -mt-1">
              Archives all files in the current directory.
            </p>
            <input
              autoFocus
              type="text"
              value={archiveName}
              onChange={(e) => setArchiveName(e.target.value)}
              placeholder="archive.zip"
              className="text-sm px-3 py-2 rounded-lg bg-[oklch(11%_0.01_260)] border border-[oklch(25%_0.01_260)] text-white placeholder-[oklch(35%_0.01_260)] focus:outline-none focus:border-[oklch(65%_0.18_250)]"
            />
            <div className="flex gap-2">
              {(["zip", "tar.gz"] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => {
                    setArchiveFormat(fmt);
                    setArchiveName(`archive.${fmt}`);
                  }}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    archiveFormat === fmt
                      ? "bg-[oklch(65%_0.18_250)]/20 border-[oklch(65%_0.18_250)]/50 text-[oklch(75%_0.18_250)]"
                      : "bg-transparent border-[oklch(25%_0.01_260)] text-[oklch(50%_0.01_260)] hover:border-[oklch(35%_0.01_260)]",
                  )}
                >
                  .{fmt}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowArchiveModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleCreateArchive}
                loading={actionLoading === "archive"}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-3 py-2 text-xs text-[oklch(45%_0.01_260)] overflow-x-auto whitespace-nowrap border-b border-[oklch(20%_0.01_260)]">
        {crumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={11} className="flex-shrink-0" />}
            <button
              onClick={() => setCurrentPath(crumb.path)}
              className={cn(
                "hover:text-white transition-colors truncate max-w-28",
                i === crumbs.length - 1
                  ? "text-[oklch(75%_0.01_260)] font-medium"
                  : "",
              )}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-2 text-xs text-[oklch(65%_0.18_25)] bg-[oklch(60%_0.22_25)]/10 border border-[oklch(60%_0.22_25)]/20 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading && !data && (
          <div className="flex items-center justify-center py-10 text-[oklch(40%_0.01_260)] text-sm">
            Loading…
          </div>
        )}
        {data && data.entries.length === 0 && (
          <div className="flex items-center justify-center py-10 text-[oklch(40%_0.01_260)] text-sm italic">
            Empty directory
          </div>
        )}
        {data &&
          search &&
          data.entries.filter((e) =>
            e.name.toLowerCase().includes(search.toLowerCase()),
          ).length === 0 && (
            <div className="flex items-center justify-center py-10 text-[oklch(40%_0.01_260)] text-sm italic">
              No results for "{search}"
            </div>
          )}
        {data?.entries
          .filter(
            (e) =>
              !search || e.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((entry) => (
            <div
              key={entry.path}
              className={cn(
                "flex items-center justify-between px-3 py-2 cursor-pointer group hover:bg-[oklch(20%_0.01_260)] transition-colors",
                selectedPath === entry.path && "bg-[oklch(65%_0.18_250)]/10",
              )}
              onClick={() => {
                if (entry.is_dir) setCurrentPath(entry.path);
                else onFileSelect(entry);
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {entry.is_dir ? (
                  <FolderOpen
                    size={15}
                    className="text-[oklch(65%_0.18_80)] flex-shrink-0"
                  />
                ) : (
                  <File
                    size={15}
                    className="text-[oklch(50%_0.01_260)] flex-shrink-0"
                  />
                )}
                <span
                  className={cn(
                    "text-sm truncate",
                    entry.is_dir ? "text-white" : "text-[oklch(75%_0.01_260)]",
                  )}
                >
                  {entry.name}
                </span>
                {!entry.is_dir && entry.size_bytes != null && (
                  <span className="text-xs text-[oklch(38%_0.01_260)] flex-shrink-0 hidden group-hover:inline">
                    {formatSize(entry.size_bytes)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                {!entry.is_dir && isArchive(entry.name) && (
                  <button
                    className="text-[oklch(55%_0.18_250)] hover:text-[oklch(70%_0.18_250)] transition-colors p-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExtract(entry);
                    }}
                    disabled={actionLoading === `extract-${entry.path}`}
                    title="Extract archive"
                  >
                    {actionLoading === `extract-${entry.path}` ? (
                      <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <PackageOpen size={13} />
                    )}
                  </button>
                )}
                <button
                  className="text-[oklch(38%_0.01_260)] hover:text-[oklch(60%_0.22_25)] transition-all p-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(entry);
                  }}
                  disabled={actionLoading === `delete-${entry.path}`}
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Footer */}
      <div
        ref={footerRef}
        className="flex items-center gap-0.5 px-3 py-1.5 border-t border-[oklch(20%_0.01_260)] text-xs font-mono overflow-x-auto whitespace-nowrap"
      >
        {buildCrumbs(currentPath, rootPath).map((crumb, i, arr) => (
          <span key={crumb.path} className="flex items-center gap-0.5">
            {i > 0 && (
              <span className="text-[oklch(28%_0.01_260)] select-none">/</span>
            )}
            <button
              onClick={() => setCurrentPath(crumb.path)}
              className={cn(
                "hover:text-white transition-colors px-0.5 rounded",
                i === arr.length - 1
                  ? "text-[oklch(55%_0.01_260)] cursor-default"
                  : "text-[oklch(35%_0.01_260)] hover:text-[oklch(70%_0.01_260)]",
              )}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function buildCrumbs(current: string, root: string) {
  const parts = current.replace(root, "").split("/").filter(Boolean);
  const crumbs = [{ label: "~", path: root }];
  let accumulated = root;
  for (const part of parts) {
    accumulated = `${accumulated}/${part}`;
    crumbs.push({ label: part, path: accumulated });
  }
  return crumbs;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
