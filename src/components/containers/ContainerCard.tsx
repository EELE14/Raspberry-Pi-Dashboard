import { useEffect, useMemo, useRef, useState } from "react";
import Convert from "ansi-to-html";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  Play,
  Square,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Trash2,
  TerminalSquare,
} from "lucide-react";
import {
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
} from "../../lib/api";
import { wsUrl } from "../../lib/ws";
import type { ContainerInfo } from "../../types/api";
import Badge from "../ui/Badge";
import Button from "../ui/Button";

const ansiConvert = new Convert({ escapeXML: true });

// map container status
type BadgeStatus =
  | "active"
  | "inactive"
  | "failed"
  | "unknown"
  | "activating"
  | "deactivating";

function containerBadgeStatus(status: ContainerInfo["status"]): BadgeStatus {
  switch (status) {
    case "running":
      return "active";
    case "exited":
      return "inactive";
    case "restarting":
      return "activating";
    case "paused":
      return "deactivating";
    case "created":
      return "unknown";
    default:
      return "unknown";
  }
}

interface ContainerCardProps {
  container: ContainerInfo;
  onRefresh: () => void;
}

function LogPanel({
  logLines,
  logsEndRef,
}: {
  logLines: string[];
  logsEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const html = useMemo(
    () => ansiConvert.toHtml(logLines.join("\n")),
    [logLines],
  );
  return (
    <div className="border-t border-[oklch(20%_0.01_260)] bg-[oklch(11%_0.01_260)]">
      {logLines.length > 0 ? (
        <pre
          className="text-xs font-mono text-[oklch(65%_0.01_260)] p-3 overflow-y-auto max-h-64 whitespace-pre-wrap break-words leading-5"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="text-xs font-mono p-3">
          <span className="text-[oklch(38%_0.01_260)] italic">
            Waiting for logs…
          </span>
        </pre>
      )}
      <div ref={logsEndRef} />
    </div>
  );
}

function ContainerConsole({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // terminal setup
    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Fira Code", ui-monospace, monospace',
      theme: {
        background: "#0d0d10",
        foreground: "#e0e0e0",
        cursor: "#6b9fff",
        selectionBackground: "#6b9fff44",
        black: "#1a1a1a",
        red: "#e06c75",
        green: "#98c379",
        yellow: "#e5c07b",
        blue: "#61afef",
        magenta: "#c678dd",
        cyan: "#56b6c2",
        white: "#abb2bf",
        brightBlack: "#5c6370",
        brightRed: "#e06c75",
        brightGreen: "#98c379",
        brightYellow: "#e5c07b",
        brightBlue: "#61afef",
        brightMagenta: "#c678dd",
        brightCyan: "#56b6c2",
        brightWhite: "#ffffff",
      },
      scrollback: 1000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    const { cols, rows } = terminal;
    const ws = new WebSocket(
      wsUrl(`/containers/${encodeURIComponent(name)}/exec`, {
        cols: String(cols),
        rows: String(rows),
      }),
    );
    ws.binaryType = "arraybuffer";

    ws.onopen = () => terminal.focus();
    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        terminal.write(new Uint8Array(e.data));
      } else {
        terminal.write(e.data as string);
      }
    };
    ws.onclose = () =>
      terminal.write("\r\n\x1b[31m[Connection closed]\x1b[0m\r\n");
    ws.onerror = () =>
      terminal.write("\r\n\x1b[31m[WebSocket error]\x1b[0m\r\n");

    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "resize",
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        );
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      ws.close();
      terminal.dispose();
    };
  }, [name]);

  return (
    <div className="border-t border-[oklch(20%_0.01_260)] bg-[#0d0d10]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[oklch(20%_0.01_260)]">
        <span className="text-xs text-[oklch(45%_0.01_260)] font-mono">
          exec: {name} — /bin/sh
        </span>
        <button
          onClick={onClose}
          className="text-[oklch(40%_0.01_260)] hover:text-white transition-colors text-sm leading-none px-1"
          title="Close console"
        >
          ✕
        </button>
      </div>
      <div ref={containerRef} style={{ height: 300, padding: "4px 4px 0" }} />
    </div>
  );
}

