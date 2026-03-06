import { useEffect, useRef, useState } from "react";
import { RefreshCw, Network as NetworkIcon } from "lucide-react";
import { getNetwork, getProcesses, getPorts } from "../lib/api";
import { wsUrl } from "../lib/ws";
import { useApi } from "../hooks/useApi";
import InterfaceCard from "../components/network/InterfaceCard";
import ProcessTable from "../components/network/ProcessTable";
import BandwidthChart from "../components/network/BandwidthChart";
import PortTable from "../components/network/PortTable";
import Button from "../components/ui/Button";
import type { BandwidthPoint } from "../types/api";

const MAX_BW_POINTS = 60; // 60 seconds of history

export default function Network() {
  const {
    data: network,
    loading: netLoading,
    refetch: refetchNet,
  } = useApi(getNetwork, [], 30_000);
  const {
    data: procList,
    loading: procLoading,
    refetch: refetchProcs,
  } = useApi(getProcesses, [], 5_000);
  const {
    data: portList,
    loading: portsLoading,
    refetch: refetchPorts,
  } = useApi(getPorts, [], 10_000);

  const [bwData, setBwData] = useState<BandwidthPoint[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(wsUrl("/network/stream"));
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const point = JSON.parse(e.data as string) as BandwidthPoint;
        setBwData((prev) => {
          const next = [...prev, point];
          return next.length > MAX_BW_POINTS
            ? next.slice(-MAX_BW_POINTS)
            : next;
        });
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  function refresh() {
    refetchNet();
    refetchProcs();
    refetchPorts();
  }

  const loading = netLoading || procLoading || portsLoading;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Network</h1>
          <p className="text-sm text-[oklch(50%_0.01_260)] mt-0.5">
            Interfaces, bandwidth and processes
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {/* Interfaces */}
      <section>
        <h2 className="text-xs font-semibold text-[oklch(45%_0.01_260)] uppercase tracking-wider mb-3">
          Interfaces
        </h2>
        {network && network.interfaces.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {network.interfaces
              .filter((i) => i.is_up || i.ip)
              .map((iface) => (
                <InterfaceCard key={iface.name} iface={iface} />
              ))}
          </div>
        ) : (
          <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] px-4 py-8 text-center text-sm text-[oklch(45%_0.01_260)]">
            {netLoading ? "Loading…" : "No interfaces found"}
          </div>
        )}
      </section>

      {/* Live bandwidth chart */}
      <section>
        <h2 className="text-xs font-semibold text-[oklch(45%_0.01_260)] uppercase tracking-wider mb-3">
          Live Bandwidth
        </h2>
        {bwData.length > 1 ? (
          <BandwidthChart data={bwData} />
        ) : (
          <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] px-4 py-8 text-center text-sm text-[oklch(45%_0.01_260)]">
            <NetworkIcon size={24} className="mx-auto mb-2 opacity-40" />
            Collecting data…
          </div>
        )}
      </section>

      {/* Process table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-[oklch(45%_0.01_260)] uppercase tracking-wider">
            Processes
          </h2>
          <span className="text-xs text-[oklch(40%_0.01_260)]">
            Top {procList?.processes.length ?? 0} by CPU · auto-refreshes every
            5s
          </span>
        </div>
        {procList && procList.processes.length > 0 ? (
          <ProcessTable
            processes={procList.processes}
            onKilled={refetchProcs}
          />
        ) : (
          <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] px-4 py-8 text-center text-sm text-[oklch(45%_0.01_260)]">
            {procLoading ? "Loading…" : "No processes"}
          </div>
        )}
      </section>

      {/* Port table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-[oklch(45%_0.01_260)] uppercase tracking-wider">
            Ports
          </h2>
          <span className="text-xs text-[oklch(40%_0.01_260)]">
            {portList ? `${portList.ports.length} connections` : ""} ·
            auto-refreshes every 10s
          </span>
        </div>
        {portList && portList.ports.length > 0 ? (
          <PortTable ports={portList.ports} onKilled={refetchPorts} />
        ) : (
          <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] px-4 py-8 text-center text-sm text-[oklch(45%_0.01_260)]">
            {portsLoading ? "Loading…" : "No ports found"}
          </div>
        )}
      </section>
    </div>
  );
}
