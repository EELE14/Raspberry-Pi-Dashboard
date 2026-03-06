import { useEffect, useRef, useState } from "react";
import {
  Play,
  Square,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { startBot, stopBot, restartBot, deleteBot } from "../../lib/api";
import { wsUrl } from "../../lib/ws";
import type { BotStatus } from "../../types/api";
import Badge from "../ui/Badge";
import Button from "../ui/Button";

interface BotCardProps {
  bot: BotStatus;
  onRefresh: () => void;
}

export default function BotCard({ bot, onRefresh }: BotCardProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logsOpen) logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logLines, logsOpen]);

  // Open / close WS log stream
  useEffect(() => {
    if (!logsOpen) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }
    setLogLines([]);
    const ws = new WebSocket(
      wsUrl(`/bots/${encodeURIComponent(bot.name)}/logs/stream`),
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
  }, [logsOpen, bot.name]);

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
    setActionLoading("delete");
    try {
      await deleteBot(bot.name);
      onRefresh();
    } catch (e) {
      console.error(e);
      setActionLoading(null);
    }
  }

  return (
    <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-sm text-white truncate">
            {bot.name}
          </span>
          <Badge status={bot.status} />
          <span className="text-xs text-[oklch(38%_0.01_260)] hidden sm:inline">
            {bot.service}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => runAction("start", () => startBot(bot.name))}
            loading={actionLoading === "start"}
            disabled={bot.is_running || !!actionLoading}
            title="Start"
          >
            <Play size={13} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => runAction("stop", () => stopBot(bot.name))}
            loading={actionLoading === "stop"}
            disabled={!bot.is_running || !!actionLoading}
            title="Stop"
          >
            <Square size={13} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => runAction("restart", () => restartBot(bot.name))}
            disabled={!!actionLoading}
            title="Restart"
          >
            <RotateCcw size={13} className={actionLoading === "restart" ? "animate-spin [animation-direction:reverse]" : ""} />
          </Button>

          <div className="w-px h-4 bg-[oklch(25%_0.01_260)]" />

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLogsOpen((o) => !o)}
            title="Logs"
          >
            {logsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Logs
          </Button>

          <div className="w-px h-4 bg-[oklch(25%_0.01_260)]" />

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeleteConfirm(true)}
            disabled={!!actionLoading}
            className="text-[oklch(55%_0.01_260)] hover:text-[oklch(60%_0.22_25)]"
            title="Delete bot"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-[oklch(14%_0.01_260)] border border-[oklch(22%_0.01_260)] shadow-2xl p-6 flex flex-col items-center gap-4">
            <div className="p-3 rounded-full bg-[oklch(60%_0.22_25)]/15">
              <Trash2 size={28} className="text-[oklch(65%_0.22_25)]" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white">Delete "{bot.name}"?</p>
              <p className="text-sm text-[oklch(50%_0.01_260)] mt-1">
                The bot and its service will be permanently removed.
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
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Logs panel */}
      {logsOpen && (
        <div className="border-t border-[oklch(20%_0.01_260)] bg-[oklch(11%_0.01_260)]">
          <pre className="text-xs font-mono text-[oklch(65%_0.01_260)] p-3 overflow-y-auto max-h-64 whitespace-pre-wrap break-words leading-5">
            {logLines.length > 0 ? (
              logLines.join("\n")
            ) : (
              <span className="text-[oklch(38%_0.01_260)] italic">
                Waiting for logs…
              </span>
            )}
          </pre>
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
}
