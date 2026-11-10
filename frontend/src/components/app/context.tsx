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
import { api, getSessionUser, setSessionUser, type SessionUser } from "@/lib/api";

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
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
  route: string;
  navigate: (to: string) => void;
  logout: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const route = useSyncExternalStore(subscribeToHash, getRouteSnapshot, getServerRouteSnapshot);
  const [user, setUserState] = useState<SessionUser | null>(null);

  // Hydrate the persisted session after mount (avoids SSR hydration mismatch),
  // then silently revalidate against the API: tokens may have expired while
  // away, and the profile may have changed since this device last saw it.
  useEffect(() => {
    const stored = getSessionUser();
    if (stored) {
      queueMicrotask(() => setUserState(stored));
      api
        .me()
        .then((fresh) => setUserState(fresh))
        .catch(() => {
          // The API client already attempts token refresh. If revalidation still
          // fails, do not leave a stale identity rendered as authenticated.
          setUserState(null);
          setSessionUser(null);
        });
    }
  }, []);

  const setUser = useCallback((next: SessionUser | null) => {
    setUserState(next);
    setSessionUser(next);
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
    // Server-side token revocation first; the local session dies either way.
    void api.logout();
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
