import type { NetworkInterface } from "../../types/api";

interface Props {
  iface: NetworkInterface;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export default function InterfaceCard({ iface }: Props) {
  return (
    <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-white">{iface.name}</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            iface.is_up
              ? "bg-[oklch(50%_0.18_145)]/15 text-[oklch(65%_0.18_145)]"
              : "bg-[oklch(35%_0.01_260)]/20 text-[oklch(45%_0.01_260)]"
          }`}
        >
          {iface.is_up ? "UP" : "DOWN"}
        </span>
      </div>

      <div className="space-y-1 text-xs text-[oklch(55%_0.01_260)]">
        {iface.ip && (
          <div className="flex justify-between">
            <span>IP</span>
            <span className="text-[oklch(75%_0.01_260)] font-mono">
              {iface.ip}
            </span>
          </div>
        )}
        {iface.mac && (
          <div className="flex justify-between">
            <span>MAC</span>
            <span className="text-[oklch(55%_0.01_260)] font-mono text-[10px]">
              {iface.mac}
            </span>
          </div>
        )}
        {iface.speed_mb > 0 && (
          <div className="flex justify-between">
            <span>Speed</span>
            <span className="text-[oklch(65%_0.01_260)]">
              {iface.speed_mb} Mb/s
            </span>
          </div>
        )}
        <div className="flex justify-between pt-1 border-t border-[oklch(22%_0.01_260)]">
          <span>↑ Sent</span>
          <span>{formatBytes(iface.bytes_sent)}</span>
        </div>
        <div className="flex justify-between">
          <span>↓ Recv</span>
          <span>{formatBytes(iface.bytes_recv)}</span>
        </div>
      </div>
    </div>
  );
}
