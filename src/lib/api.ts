import type {
  AuditResponse,
  BannedIp,
  BannedIpList,
  BotActionResponse,
  BotLogsResponse,
  BotStatus,
  BotStatusList,
  ContainerActionResponse,
  ContainerInfo,
  ContainerLogsResponse,
  CreateArchiveResponse,
  CreateBotRequest,
  CreateContainerRequest,
  DeleteBotResponse,
  DeleteResponse,
  DirectoryListing,
  DockerStatus,
  ExtractResponse,
  FileContent,
  GitConfig,
  GitConfigSave,
  KillResponse,
  ManualBanRequest,
  NetworkStats,
  PortList,
  ProcessList,
  SaveConfigResponse,
  SecurityChecklist,
  SecurityStats,
  SystemHistoryPoint,
  SystemStats,
  TokenRotateResponse,
  TotpDisableResponse,
  TotpSessionResponse,
  TotpSetupResponse,
  TotpStatus,
  UploadResponse,
} from "../types/api";
import { getApiBase } from "./serverStore";
import { triggerTotpReauth } from "./totpReauth";

// base URL
function httpBase(): string {
  return getApiBase();
}

function apiBase(): string {
  return httpBase() + "/api";
}

export function rawFileUrl(path: string): string {
  return `${httpBase()}/api/files/raw?path=${encodeURIComponent(path)}&token=${encodeURIComponent(getToken())}`;
}

export function getToken(): string {
  return localStorage.getItem("api_token") ?? "";
}

export function getTotpSession(): string {
  return localStorage.getItem("totp_session") ?? "";
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  _retried = false,
): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const session = getTotpSession();
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,

      ...(session ? { "X-TOTP-Session": session } : {}),

      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 403) {
    const payload = (await res.json().catch(() => ({}))) as { detail?: string };
    const reason = payload.detail ?? "Access denied";
    window.location.href = `/access-denied?reason=${encodeURIComponent(reason)}`;
    throw new Error(reason);
  }

  if (res.status === 401 && !_retried) {
    const payload = (await res.json().catch(() => ({}))) as { detail?: string };
    const detail = payload.detail ?? "";

    const isTotpAuthPath = path.startsWith("/auth/totp/");
    if (detail.toLowerCase().includes("totp") && !isTotpAuthPath) {
      await triggerTotpReauth();
      return apiFetch(path, init, true);
    }
    throw new Error(detail || "HTTP 401");
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(payload.detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// health

export function checkHealth(): Promise<{ status: string }> {
  return fetch(`${apiBase()}/health`).then((r) => r.json());
}

// bots

export function listBots(): Promise<BotStatusList> {
  return apiFetch("/bots");
}

export function getBot(name: string): Promise<BotStatus> {
  return apiFetch(`/bots/${encodeURIComponent(name)}`);
}

export function createBot(req: CreateBotRequest): Promise<BotStatus> {
  return apiFetch("/bots", { method: "POST", body: JSON.stringify(req) });
}

export function deleteBot(name: string): Promise<DeleteBotResponse> {
  return apiFetch(`/bots/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export function startBot(name: string): Promise<BotActionResponse> {
  return apiFetch(`/bots/${encodeURIComponent(name)}/start`, {
    method: "POST",
  });
}

export function stopBot(name: string): Promise<BotActionResponse> {
  return apiFetch(`/bots/${encodeURIComponent(name)}/stop`, { method: "POST" });
}

export function restartBot(name: string): Promise<BotActionResponse> {
  return apiFetch(`/bots/${encodeURIComponent(name)}/restart`, {
    method: "POST",
  });
}

export function getBotLogs(
  name: string,
  lines = 100,
): Promise<BotLogsResponse> {
  return apiFetch(`/bots/${encodeURIComponent(name)}/logs?lines=${lines}`);
}

// system

export function getSystemStats(): Promise<SystemStats> {
  return apiFetch("/system");
}

export function getSystemHistory(
  minutes: number,
): Promise<SystemHistoryPoint[]> {
  return apiFetch(`/system/history?minutes=${minutes}`);
}

export function shutdownPi(): Promise<{ status: string }> {
  return apiFetch("/system/shutdown", { method: "POST" });
}

export function rebootPi(): Promise<{ status: string }> {
  return apiFetch("/system/reboot", { method: "POST" });
}

// files

export function listDirectory(path: string): Promise<DirectoryListing> {
  return apiFetch(`/files?path=${encodeURIComponent(path)}`);
}

export function readFile(path: string): Promise<FileContent> {
  return apiFetch(`/files/read?path=${encodeURIComponent(path)}`);
}

export function writeFile(path: string, content: string): Promise<FileContent> {
  return apiFetch("/files/write", {
    method: "POST",
    body: JSON.stringify({ path, content }),
  });
}

export function createDirectory(path: string): Promise<DirectoryListing> {
  return apiFetch("/files/dir", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function deletePath(path: string): Promise<DeleteResponse> {
  return apiFetch(`/files?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
  });
}

export function uploadFile(
  directory: string,
  file: File,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("path", directory);
  form.append("file", file);
  return apiFetch("/files/upload", { method: "POST", body: form });
}

export function extractArchive(
  path: string,
  dest_dir?: string,
): Promise<ExtractResponse> {
  return apiFetch("/files/extract", {
    method: "POST",
    body: JSON.stringify({ path, dest_dir: dest_dir ?? null }),
  });
}

export function createArchive(
  paths: string[],
  dest_path: string,
  format: "zip" | "tar.gz",
): Promise<CreateArchiveResponse> {
  return apiFetch("/files/archive", {
    method: "POST",
    body: JSON.stringify({ paths, dest_path, format }),
  });
}

// network

export function getNetwork(): Promise<NetworkStats> {
  return apiFetch("/network");
}

export function getProcesses(): Promise<ProcessList> {
  return apiFetch("/network/processes");
}

export function getPorts(): Promise<PortList> {
  return apiFetch("/network/ports");
}

export function killProcess(pid: number): Promise<KillResponse> {
  return apiFetch(`/network/processes/${pid}`, { method: "DELETE" });
}

// audit

export function getAudit(
  limit = 100,
  offset = 0,
  type?: string,
): Promise<AuditResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (type) params.set("type", type);
  return apiFetch(`/audit?${params}`);
}

