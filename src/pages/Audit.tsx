import { useState } from "react";
import { RefreshCw, ClipboardList } from "lucide-react";
import { getAudit } from "../lib/api";
import { useApi } from "../hooks/useApi";
import Button from "../components/ui/Button";
import type { AuditEvent } from "../types/api";

const FILTER_TABS = [
  { label: "All", value: undefined },
  { label: "Login fail", value: "login_fail" },
  { label: "Bot", value: "bot" },
  { label: "File", value: "file" },
  { label: "System", value: "system" },
  { label: "Kill", value: "kill" },
] as const;

const TYPE_COLORS: Record<string, string> = {
  login_fail: "bg-[oklch(60%_0.22_25)]/15 text-[oklch(65%_0.22_25)]",
  bot: "bg-[oklch(65%_0.18_250)]/15 text-[oklch(70%_0.18_250)]",
  file: "bg-[oklch(65%_0.18_145)]/15 text-[oklch(65%_0.18_145)]",
  system: "bg-[oklch(65%_0.15_80)]/15 text-[oklch(65%_0.15_80)]",
  kill: "bg-[oklch(60%_0.22_25)]/15 text-[oklch(65%_0.22_25)]",
};

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

export default function Audit() {
  const [activeFilter, setActiveFilter] = useState<string | undefined>(
    undefined,
  );
  const [offset, setOffset] = useState(0);
  const LIMIT = 100;

  const { data, loading, refetch } = useApi(
    () => getAudit(LIMIT, offset, activeFilter),
    [activeFilter, offset],
  );

  function handleFilterChange(value: string | undefined) {
    setActiveFilter(value);
    setOffset(0);
  }

  const events: AuditEvent[] = data?.events ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Audit Log</h1>
          <p className="text-sm text-[oklch(50%_0.01_260)] mt-0.5">
            {total > 0 ? `${total} total events` : "No events recorded yet"}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={refetch} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTER_TABS.map(({ label, value }) => (
          <button
            key={label}
            onClick={() => handleFilterChange(value)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              activeFilter === value
                ? "bg-[oklch(65%_0.18_250)]/20 text-[oklch(75%_0.18_250)] border border-[oklch(65%_0.18_250)]/30"
                : "text-[oklch(50%_0.01_260)] hover:bg-[oklch(20%_0.01_260)] hover:text-white border border-transparent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      {events.length > 0 ? (
        <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[oklch(22%_0.01_260)] text-[oklch(40%_0.01_260)] text-left">
                  <th className="px-4 py-2.5 font-medium w-40">Time</th>
                  <th className="px-4 py-2.5 font-medium w-28">IP</th>
                  <th className="px-4 py-2.5 font-medium w-24">Type</th>
                  <th className="px-4 py-2.5 font-medium">Detail</th>
                  <th className="px-4 py-2.5 font-medium w-16 text-right">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[oklch(20%_0.01_260)]">
                {events.map((ev) => (
                  <tr
                    key={ev.id}
                    className={`hover:bg-[oklch(18%_0.01_260)] transition-colors ${
                      ev.action_type === "login_fail"
                        ? "bg-[oklch(60%_0.22_25)]/5"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-2 text-[oklch(45%_0.01_260)] whitespace-nowrap font-mono">
                      {formatTs(ev.ts)}
                    </td>
                    <td className="px-4 py-2 text-[oklch(55%_0.01_260)] font-mono whitespace-nowrap">
                      {ev.ip}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          TYPE_COLORS[ev.action_type] ??
                          "bg-[oklch(25%_0.01_260)] text-[oklch(50%_0.01_260)]"
                        }`}
                      >
                        {ev.action_type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[oklch(70%_0.01_260)] truncate max-w-[280px]">
                      {ev.detail}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono ${
                        ev.status >= 400
                          ? "text-[oklch(65%_0.18_25)]"
                          : "text-[oklch(55%_0.01_260)]"
                      }`}
                    >
                      {ev.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[oklch(22%_0.01_260)]">
              <span className="text-xs text-[oklch(40%_0.01_260)]">
                Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of{" "}
                {total}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                >
                  ← Prev
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={offset + LIMIT >= total}
                  onClick={() => setOffset(offset + LIMIT)}
                >
                  Next →
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] px-4 py-16 flex flex-col items-center gap-3 text-[oklch(40%_0.01_260)]">
          <ClipboardList size={32} strokeWidth={1.5} />
          <p className="text-sm">
            {loading
              ? "Loading…"
              : activeFilter
                ? `No "${activeFilter}" events`
                : "No audit events yet"}
          </p>
        </div>
      )}
    </div>
  );
}
