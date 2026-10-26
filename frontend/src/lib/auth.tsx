"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { pickStartup, readStartupHref, startupChoices } from "./settings";
import { emptyOptions, Me, Options } from "./types";

type Session = {
  ready: boolean;
  me: Me | null;
  options: Options;
  has: (code: string) => boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [options, setOptions] = useState<Options>(emptyOptions);

  const load = useCallback(async () => {
    const user = await api<Me>("/auth/me");
    const opts = await api<Options>("/meta/options");
    setMe(user);
    setOptions(opts);
    return user;
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("ksb_token");
    if (!token) {
      setReady(true);
      return;
    }
    load()
      .catch(() => {
        localStorage.removeItem("ksb_token");
        setMe(null);
      })
      .finally(() => setReady(true));
  }, [load]);

  const login = useCallback(
    async (username: string, password: string) => {
      const result = await api<{ access_token: string; user: Me }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem("ksb_token", result.access_token);
      setMe(result.user);
      const opts = await api<Options>("/meta/options");
      setOptions(opts);
      const allowed = startupChoices((code) => result.user.permissions.includes(code), result.user).map((item) => item.href);
      router.push(pickStartup(readStartupHref(), allowed));
    },
    [router],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("ksb_token");
    setMe(null);
    setOptions(emptyOptions);
    router.push("/login");
  }, [router]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const value = useMemo<Session>(
    () => ({
      ready,
      me,
      options,
      has: (code) => Boolean(me?.permissions.includes(code)),
      login,
      logout,
      refresh,
    }),
    [ready, me, options, login, logout, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Session is unavailable");
  return ctx;
}
