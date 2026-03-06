import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LucideServer, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { getTotpStatus, verifyTotpCode } from "../lib/api";
import { getApiBase } from "../lib/serverStore";

type Step = "token" | "totp";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("token");
  const [token, setToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // check on mount if banned
  useEffect(() => {
    fetch(`${getApiBase()}/api/health`)
      .then(async (res) => {
        if (res.status === 403) {
          const payload = (await res.json().catch(() => ({}))) as {
            detail?: string;
          };
          const reason = payload.detail ?? "Access denied.";
          navigate(`/access-denied?reason=${encodeURIComponent(reason)}`);
        }
      })
      .catch(() => {
        // Server unreachable
      });
  }, [navigate]);

  async function handleTokenSubmit(e: FormEvent) {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      // Store the token temporarily so verifyTotpCode can use it as Bearer
      localStorage.setItem("api_token", t);
      const status = await getTotpStatus();
      if (status.enabled) {
        // dont complete login yet
        setStep("totp");
      } else {
        await login(t);
      }
    } catch {
      localStorage.removeItem("api_token");
      setError("Could not reach the server. Check the URL and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTotpSubmit(e: FormEvent) {
    e.preventDefault();
    const code = totpCode.trim();
    if (code.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const { session_token } = await verifyTotpCode(code);
      localStorage.setItem("totp_session", session_token);
      await login(token.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code. Try again.");
      setTotpCode("");
    } finally {
      setLoading(false);
    }
  }

  function handleBackToToken() {
    localStorage.removeItem("api_token");
    setStep("token");
    setTotpCode("");
    setError(null);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[oklch(10%_0.01_260)]">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[oklch(16%_0.01_260)] border border-white/10 mb-4">
            {step === "totp" ? (
              <ShieldCheck
                size={28}
                strokeWidth={1}
                className="text-[oklch(65%_0.18_250)]"
              />
            ) : (
              <LucideServer size={28} strokeWidth={1} />
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">PI Server</h1>
          <p className="text-sm text-[oklch(55%_0.01_260)] mt-1">
            {step === "totp" ? "Enter your 2FA code" : "Enter your API token"}
          </p>
        </div>

        {step === "token" ? (
          <form onSubmit={handleTokenSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="token"
                className="block text-sm font-medium text-[oklch(75%_0.01_260)] mb-1.5"
              >
                API Token
              </label>
              <input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter token…"
                autoComplete="current-password"
                className="w-full px-3 py-2.5 rounded-lg bg-[oklch(16%_0.01_260)] border border-white/10 text-white placeholder-[oklch(40%_0.01_260)] focus:outline-none focus:border-[oklch(65%_0.18_250)] focus:ring-1 focus:ring-[oklch(65%_0.18_250)] transition"
              />
            </div>

            {error && (
              <p className="text-sm text-[oklch(60%_0.22_25)] bg-[oklch(60%_0.22_25)]/10 border border-[oklch(60%_0.22_25)]/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="w-full py-2.5 rounded-lg bg-[oklch(65%_0.18_250)] text-white font-medium hover:bg-[oklch(60%_0.18_250)] disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Connecting…" : "Continue"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleTotpSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="totp"
                className="block text-sm font-medium text-[oklch(75%_0.01_260)] mb-1.5"
              >
                Authentication Code
              </label>
              <input
                id="totp"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoFocus
                autoComplete="one-time-code"
                className="w-full px-3 py-2.5 rounded-lg bg-[oklch(16%_0.01_260)] border border-white/10 text-white text-center text-2xl tracking-[0.5em] font-mono placeholder-[oklch(40%_0.01_260)] focus:outline-none focus:border-[oklch(65%_0.18_250)] focus:ring-1 focus:ring-[oklch(65%_0.18_250)] transition"
              />
              <p className="mt-1.5 text-xs text-[oklch(40%_0.01_260)]">
                Open your authenticator app and enter the 6-digit code.
              </p>
            </div>

            {error && (
              <p className="text-sm text-[oklch(60%_0.22_25)] bg-[oklch(60%_0.22_25)]/10 border border-[oklch(60%_0.22_25)]/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full py-2.5 rounded-lg bg-[oklch(65%_0.18_250)] text-white font-medium hover:bg-[oklch(60%_0.18_250)] disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Verifying…" : "Sign in"}
            </button>

            <button
              type="button"
              onClick={handleBackToToken}
              className="w-full py-2 text-sm text-[oklch(45%_0.01_260)] hover:text-white transition"
            >
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
