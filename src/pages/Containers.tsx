import { useState } from "react";
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Copy,
  Plus,
  RefreshCw,
} from "lucide-react";
import { getDockerStatus, listContainers } from "../lib/api";
import { useApi } from "../hooks/useApi";
import ContainerCard from "../components/containers/ContainerCard";
import CreateContainerModal from "../components/containers/CreateContainerModal";
import Button from "../components/ui/Button";

// docker status banner

interface DockerBannerProps {
  errors: string[];
  installed: boolean;
  daemonReachable: boolean;
  permissionOk: boolean;
}

function DockerBanner({
  errors,
  installed,
  daemonReachable,
  permissionOk,
}: DockerBannerProps) {
  const [copied, setCopied] = useState<string | null>(null);

  function copyCmd(cmd: string) {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(cmd);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  if (installed && daemonReachable && permissionOk) return null;

  return (
    <div className="rounded-xl bg-[oklch(60%_0.22_80)]/8 border border-[oklch(60%_0.22_80)]/25 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle
          size={15}
          className="text-[oklch(75%_0.18_80)] flex-shrink-0"
        />
        <span className="text-sm font-medium text-[oklch(80%_0.15_80)]">
          {!installed
            ? "Docker is not installed"
            : !permissionOk
              ? "Docker permission error"
              : "Docker daemon is not running"}
        </span>
      </div>
      {errors.map((err, i) => {
        // Extract code block if the message contains "Run: <cmd>"
        const match = err.match(/Run:\s+(.+)$/);
        return (
          <div key={i} className="text-sm text-[oklch(65%_0.01_260)]">
            {match ? (
              <>
                <span>{err.replace(match[0], "")}</span>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-[oklch(10%_0.01_260)] border border-[oklch(22%_0.01_260)] text-xs font-mono text-[oklch(70%_0.01_260)] break-all">
                    {match[1]}
                  </code>
                  <button
                    onClick={() => copyCmd(match[1])}
                    className="flex-shrink-0 text-[oklch(45%_0.01_260)] hover:text-white transition-colors"
                    title="Copy command"
                  >
                    {copied === match[1] ? (
                      <CheckCircle2
                        size={15}
                        className="text-[oklch(65%_0.18_145)]"
                      />
                    ) : (
                      <Copy size={15} />
                    )}
                  </button>
                </div>
              </>
            ) : (
              err
            )}
          </div>
        );
      })}
    </div>
  );
}

interface DockerInfoProps {
  clientVersion: string | null;
  serverVersion: string | null;
  arch: string | null;
}

function DockerInfo({ clientVersion, serverVersion, arch }: DockerInfoProps) {
  const version = serverVersion ?? clientVersion;
  if (!version && !arch) return null;
  return (
    <div className="flex items-center gap-3 text-xs text-[oklch(42%_0.01_260)]">
      {version && <span className="font-mono">Docker {version}</span>}
      {arch && <span className="font-mono">{arch}</span>}
    </div>
  );
}

// page

export default function Containers() {
  const { data: dockerStatus, loading: dockerLoading } = useApi(
    getDockerStatus,
    [],
    30_000,
  );

  const {
    data: containers,
    loading: containersLoading,
    refreshing: containersRefreshing,
    error: containersError,
    refetch,
  } = useApi(listContainers, [], 15_000);

  const [showModal, setShowModal] = useState(false);

  const loading = dockerLoading || containersLoading;
  const refreshing = containersRefreshing || dockerLoading;
  const dockerReady =
    dockerStatus !== null &&
    dockerStatus.installed &&
    dockerStatus.daemon_reachable &&
    dockerStatus.permission_ok;

  return (
    <div className="p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Containers</h1>
          <div className="flex items-center gap-3 mt-0.5">
            {containers !== null ? (
              <p className="text-sm text-[oklch(50%_0.01_260)]">
                {containers.length} container
                {containers.length !== 1 ? "s" : ""}
                {containers.filter((c) => c.is_running).length > 0 &&
                  ` · ${containers.filter((c) => c.is_running).length} running`}
              </p>
            ) : (
              <p className="text-sm text-[oklch(50%_0.01_260)]">
                {dockerLoading ? "Loading…" : "—"}
              </p>
            )}
            {dockerStatus && (
              <DockerInfo
                clientVersion={dockerStatus.client_version}
                serverVersion={dockerStatus.server_version}
                arch={dockerStatus.arch}
              />
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={refetch}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowModal(true)}
            disabled={!dockerReady}
            title={dockerReady ? undefined : "Docker is not available"}
          >
            <Plus size={14} />
            New container
          </Button>
        </div>
      </div>

      {dockerStatus && (
        <DockerBanner
          installed={dockerStatus.installed}
          daemonReachable={dockerStatus.daemon_reachable}
          permissionOk={dockerStatus.permission_ok}
          errors={dockerStatus.errors}
        />
      )}

      {/* ── List fetch error ── */}
      {containersError && (dockerReady || dockerStatus === null) && (
        <div className="rounded-lg bg-[oklch(60%_0.22_25)]/10 border border-[oklch(60%_0.22_25)]/20 px-4 py-3 text-sm text-[oklch(70%_0.18_25)]">
          {containersError}
        </div>
      )}

      {/* ── Container list ── */}
      {containers && containers.length > 0 ? (
        <div className="space-y-3">
          {containers.map((c) => (
            <ContainerCard key={c.id} container={c} onRefresh={refetch} />
          ))}
        </div>
      ) : containers !== null && !containersError ? (
        <div className="rounded-xl bg-[oklch(16%_0.01_260)] border border-[oklch(22%_0.01_260)] px-4 py-12 text-center">
          <Box
            size={32}
            strokeWidth={1.25}
            className="mx-auto mb-3 text-[oklch(32%_0.01_260)]"
          />
          <p className="text-sm text-[oklch(45%_0.01_260)]">
            {dockerReady
              ? "No containers. Create one to get started."
              : "Docker is not available on this server."}
          </p>
          {dockerReady && (
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={() => setShowModal(true)}
            >
              <Plus size={14} />
              Create first container
            </Button>
          )}
        </div>
      ) : null}

      {/* ── Create modal ── */}
      {showModal && (
        <CreateContainerModal
          onClose={() => setShowModal(false)}
          onCreated={refetch}
        />
      )}
    </div>
  );
}
