import { type FormEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import type { ContainerInfo, RestartPolicy } from "../../types/api";
import { wsUrl } from "../../lib/ws";
import Button from "../ui/Button";

interface CreateContainerModalProps {
  onClose: () => void;
  onCreated: () => void;
}

type SourceMode = "image" | "dockerfile";

interface IdRow {
  id: string;
  value: string;
}

interface EnvRow {
  id: string;
  key: string;
  val: string;
}

const INPUT_CLS =
  "w-full px-3 py-2 rounded-lg bg-[oklch(12%_0.01_260)] border border-[oklch(25%_0.01_260)] text-white text-sm font-mono placeholder-[oklch(35%_0.01_260)] focus:outline-none focus:border-[oklch(65%_0.18_250)] transition";

const LABEL_CLS = "block text-xs font-medium text-[oklch(65%_0.01_260)] mb-1.5";

export default function CreateContainerModal({
  onClose,
  onCreated,
}: CreateContainerModalProps) {
  const [name, setName] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("image");
  const [image, setImage] = useState("");
  const [dockerfilePath, setDockerfilePath] = useState("");
  const [contextPath, setContextPath] = useState("");

  const [ports, setPorts] = useState<IdRow[]>([]);
  const [volumes, setVolumes] = useState<IdRow[]>([]);
  const [envVars, setEnvVars] = useState<EnvRow[]>([]);

  function addPort() {
    setPorts((p) => [...p, { id: crypto.randomUUID(), value: "" }]);
  }
  function addVolume() {
    setVolumes((v) => [...v, { id: crypto.randomUUID(), value: "" }]);
  }
  function addEnvVar() {
    setEnvVars((e) => [...e, { id: crypto.randomUUID(), key: "", val: "" }]);
  }

  function removePort(id: string) {
    setPorts((p) => p.filter((r) => r.id !== id));
  }
  function removeVolume(id: string) {
    setVolumes((v) => v.filter((r) => r.id !== id));
  }
  function removeEnvVar(id: string) {
    setEnvVars((e) => e.filter((r) => r.id !== id));
  }

  function updatePort(id: string, value: string) {
    setPorts((p) => p.map((r) => (r.id === id ? { ...r, value } : r)));
  }
  function updateVolume(id: string, value: string) {
    setVolumes((v) => v.map((r) => (r.id === id ? { ...r, value } : r)));
  }
  function updateEnvKey(id: string, key: string) {
    setEnvVars((e) => e.map((r) => (r.id === id ? { ...r, key } : r)));
  }
  function updateEnvVal(id: string, val: string) {
    setEnvVars((e) => e.map((r) => (r.id === id ? { ...r, val } : r)));
  }

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [restart, setRestart] = useState<RestartPolicy>("on-failure");
  const [memory, setMemory] = useState("");
  const [cpus, setCpus] = useState("");
  const [workdir, setWorkdir] = useState("");
  const [command, setCommand] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildLog, setBuildLog] = useState<string | null>(null); // null = form phase
  const logEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-scroll build log
  useEffect(() => {
    if (buildLog !== null)
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [buildLog]);

  // Cleanup WS on unmount
  useEffect(
    () => () => {
      wsRef.current?.close();
    },
    [],
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const env: Record<string, string> = {};
    for (const { key, val } of envVars) {
      if (key.trim()) env[key.trim()] = val;
    }
    const parsedCpus = cpus.trim() !== "" ? parseFloat(cpus.trim()) : null;

    const payload = {
      name: name.trim(),
      image: sourceMode === "image" ? image.trim() || null : null,
      dockerfile_path:
        sourceMode === "dockerfile" ? dockerfilePath.trim() || null : null,
      context_path:
        sourceMode === "dockerfile" && contextPath.trim()
          ? contextPath.trim()
          : null,
      ports: ports.map((r) => r.value.trim()).filter(Boolean),
      volumes: volumes.map((r) => r.value.trim()).filter(Boolean),
      env: Object.keys(env).length > 0 ? env : undefined,
      restart,
      command: command.trim() !== "" ? command.trim().split(/\s+/) : null,
      workdir: workdir.trim() || null,
      memory: memory.trim() || null,
      cpus:
        parsedCpus !== null && !isNaN(parsedCpus) && parsedCpus > 0
          ? parsedCpus
          : null,
    };

    // Switch to build-log phase
    setBuildLog("");
    setLoading(true);

    const ws = new WebSocket(wsUrl("/containers/build"));
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify(payload));

    ws.onmessage = (ev) => {
      const text: string = ev.data;
      if (text.startsWith("\x01")) {
        // Control message
        try {
          const msg = JSON.parse(text.slice(1)) as
            | { type: "done"; container: ContainerInfo }
            | { type: "error"; message: string };
          if (msg.type === "done") {
            onCreated();
            onClose();
          } else {
            setLoading(false);
            setError(msg.message);
          }
        } catch {
          setLoading(false);
          setError("Unexpected server message.");
        }
      } else {
        setBuildLog((prev) => (prev ?? "") + text);
      }
    };

    ws.onerror = () => {
      setLoading(false);
      setError("WebSocket connection error — check the backend.");
    };

    ws.onclose = (ev) => {
      if (ev.code !== 1000 && ev.code !== 1005) {
        setLoading(false);
        setError(`Connection closed unexpectedly (code ${ev.code}).`);
      }
    };
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (!loading && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-[oklch(16%_0.01_260)] border border-[oklch(25%_0.01_260)] shadow-2xl flex flex-col max-h-[90vh]">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[oklch(22%_0.01_260)] flex-shrink-0">
          <div>
            <h2 className="font-semibold text-white">
              {buildLog !== null
                ? `Building ${name || "container"}…`
                : "New container"}
            </h2>
            {buildLog !== null && (
              <p className="text-xs text-[oklch(45%_0.01_260)] mt-0.5">
                This may take several minutes on a Pi.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-[oklch(45%_0.01_260)] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Build log phase ── */}
        {buildLog !== null && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all bg-[oklch(10%_0.005_260)] text-[oklch(78%_0.01_260)]">
              {buildLog || "Connecting…"}
              <div ref={logEndRef} />
            </div>
            {error && (
              <p className="flex-shrink-0 text-sm text-[oklch(65%_0.18_25)] bg-[oklch(60%_0.22_25)]/10 border-t border-[oklch(60%_0.22_25)]/20 px-4 py-2">
                {error}
              </p>
            )}
            <div className="flex gap-2 px-5 py-4 border-t border-[oklch(22%_0.01_260)] flex-shrink-0">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  wsRef.current?.close();
                  onClose();
                }}
                disabled={loading}
                className="flex-1"
              >
                {loading ? "Building…" : "Close"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Form (wraps scrollable body + footer so submit button works) ── */}
        {buildLog === null && (
          <form
            onSubmit={handleSubmit}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Name */}
              <div>
                <label className={LABEL_CLS}>
                  Name{" "}
                  <span className="text-[oklch(50%_0.01_260)] font-normal">
                    (letters, digits, _ -)
                  </span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-container"
                  required
                  pattern="^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$"
                  title="Start with a letter/digit, then letters/digits/underscore/dash (max 64 chars)"
                  className={INPUT_CLS}
                />
              </div>

              {/* Source mode toggle */}
              <div>
                <label className={LABEL_CLS}>Source</label>
                <div className="flex rounded-lg overflow-hidden border border-[oklch(25%_0.01_260)]">
                  {(["image", "dockerfile"] as SourceMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSourceMode(mode)}
                      className={`flex-1 py-1.5 text-sm transition ${
                        sourceMode === mode
                          ? "bg-[oklch(65%_0.18_250)] text-white font-medium"
                          : "bg-[oklch(12%_0.01_260)] text-[oklch(55%_0.01_260)] hover:text-white"
                      }`}
                    >
                      {mode === "image" ? "Docker Image" : "Dockerfile"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image mode */}
              {sourceMode === "image" && (
                <div>
                  <label className={LABEL_CLS}>Image</label>
                  <input
                    type="text"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="nginx:latest"
                    required
                    className={INPUT_CLS}
                  />
                </div>
              )}

              {/* Dockerfile mode */}
              {sourceMode === "dockerfile" && (
                <>
                  <div>
                    <label className={LABEL_CLS}>
                      Dockerfile path{" "}
                      <span className="text-[oklch(50%_0.01_260)] font-normal">
                        (absolute path within /home/pi)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={dockerfilePath}
                      onChange={(e) => setDockerfilePath(e.target.value)}
                      placeholder="/home/pi/myapp/Dockerfile"
                      required
                      pattern="^\/.*"
                      title="Must be an absolute path starting with /"
                      className={INPUT_CLS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>
                      Build context{" "}
                      <span className="text-[oklch(50%_0.01_260)] font-normal">
                        (optional — defaults to Dockerfile directory)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={contextPath}
                      onChange={(e) => setContextPath(e.target.value)}
                      placeholder="/home/pi/myapp"
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="rounded-lg bg-[oklch(11%_0.01_260)] border border-[oklch(22%_0.01_260)] px-3 py-2">
                    <p className="text-xs text-[oklch(50%_0.01_260)]">
                      Building from a Dockerfile may take several minutes on a
                      Pi.
                    </p>
                  </div>
                </>
              )}

              {/* ── Ports ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`${LABEL_CLS} mb-0`}>Ports</label>
                  <button
                    type="button"
                    onClick={addPort}
                    className="flex items-center gap-1 text-xs text-[oklch(65%_0.18_250)] hover:text-[oklch(75%_0.18_250)] transition-colors"
                  >
                    <Plus size={12} /> Add
                  </button>
                </div>
                {ports.length === 0 ? (
                  <p className="text-xs text-[oklch(38%_0.01_260)] italic">
                    No port mappings — container uses internal networking only.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {ports.map((row) => (
                      <div key={row.id} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) => updatePort(row.id, e.target.value)}
                          placeholder="8080:80"
                          className={`${INPUT_CLS} flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => removePort(row.id)}
                          className="text-[oklch(45%_0.01_260)] hover:text-[oklch(65%_0.22_25)] transition-colors flex-shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Volumes ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`${LABEL_CLS} mb-0`}>Volumes</label>
                  <button
                    type="button"
                    onClick={addVolume}
                    className="flex items-center gap-1 text-xs text-[oklch(65%_0.18_250)] hover:text-[oklch(75%_0.18_250)] transition-colors"
                  >
                    <Plus size={12} /> Add
                  </button>
                </div>
                {volumes.length === 0 ? (
                  <p className="text-xs text-[oklch(38%_0.01_260)] italic">
                    No volume mounts. Host path must be within /home/pi.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {volumes.map((row) => (
                      <div key={row.id} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) => updateVolume(row.id, e.target.value)}
                          placeholder="/home/pi/data:/data"
                          className={`${INPUT_CLS} flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => removeVolume(row.id)}
                          className="text-[oklch(45%_0.01_260)] hover:text-[oklch(65%_0.22_25)] transition-colors flex-shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Environment variables ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`${LABEL_CLS} mb-0`}>Environment</label>
                  <button
                    type="button"
                    onClick={addEnvVar}
                    className="flex items-center gap-1 text-xs text-[oklch(65%_0.18_250)] hover:text-[oklch(75%_0.18_250)] transition-colors"
                  >
                    <Plus size={12} /> Add
                  </button>
                </div>
                {envVars.length === 0 ? (
                  <p className="text-xs text-[oklch(38%_0.01_260)] italic">
                    No environment variables.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {envVars.map((row) => (
                      <div key={row.id} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={row.key}
                          onChange={(e) => updateEnvKey(row.id, e.target.value)}
                          placeholder="KEY"
                          className={`${INPUT_CLS} w-2/5`}
                        />
                        <input
                          type="text"
                          value={row.val}
                          onChange={(e) => updateEnvVal(row.id, e.target.value)}
                          placeholder="value"
                          className={`${INPUT_CLS} flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => removeEnvVar(row.id)}
                          className="text-[oklch(45%_0.01_260)] hover:text-[oklch(65%_0.22_25)] transition-colors flex-shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Advanced options (collapsible) ── */}
              <div className="border border-[oklch(22%_0.01_260)] rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[oklch(60%_0.01_260)] hover:text-white hover:bg-[oklch(20%_0.01_260)] transition-colors"
                >
                  <span className="font-medium">Advanced options</span>
                  {showAdvanced ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </button>

                {showAdvanced && (
                  <div className="px-4 pb-4 pt-3 space-y-4 border-t border-[oklch(22%_0.01_260)]">
                    {/* Restart policy */}
                    <div>
                      <label className={LABEL_CLS}>Restart policy</label>
                      <select
                        value={restart}
                        onChange={(e) =>
                          setRestart(e.target.value as RestartPolicy)
                        }
                        className={`${INPUT_CLS} font-sans`}
                      >
                        <option value="on-failure">on-failure (default)</option>
                        <option value="always">always</option>
                        <option value="unless-stopped">unless-stopped</option>
                        <option value="no">no</option>
                      </select>
                    </div>

                    {/* Memory + CPUs side by side */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL_CLS}>
                          Memory limit{" "}
                          <span className="text-[oklch(45%_0.01_260)] font-normal">
                            256m, 1g
                          </span>
                        </label>
                        <input
                          type="text"
                          value={memory}
                          onChange={(e) => setMemory(e.target.value)}
                          placeholder="256m"
                          pattern="^\d+[kmgKMG]?$|^$"
                          title="e.g. 256m or 1g — leave empty for no limit"
                          className={INPUT_CLS}
                        />
                      </div>
                      <div>
                        <label className={LABEL_CLS}>
                          CPU limit{" "}
                          <span className="text-[oklch(45%_0.01_260)] font-normal">
                            0.5, 2
                          </span>
                        </label>
                        <input
                          type="number"
                          value={cpus}
                          onChange={(e) => setCpus(e.target.value)}
                          placeholder="0.5"
                          min="0.01"
                          max="32"
                          step="0.01"
                          className={INPUT_CLS}
                        />
                      </div>
                    </div>

                    {/* Working directory */}
                    <div>
                      <label className={LABEL_CLS}>
                        Working directory{" "}
                        <span className="text-[oklch(45%_0.01_260)] font-normal">
                          (inside container, optional)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={workdir}
                        onChange={(e) => setWorkdir(e.target.value)}
                        placeholder="/app"
                        className={INPUT_CLS}
                      />
                    </div>

                    {/* Command override */}
                    <div>
                      <label className={LABEL_CLS}>
                        Command override{" "}
                        <span className="text-[oklch(45%_0.01_260)] font-normal">
                          (space-separated args, optional)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        placeholder="node server.js"
                        className={INPUT_CLS}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Error message */}
              {error && (
                <p className="text-sm text-[oklch(65%_0.18_25)] bg-[oklch(60%_0.22_25)]/10 border border-[oklch(60%_0.22_25)]/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* ── Footer — inside form so type="submit" works ── */}
            <div className="flex gap-2 px-5 py-4 border-t border-[oklch(22%_0.01_260)] flex-shrink-0">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={loading}
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
                Create container
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
