import { cn } from "../../lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  percent?: number; // 0–100, shows a progress bar when provided
  icon?: React.ReactNode;
  barColor?: string; // Tailwind bg class or inline color
  warning?: boolean; // Turns bar orange above threshold
  danger?: boolean; // Turns bar red above threshold
}

export default function StatCard({
  label,
  value,
  subValue,
  percent,
  icon,
  warning = false,
  danger = false,
}: StatCardProps) {
  const barColor = danger
    ? "bg-[oklch(60%_0.22_25)]"
    : warning
      ? "bg-[oklch(75%_0.18_80)]"
      : "bg-[oklch(65%_0.18_250)]";

  return (
    <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[oklch(50%_0.01_260)] uppercase tracking-wider">
          {label}
        </span>
        {icon && <span className="text-[oklch(50%_0.01_260)]">{icon}</span>}
      </div>

      {/* Value */}
      <div>
        <span className="text-2xl font-bold text-white tabular-nums">
          {value}
        </span>
        {subValue && (
          <span className="ml-2 text-xs text-[oklch(50%_0.01_260)]">
            {subValue}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {percent !== undefined && (
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-[oklch(22%_0.01_260)] overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                barColor,
              )}
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </div>
          <span className="text-xs text-[oklch(45%_0.01_260)]">
            {percent.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
