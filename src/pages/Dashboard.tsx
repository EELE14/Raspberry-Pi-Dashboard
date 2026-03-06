import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Cpu,
  HardDrive,
  Thermometer,
  MemoryStick,
  Clock,
  RefreshCw,
  Power,
  PowerOff,
  RotateCcw,
  ChevronDown,
  X,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import {
  getSystemHistory,
  getSystemStats,
  listContainers,
  rebootPi,
  shutdownPi,
} from "../lib/api";
import { wsUrl } from "../lib/ws";
import { useApi } from "../hooks/useApi";
import { usePiStatus } from "../hooks/usePiStatus";
import StatCard from "../components/system/StatCard";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { Link } from "react-router-dom";
import type { ContainerInfo, SystemStats } from "../types/api";

const THRESH = {
  cpu: { warn: 70, danger: 90, streak: 5 },
  ram: { warn: 75, danger: 88 },
  temp: { warn: 75, danger: 82 }, // Pi 3B throttles at 85 °C
  disk: { warn: 75, danger: 90 },
} as const;

// tyopes

interface ChartPoint {
  t: number;
  cpu: number;
  ram: number;
  temp: number | null;
}

interface Alert {
  id: string;
  message: string;
  level: "warn" | "danger";
}

const MAX_CHART = 600; // 500 historical + room for live points

const HISTORY_KEY = "stats_history_minutes";
function getHistoryMinutesSetting(): number {
  return parseInt(localStorage.getItem(HISTORY_KEY) ?? "60", 10);
}

