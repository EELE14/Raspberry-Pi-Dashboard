import { createContext, useCallback, useContext, useState } from "react";
import type { ServerProfile } from "../types/api";
import {
  addProfile,
  getActiveId,
  getDefaultUrl,
  getProfiles,
  removeProfile,
  switchProfile,
  switchToDefault as switchToDefaultProfile,
} from "../lib/serverStore";

interface ServerContextValue {
  profiles: ServerProfile[];
  activeId: string | null;
  defaultUrl: string;
  addServer: (name: string, url: string, token: string) => void;
  removeServer: (id: string) => void;
  switchServer: (id: string) => void;
  switchToDefault: () => void;
}

const ServerContext = createContext<ServerContextValue | null>(null);

export function ServerProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<ServerProfile[]>(getProfiles);
  const [activeId, setActiveId] = useState<string | null>(getActiveId);
  const defaultUrl = getDefaultUrl();

  const addServer = useCallback((name: string, url: string, token: string) => {
    addProfile({ name, url, token });
    setProfiles(getProfiles());
  }, []);

  const removeServer = useCallback((id: string) => {
    removeProfile(id);
    setProfiles(getProfiles());
    setActiveId(getActiveId());
  }, []);

  const switchServer = useCallback((id: string) => {
    switchProfile(id);
  }, []);

  const switchToDefault = useCallback(() => {
    switchToDefaultProfile();
  }, []);

  return (
    <ServerContext.Provider
      value={{
        profiles,
        activeId,
        defaultUrl,
        addServer,
        removeServer,
        switchServer,
        switchToDefault,
      }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServer(): ServerContextValue {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error("useServer must be used within ServerProvider");
  return ctx;
}