export default function ContainerCard({
  container,
  onRefresh,
}: ContainerCardProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-scroll logs to bottom when new lines arrive
  useEffect(() => {
    if (logsOpen) logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logLines, logsOpen]);

  // Open/close WebSocket log stream
  useEffect(() => {
    if (!logsOpen) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }
    setLogLines([]);
    const ws = new WebSocket(
      wsUrl(`/containers/${encodeURIComponent(container.name)}/logs/stream`),
    );
    wsRef.current = ws;
    ws.onmessage = (e) => {
      setLogLines((prev) => [...prev.slice(-800), e.data as string]);
    };
    ws.onerror = () => setLogLines((prev) => [...prev, "[Connection error]"]);
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [logsOpen, container.name, container.id]);

  async function runAction(action: string, fn: () => Promise<unknown>) {
    setActionLoading(action);
    try {
      await fn();
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    setDeleteConfirm(false);
    setDeleteError(null);
    setActionLoading("delete");
    try {
      await removeContainer(container.name);
      onRefresh();
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : "Failed to remove container.",
      );
    } finally {
      setActionLoading(null);
    }
  }

  const isBuiltImage = container.image.startsWith("pi-dashboard/");

  return (
    <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 gap-3 flex-wrap">
        {/* Left: name + badge + image + port chips */}
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <span className="font-semibold text-sm text-white truncate">
            {container.name}
          </span>
          <Badge status={containerBadgeStatus(container.status)} />
          <span className="text-xs text-[oklch(40%_0.01_260)] font-mono truncate hidden sm:inline">
            {container.image}
          </span>
          {container.ports.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {container.ports.map((p) => (
                <span
                  key={p}
                  className="px-1.5 py-0.5 rounded text-xs font-mono bg-[oklch(20%_0.01_260)] text-[oklch(58%_0.01_260)] border border-[oklch(26%_0.01_260)]"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              runAction("start", () => startContainer(container.name))
            }
            loading={actionLoading === "start"}
            disabled={container.is_running || !!actionLoading}
            title="Start"
          >
            <Play size={13} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              runAction("stop", () => stopContainer(container.name))
            }
            loading={actionLoading === "stop"}
            disabled={!container.is_running || !!actionLoading}
            title="Stop"
          >
            <Square size={13} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              runAction("restart", () => restartContainer(container.name))
            }
            disabled={!!actionLoading}
            title="Restart"
          >
            <RotateCcw
              size={13}
              className={
                actionLoading === "restart"
                  ? "animate-spin [animation-direction:reverse]"
                  : ""
              }
            />
          </Button>

          <div className="w-px h-4 bg-[oklch(25%_0.01_260)]" />

          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setLogsOpen((o) => !o);
              setConsoleOpen(false);
            }}
            title="Logs"
          >
            {logsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Logs
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setConsoleOpen((o) => !o);
              setLogsOpen(false);
            }}
            disabled={!container.is_running}
            title={
              container.is_running ? "Console" : "Container must be running"
            }
          >
            <TerminalSquare size={13} />
            Console
          </Button>

          <div className="w-px h-4 bg-[oklch(25%_0.01_260)]" />

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeleteConfirm(true)}
            disabled={!!actionLoading}
            className="text-[oklch(55%_0.01_260)] hover:text-[oklch(60%_0.22_25)]"
            title="Remove container"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {/* Delete error banner */}
      {deleteError && (
        <div className="px-4 py-2 text-xs text-[oklch(65%_0.18_25)] bg-[oklch(60%_0.22_25)]/10 border-t border-[oklch(60%_0.22_25)]/20 flex items-center justify-between gap-2">
          <span>{deleteError}</span>
          <button
            onClick={() => setDeleteError(null)}
            className="text-[oklch(45%_0.01_260)] hover:text-white transition-colors flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-[oklch(14%_0.01_260)] border border-[oklch(22%_0.01_260)] shadow-2xl p-6 flex flex-col items-center gap-4">
            <div className="p-3 rounded-full bg-[oklch(60%_0.22_25)]/15">
              <Trash2 size={28} className="text-[oklch(65%_0.22_25)]" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white">
                Remove "{container.name}"?
              </p>
              <p className="text-sm text-[oklch(50%_0.01_260)] mt-1">
                The container will be stopped and permanently removed.
                {isBuiltImage && (
                  <> The locally built image will also be deleted.</>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full pt-1">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                loading={actionLoading === "delete"}
                onClick={handleDelete}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible log panel */}
      {logsOpen && <LogPanel logLines={logLines} logsEndRef={logsEndRef} />}

      {/* Collapsible console panel */}
      {consoleOpen && (
        <ContainerConsole
          name={container.name}
          onClose={() => setConsoleOpen(false)}
        />
      )}
    </div>
  );
}