function checkThresholds(
  s: SystemStats,
  cpuHighRef: React.RefObject<number>,
  setAlerts: React.Dispatch<React.SetStateAction<Alert[]>>,
  snoozedIdsRef: React.RefObject<Set<string>>,
): void {
  const add = (id: string, message: string, level: Alert["level"]) => {
    if (snoozedIdsRef.current.has(id)) return;
    setAlerts((prev) => {
      const existing = prev.find((a) => a.id === id);
      if (!existing) return [...prev, { id, message, level }];
      if (existing.level === level && existing.message === message) return prev;
      return prev.map((a) => (a.id === id ? { ...a, message, level } : a));
    });
  };

  const remove = (id: string) => {
    snoozedIdsRef.current.delete(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };
  // CPU
  if (s.cpu.percent > THRESH.cpu.danger) {
    cpuHighRef.current = Math.min(
      cpuHighRef.current + 1,
      THRESH.cpu.streak + 1,
    );
    if (cpuHighRef.current >= THRESH.cpu.streak)
      add("cpu_high", `CPU at ${s.cpu.percent.toFixed(0)}%`, "danger");
  } else {
    cpuHighRef.current = Math.max(0, cpuHighRef.current - 1);
    if (cpuHighRef.current === 0) remove("cpu_high");
  }

  // RAM
  if (s.ram.percent > THRESH.ram.danger)
    add("ram_high", `RAM at ${s.ram.percent.toFixed(0)}%`, "danger");
  else remove("ram_high");

  // Temperature
  if (s.temperature_celsius != null) {
    if (s.temperature_celsius > THRESH.temp.danger)
      add("temp_high", `Temperature at ${s.temperature_celsius}°C`, "danger");
    else if (s.temperature_celsius > THRESH.temp.warn)
      add("temp_high", `Temperature at ${s.temperature_celsius}°C`, "warn");
    else remove("temp_high");
  } else {
    remove("temp_high");
  }

  // Disk
  if (s.disk.percent > THRESH.disk.danger)
    add("disk_high", `Disk at ${s.disk.percent.toFixed(0)}%`, "danger");
  else remove("disk_high");
}

// component

export default function Dashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const snoozedIdsRef = useRef<Set<string>>(new Set());

  const cpuHighRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: containerList } = useApi(listContainers, [], 15_000);
  const [shutdownState, setShutdownState] = useState<
    "idle" | "confirm" | "done"
  >("idle");
  const [rebootState, setRebootState] = useState<"idle" | "confirm" | "done">(
    "idle",
  );
  const [powerDropdownOpen, setPowerDropdownOpen] = useState(false);
  const powerDropdownRef = useRef<HTMLDivElement>(null);
  const { isOffline } = usePiStatus();

  const [notifPermission, setNotifPermission] =
    useState<NotificationPermission>(
      "Notification" in window ? Notification.permission : "denied",
    );

  useEffect(() => {
    getSystemHistory(getHistoryMinutesSetting())
      .then((points) => {
        if (points.length === 0) return;
        setChartData(
          points.map((p) => ({
            t: new Date(p.ts).getTime(),
            cpu: p.cpu,
            ram: p.ram,
            temp: p.temp,
          })),
        );
      })
      .catch(() => {});
  }, []);

  const applyStats = useCallback((s: SystemStats) => {
    setStats(s);
    setStatsLoading(false);
    setStatsError(null);
    setChartData((prev) => {
      const next: ChartPoint = {
        t: Date.now(),
        cpu: s.cpu.percent,
        ram: s.ram.percent,
        temp: s.temperature_celsius,
      };
      const updated = [...prev, next];
      return updated.length > MAX_CHART ? updated.slice(-MAX_CHART) : updated;
    });
    checkThresholds(s, cpuHighRef, setAlerts, snoozedIdsRef);
  }, []);

  const prevAlertIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (Notification.permission !== "granted") return;
    for (const a of alerts) {
      if (a.level === "danger" && !prevAlertIds.current.has(a.id)) {
        new Notification("PI Server Alert", { body: a.message });
      }
    }
    prevAlertIds.current = new Set(alerts.map((a) => a.id));
  }, [alerts]);

  useEffect(() => {
    let active = true;

    function startPoll() {
      if (pollRef.current) return;
      getSystemStats()
        .then((s) => {
          if (active) applyStats(s);
        })
        .catch((e) => {
          if (active) {
            setStatsError(e instanceof Error ? e.message : "Error");
            setStatsLoading(false);
          }
        });
      pollRef.current = setInterval(async () => {
        try {
          const s = await getSystemStats();
          if (active) applyStats(s);
        } catch (e) {
          if (active) setStatsError(e instanceof Error ? e.message : "Error");
        }
      }, 5_000);
    }

    function connect() {
      const ws = new WebSocket(wsUrl("/system/stream"));
      wsRef.current = ws;
      ws.onopen = () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
      ws.onmessage = (e) => {
        try {
          const s = JSON.parse(e.data as string) as SystemStats;
          if (active) applyStats(s);
        } catch {
          // ignore malformed
        }
      };
      ws.onerror = () => {
        if (active && !pollRef.current) startPoll();
      };
      ws.onclose = () => {
        if (active && !pollRef.current) {
          startPoll();

          reconnectTimerRef.current = setTimeout(() => {
            if (active) {
              wsRef.current?.close();
              connect();
            }
          }, 10_000);
        }
      };
    }

    connect();
    return () => {
      active = false;
      wsRef.current?.close();
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [applyStats]);

  function refetchStats() {
    setStatsLoading(true);
    getSystemStats()
      .then(applyStats)
      .catch((e) => {
        setStatsError(e instanceof Error ? e.message : "Error");
        setStatsLoading(false);
      });
  }

  useEffect(() => {
    if (isOffline) {
      setShutdownState("idle");
      setRebootState("idle");
    }
  }, [isOffline]);

  // Close the power dropdown when clicking outside it.
  useEffect(() => {
    if (!powerDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        powerDropdownRef.current &&
        !powerDropdownRef.current.contains(e.target as Node)
      ) {
        setPowerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [powerDropdownOpen]);

  async function handleShutdown() {
    try {
      await shutdownPi();
      setShutdownState("done");
    } catch {
      setShutdownState("idle");
    }
  }

  async function handleReboot() {
    try {
      await rebootPi();
      setRebootState("done");
    } catch {
      setRebootState("idle");
    }
  }

  const historyMinutes =
    chartData.length > 1
      ? Math.max(1, Math.round((Date.now() - chartData[0].t) / 60_000))
      : 1;
  const hasTemp = chartData.some((p) => p.temp != null);

  return (
    <div className="p-6 space-y-6">
      {/* Alert banners */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm border ${
                a.level === "danger"
                  ? "bg-[oklch(60%_0.22_25)]/10 border-[oklch(60%_0.22_25)]/30 text-[oklch(72%_0.18_25)]"
                  : "bg-[oklch(65%_0.18_80)]/10 border-[oklch(65%_0.18_80)]/30 text-[oklch(72%_0.15_80)]"
              }`}
            >
              <span>
                {a.level === "danger" ? "⛔" : "⚠"} {a.message}
              </span>

              <button
                onClick={() => {
                  snoozedIdsRef.current.add(a.id);
                  setAlerts((prev) => prev.filter((x) => x.id !== a.id));
                }}
                className="ml-4 opacity-60 hover:opacity-100 transition-opacity"
                title="Dismiss until metric recovers"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-[oklch(50%_0.01_260)] mt-0.5">
            System overview
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* M-4: request notification permission only on explicit user action */}
          {"Notification" in window && notifPermission === "default" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                Notification.requestPermission().then((p) =>
                  setNotifPermission(p),
                )
              }
              title="Enable browser notifications for danger alerts"
            >
              <Bell size={14} />
              Enable alerts
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={refetchStats}
            disabled={statsLoading}
          >
            <RefreshCw
              size={14}
              className={statsLoading ? "animate-spin" : ""}
            />
            Refresh
          </Button>
          <div className="relative" ref={powerDropdownRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPowerDropdownOpen((o) => !o)}
              title="Power options"
            >
              <Power size={14} />
              <ChevronDown size={10} />
            </Button>
            {powerDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 rounded-lg bg-[oklch(18%_0.01_260)] border border-[oklch(26%_0.01_260)] shadow-xl z-20 overflow-hidden">
                <button
                  onClick={() => {
                    setPowerDropdownOpen(false);
                    setShutdownState("confirm");
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[oklch(62%_0.01_260)] hover:bg-[oklch(22%_0.01_260)] hover:text-[oklch(65%_0.22_25)] transition-colors"
                >
                  <Power size={13} />
                  Shutdown
                </button>
                <button
                  onClick={() => {
                    setPowerDropdownOpen(false);
                    setRebootState("confirm");
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[oklch(62%_0.01_260)] hover:bg-[oklch(22%_0.01_260)] hover:text-white transition-colors"
                >
                  <RotateCcw size={13} />
                  Reboot
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {statsError && (
        <div className="rounded-lg bg-[oklch(60%_0.22_25)]/10 border border-[oklch(60%_0.22_25)]/20 px-4 py-3 text-sm text-[oklch(70%_0.18_25)]">
          Error loading: {statsError}
        </div>
      )}

      <section>
        <h2 className="text-xs font-semibold text-[oklch(45%_0.01_260)] uppercase tracking-wider mb-3">
          System
        </h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <StatCard
            label="CPU"
            value={stats ? `${stats.cpu.percent.toFixed(1)}%` : "—"}
            percent={stats?.cpu.percent}
            icon={<Cpu size={15} />}
            warning={!!stats && stats.cpu.percent > THRESH.cpu.warn}
            danger={!!stats && stats.cpu.percent > THRESH.cpu.danger}
          />
          <StatCard
            label="RAM"
            value={stats ? `${stats.ram.used_mb.toFixed(0)} MB` : "—"}
            subValue={
              stats ? `/ ${stats.ram.total_mb.toFixed(0)} MB` : undefined
            }
            percent={stats?.ram.percent}
            icon={<MemoryStick size={15} />}
            warning={!!stats && stats.ram.percent > THRESH.ram.warn}
            danger={!!stats && stats.ram.percent > THRESH.ram.danger}
          />
          <StatCard
            label="Disk"
            value={stats ? `${stats.disk.used_gb.toFixed(1)} GB` : "—"}
            subValue={
              stats ? `/ ${stats.disk.total_gb.toFixed(1)} GB` : undefined
            }
            percent={stats?.disk.percent}
            icon={<HardDrive size={15} />}
            warning={!!stats && stats.disk.percent > THRESH.disk.warn}
            danger={!!stats && stats.disk.percent > THRESH.disk.danger}
          />
          <StatCard
            label="Temperature"
            value={
              stats?.temperature_celsius != null
                ? `${stats.temperature_celsius}°C`
                : "—"
            }
            icon={<Thermometer size={15} />}
            warning={
              !!stats?.temperature_celsius &&
              stats.temperature_celsius > THRESH.temp.warn
            }
            danger={
              !!stats?.temperature_celsius &&
              stats.temperature_celsius > THRESH.temp.danger
            }
          />
        </div>
      </section>

      {/* Historical Charts */}
      {chartData.length > 2 && (
        <section>
          <h2 className="text-xs font-semibold text-[oklch(45%_0.01_260)] uppercase tracking-wider mb-3">
            History (last {historyMinutes} min)
          </h2>
          <div
            className={`grid gap-3 ${hasTemp ? "grid-cols-3" : "grid-cols-2"}`}
          >
            <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] p-3">
              <span className="text-xs text-[oklch(45%_0.01_260)]">CPU %</span>
              <ResponsiveContainer width="100%" height={56}>
                <LineChart data={chartData}>
                  <Tooltip
                    contentStyle={{
                      background: "#11111a",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                    formatter={(v: number | undefined) => [
                      v != null ? `${v.toFixed(1)}%` : "—",
                      "CPU",
                    ]}
                    labelFormatter={() => ""}
                  />
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    stroke="#818cf8"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] p-3">
              <span className="text-xs text-[oklch(45%_0.01_260)]">RAM %</span>
              <ResponsiveContainer width="100%" height={56}>
                <LineChart data={chartData}>
                  <Tooltip
                    contentStyle={{
                      background: "#11111a",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                    formatter={(v: number | undefined) => [
                      v != null ? `${v.toFixed(1)}%` : "—",
                      "RAM",
                    ]}
                    labelFormatter={() => ""}
                  />
                  <Line
                    type="monotone"
                    dataKey="ram"
                    stroke="#22d3ee"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {hasTemp && (
              <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] p-3">
                <span className="text-xs text-[oklch(45%_0.01_260)]">
                  Temp °C
                </span>
                <ResponsiveContainer width="100%" height={56}>
                  <LineChart data={chartData}>
                    <Tooltip
                      contentStyle={{
                        background: "#11111a",
                        border: "none",
                        borderRadius: 6,
                        fontSize: 11,
                      }}
                      formatter={(v: number | undefined) => [
                        v != null ? `${v.toFixed(1)}°C` : "—",
                        "Temp",
                      ]}
                      labelFormatter={() => ""}
                    />
                    <Line
                      type="monotone"
                      dataKey="temp"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Uptime */}
      {stats && (
        <div className="flex items-center gap-2 text-sm text-[oklch(50%_0.01_260)]">
          <Clock size={13} />
          <span>
            Uptime:{" "}
            <span className="text-[oklch(70%_0.01_260)] font-medium">
              {stats.uptime_human}
            </span>
          </span>
        </div>
      )}

      {/* Container overview */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-[oklch(45%_0.01_260)] uppercase tracking-wider">
            Containers
          </h2>
          <Link
            to="/containers"
            className="text-xs text-[oklch(65%_0.18_250)] hover:underline"
          >
            Manage all →
          </Link>
        </div>
        {containerList && containerList.length > 0 ? (
          <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] divide-y divide-[oklch(20%_0.01_260)]">
            {containerList.map((c: ContainerInfo) => (
              <div
                key={c.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium text-white truncate">
                    {c.name}
                  </span>
                  <span className="text-xs text-[oklch(40%_0.01_260)] font-mono truncate hidden sm:inline">
                    {c.image}
                  </span>
                </div>
                <Badge
                  status={
                    c.status === "running"
                      ? "active"
                      : c.status === "exited"
                        ? "inactive"
                        : c.status === "restarting"
                          ? "activating"
                          : c.status === "paused"
                            ? "deactivating"
                            : "unknown"
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] px-4 py-8 text-center text-sm text-[oklch(45%_0.01_260)]">
            No containers running
          </div>
        )}
      </section>

      {/* Shutdown modal */}
      {shutdownState !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-[oklch(14%_0.01_260)] border border-[oklch(22%_0.01_260)] shadow-2xl p-6 flex flex-col items-center gap-4">
            <div
              className={`p-3 rounded-full ${shutdownState === "done" ? "bg-[oklch(40%_0.01_260)]/20" : "bg-[oklch(60%_0.22_25)]/15"}`}
            >
              <PowerOff
                size={28}
                className={
                  shutdownState === "done"
                    ? "text-[oklch(50%_0.01_260)]"
                    : "text-[oklch(65%_0.22_25)]"
                }
              />
            </div>
            {shutdownState === "confirm" ? (
              <>
                <div className="text-center">
                  <p className="text-base font-semibold text-white">
                    Shut down the Pi?
                  </p>
                  <p className="text-sm text-[oklch(50%_0.01_260)] mt-1">
                    The Raspberry Pi will be shut down immediately.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full pt-1">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setShutdownState("idle")}
                  >
                    Cancel
                  </Button>
                  <Button variant="danger" size="md" onClick={handleShutdown}>
                    Shut down
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center">
                <p className="text-base font-semibold text-white">
                  Shutting down…
                </p>
                <p className="text-sm text-[oklch(50%_0.01_260)] mt-1">
                  The Pi will turn off shortly.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reboot modal */}
      {rebootState !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-[oklch(14%_0.01_260)] border border-[oklch(22%_0.01_260)] shadow-2xl p-6 flex flex-col items-center gap-4">
            <div
              className={`p-3 rounded-full ${rebootState === "done" ? "bg-[oklch(40%_0.01_260)]/20" : "bg-[oklch(55%_0.18_250)]/15"}`}
            >
              <RotateCcw
                size={28}
                className={
                  rebootState === "done"
                    ? "text-[oklch(50%_0.01_260)]"
                    : "text-[oklch(65%_0.18_250)]"
                }
              />
            </div>
            {rebootState === "confirm" ? (
              <>
                <div className="text-center">
                  <p className="text-base font-semibold text-white">
                    Reboot the Pi?
                  </p>
                  <p className="text-sm text-[oklch(50%_0.01_260)] mt-1">
                    The Raspberry Pi will restart. It will be back online in
                    about a minute.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full pt-1">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setRebootState("idle")}
                  >
                    Cancel
                  </Button>
                  <Button variant="primary" size="md" onClick={handleReboot}>
                    Reboot
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center">
                <p className="text-base font-semibold text-white">Rebooting…</p>
                <p className="text-sm text-[oklch(50%_0.01_260)] mt-1">
                  The Pi will be back online shortly.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
