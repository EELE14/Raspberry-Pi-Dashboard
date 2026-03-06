import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { checkHealth } from "../lib/api";
import { saveTokenToActiveProfile } from "../lib/serverStore";
import { AuthContext } from "./AuthContextType";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => !!localStorage.getItem("api_token"),
  );
  const navigate = useNavigate();

  const login = useCallback(
    async (token: string) => {
      // shortly store the token so apiFetch uses it for the health check
      localStorage.setItem("api_token", token);
      try {
        await checkHealth();
        saveTokenToActiveProfile(token);
        setIsAuthenticated(true);
        navigate("/");
      } catch {
        // remove invalid token
        localStorage.removeItem("api_token");
        throw new Error("Invalid token. Please check your API token.");
      }
    },
    [navigate],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("api_token");
    localStorage.removeItem("totp_session");
    setIsAuthenticated(false);
    navigate("/login");
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
