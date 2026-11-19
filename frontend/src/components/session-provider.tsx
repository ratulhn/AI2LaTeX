"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { api, getToken, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

interface SessionValue {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  google: () => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setCredits: (n: number) => void;
  applyUser: (u: User) => void;
  /** Complete a session that was started elsewhere (e.g. email verification). */
  adopt: (token: string, user: User) => void;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [ready, setReady] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const login = React.useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.token);
    setUser(res.user);
    router.push("/dashboard");
  }, [router]);

  const signup = React.useCallback(async (email: string, password: string, name: string) => {
    const res = await api.signup(email, password, name);
    setToken(res.token);
    setUser(res.user);
    router.push("/dashboard");
  }, [router]);

  const google = React.useCallback(async () => {
    const res = await api.google();
    setToken(res.token);
    setUser(res.user);
    router.push("/dashboard");
  }, [router]);

  const logout = React.useCallback(() => {
    setToken(null);
    setUser(null);
    router.push("/");
  }, [router]);

  const refresh = React.useCallback(async () => {
    try {
      const res = await api.me();
      setUser(res.user);
    } catch {
      /* ignore */
    }
  }, []);

  const setCredits = React.useCallback((n: number) => {
    setUser((u) => (u ? { ...u, credits: n } : u));
  }, []);

  const applyUser = React.useCallback((u: User) => setUser(u), []);

  const adopt = React.useCallback((token: string, nextUser: User) => {
    setToken(token);
    setUser(nextUser);
  }, []);

  const value = React.useMemo(
    () => ({ user, ready, login, signup, google, logout, refresh, setCredits, applyUser, adopt }),
    [user, ready, login, signup, google, logout, refresh, setCredits, applyUser, adopt],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
