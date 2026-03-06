import { useContext } from "react";
import type { AuthContextValue } from "./AuthContextType";
import { AuthContext } from "./AuthContextType";
import { getToken } from "../lib/api";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { getToken };
