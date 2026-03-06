// api respionse types

export interface BotStatus {
  name: string;
  service: string;
  status:
    | "active"
    | "inactive"
    | "activating"
    | "deactivating"
    | "failed"
    | "unknown";
  is_running: boolean;
}

export interface BotStatusList {
  bots: BotStatus[];
}

export interface BotActionResponse {
  name: string;
  action: string;
  success: boolean;
  message: string;
}

export interface BotLogsResponse {
  name: string;
  lines: number;
  logs: string;
}

export interface CreateBotRequest {
  name: string;
  exec_start: string;
  description?: string;
  auto_start?: boolean;
  venv_path?: string;
  install_requirements?: boolean;
}

export interface DeleteBotResponse {
  name: string;
  deleted: boolean;
}

// system

export interface CpuInfo {
  percent: number;
}

export interface RamInfo {
  total_mb: number;
  used_mb: number;
  available_mb: number;
  percent: number;
}

export interface DiskInfo {
  total_gb: number;
  used_gb: number;
  free_gb: number;
  percent: number;
}

export interface SystemStats {
  cpu: CpuInfo;
  ram: RamInfo;
  disk: DiskInfo;
  temperature_celsius: number | null;
  uptime_seconds: number;
  uptime_human: string;
}

export interface SystemHistoryPoint {
  ts: string;
  cpu: number;
  ram: number;
  temp: number | null;
}

// files

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number | null;
  modified_at: number;
}

export interface DirectoryListing {
  path: string;
  entries: FileEntry[];
}

export interface FileContent {
  path: string;
  content: string;
}

export interface UploadResponse {
  path: string;
  filename: string;
  size_bytes: number;
  modified_at: number;
}

export interface DeleteResponse {
  path: string;
  deleted: boolean;
}

export interface ExtractResponse {
  extracted: string[];
  count: number;
}

export interface CreateArchiveResponse {
  path: string;
}

// network

export interface NetworkInterface {
  name: string;
  ip: string | null;
  mac: string | null;
  is_up: boolean;
  speed_mb: number;
  bytes_sent: number;
  bytes_recv: number;
}

export interface NetworkStats {
  interfaces: NetworkInterface[];
}

export interface ProcessInfo {
  pid: number;
  name: string;
  username: string;
  cpu_percent: number;
  memory_percent: number;
  status: string;
}

export interface ProcessList {
  processes: ProcessInfo[];
}

export interface KillResponse {
  pid: number;
  killed: boolean;
}

export interface BandwidthPoint {
  ts: string;
  interfaces: { name: string; bytes_sent_s: number; bytes_recv_s: number }[];
}

export interface PortEntry {
  protocol: string;
  local_addr: string;
  local_port: number;
  remote_addr: string;
  remote_port: number | null;
  status: string;
  pid: number | null;
  process_name: string;
}

export interface PortList {
  ports: PortEntry[];
}

// audit

export interface AuditEvent {
  id: number;
  ts: string;
  ip: string;
  action_type: string;
  detail: string;
  status: number;
}

export interface AuditResponse {
  total: number;
  events: AuditEvent[];
}

// securitx

export interface SecurityStats {
  login_fails_1h: number;
  login_fails_24h: number;
  banned_ips_count: number;
  terminal_sessions: number;
  system_stream_sessions: number;
  network_stream_sessions: number;
}

export interface ChecklistItem {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface SecurityChecklist {
  items: ChecklistItem[];
  score: number;
}

export interface BannedIp {
  ip: string;
  reason: string;
  banned_at: string;
  expires_at: string | null;
}

export interface BannedIpList {
  bans: BannedIp[];
}

export interface TokenRotateResponse {
  token: string;
}

export interface ManualBanRequest {
  ip: string;
  reason?: string;
  duration_minutes?: number | null;
}

// settings

export interface GitConfig {
  repo_url: string;
  branch: string;
  working_dir: string;
  has_token: boolean;
}

export interface GitConfigSave {
  repo_url: string;
  branch: string;
  working_dir: string;
  access_token?: string | null;
}

export interface SaveConfigResponse {
  saved: boolean;
  has_token: boolean;
}

// 2FA

export interface TotpStatus {
  enabled: boolean;
}

export interface TotpSetupResponse {
  secret: string;
  otpauth_uri: string;
}

export interface TotpSessionResponse {
  session_token: string;
}

export interface TotpDisableResponse {
  disabled: boolean;
}

// docker

export type ContainerStatus =
  | "running"
  | "exited"
  | "paused"
  | "restarting"
  | "created";

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  is_running: boolean;
  ports: string[];
  created: string;
}

export interface DockerStatus {
  installed: boolean;
  daemon_reachable: boolean;
  permission_ok: boolean;
  client_version: string | null;
  server_version: string | null;
  arch: string | null;
  errors: string[];
}

export interface ContainerActionResponse {
  name: string;
  action: string;
  success: boolean;
  message: string;
}

export interface ContainerLogsResponse {
  name: string;
  lines: number;
  logs: string;
}

export type RestartPolicy = "no" | "always" | "on-failure" | "unless-stopped";

export interface CreateContainerRequest {
  name: string;
  image?: string | null;
  dockerfile_path?: string | null;
  context_path?: string | null;
  ports?: string[];
  volumes?: string[];
  env?: Record<string, string>;
  restart?: RestartPolicy;
  command?: string[] | null;
  workdir?: string | null;
  memory?: string | null;
  cpus?: number | null;
}

export interface ServerProfile {
  id: string;
  name: string;
  url: string;
  token: string;
}
