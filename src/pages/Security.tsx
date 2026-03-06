import { useState, type FormEvent, type ReactNode } from "react";
import {
  Shield,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Ban,
  KeyRound,
  AlertTriangle,
  Copy,
  Check,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import {
  getBannedIps,
  getSecurityChecklist,
  getSecurityStats,
  getAudit,
  banIp,
  unbanIp,
  rotateToken,
} from "../lib/api";
import { useApi } from "../hooks/useApi";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import type { BannedIp, ChecklistItem } from "../types/api";

// helpers
function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 80
      ? "oklch(65%_0.18_145)"
      : score >= 50
        ? "oklch(65%_0.15_80)"
        : "oklch(65%_0.22_25)";
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-4xl font-bold" style={{ color }}>
        {score}
      </span>
      <span className="text-xs text-[oklch(45%_0.01_260)]">/ 100</span>
    </div>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[oklch(20%_0.01_260)] last:border-0">
      {item.ok ? (
        <CheckCircle2
          size={16}
          className="text-[oklch(65%_0.18_145)] mt-0.5 shrink-0"
        />
      ) : (
        <XCircle
          size={16}
          className="text-[oklch(65%_0.22_25)] mt-0.5 shrink-0"
        />
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-[oklch(80%_0.01_260)]">
          {item.label}
        </p>
        <p className="text-[11px] text-[oklch(45%_0.01_260)] mt-0.5">
          {item.detail}
        </p>
      </div>
    </div>
  );
}

// token rotate
function TokenRotation() {
  const [newToken, setNewToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function handleRotate() {
    setLoading(true);
    setError(null);
    try {
      const res = await rotateToken();
      setNewToken(res.token);
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!newToken) return;
    navigator.clipboard
      .writeText(newToken)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <Card title="Token Rotation">
      {newToken ? (
        <div className="space-y-4">
          {/* Success banner */}
          <div className="flex items-center gap-2.5 rounded-lg bg-[oklch(65%_0.18_145)]/8 border border-[oklch(65%_0.18_145)]/20 px-3 py-2.5">
            <Check size={14} className="text-[oklch(65%_0.18_145)] shrink-0" />
            <p className="text-xs font-medium text-[oklch(65%_0.18_145)]">
              New token generated — copy it now. It won't be shown again.
            </p>
          </div>

          {/* Token display */}
          <div className="rounded-lg bg-[oklch(12%_0.01_260)] border border-[oklch(28%_0.01_260)] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[oklch(22%_0.01_260)]">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[oklch(40%_0.01_260)]">
                API Token
              </span>
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  copied
                    ? "bg-[oklch(65%_0.18_145)]/15 text-[oklch(65%_0.18_145)]"
                    : "bg-[oklch(20%_0.01_260)] hover:bg-[oklch(26%_0.01_260)] text-[oklch(65%_0.01_260)] hover:text-white"
                }`}
              >
                {copied ? (
                  <>
                    <Check size={11} /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={11} /> Copy
                  </>
                )}
              </button>
            </div>
            <div className="px-3 py-3">
              <code className="block text-[11px] text-[oklch(72%_0.16_145)] font-mono break-all leading-relaxed">
                {newToken}
              </code>
            </div>
          </div>

          {/* Confirmation */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                confirmed
                  ? "bg-[oklch(65%_0.18_250)] border-[oklch(65%_0.18_250)]"
                  : "border-[oklch(30%_0.01_260)] group-hover:border-[oklch(45%_0.01_260)]"
              }`}
            >
              {confirmed && (
                <Check size={10} className="text-white" strokeWidth={3} />
              )}
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="sr-only"
              />
            </div>
            <span className="text-xs text-[oklch(55%_0.01_260)] group-hover:text-[oklch(70%_0.01_260)] transition-colors">
              I have saved this token somewhere safe
            </span>
          </label>

          <Button
            variant="primary"
            size="sm"
            disabled={!confirmed}
            onClick={() => {
              setNewToken(null);
              setConfirmed(false);
            }}
          >
            Done
          </Button>
        </div>
      ) : (
        /* ── Idle state ── */
        <div className="space-y-4">
          <p className="text-xs text-[oklch(50%_0.01_260)] leading-relaxed">
            Generate a new cryptographically random API token. The current token
            is{" "}
            <span className="text-[oklch(65%_0.22_25)] font-medium">
              immediately revoked
            </span>{" "}
            — update all clients before rotating.
          </p>

          {/* Danger callout */}
          <div className="rounded-lg border border-[oklch(28%_0.01_260)] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-[oklch(60%_0.15_80)]/6 border-b border-[oklch(28%_0.01_260)]">
              <AlertTriangle
                size={12}
                className="text-[oklch(62%_0.15_80)] shrink-0"
              />
              <span className="text-[11px] font-medium text-[oklch(62%_0.15_80)]">
                Destructive action
              </span>
            </div>
            <ul className="px-3 py-2.5 space-y-1.5">
              {[
                "Old token stops working immediately",
                "Active WebSocket sessions are disconnected",
                "New token is shown exactly once",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-[11px] text-[oklch(45%_0.01_260)]"
                >
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-[oklch(35%_0.01_260)] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-[oklch(65%_0.22_25)]">
              <XCircle size={13} />
              {error}
            </div>
          )}

          <Button
            variant="secondary"
            size="md"
            loading={loading}
            onClick={handleRotate}
            className="w-full justify-center bg-[oklch(62%_0.15_80)]/5 border-[oklch(62%_0.15_80)]/25 text-[oklch(65%_0.15_80)] hover:bg-[oklch(62%_0.15_80)]/12 hover:border-[oklch(62%_0.15_80)]/50 hover:text-[oklch(72%_0.15_80)]"
          >
            <KeyRound size={15} />
            Generate New Token
          </Button>
        </div>
      )}
    </Card>
  );
}

