import { Compass } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export default function NotFound() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-[oklch(11%_0.01_260)] flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="p-5 rounded-full bg-[oklch(65%_0.18_250)]/10 border border-[oklch(65%_0.18_250)]/20">
            <Compass
              size={48}
              strokeWidth={1.5}
              className="text-[oklch(65%_0.18_250)]"
            />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">Page Not Found</h1>
          <p className="text-sm text-[oklch(55%_0.01_260)] leading-relaxed">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        {/* Requested path */}
        <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] px-4 py-3 text-left space-y-1">
          <p className="text-xs text-[oklch(40%_0.01_260)]">Requested path</p>
          <p className="text-xs font-mono text-[oklch(60%_0.01_260)] truncate">
            {pathname}
          </p>
        </div>

        {/* Action */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[oklch(65%_0.18_250)] hover:bg-[oklch(60%_0.18_250)] text-white text-sm font-medium transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
