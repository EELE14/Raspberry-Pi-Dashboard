export type { ServerProfile } from "../types/api";
import type { ServerProfile } from "../types/api";

const PROFILES_KEY = "server_profiles";
const ACTIVE_KEY = "active_server_id";
const DEFAULT_TOKEN_KEY = "default_token";

// helpers

function loadProfiles(): ServerProfile[] {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveProfiles(profiles: ServerProfile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function getApiBase(): string {
  const profiles = loadProfiles();
  const activeId = localStorage.getItem(ACTIVE_KEY);
  const active = profiles.find((p) => p.id === activeId);
  const raw =
    active?.url ??
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    "https://dash.eele14.dev";
  return raw.replace(/\/+$/, "");
}

export function getDefaultUrl(): string {
  return (
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    "https://dash.eele14.dev"
  ).replace(/\/+$/, "");
}

export function saveTokenToActiveProfile(token: string): void {
  const activeId = localStorage.getItem(ACTIVE_KEY);
  if (!activeId) {
    // Default server
    localStorage.setItem(DEFAULT_TOKEN_KEY, token);
    return;
  }
  const profiles = loadProfiles();
  const idx = profiles.findIndex((p) => p.id === activeId);
  if (idx === -1) return;
  profiles[idx].token = token;
  saveProfiles(profiles);
}

export function getProfiles(): ServerProfile[] {
  return loadProfiles();
}

export function getActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function addProfile(profile: Omit<ServerProfile, "id">): ServerProfile {
  const profiles = loadProfiles();
  const newProfile: ServerProfile = { ...profile, id: generateId() };
  profiles.push(newProfile);
  saveProfiles(profiles);
  return newProfile;
}

export function removeProfile(id: string): void {
  const profiles = loadProfiles().filter((p) => p.id !== id);
  saveProfiles(profiles);
  if (localStorage.getItem(ACTIVE_KEY) === id) {
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem("api_token");
  }
}

export function switchProfile(id: string): void {
  const currentToken = localStorage.getItem("api_token") ?? "";
  saveTokenToActiveProfile(currentToken);

  localStorage.setItem(ACTIVE_KEY, id);
  // clear TOTP on switch
  localStorage.removeItem("totp_session");

  const profiles = loadProfiles();
  const target = profiles.find((p) => p.id === id);
  if (target?.token) {
    localStorage.setItem("api_token", target.token);
  } else {
    localStorage.removeItem("api_token");
  }

  window.location.href = "/";
}

export function switchToDefault(): void {
  const currentToken = localStorage.getItem("api_token") ?? "";
  saveTokenToActiveProfile(currentToken);

  localStorage.removeItem(ACTIVE_KEY);

  localStorage.removeItem("totp_session");

  const defaultToken = localStorage.getItem(DEFAULT_TOKEN_KEY) ?? "";
  if (defaultToken) {
    localStorage.setItem("api_token", defaultToken);
  } else {
    localStorage.removeItem("api_token");
  }

  window.location.href = "/";
}
