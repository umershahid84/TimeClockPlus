import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { api, setToken } from "../api/client";

export interface CurrentUser {
  id: number;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "ADMINISTRATOR" | "SUPERVISOR";
  isAdministrator: boolean;
  canViewAllLinesOfBiz: boolean;
  linesOfBusiness: { id: number; code: string; name: string; canAddEmployees: boolean }[];
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  mustChangePassword: boolean;
  login: (userId: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  clearMustChangePassword: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<CurrentUser>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (userId: string, password: string) => {
    const res = await api.post<{ token: string; mustChangePassword: boolean; user: CurrentUser }>(
      "/auth/login",
      { userId, password }
    );
    setToken(res.token);
    setUser(res.user);
    setMustChangePassword(res.mustChangePassword);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        mustChangePassword,
        login,
        logout,
        refresh,
        clearMustChangePassword: () => setMustChangePassword(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
