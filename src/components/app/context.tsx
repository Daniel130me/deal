"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { api, type SafeUser } from "@/lib/api";

const USER_KEY = "deal_user";

/* ---- hash-based route store (no setState-in-effect) ---- */

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getRouteSnapshot() {
  return window.location.hash.replace(/^#/, "") || "/";
}

function getServerRouteSnapshot() {
  return "/";
}

export interface AppContextValue {
  user: SafeUser | null;
  setUser: (user: SafeUser | null) => void;
  route: string;
  navigate: (to: string) => void;
  logout: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const route = useSyncExternalStore(subscribeToHash, getRouteSnapshot, getServerRouteSnapshot);
  const [user, setUserState] = useState<SafeUser | null>(null);

  // hydrate the signed-in user after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    let parsed: SafeUser | null = null;
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) parsed = JSON.parse(raw) as SafeUser;
    } catch {
      parsed = null;
    }
    if (!parsed) return;
    queueMicrotask(() => setUserState(parsed));
  }, []);

  const setUser = useCallback((next: SafeUser | null) => {
    setUserState(next);
    if (next) localStorage.setItem(USER_KEY, JSON.stringify(next));
    else localStorage.removeItem(USER_KEY);
  }, []);

  const navigate = useCallback((to: string) => {
    const target = to.startsWith("#") ? to : `#${to}`;
    if (window.location.hash === target) {
      window.scrollTo({ top: 0 });
    } else {
      window.location.hash = target;
      window.scrollTo({ top: 0 });
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    navigate("/");
  }, [navigate, setUser]);

  const value = useMemo(
    () => ({ user, setUser, route, navigate, logout }),
    [user, setUser, route, navigate, logout]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export async function quickDemoLogin(
  navigate: (to: string) => void,
  setUser: (u: SafeUser | null) => void
) {
  const { user } = await api.login({ contact: "tobi@deal.ng", password: "demo1234" });
  setUser(user);
  navigate("/dashboard");
  return user;
}
