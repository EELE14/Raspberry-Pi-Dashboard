import { cn } from "../../lib/utils";

type Status =
  | "active"
  | "inactive"
  | "failed"
  | "unknown"
  | "activating"
  | "deactivating";

interface BadgeProps {
  status: Status;
  className?: string;
}

const config: Record<Status, { dot: string; text: string; label: string }> = {
  active: {
    dot: "bg-[oklch(65%_0.18_145)]",
    text: "text-[oklch(75%_0.15_145)]",
    label: "active",
  },
  activating: {
    dot: "bg-[oklch(75%_0.18_80)] animate-pulse",
    text: "text-[oklch(80%_0.15_80)]",
    label: "activating",
  },
  deactivating: {
    dot: "bg-[oklch(75%_0.18_80)] animate-pulse",
    text: "text-[oklch(80%_0.15_80)]",
    label: "deactivating",
  },
  inactive: {
    dot: "bg-[oklch(45%_0.01_260)]",
    text: "text-[oklch(55%_0.01_260)]",
    label: "inactive",
  },
  failed: {
    dot: "bg-[oklch(60%_0.22_25)]",
    text: "text-[oklch(65%_0.18_25)]",
    label: "failed",
  },
  unknown: {
    dot: "bg-[oklch(40%_0.01_260)]",
    text: "text-[oklch(50%_0.01_260)]",
    label: "unknown",
  },
};

export default function Badge({ status, className }: BadgeProps) {
  const { dot, text, label } = config[status] ?? config.unknown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        text,
        className,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", dot)} />
      {label}
    </span>
  );
}
