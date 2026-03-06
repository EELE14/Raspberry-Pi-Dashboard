import { useState } from "react";
import { OctagonX, Search } from "lucide-react";
import { killProcess } from "../../lib/api";
import type { ProcessInfo } from "../../types/api";
import Button from "../ui/Button";
import { cn } from "../../lib/utils";

interface Props {
  processes: ProcessInfo[];
  onKilled: () => void;
}

export default function ProcessTable({ processes, onKilled }: Props) {
  const [query, setQuery] = useState("");
  const [confirmPid, setConfirmPid] = useState<number | null>(null);
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? processes.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          String(p.pid).includes(q) ||
          p.username.toLowerCase().includes(q),
      )
    : processes;

  const confirmProcess =
    confirmPid != null ? processes.find((p) => p.pid === confirmPid) : null;

  async function handleKill(pid: number) {
    setKillingPid(pid);
    setConfirmPid(null);
    setError(null);
    try {
      await killProcess(pid);
      onKilled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kill failed.");
    } finally {
      setKillingPid(null);
    }
  }

  return (
    <>
      <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] overflow-hidden">
        {/* Search bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[oklch(22%_0.01_260)]">
          <Search size={13} className="text-[oklch(40%_0.01_260)] shrink-0" />
          <input
            type="text"
            placeholder="Filter by name, PID or user…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-white placeholder-[oklch(38%_0.01_260)] outline-none"
          />
          {q && (
            <span className="text-[10px] text-[oklch(40%_0.01_260)] shrink-0">
              {filtered.length} / {processes.length}
            </span>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 text-xs text-[oklch(65%_0.18_25)] bg-[oklch(60%_0.22_25)]/10 border-b border-[oklch(22%_0.01_260)]">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[oklch(22%_0.01_260)] text-[oklch(40%_0.01_260)] text-left">
                <th className="px-4 py-2 font-medium w-16">PID</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium hidden sm:table-cell">
                  User
                </th>
                <th className="px-4 py-2 font-medium w-20 text-right">CPU%</th>
                <th className="px-4 py-2 font-medium w-20 text-right">MEM%</th>
                <th className="px-4 py-2 font-medium hidden md:table-cell w-20">
                  Status
                </th>
                <th className="px-4 py-2 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[oklch(20%_0.01_260)]">
              {filtered.length > 0 ? (
                filtered.map((p) => (
                  <tr
                    key={p.pid}
                    className={cn(
                      "hover:bg-[oklch(18%_0.01_260)] transition-colors",
                      killingPid === p.pid && "opacity-40",
                    )}
                  >
                    <td className="px-4 py-2 font-mono text-[oklch(45%_0.01_260)]">
                      {p.pid}
                    </td>
                    <td className="px-4 py-2 text-white font-medium truncate max-w-[160px]">
                      {p.name}
                    </td>
                    <td className="px-4 py-2 text-[oklch(50%_0.01_260)] hidden sm:table-cell">
                      {p.username}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2 text-right font-mono",
                        p.cpu_percent > 50
                          ? "text-[oklch(65%_0.18_25)]"
                          : p.cpu_percent > 20
                            ? "text-[oklch(72%_0.15_80)]"
                            : "text-[oklch(55%_0.01_260)]",
                      )}
                    >
                      {p.cpu_percent.toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-[oklch(55%_0.01_260)]">
                      {p.memory_percent.toFixed(1)}
                    </td>
                    <td className="px-4 py-2 hidden md:table-cell">
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full",
                          p.status === "running"
                            ? "bg-[oklch(50%_0.18_145)]/15 text-[oklch(60%_0.18_145)]"
                            : "bg-[oklch(25%_0.01_260)] text-[oklch(45%_0.01_260)]",
                        )}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => setConfirmPid(p.pid)}
                        disabled={killingPid === p.pid}
                        className="text-[oklch(38%_0.01_260)] hover:text-[oklch(60%_0.22_25)] transition-colors p-1 disabled:opacity-30"
                        title={`Kill PID ${p.pid}`}
                      >
                        <OctagonX size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-[oklch(40%_0.01_260)]"
                  >
                    No processes match "{query}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Kill confirmation modal */}
      {confirmPid !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-[oklch(14%_0.01_260)] border border-[oklch(22%_0.01_260)] shadow-2xl p-6 flex flex-col items-center gap-4">
            <div className="p-3 rounded-full bg-[oklch(60%_0.22_25)]/15">
              <OctagonX size={28} className="text-[oklch(65%_0.22_25)]" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white">
                Kill process?
              </p>
              <p className="text-sm text-[oklch(50%_0.01_260)] mt-1">
                <span className="text-white font-medium">
                  {confirmProcess?.name}
                </span>{" "}
                (PID {confirmPid}) will receive SIGTERM.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full pt-1">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setConfirmPid(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                loading={killingPid === confirmPid}
                onClick={() => handleKill(confirmPid)}
              >
                Kill
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
