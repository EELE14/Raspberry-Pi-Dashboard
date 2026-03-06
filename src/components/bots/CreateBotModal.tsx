import { type FormEvent, useState } from "react";
import { X } from "lucide-react";
import { createBot } from "../../lib/api";
import Button from "../ui/Button";

interface CreateBotModalProps {
  onClose: () => void;
  onCreated: () => void;
}

type BotType = "command" | "python";

export default function CreateBotModal({
  onClose,
  onCreated,
}: CreateBotModalProps) {
  const [name, setName] = useState("");
  const [botType, setBotType] = useState<BotType>("command");
  // command mode
  const [execStart, setExecStart] = useState("");
  // python mode
  const [scriptPath, setScriptPath] = useState("");
  const [venvPath, setVenvPath] = useState("");
  const [installRequirements, setInstallRequirements] = useState(false);
  const [description, setDescription] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resolvedVenv(): string {
    if (botType !== "python") return "";
    if (venvPath.trim()) return venvPath.trim().replace(/\/$/, "");
    // only for absoulute paths (backend enforcement anyways)
    const script = scriptPath.trim();
    if (!script.startsWith("/")) return "";
    const dir = script.replace(/\/[^/]+$/, "") || "/";
    return `${dir}/.venv`;
  }

  function buildExecStart(): string {
    if (botType === "command") return execStart.trim();
    const venv = resolvedVenv();
    const python = venv ? `${venv}/bin/python` : "/usr/bin/python3";
    return `${python} ${scriptPath.trim()}`;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const venv = resolvedVenv();
      await createBot({
        name,
        exec_start: buildExecStart(),
        description,
        auto_start: autoStart,
        ...(botType === "python" && venv ? { venv_path: venv } : {}),
        ...(botType === "python" && installRequirements
          ? { install_requirements: true }
          : {}),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating bot.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 rounded-lg bg-[oklch(12%_0.01_260)] border border-[oklch(25%_0.01_260)] text-white text-sm font-mono placeholder-[oklch(35%_0.01_260)] focus:outline-none focus:border-[oklch(65%_0.18_250)] transition";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-[oklch(16%_0.01_260)] border border-[oklch(25%_0.01_260)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[oklch(22%_0.01_260)]">
          <h2 className="font-semibold text-white">Create new bot</h2>
          <button
            onClick={onClose}
            className="text-[oklch(45%_0.01_260)] hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-[oklch(65%_0.01_260)] mb-1.5">
              Name{" "}
              <span className="text-[oklch(50%_0.01_260)] font-normal">
                (letters, digits, _-)
              </span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mybot"
              required
              pattern="^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$"
              className={inputCls}
            />
          </div>

          {/* Type toggle */}
          <div>
            <label className="block text-xs font-medium text-[oklch(65%_0.01_260)] mb-1.5">
              Type
            </label>
            <div className="flex rounded-lg overflow-hidden border border-[oklch(25%_0.01_260)]">
              {(["command", "python"] as BotType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBotType(t)}
                  className={`flex-1 py-1.5 text-sm transition ${
                    botType === t
                      ? "bg-[oklch(65%_0.18_250)] text-white font-medium"
                      : "bg-[oklch(12%_0.01_260)] text-[oklch(55%_0.01_260)] hover:text-white"
                  }`}
                >
                  {t === "command" ? "Command" : "Python Script"}
                </button>
              ))}
            </div>
          </div>

          {/* Command mode */}
          {botType === "command" && (
            <div>
              <label className="block text-xs font-medium text-[oklch(65%_0.01_260)] mb-1.5">
                ExecStart{" "}
                <span className="text-[oklch(50%_0.01_260)] font-normal">
                  (absolute path + optional args)
                </span>
              </label>
              <input
                type="text"
                value={execStart}
                onChange={(e) => setExecStart(e.target.value)}
                placeholder="/home/pi/bots/mybot/run.sh"
                required
                className={inputCls}
              />
            </div>
          )}

          {/* Python mode */}
          {botType === "python" && (
            <>
              <div>
                <label className="block text-xs font-medium text-[oklch(65%_0.01_260)] mb-1.5">
                  Script path
                </label>
                <input
                  type="text"
                  value={scriptPath}
                  onChange={(e) => setScriptPath(e.target.value)}
                  placeholder="/home/pi/bots/mybot/main.py"
                  required
                  pattern="^\/.*"
                  title="Must be an absolute path starting with /"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[oklch(65%_0.01_260)] mb-1.5">
                  Venv path{" "}
                  <span className="text-[oklch(50%_0.01_260)] font-normal">
                    (optional — auto-created next to script if left empty)
                  </span>
                </label>
                <input
                  type="text"
                  value={venvPath}
                  onChange={(e) => setVenvPath(e.target.value)}
                  placeholder={resolvedVenv() || "/home/pi/bots/mybot/.venv"}
                  className={inputCls}
                />
              </div>
              {/* Preview */}
              <div className="rounded-lg bg-[oklch(11%_0.01_260)] border border-[oklch(22%_0.01_260)] px-3 py-2">
                <p className="text-xs text-[oklch(45%_0.01_260)] mb-1">
                  ExecStart preview
                </p>
                <p className="text-xs font-mono text-[oklch(60%_0.01_260)] break-all">
                  {buildExecStart() || (
                    <span className="text-[oklch(35%_0.01_260)]">—</span>
                  )}
                </p>
              </div>
              {/* Install requirements.txt */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={installRequirements}
                  onChange={(e) => setInstallRequirements(e.target.checked)}
                  className="w-4 h-4 rounded accent-[oklch(65%_0.18_250)]"
                />
                <span className="text-sm text-[oklch(70%_0.01_260)]">
                  Install <span className="font-mono">requirements.txt</span>{" "}
                  after venv creation
                  <span className="block text-xs text-[oklch(45%_0.01_260)] font-normal mt-0.5">
                    Requires a requirements.txt in the script directory
                  </span>
                </span>
              </label>
            </>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-[oklch(65%_0.01_260)] mb-1.5">
              Description{" "}
              <span className="text-[oklch(50%_0.01_260)] font-normal">
                (optional)
              </span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="My bot"
              maxLength={128}
              className={inputCls.replace("font-mono", "")}
            />
          </div>

          {/* auto_start */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="w-4 h-4 rounded accent-[oklch(65%_0.18_250)]"
            />
            <span className="text-sm text-[oklch(70%_0.01_260)]">
              Automatically start bot after creation
            </span>
          </label>

          {error && (
            <p className="text-sm text-[oklch(65%_0.18_25)] bg-[oklch(60%_0.22_25)]/10 border border-[oklch(60%_0.22_25)]/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              className="flex-1"
            >
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
