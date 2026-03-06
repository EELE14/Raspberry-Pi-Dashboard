import { useState } from "react";
import { OctagonX, Search } from "lucide-react";
import { killProcess } from "../../lib/api";
import type { PortEntry } from "../../types/api";
import Button from "../ui/Button";
import { cn } from "../../lib/utils";

interface Props {
  ports: PortEntry[];
  onKilled: () => void;
}

type Tab = "all" | "listen" | "active";

const STATUS_COLORS: Record<string, string> = {
  LISTEN: "bg-[oklch(50%_0.18_145)]/15 text-[oklch(60%_0.18_145)]",
  ESTABLISHED: "bg-[oklch(65%_0.18_250)]/15 text-[oklch(70%_0.18_250)]",
  TIME_WAIT: "bg-[oklch(65%_0.15_80)]/15 text-[oklch(65%_0.15_80)]",
  CLOSE_WAIT: "bg-[oklch(65%_0.15_80)]/15 text-[oklch(65%_0.15_80)]",
  SYN_SENT: "bg-[oklch(65%_0.15_80)]/15 text-[oklch(65%_0.15_80)]",
  SYN_RECV: "bg-[oklch(65%_0.15_80)]/15 text-[oklch(65%_0.15_80)]",
  FIN_WAIT1: "bg-[oklch(35%_0.01_260)]/20 text-[oklch(45%_0.01_260)]",
  FIN_WAIT2: "bg-[oklch(35%_0.01_260)]/20 text-[oklch(45%_0.01_260)]",
  NONE: "bg-[oklch(35%_0.01_260)]/20 text-[oklch(45%_0.01_260)]",
};

export default function PortTable({ ports, onKilled }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [confirmEntry, setConfirmEntry] = useState<PortEntry | null>(null);
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  const byTab = ports.filter((p) => {
    if (tab === "listen") return p.status === "LISTEN";
    if (tab === "active") return p.status === "ESTABLISHED";
    return true;
  });

  const filtered = q
    ? byTab.filter(
        (p) =>
          String(p.local_port).includes(q) ||
          (p.remote_port != null && String(p.remote_port).includes(q)) ||
          p.process_name.toLowerCase().includes(q) ||
          p.local_addr.includes(q) ||
          p.remote_addr.includes(q) ||
          p.protocol.includes(q),
      )
    : byTab;

  const listenCount = ports.filter((p) => p.status === "LISTEN").length;
  const activeCount = ports.filter((p) => p.status === "ESTABLISHED").length;

  async function handleKill(pid: number) {
    setKillingPid(pid);
    setConfirmEntry(null);
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

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "all", label: "All", count: ports.length },
    { id: "listen", label: "Listening", count: listenCount },
    { id: "active", label: "Established", count: activeCount },
  ];

  return (
    <>
      <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] overflow-hidden">
        {/* Tabs + search */}
        <div className="flex items-center gap-0 border-b border-[oklch(22%_0.01_260)]">
          {tabs.map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                tab === id
                  ? "border-[oklch(65%_0.18_250)] text-[oklch(75%_0.18_250)]"
                  : "border-transparent text-[oklch(45%_0.01_260)] hover:text-white",
              )}
            >
              {label}
              {count !== undefined && (
                <span
                  className={cn(
                    "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]",
                    tab === id
                      ? "bg-[oklch(65%_0.18_250)]/20 text-[oklch(70%_0.18_250)]"
                      : "bg-[oklch(22%_0.01_260)] text-[oklch(40%_0.01_260)]",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-2 px-3 py-2 border-l border-[oklch(22%_0.01_260)]">
            <Search size={12} className="text-[oklch(40%_0.01_260)] shrink-0" />
            <input
              type="text"
              placeholder="port, process, IP…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-36 bg-transparent text-xs text-white placeholder-[oklch(38%_0.01_260)] outline-none"
            />
            {q && (
              <span className="text-[10px] text-[oklch(40%_0.01_260)] shrink-0">
                {filtered.length}/{byTab.length}
              </span>
            )}
          </div>
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
                <th className="px-4 py-2 font-medium w-20">Port</th>
                <th className="px-4 py-2 font-medium w-14">Proto</th>
                <th className="px-4 py-2 font-medium w-24">Status</th>
                <th className="px-4 py-2 font-medium hidden md:table-cell">
                  Local
                </th>
                <th className="px-4 py-2 font-medium hidden lg:table-cell">
                  Remote
                </th>
                <th className="px-4 py-2 font-medium">Process</th>
                <th className="px-4 py-2 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[oklch(20%_0.01_260)]">
              {filtered.length > 0 ? (
                filtered.map((p, i) => (
                  <tr
                    key={`${p.protocol}-${p.local_addr}-${p.local_port}-${p.remote_addr}-${p.remote_port}-${i}`}
                    className={cn(
                      "hover:bg-[oklch(18%_0.01_260)] transition-colors",
                      p.pid != null && killingPid === p.pid && "opacity-40",
                    )}
                  >
                    <td className="px-4 py-2 font-mono font-semibold text-white">
                      {p.local_port}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-mono font-medium",
                          p.protocol === "tcp"
                            ? "bg-[oklch(65%_0.18_250)]/10 text-[oklch(65%_0.18_250)]"
                            : "bg-[oklch(65%_0.15_80)]/10 text-[oklch(65%_0.15_80)]",
                        )}
                      >
                        {p.protocol.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full",
                          STATUS_COLORS[p.status] ??
                            "bg-[oklch(25%_0.01_260)] text-[oklch(45%_0.01_260)]",
                        )}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-[oklch(50%_0.01_260)] hidden md:table-cell whitespace-nowrap">
                      {p.local_addr}
                    </td>
                    <td className="px-4 py-2 font-mono text-[oklch(50%_0.01_260)] hidden lg:table-cell whitespace-nowrap">
                      {p.remote_addr && p.remote_port != null ? (
                        `${p.remote_addr}:${p.remote_port}`
                      ) : (
                        <span className="text-[oklch(30%_0.01_260)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[oklch(70%_0.01_260)]">
                      {p.process_name ? (
                        <span>
                          <span className="font-medium text-white">
                            {p.process_name}
                          </span>
                          {p.pid != null && (
                            <span className="text-[oklch(40%_0.01_260)] ml-1.5 font-mono">
                              {p.pid}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[oklch(30%_0.01_260)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {p.pid != null && (
                        <button
                          onClick={() => setConfirmEntry(p)}
                          disabled={killingPid === p.pid}
                          className="text-[oklch(38%_0.01_260)] hover:text-[oklch(60%_0.22_25)] transition-colors p-1 disabled:opacity-30"
                          title={`Kill PID ${p.pid}`}
                        >
                          <OctagonX size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-[oklch(40%_0.01_260)]"
                  >
                    {q ? `No ports match "${query}"` : "No entries"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Kill confirmation modal */}
      {confirmEntry && (
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
                  {confirmEntry.process_name}
                </span>{" "}
                (PID {confirmEntry.pid}) listening on port{" "}
                <span className="text-white font-medium font-mono">
                  {confirmEntry.local_port}
                </span>{" "}
                will receive SIGTERM.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full pt-1">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setConfirmEntry(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                loading={killingPid === confirmEntry.pid}
                onClick={() =>
                  confirmEntry.pid != null && handleKill(confirmEntry.pid)
                }
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
