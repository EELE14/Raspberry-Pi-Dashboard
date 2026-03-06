import { cn } from "../../lib/utils";

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
}

export default function Card({
  title,
  children,
  className,
  headerRight,
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)]",
        className,
      )}
    >
      {title !== undefined && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-[oklch(22%_0.01_260)]">
          <h2 className="text-sm font-semibold text-[oklch(80%_0.01_260)]">
            {title}
          </h2>
          {headerRight}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