// ban form
function BanForm({ onBanned }: { onBanned: () => void }) {
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ip.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await banIp({
        ip: ip.trim(),
        reason: reason.trim() || "Manual ban",
        duration_minutes: duration ? parseInt(duration, 10) : null,
      });
      setIp("");
      setReason("");
      setDuration("");
      onBanned();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const field = (label: string, node: ReactNode) => (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-[oklch(45%_0.01_260)] uppercase tracking-wide">
        {label}
      </label>
      {node}
    </div>
  );

  const inputCls =
    "w-full bg-[oklch(13%_0.01_260)] border border-[oklch(24%_0.01_260)] rounded-lg px-3 py-2 text-xs text-white placeholder-[oklch(32%_0.01_260)] focus:outline-none focus:border-[oklch(48%_0.01_260)] focus:bg-[oklch(14%_0.01_260)] transition-colors";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {field(
          "IP Address *",
          <input
            className={inputCls}
            placeholder="e.g. 192.168.1.1"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            required
            maxLength={45}
          />,
        )}
        {field(
          "Duration",
          <input
            className={inputCls}
            placeholder="Minutes — blank = permanent"
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />,
        )}
      </div>
      {field(
        "Reason",
        <input
          className={inputCls}
          placeholder="Optional — shown in ban list"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
        />,
      )}
      {error && (
        <div className="flex items-center gap-2 text-xs text-[oklch(65%_0.22_25)]">
          <XCircle size={12} />
          {error}
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="danger" size="md" loading={loading}>
          <Ban size={15} />
          Ban IP
        </Button>
      </div>
    </form>
  );
}

// main page
export default function Security() {
  const {
    data: stats,
    loading: statsLoading,
    refetch: refetchStats,
  } = useApi(getSecurityStats, [], 10_000);

  const {
    data: checklist,
    loading: checklistLoading,
    refetch: refetchChecklist,
  } = useApi(getSecurityChecklist, [], 15_000);

  const {
    data: bannedData,
    loading: bansLoading,
    refetch: refetchBans,
  } = useApi(getBannedIps, [], 10_000);

  const { data: loginFails } = useApi(
    () => getAudit(10, 0, "login_fail"),
    [],
    15_000,
  );

  const bans: BannedIp[] = bannedData?.bans ?? [];

  async function handleUnban(ip: string) {
    try {
      await unbanIp(ip);
      refetchBans();
      refetchStats();
    } catch {
      // ignore
    }
  }

  function refetchAll() {
    refetchStats();
    refetchChecklist();
    refetchBans();
  }

  const totalSessions =
    (stats?.terminal_sessions ?? 0) +
    (stats?.system_stream_sessions ?? 0) +
    (stats?.network_stream_sessions ?? 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Security</h1>
          <p className="text-sm text-[oklch(50%_0.01_260)] mt-0.5">
            Access control and security monitoring
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refetchAll}
          disabled={statsLoading || checklistLoading}
        >
          <RefreshCw
            size={14}
            className={statsLoading || checklistLoading ? "animate-spin" : ""}
          />
          Refresh
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Login Fails (1h)",
            value: stats?.login_fails_1h ?? "—",
            warn: (stats?.login_fails_1h ?? 0) >= 5,
          },
          {
            label: "Login Fails (24h)",
            value: stats?.login_fails_24h ?? "—",
            warn: (stats?.login_fails_24h ?? 0) >= 20,
          },
          {
            label: "Banned IPs",
            value: stats?.banned_ips_count ?? "—",
            warn: false,
          },
          {
            label: "Active Sessions",
            value: totalSessions,
            warn: totalSessions >= 4,
          },
        ].map(({ label, value, warn }) => (
          <div
            key={label}
            className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] px-4 py-4"
          >
            <p className="text-[11px] text-[oklch(45%_0.01_260)] font-medium uppercase tracking-wide">
              {label}
            </p>
            <p
              className={`text-2xl font-bold mt-1 ${
                warn ? "text-[oklch(65%_0.22_25)]" : "text-white"
              }`}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Checklist + Token rotation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Security checklist */}
        <Card
          title="Security Checklist"
          headerRight={
            <div className="flex items-center gap-3">
              <Shield size={14} className="text-[oklch(50%_0.01_260)]" />
              {checklist && <ScoreRing score={checklist.score} />}
            </div>
          }
        >
          {checklistLoading && !checklist ? (
            <p className="text-xs text-[oklch(40%_0.01_260)]">Loading…</p>
          ) : checklist ? (
            <div>
              {checklist.items.map((item) => (
                <ChecklistRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-[oklch(40%_0.01_260)]">
              No checklist data available.
            </p>
          )}
        </Card>

        {/* Token rotation */}
        <TokenRotation />
      </div>

      {/* Banned IPs */}
      <Card
        title="IP Bans"
        headerRight={
          bans.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[oklch(60%_0.22_25)]/10 text-[oklch(65%_0.22_25)] text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[oklch(65%_0.22_25)]" />
              {bans.length} active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[oklch(65%_0.18_145)]/10 text-[oklch(60%_0.18_145)] text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[oklch(60%_0.18_145)]" />
              Clear
            </span>
          )
        }
      >
        <div className="space-y-5">
          {/* ── Add ban ── */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[oklch(38%_0.01_260)]">
                Add ban
              </span>
              <div className="flex-1 h-px bg-[oklch(20%_0.01_260)]" />
            </div>
            <BanForm
              onBanned={() => {
                refetchBans();
                refetchStats();
              }}
            />
          </div>

          {/* ── Active bans ── */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[oklch(38%_0.01_260)]">
                Active bans
              </span>
              <div className="flex-1 h-px bg-[oklch(20%_0.01_260)]" />
            </div>

            {bansLoading && bans.length === 0 ? (
              <p className="text-xs text-[oklch(38%_0.01_260)] py-2">
                Loading…
              </p>
            ) : bans.length > 0 ? (
              <div className="rounded-lg border border-[oklch(22%_0.01_260)] overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[oklch(14%_0.01_260)] border-b border-[oklch(22%_0.01_260)] text-[oklch(38%_0.01_260)] text-left">
                      <th className="px-3 py-2 font-medium">IP</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Reason</th>
                      <th className="px-3 py-2 font-medium w-28">Expires</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[oklch(19%_0.01_260)]">
                    {bans.map((ban) => {
                      const isAuto = ban.reason.startsWith("Auto-banned");
                      return (
                        <tr
                          key={ban.ip}
                          className="hover:bg-[oklch(17%_0.01_260)] transition-colors group"
                        >
                          <td className="px-3 py-2.5 font-mono text-[oklch(78%_0.01_260)] whitespace-nowrap">
                            {ban.ip}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                                isAuto
                                  ? "bg-[oklch(60%_0.22_25)]/12 text-[oklch(65%_0.22_25)]"
                                  : "bg-[oklch(65%_0.18_250)]/12 text-[oklch(65%_0.18_250)]"
                              }`}
                            >
                              {isAuto ? "Auto" : "Manual"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-[oklch(50%_0.01_260)] max-w-[180px] truncate">
                            {ban.reason}
                          </td>
                          <td className="px-3 py-2.5 text-[oklch(42%_0.01_260)] whitespace-nowrap">
                            {ban.expires_at ? (
                              formatTs(ban.expires_at)
                            ) : (
                              <span className="text-[oklch(60%_0.22_25)] font-medium">
                                Permanent
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => handleUnban(ban.ip)}
                              className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-[oklch(60%_0.22_25)]/12 text-[oklch(45%_0.01_260)] hover:text-[oklch(65%_0.22_25)] transition-all"
                              title="Unban"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[oklch(22%_0.01_260)] px-4 py-7 flex flex-col items-center gap-2.5 text-[oklch(35%_0.01_260)]">
                <Shield size={22} strokeWidth={1.5} />
                <p className="text-xs">No IPs currently banned</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Recent login failures */}
      <Card
        title="Recent Login Failures"
        headerRight={
          <ShieldAlert size={14} className="text-[oklch(50%_0.01_260)]" />
        }
      >
        {(loginFails?.events.length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[oklch(22%_0.01_260)] text-[oklch(40%_0.01_260)] text-left">
                  <th className="pb-2 font-medium w-36">Time</th>
                  <th className="pb-2 font-medium">IP</th>
                  <th className="pb-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[oklch(20%_0.01_260)]">
                {loginFails?.events.map((ev) => (
                  <tr
                    key={ev.id}
                    className="hover:bg-[oklch(18%_0.01_260)] transition-colors"
                  >
                    <td className="py-2 pr-3 text-[oklch(40%_0.01_260)] whitespace-nowrap font-mono">
                      {formatTs(ev.ts)}
                    </td>
                    <td className="py-2 pr-3 font-mono text-[oklch(65%_0.22_25)] whitespace-nowrap">
                      {ev.ip}
                    </td>
                    <td className="py-2 text-[oklch(50%_0.01_260)] truncate max-w-[240px]">
                      {ev.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-[oklch(40%_0.01_260)]">
            <CheckCircle2 size={24} strokeWidth={1.5} />
            <p className="text-xs">No login failures recorded</p>
          </div>
        )}
      </Card>
    </div>
  );
}
