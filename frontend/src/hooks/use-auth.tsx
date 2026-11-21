import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, getToken, setToken, TOKEN_KEY } from "@/lib/api";
import type { Role, User } from "@/types";

interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<User>;
  demoLogin: (role: Role) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .get<User>("/auth/me")
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch(() => {
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener("slt:unauthorized", handleUnauthorized);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY && !event.newValue) {
        setUser(null);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("slt:unauthorized", handleUnauthorized);
      window.removeEventListener("storage", handleStorage);
    };
  }, [queryClient]);

  const login = useCallback(async (identifier: string, password: string) => {
    const response = await api.post<LoginResponse>("/auth/login", { identifier, password });
    setToken(response.access_token);
    setUser(response.user);
    return response.user;
  }, []);

  const demoLogin = useCallback(async (role: Role) => {
    const response = await api.post<LoginResponse>("/auth/demo-login", { role });
    setToken(response.access_token);
    setUser(response.user);
    return response.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // The token is discarded client-side even if the server is unreachable.
    }
    setToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, demoLogin, logout, updateUser: setUser }),
    [user, loading, login, demoLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export const roleLabels: Record<Role, string> = {
  admin: "Administrator",
  lab_assistant: "Lab Assistant",
  student: "Student",
  faculty: "Faculty",
};