// security

export function getSecurityStats(): Promise<SecurityStats> {
  return apiFetch("/security/stats");
}

export function getSecurityChecklist(): Promise<SecurityChecklist> {
  return apiFetch("/security/checklist");
}

export function getBannedIps(): Promise<BannedIpList> {
  return apiFetch("/security/banned-ips");
}

export function unbanIp(
  ip: string,
): Promise<{ ip: string; unbanned: boolean }> {
  return apiFetch(`/security/banned-ips/${encodeURIComponent(ip)}`, {
    method: "DELETE",
  });
}

export function banIp(req: ManualBanRequest): Promise<BannedIp> {
  return apiFetch("/security/ban-ip", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function rotateToken(): Promise<TokenRotateResponse> {
  return apiFetch("/security/rotate-token", { method: "POST" });
}

// settings

export function getGitConfig(): Promise<GitConfig> {
  return apiFetch("/settings/git");
}

export function saveGitConfig(req: GitConfigSave): Promise<SaveConfigResponse> {
  return apiFetch("/settings/git", {
    method: "PUT",
    body: JSON.stringify(req),
  });
}

// 2FA

// public
export function getTotpStatus(): Promise<TotpStatus> {
  return fetch(`${apiBase()}/auth/totp/status`).then((r) => r.json());
}

export function getTotpSetup(): Promise<TotpSetupResponse> {
  return apiFetch("/auth/totp/setup");
}

export function confirmTotpSetup(code: string): Promise<TotpSessionResponse> {
  return apiFetch("/auth/totp/setup/confirm", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function verifyTotpCode(code: string): Promise<TotpSessionResponse> {
  return apiFetch("/auth/totp/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function disableTotp(): Promise<TotpDisableResponse> {
  return apiFetch("/auth/totp", { method: "DELETE" });
}

// docker

export function getDockerStatus(): Promise<DockerStatus> {
  return apiFetch("/containers/status");
}

export function listContainers(): Promise<ContainerInfo[]> {
  return apiFetch("/containers");
}

export function createContainer(
  req: CreateContainerRequest,
): Promise<ContainerInfo> {
  return apiFetch("/containers", { method: "POST", body: JSON.stringify(req) });
}

export function startContainer(name: string): Promise<ContainerActionResponse> {
  return apiFetch(`/containers/${encodeURIComponent(name)}/start`, {
    method: "POST",
  });
}

export function stopContainer(name: string): Promise<ContainerActionResponse> {
  return apiFetch(`/containers/${encodeURIComponent(name)}/stop`, {
    method: "POST",
  });
}

export function restartContainer(
  name: string,
): Promise<ContainerActionResponse> {
  return apiFetch(`/containers/${encodeURIComponent(name)}/restart`, {
    method: "POST",
  });
}

export function removeContainer(name: string): Promise<void> {
  return apiFetch(`/containers/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export function getContainerLogs(
  name: string,
  tail = 200,
): Promise<ContainerLogsResponse> {
  return apiFetch(`/containers/${encodeURIComponent(name)}/logs?tail=${tail}`);
}
