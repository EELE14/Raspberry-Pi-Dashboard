import { useEffect, useState } from "react";
import { Save, X, RefreshCw, FileX, Image } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { readFile, writeFile, rawFileUrl } from "../../lib/api";
import type { FileEntry } from "../../types/api";
import Button from "../ui/Button";
import type { Extension } from "@codemirror/state";

const dashEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "oklch(16% 0.01 260)",
      color: "oklch(80% 0.01 260)",
    },
    ".cm-content": { caretColor: "#fff" },
    ".cm-cursor": { borderLeftColor: "#fff" },
    ".cm-gutters": {
      backgroundColor: "oklch(14% 0.01 260)",
      color: "oklch(40% 0.01 260)",
      border: "none",
      borderRight: "1px solid oklch(22% 0.01 260)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "oklch(18% 0.01 260)",
      color: "oklch(55% 0.01 260)",
    },
    ".cm-activeLine": { backgroundColor: "oklch(18% 0.01 260)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "oklch(40% 0.12 250)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "oklch(22% 0.01 260)",
      border: "none",
    },
  },
  { dark: true },
);

interface FileEditorProps {
  file: FileEntry;
  onClose: () => void;
}

const IMAGE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "svg",
  "webp",
  "bmp",
  "ico",
  "avif",
]);

const BINARY_EXTS = new Set([
  "mp4",
  "mov",
  "webm",
  "avi",
  "mkv",
  "flv",
  "mp3",
  "wav",
  "ogg",
  "flac",
  "m4a",
  "aac",
  "zip",
  "tar",
  "gz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "pdf",
  "exe",
  "dmg",
  "pkg",
  "deb",
  "rpm",
  "bin",
  "so",
  "dylib",
  "dll",
  "class",
  "pyc",
  "wasm",
]);

function getFileMode(name: string): "image" | "binary" | "text" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (BINARY_EXTS.has(ext)) return "binary";
  return "text";
}

function getLanguageExtension(filename: string): Extension[] {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "py":
      return [python()];
    case "js":
    case "jsx":
      return [javascript({ jsx: true })];
    case "ts":
    case "tsx":
      return [javascript({ typescript: true, jsx: true })];
    case "html":
    case "htm":
      return [html()];
    case "css":
      return [css()];
    case "json":
      return [json()];
    case "md":
    case "markdown":
      return [markdown()];
    default:
      return [];
  }
}

export default function FileEditor({ file, onClose }: FileEditorProps) {
  const mode = getFileMode(file.name);

  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(mode === "text");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [imgError, setImgError] = useState(false);

  const isDirty = content !== originalContent;

  useEffect(() => {
    if (mode !== "text") return;
    setLoading(true);
    setError(null);
    setContent("");
    setOriginalContent("");
    readFile(file.path)
      .then((fc) => {
        setContent(fc.content);
        setOriginalContent(fc.content);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error loading."))
      .finally(() => setLoading(false));
  }, [file.path, mode]);

  useEffect(() => {
    setImgError(false);
  }, [file.path]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await writeFile(file.path, content);
      setOriginalContent(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error saving.");
    } finally {
      setSaving(false);
    }
  }

  // Ctrl+S
  useEffect(() => {
    if (mode !== "text") return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && !saving) handleSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, saving, content, mode]);

  const langExtensions = getLanguageExtension(file.name);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(22%_0.01_260)] gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-white truncate">
            {file.name}
          </span>
          {mode === "text" && isDirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-[oklch(65%_0.18_250)] flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {mode === "text" && saved && (
            <span className="text-xs text-[oklch(65%_0.18_145)]">✓ Saved</span>
          )}
          {mode === "text" && (
            <Button
              size="sm"
              variant="primary"
              onClick={handleSave}
              disabled={!isDirty || loading}
              loading={saving}
            >
              <Save size={13} />
              Save
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose} title="Close">
            <X size={13} />
          </Button>
        </div>
      </div>

      {/* Error (text mode) */}
      {mode === "text" && error && (
        <div className="mx-3 mt-2 text-xs text-[oklch(65%_0.18_25)] bg-[oklch(60%_0.22_25)]/10 border border-[oklch(60%_0.22_25)]/20 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      {/* Binary — cannot open */}
      {mode === "binary" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[oklch(40%_0.01_260)]">
          <FileX size={36} strokeWidth={1.5} />
          <div className="text-center">
            <div className="text-sm font-medium text-[oklch(60%_0.01_260)]">
              Cannot open file
            </div>
            <div className="text-xs mt-1 text-[oklch(38%_0.01_260)]">
              Binary files (video, audio, archives, etc.) are not readable.
            </div>
          </div>
        </div>
      )}

      {/* Image preview */}
      {mode === "image" && (
        <div className="flex-1 flex items-center justify-center bg-[oklch(10%_0.005_260)] p-6 overflow-auto">
          {imgError ? (
            <div className="flex flex-col items-center gap-3 text-[oklch(40%_0.01_260)]">
              <Image size={36} strokeWidth={1.5} />
              <div className="text-sm text-[oklch(50%_0.01_260)]">
                Could not load image.
              </div>
            </div>
          ) : (
            <img
              src={rawFileUrl(file.path)}
              alt={file.name}
              className="max-w-full max-h-full object-contain rounded shadow-lg"
              onError={() => setImgError(true)}
            />
          )}
        </div>
      )}

      {/* Text editor — CodeMirror with syntax highlighting */}
      {mode === "text" &&
        (loading ? (
          <div className="flex-1 flex items-center justify-center text-[oklch(40%_0.01_260)]">
            <RefreshCw size={18} className="animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <CodeMirror
              value={content}
              onChange={setContent}
              extensions={[
                dashEditorTheme,
                syntaxHighlighting(oneDarkHighlightStyle),
                ...langExtensions,
              ]}
              theme="none"
              height="100%"
              style={{ height: "100%", fontSize: "13px" }}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                tabSize: 2,
              }}
            />
          </div>
        ))}

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-[oklch(20%_0.01_260)] text-xs text-[oklch(35%_0.01_260)]">
        <span className="font-mono truncate">{file.path}</span>
        {mode === "text" && !loading && (
          <span>{content.split("\n").length} lines</span>
        )}
        {mode === "image" && (
          <span className="text-[oklch(30%_0.01_260)]">Image Preview</span>
        )}
      </div>
    </div>
  );
}
