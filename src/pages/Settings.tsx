import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart2,
  CheckCircle2,
  FolderCode,
  GitBranch,
  Globe,
  Key,
  Plus,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  ShieldOff,
  Trash2,
  XCircle,
} from "lucide-react";
import QRCode from "qrcode";
import { useApi } from "../hooks/useApi";
import {
  confirmTotpSetup,
  disableTotp,
  getGitConfig,
  getTotpSetup,
  getTotpStatus,
  saveGitConfig,
} from "../lib/api";
import { wsUrl } from "../lib/ws";
import { useServer } from "../context/ServerContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-lg bg-[oklch(13%_0.01_260)] border border-[oklch(22%_0.01_260)] " +
  "text-white text-sm placeholder-[oklch(35%_0.01_260)] " +
  "focus:outline-none focus:border-[oklch(65%_0.18_250)] focus:ring-1 focus:ring-[oklch(65%_0.18_250)] transition";

const LABEL_CLASS =
  "text-xs font-medium text-[oklch(55%_0.01_260)] flex items-center gap-1.5";

export default function Settings() {
  const {
    profiles,
    activeId,
    defaultUrl,
    addServer,
    removeServer,
    switchServer,
    switchToDefault,
  } = useServer();

  // stats history range
  const [historyMinutes, setHistoryMinutes] = useState<string>(
    () => localStorage.getItem("stats_history_minutes") ?? "60",
  );
  function handleHistoryChange(value: string) {
    setHistoryMinutes(value);
    localStorage.setItem("stats_history_minutes", value);
  }

  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newToken, setNewToken] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  function handleAddServer() {
    const url = newUrl.trim().replace(/\/+$/, "");
    if (!url) {
      setAddError("URL is required.");
      return;
    }
    if (!url.startsWith("http")) {
      setAddError("URL must start with http:// or https://");
      return;
    }
    const name =
      newName.trim() ||
      (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return url;
        }
      })();
    addServer(name, url, newToken.trim());
    setNewName("");
    setNewUrl("");
    setNewToken("");
    setAddError(null);
  }

  const { data: config, loading, error, refetch } = useApi(getGitConfig, []);

  // form state
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [workingDir, setWorkingDir] = useState("/home/pi/dashboard");
  const [changeToken, setChangeToken] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // update stream state
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateLines, setUpdateLines] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Populate form when config loads
  useEffect(() => {
    if (!config) return;
    setRepoUrl(config.repo_url);
    setBranch(config.branch);
    setWorkingDir(config.working_dir);
    setChangeToken(false);
    setTokenInput("");
  }, [config]);

  // Auto-scroll output console
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [updateLines]);

  // Cleanup websocket on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const isDirty =
    config !== null &&
    (repoUrl !== config.repo_url ||
      branch !== config.branch ||
      workingDir !== config.working_dir ||
      changeToken ||
      (!config.has_token && tokenInput !== ""));

  // handlers

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveGitConfig({
        repo_url: repoUrl,
        branch: branch || "main",
        working_dir: workingDir,

        ...(changeToken || (!config?.has_token && tokenInput !== "")
          ? { access_token: tokenInput }
          : {}),
      });
      setSaveMsg({ ok: true, text: "Configuration saved." });
      setChangeToken(false);
      setTokenInput("");
      refetch();
    } catch (e) {
      setSaveMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Save failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleUpdate() {
    if (isUpdating || wsRef.current) return;
    setUpdateLines([]);
    setIsUpdating(true);

    const ws = new WebSocket(wsUrl("/settings/update/stream"));
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const msg = typeof e.data === "string" ? e.data : String(e.data);
      setUpdateLines((prev) => [...prev, msg]);
    };

    ws.onclose = () => {
      setIsUpdating(false);
      wsRef.current = null;
      setUpdateLines((prev) => [
        ...prev,
        "",
        "── Connection closed. If the service restarted, the app will reconnect automatically.",
      ]);
    };

    ws.onerror = () => {
      setUpdateLines((prev) => [...prev, "✗ WebSocket connection error."]);
    };
  }

  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [totpSetup, setTotpSetup] = useState<{
    secret: string;
    otpauth_uri: string;
    qrDataUrl: string;
  } | null>(null);
  const [totpView, setTotpView] = useState<"qr" | "manual">("qr");
  const [totpConfirmCode, setTotpConfirmCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpMsg, setTotpMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const refreshTotpStatus = useCallback(async () => {
    try {
      const s = await getTotpStatus();
      setTotpEnabled(s.enabled);
    } catch {
      setTotpEnabled(false);
    }
  }, []);

  useEffect(() => {
    refreshTotpStatus();
  }, [refreshTotpStatus]);

  async function handleTotpSetup() {
    setTotpLoading(true);
    setTotpMsg(null);
    setTotpConfirmCode("");
    try {
      const data = await getTotpSetup();
      const qrDataUrl = await QRCode.toDataURL(data.otpauth_uri, {
        width: 200,
        margin: 2,
        color: { dark: "#ffffff", light: "#00000000" },
      });
      setTotpSetup({ ...data, qrDataUrl });
    } catch (e) {
      setTotpMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Setup failed.",
      });
    } finally {
      setTotpLoading(false);
    }
  }

  async function handleTotpConfirm() {
    if (totpConfirmCode.length !== 6) return;
    setTotpLoading(true);
    setTotpMsg(null);
    try {
      const { session_token } = await confirmTotpSetup(totpConfirmCode);
      localStorage.setItem("totp_session", session_token);
      setTotpSetup(null);
      setTotpConfirmCode("");
      setTotpMsg({
        ok: true,
        text: "2FA enabled. You are now signed in with 2FA.",
      });
      await refreshTotpStatus();
    } catch (e) {
      setTotpMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Invalid code.",
      });
      setTotpConfirmCode("");
    } finally {
      setTotpLoading(false);
    }
  }

  async function handleTotpDisable() {
    setTotpLoading(true);
    setTotpMsg(null);
    try {
      await disableTotp();
      localStorage.removeItem("totp_session");
      setTotpMsg({ ok: true, text: "2FA disabled." });
      await refreshTotpStatus();
    } catch (e) {
      setTotpMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Failed to disable 2FA.",
      });
    } finally {
      setTotpLoading(false);
    }
  }

  // render

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-[oklch(45%_0.01_260)] mt-0.5">
          Configure and trigger backend updates from a Git repository.
        </p>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-6">
          {/* Git configuration card */}
          <Card
            title="Git Repository"
            headerRight={
              <GitBranch size={14} className="text-[oklch(50%_0.01_260)]" />
            }
          >
            {loading ? (
              <p className="text-xs text-[oklch(45%_0.01_260)]">Loading…</p>
            ) : error ? (
              <p className="text-xs text-[oklch(65%_0.22_25)]">{error}</p>
            ) : (
              <div className="space-y-4">
                {/* Repository URL */}
                <div className="space-y-1.5">
                  <label className={LABEL_CLASS}>
                    <Globe size={12} />
                    Repository URL
                  </label>
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => {
                      setRepoUrl(e.target.value);
                      setSaveMsg(null);
                    }}
                    placeholder="https://github.com/user/repo.git"
                    className={INPUT_CLASS}
                  />
                </div>

                {/* Branch */}
                <div className="space-y-1.5">
                  <label className={LABEL_CLASS}>
                    <GitBranch size={12} />
                    Branch
                  </label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => {
                      setBranch(e.target.value);
                      setSaveMsg(null);
                    }}
                    placeholder="main"
                    className={INPUT_CLASS}
                  />
                </div>

                {/* Working directory */}
                <div className="space-y-1.5">
                  <label className={LABEL_CLASS}>
                    <FolderCode size={12} />
                    Working Directory (on Pi)
                  </label>
                  <input
                    type="text"
                    value={workingDir}
                    onChange={(e) => {
                      setWorkingDir(e.target.value);
                      setSaveMsg(null);
                    }}
                    placeholder="/home/pi/dashboard"
                    className={INPUT_CLASS}
                  />
                </div>

                {/* Access token */}
                <div className="space-y-1.5">
                  <label className={LABEL_CLASS}>
                    <Key size={12} />
                    Access Token
                  </label>

                  {config?.has_token && !changeToken ? (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[oklch(13%_0.01_260)] border border-[oklch(22%_0.01_260)]">
                      <div className="flex items-center gap-2">
                        <Key
                          size={13}
                          className="text-[oklch(65%_0.22_145)] shrink-0"
                        />
                        <span className="text-xs text-[oklch(65%_0.22_145)]">
                          Token configured
                        </span>
                      </div>
                      <button
                        onClick={() => setChangeToken(true)}
                        className="text-xs text-[oklch(55%_0.01_260)] hover:text-white transition-colors"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <input
                        type="password"
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        placeholder={
                          config?.has_token
                            ? "Enter new token (leave empty to remove)"
                            : "ghp_… or GitLab personal access token"
                        }
                        autoComplete="new-password"
                        className={INPUT_CLASS}
                      />
                      {config?.has_token && (
                        <button
                          onClick={() => {
                            setChangeToken(false);
                            setTokenInput("");
                          }}
                          className="text-xs text-[oklch(45%_0.01_260)] hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-[oklch(38%_0.01_260)]">
                    Required for private repositories. Stored on the Pi (never
                    sent back to the browser).
                  </p>
                </div>

                {/* Save feedback */}
                {saveMsg && (
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
                      saveMsg.ok
                        ? "bg-[oklch(65%_0.22_145)]/10 border-[oklch(65%_0.22_145)]/20 text-[oklch(65%_0.22_145)]"
                        : "bg-[oklch(60%_0.22_25)]/10 border-[oklch(60%_0.22_25)]/20 text-[oklch(65%_0.22_25)]"
                    }`}
                  >
                    {saveMsg.ok ? (
                      <CheckCircle2 size={13} />
                    ) : (
                      <XCircle size={13} />
                    )}
                    {saveMsg.text}
                  </div>
                )}

                <Button
                  variant="primary"
                  size="md"
                  loading={saving}
                  disabled={!isDirty || saving}
                  onClick={handleSave}
                >
                  {!saving && <Save size={14} />}
                  Save Configuration
                </Button>
              </div>
            )}
          </Card>

          {/* Pull & Restart card */}
          <Card
            title="Pull & Restart"
            headerRight={
              <RefreshCw size={14} className="text-[oklch(50%_0.01_260)]" />
            }
          >
            <div className="space-y-4">
              <div className="rounded-xl bg-[oklch(13%_0.01_260)] border border-[oklch(22%_0.01_260)] px-4 py-3">
                <p className="text-xs text-[oklch(45%_0.01_260)] leading-relaxed">
                  Pulls the latest commit from the configured branch and
                  restarts the dashboard service. The connection will briefly
                  drop while the service restarts — the app reconnects
                  automatically.
                </p>
              </div>

              <Button
                variant="danger"
                size="md"
                loading={isUpdating}
                disabled={!config?.repo_url || isUpdating}
                onClick={handleUpdate}
              >
                {!isUpdating && <RefreshCw size={14} />}
                {isUpdating ? "Updating…" : "Pull & Restart"}
              </Button>

              {/* Output console */}
              {updateLines.length > 0 && (
                <div
                  ref={outputRef}
                  className="rounded-lg bg-[oklch(8%_0.005_260)] border border-[oklch(18%_0.01_260)] p-3 h-64 overflow-y-auto font-mono text-xs leading-relaxed"
                >
                  {updateLines.map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.startsWith("✓")
                          ? "text-[oklch(65%_0.22_145)]"
                          : line.startsWith("✗")
                            ? "text-[oklch(65%_0.22_25)]"
                            : line.startsWith("→")
                              ? "text-[oklch(65%_0.18_250)]"
                              : line.startsWith("──")
                                ? "text-[oklch(38%_0.01_260)] pt-1"
                                : "text-[oklch(55%_0.01_260)]"
                      }
                    >
                      {line || "\u00a0"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* 2FA card */}
          <Card
            title="Two-Factor Authentication"
            headerRight={
              totpEnabled ? (
                <ShieldCheck size={14} className="text-[oklch(65%_0.22_145)]" />
              ) : (
                <ShieldOff size={14} className="text-[oklch(50%_0.01_260)]" />
              )
            }
          >
            <div className="space-y-4">
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    totpEnabled
                      ? "bg-[oklch(65%_0.22_145)]"
                      : "bg-[oklch(35%_0.01_260)]"
                  }`}
                />
                <span className="text-sm text-[oklch(65%_0.01_260)]">
                  {totpEnabled === null
                    ? "Loading…"
                    : totpEnabled
                      ? "2FA is enabled (TOTP)"
                      : "2FA is disabled"}
                </span>
              </div>

              {/* Message feedback */}
              {totpMsg && (
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
                    totpMsg.ok
                      ? "bg-[oklch(65%_0.22_145)]/10 border-[oklch(65%_0.22_145)]/20 text-[oklch(65%_0.22_145)]"
                      : "bg-[oklch(60%_0.22_25)]/10 border-[oklch(60%_0.22_25)]/20 text-[oklch(65%_0.22_25)]"
                  }`}
                >
                  {totpMsg.ok ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <XCircle size={13} />
                  )}
                  {totpMsg.text}
                </div>
              )}

              {/* Setup flow */}
              {!totpEnabled && (
                <>
                  {!totpSetup ? (
                    <Button
                      variant="primary"
                      size="md"
                      loading={totpLoading}
                      onClick={handleTotpSetup}
                    >
                      {!totpLoading && <ShieldCheck size={14} />}
                      Set up 2FA
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      {/* QR / manual toggle */}
                      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[oklch(13%_0.01_260)] border border-[oklch(22%_0.01_260)] w-fit">
                        {(["qr", "manual"] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() => setTotpView(v)}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                              totpView === v
                                ? "bg-[oklch(65%_0.18_250)] text-white"
                                : "text-[oklch(45%_0.01_260)] hover:text-white"
                            }`}
                          >
                            {v === "qr" ? "QR Code" : "Manual"}
                          </button>
                        ))}
                      </div>

                      {totpView === "qr" ? (
                        <div className="flex flex-col items-center gap-3">
                          <p className="text-xs text-[oklch(45%_0.01_260)] text-center">
                            Scan this QR code with Google Authenticator, Authy,
                            or any TOTP app.
                          </p>
                          <div className="p-3 rounded-xl bg-[oklch(13%_0.01_260)] border border-[oklch(22%_0.01_260)]">
                            <img
                              src={totpSetup.qrDataUrl}
                              alt="TOTP QR code"
                              width={180}
                              height={180}
                              className="block"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-[oklch(45%_0.01_260)]">
                            Can't scan? Enter this key manually in your
                            authenticator app.
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 px-3 py-2 rounded-lg bg-[oklch(13%_0.01_260)] border border-[oklch(22%_0.01_260)] text-xs font-mono text-[oklch(75%_0.01_260)] break-all select-all">
                              {totpSetup.secret.match(/.{1,4}/g)?.join(" ")}
                            </code>
                            <button
                              onClick={() =>
                                navigator.clipboard?.writeText(totpSetup.secret)
                              }
                              className="flex-shrink-0 px-2.5 py-2 rounded-lg bg-[oklch(13%_0.01_260)] border border-[oklch(22%_0.01_260)] text-xs text-[oklch(55%_0.01_260)] hover:text-white transition"
                              title="Copy to clipboard"
                            >
                              Copy
                            </button>
                          </div>
                          <p className="text-xs text-[oklch(35%_0.01_260)]">
                            Select "Time-based" when prompted. Issuer: PI Server
                          </p>
                        </div>
                      )}

                      {/* Confirm code */}
                      <div className="space-y-2 pt-1 border-t border-[oklch(22%_0.01_260)]">
                        <label className={LABEL_CLASS}>
                          <Key size={12} />
                          Confirm with your authenticator code
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="\d{6}"
                            maxLength={6}
                            value={totpConfirmCode}
                            onChange={(e) =>
                              setTotpConfirmCode(
                                e.target.value.replace(/\D/g, ""),
                              )
                            }
                            placeholder="000000"
                            autoComplete="one-time-code"
                            className={`${INPUT_CLASS} text-center font-mono tracking-widest`}
                          />
                          <Button
                            variant="primary"
                            size="md"
                            loading={totpLoading}
                            disabled={
                              totpConfirmCode.length !== 6 || totpLoading
                            }
                            onClick={handleTotpConfirm}
                          >
                            Activate
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Disable button */}
              {totpEnabled && (
                <div className="space-y-2">
                  <p className="text-xs text-[oklch(38%_0.01_260)]">
                    Disabling 2FA will log out all active sessions.
                  </p>
                  <Button
                    variant="danger"
                    size="md"
                    loading={totpLoading}
                    onClick={handleTotpDisable}
                  >
                    {!totpLoading && <ShieldOff size={14} />}
                    Disable 2FA
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card
          title="Servers"
          headerRight={
            <Server size={14} className="text-[oklch(50%_0.01_260)]" />
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              {(() => {
                const isActive = activeId === null;
                return (
                  <div
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
                      isActive
                        ? "bg-[oklch(65%_0.18_250)]/5 border-[oklch(65%_0.18_250)]/20"
                        : "bg-[oklch(13%_0.01_260)] border-[oklch(22%_0.01_260)]"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        isActive
                          ? "bg-[oklch(65%_0.22_145)]"
                          : "bg-[oklch(30%_0.01_260)]"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-white truncate">
                          Default
                        </span>
                        {isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[oklch(65%_0.22_145)]/15 text-[oklch(65%_0.22_145)] flex-shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[oklch(38%_0.01_260)] truncate font-mono">
                        {defaultUrl}
                      </div>
                    </div>
                    {!isActive && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={switchToDefault}
                        title="Switch to default server"
                      >
                        Switch
                      </Button>
                    )}
                  </div>
                );
              })()}

              {/* Saved profiles */}
              {profiles.map((p) => {
                const isActive = p.id === activeId;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
                      isActive
                        ? "bg-[oklch(65%_0.18_250)]/5 border-[oklch(65%_0.18_250)]/20"
                        : "bg-[oklch(13%_0.01_260)] border-[oklch(22%_0.01_260)]"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        isActive
                          ? "bg-[oklch(65%_0.22_145)]"
                          : "bg-[oklch(30%_0.01_260)]"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-white truncate">
                          {p.name}
                        </span>
                        {isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[oklch(65%_0.22_145)]/15 text-[oklch(65%_0.22_145)] flex-shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[oklch(38%_0.01_260)] truncate font-mono">
                        {p.url}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isActive && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => switchServer(p.id)}
                          title="Switch to this server"
                        >
                          Switch
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeServer(p.id)}
                        title={
                          isActive
                            ? "Switch to another server before removing"
                            : "Remove server"
                        }
                        disabled={isActive}
                        className="text-[oklch(50%_0.01_260)] hover:text-[oklch(65%_0.22_25)]"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add server form */}
            <div className="space-y-2.5 pt-1 border-t border-[oklch(22%_0.01_260)]">
              <p className="text-xs font-medium text-[oklch(55%_0.01_260)] flex items-center gap-1.5 pt-1">
                <Plus size={12} />
                Add server
              </p>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name (optional)"
                className={INPUT_CLASS}
              />
              <input
                type="text"
                value={newUrl}
                onChange={(e) => {
                  setNewUrl(e.target.value);
                  setAddError(null);
                }}
                placeholder="https://dash.example.com"
                className={INPUT_CLASS}
              />
              <input
                type="password"
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                placeholder="API token"
                autoComplete="new-password"
                className={INPUT_CLASS}
              />
              {addError && (
                <p className="text-xs text-[oklch(65%_0.22_25)]">{addError}</p>
              )}
              <Button variant="primary" size="sm" onClick={handleAddServer}>
                <Plus size={13} />
                Add server
              </Button>
            </div>

            <p className="text-xs text-[oklch(35%_0.01_260)]">
              Switching servers reloads the page and authenticates with the new
              server's token.
            </p>
          </div>
        </Card>

        {/* ── Dashboard settings ── */}
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BarChart2 size={15} className="text-[oklch(65%_0.18_250)]" />
              <h2 className="text-sm font-semibold text-white">Dashboard</h2>
            </div>

            <div>
              <label className={LABEL_CLASS}>Stats history timeframe</label>
              <p className="text-xs text-[oklch(40%_0.01_260)] mb-2">
                How much historical data to load into the charts when opening
                the dashboard.
              </p>
              <select
                value={historyMinutes}
                onChange={(e) => handleHistoryChange(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="60">1 hour</option>
                <option value="360">6 hours</option>
                <option value="720">12 hours</option>
                <option value="1440">24 hours</option>
              </select>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
