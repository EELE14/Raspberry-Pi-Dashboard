import { type FormEvent, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { verifyTotpCode } from "../../lib/api";
import { registerTotpReauthHandler } from "../../lib/totpReauth";

export default function TotpReauthModal() {
  const { logout } = useAuth();
  const [visible, setVisible] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resolveRef = useRef<(() => void) | null>(null);
  const rejectRef = useRef<((err: Error) => void) | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    registerTotpReauthHandler((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current = reject;
      setCode("");
      setError(null);
      setVisible(true);
    });

    return () => {
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (c.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const { session_token } = await verifyTotpCode(c);
      localStorage.setItem("totp_session", session_token);
      setVisible(false);
      resolveRef.current?.();
    } catch {
      setLoading(false);
      setCode("");
      setError("Invalid code. Signing out…");
      rejectRef.current?.(new Error("TOTP reauth failed"));
      logoutTimerRef.current = setTimeout(() => {
        setVisible(false);
        logout();
      }, 1200);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-[oklch(14%_0.01_260)] border border-white/10 rounded-2xl p-6 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[oklch(16%_0.01_260)] border border-white/10 mb-3">
            <ShieldCheck
              size={24}
              strokeWidth={1.5}
              className="text-[oklch(65%_0.18_250)]"
            />
          </div>
          <h2 className="text-lg font-semibold text-white">Session expired</h2>
          <p className="text-sm text-[oklch(50%_0.01_260)] mt-1">
            Enter your 2FA code to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            autoFocus
            autoComplete="one-time-code"
            disabled={loading || error !== null}
            className="w-full px-3 py-2.5 rounded-lg bg-[oklch(16%_0.01_260)] border border-white/10 text-white text-center text-2xl tracking-[0.5em] font-mono placeholder-[oklch(40%_0.01_260)] focus:outline-none focus:border-[oklch(65%_0.18_250)] focus:ring-1 focus:ring-[oklch(65%_0.18_250)] transition disabled:opacity-50"
          />

          {error && (
            <p className="text-sm text-[oklch(60%_0.22_25)] bg-[oklch(60%_0.22_25)]/10 border border-[oklch(60%_0.22_25)]/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6 || error !== null}
            className="w-full py-2.5 rounded-lg bg-[oklch(65%_0.18_250)] text-white font-medium hover:bg-[oklch(60%_0.18_250)] disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? "Verifying…" : "Continue"}
          </button>
        </form>

        <p className="mt-3 text-xs text-center text-[oklch(35%_0.01_260)]"></p>
      </div>
    </div>
  );
}
