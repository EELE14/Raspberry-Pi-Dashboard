import { ShieldOff } from "lucide-react";
import { useSearchParams } from "react-router-dom";

export default function AccessDenied() {
  const [params] = useSearchParams();
  const reason =
    params.get("reason") ?? "Your access has been denied by the server.";

  return (
    <div className="min-h-screen bg-[oklch(11%_0.01_260)] flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="p-5 rounded-full bg-[oklch(60%_0.22_25)]/10 border border-[oklch(60%_0.22_25)]/20">
            <ShieldOff
              size={48}
              strokeWidth={1.5}
              className="text-[oklch(65%_0.22_25)]"
            />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">Access Denied</h1>
          <p className="text-sm text-[oklch(55%_0.01_260)] leading-relaxed">
            {reason}
          </p>
        </div>

        {/* Info box */}
        <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] px-4 py-3 text-left">
          <p className="text-xs text-[oklch(45%_0.01_260)]">
            If you believe this is an error, contact the server administrator
            and provide your IP address.
          </p>
        </div>
      </div>
    </div>
  );
}
