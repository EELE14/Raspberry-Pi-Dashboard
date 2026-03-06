import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { usePiStatus } from "../../hooks/usePiStatus";

export default function OfflineOverlay() {
  const { isOffline } = usePiStatus();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isOffline) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [isOffline]);

  if (!isOffline) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const elapsedStr =
    mins > 0 ? `${mins}m ${secs.toString().padStart(2, "0")}s` : `${secs}s`;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[oklch(9%_0.01_260)]">
      <div className="flex flex-col items-center gap-8 text-center px-6">
        {/* Icon with pulsing rings */}
        <div className="relative flex items-center justify-center w-36 h-36">
          <div
            className="absolute inset-0 rounded-full bg-[oklch(60%_0.22_25)]/8 animate-ping"
            style={{ animationDuration: "2s" }}
          />
          <div className="absolute inset-4 rounded-full bg-[oklch(60%_0.22_25)]/10" />
          <div className="relative rounded-full bg-[oklch(60%_0.22_25)]/15 p-7 border border-[oklch(60%_0.22_25)]/25">
            <WifiOff
              size={42}
              className="text-[oklch(65%_0.18_25)]"
              strokeWidth={1.5}
            />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-[0.15em] text-white uppercase">
            PI Offline
          </h1>
          <p className="text-sm text-[oklch(42%_0.01_260)]">
            The Raspberry Pi is not reachable
          </p>
        </div>

        {/* Reconnecting indicator */}
        <div className="flex items-center gap-2.5 text-xs text-[oklch(38%_0.01_260)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[oklch(65%_0.18_145)] animate-pulse" />
          Reconnecting automatically…
        </div>

        {/* Elapsed time — only show after 3s to avoid flash */}
        {elapsed >= 3 && (
          <p className="text-xs text-[oklch(30%_0.01_260)] font-mono tabular-nums">
            Offline for {elapsedStr}
          </p>
        )}
      </div>
    </div>
  );
}
