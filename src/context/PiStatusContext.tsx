import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { checkHealth } from "../lib/api";

interface PiStatusContextValue {
  isOffline: boolean;
  triggerOffline: () => void;
}

export const PiStatusContext = createContext<PiStatusContextValue | null>(null);

export function PiStatusProvider({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);
  const isOfflineRef = useRef(false);
  const failuresRef = useRef(0);

  const triggerOffline = useCallback(() => {
    setIsOffline(true);
    isOfflineRef.current = true;
    failuresRef.current = 99; // skip threshold, already know its down
  }, []);

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        await checkHealth();
        failuresRef.current = 0;
        if (isOfflineRef.current) {
          setIsOffline(false);
          isOfflineRef.current = false;
        }
      } catch {
        failuresRef.current += 1;
        if (failuresRef.current >= 2 && !isOfflineRef.current) {
          setIsOffline(true);
          isOfflineRef.current = true;
        }
      }
      // Poll more frequently while offline for faster recovery detection
      timerId = setTimeout(tick, isOfflineRef.current ? 4_000 : 10_000);
    }

    // First check after 10s to not spam api immediately on load
    timerId = setTimeout(tick, 10_000);
    return () => clearTimeout(timerId);
  }, []);

  return (
    <PiStatusContext.Provider value={{ isOffline, triggerOffline }}>
      {children}
    </PiStatusContext.Provider>
  );
}
