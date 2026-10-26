"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Row } from "@/lib/types";

const cache = new Map<string, Row>();

export function GoodsPreviewLink({
  href,
  cacheKey,
  name,
  className = "",
  loadPath,
  children,
}: {
  href: string;
  cacheKey: string;
  name: string;
  className?: string;
  loadPath: string;
  children: (row: Row) => React.ReactNode;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<Row | null>(cache.get(cacheKey) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function place() {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 320;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const below = rect.bottom + 8;
    const top = below + 260 > window.innerHeight ? Math.max(8, rect.top - 260) : below;
    setPos({ top, left });
  }

  function show() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      place();
      setOpen(true);
      const cached = cache.get(cacheKey);
      if (cached) {
        setRow(cached);
        setError(null);
        return;
      }
      api<Row>(loadPath)
        .then((data) => {
          cache.set(cacheKey, data);
          setRow(data);
          setError(null);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load goods"));
    }, 180);
  }

  function hide() {
    if (timer.current) window.clearTimeout(timer.current);
    setOpen(false);
  }

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <span ref={anchor} className="inline-block" onMouseEnter={show} onMouseLeave={hide}>
      <Link href={href} className={`text-brass hover:underline ${className}`} onClick={(event) => event.stopPropagation()}>
        {name}
      </Link>
      {open && (
        <span
          className="fixed z-50 block w-80 rounded-lg border border-line bg-paper p-3 text-left text-ink shadow-xl"
          style={{ top: pos.top, left: pos.left }}
        >
          {error && <span className="block text-sm text-clay">{error}</span>}
          {!row && !error && <span className="block text-sm text-ink/50">Loading…</span>}
          {row && children(row)}
        </span>
      )}
    </span>
  );
}
