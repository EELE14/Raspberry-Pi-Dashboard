import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-[oklch(65%_0.18_250)]/5 border border-[oklch(65%_0.18_250)]/25 text-[oklch(65%_0.18_250)] hover:bg-[oklch(65%_0.18_250)]/12 hover:border-[oklch(65%_0.18_250)]/50 hover:text-[oklch(72%_0.18_250)]",
  secondary:
    "bg-[oklch(20%_0.01_260)] hover:bg-[oklch(24%_0.01_260)] text-white border border-[oklch(28%_0.01_260)]",
  danger:
    "bg-transparent border border-[oklch(60%_0.22_25)]/35 text-[oklch(65%_0.22_25)] hover:bg-[oklch(60%_0.22_25)]/12 hover:border-[oklch(60%_0.22_25)]/60 hover:text-[oklch(72%_0.22_25)]",
  ghost:
    "bg-transparent hover:bg-[oklch(20%_0.01_260)] text-[oklch(75%_0.01_260)]",
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs rounded-md",
  md: "px-3.5 py-1.5 text-sm rounded-lg",
};

export default function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center gap-1.5 font-medium transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : null}
      {children}
    </button>
  );
}
