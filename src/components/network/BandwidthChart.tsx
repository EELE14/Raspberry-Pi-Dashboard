import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import type { BandwidthPoint } from "../../types/api";

interface ChartEntry {
  t: number;
  sent: number;
  recv: number;
}

interface Props {
  data: BandwidthPoint[];
  interfaceName?: string;
}

function formatBps(v: number | undefined): string {
  if (v == null) return "—";
  if (v < 1024) return `${v} B/s`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB/s`;
  return `${(v / 1024 ** 2).toFixed(2)} MB/s`;
}

export default function BandwidthChart({ data, interfaceName }: Props) {
  const chartData: ChartEntry[] = data.map((point) => {
    const iface = interfaceName
      ? point.interfaces.find((i) => i.name === interfaceName)
      : point.interfaces.reduce(
          (acc, i) => ({
            name: i.name,
            bytes_sent_s: acc.bytes_sent_s + i.bytes_sent_s,
            bytes_recv_s: acc.bytes_recv_s + i.bytes_recv_s,
          }),
          { name: "total", bytes_sent_s: 0, bytes_recv_s: 0 },
        );
    return {
      t: new Date(point.ts).getTime(),
      sent: iface?.bytes_sent_s ?? 0,
      recv: iface?.bytes_recv_s ?? 0,
    };
  });

  return (
    <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] p-4">
      <p className="text-xs text-[oklch(45%_0.01_260)] mb-3">
        Live Bandwidth{" "}
        {interfaceName ? `— ${interfaceName}` : "(all interfaces)"}
      </p>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorRecv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            contentStyle={{
              background: "#11111a",
              border: "none",
              borderRadius: 6,
              fontSize: 11,
            }}
            formatter={(v: number | undefined, name: string | undefined) => [
              formatBps(v),
              name === "sent" ? "Upload" : "Download",
            ]}
            labelFormatter={() => ""}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "oklch(50% 0.01 260)" }}
            formatter={(value) => (value === "sent" ? "Upload" : "Download")}
          />
          <Area
            type="monotone"
            dataKey="sent"
            stroke="#818cf8"
            strokeWidth={1.5}
            fill="url(#colorSent)"
            dot={false}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="recv"
            stroke="#22d3ee"
            strokeWidth={1.5}
            fill="url(#colorRecv)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
