"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useText } from "@/lib/i18n";

type ToastTone = "ok" | "error" | "info";

type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastApi = {
  success: (message?: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const Ctx = createContext<ToastApi | null>(null);

const toneClass: Record<ToastTone, string> = {
  ok: "border-pine/30 bg-pine text-paper",
  error: "border-clay/30 bg-clay text-paper",
  info: "border-tide/30 bg-ink text-paper",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t, text } = useText();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: ToastTone) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message?: string) => push(message ? text(message) : t("common.saved"), "ok"),
      error: (message) => push(message, "error"),
      info: (message) => push(message, "info"),
    }),
    [push, t, text],
  );

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, 2800),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto w-full max-w-md rounded-md border px-4 py-2.5 text-center text-sm shadow-lg ${toneClass[toast.tone]}`}
            role="status"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Toast is unavailable");
  return ctx;
}
