"use client";

import Link from "next/link";
import { useText } from "@/lib/i18n";

export function PageHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: React.ReactNode }) {
  const { text } = useText();
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
      <div>
        {eyebrow && <div className="text-[11px] uppercase tracking-[0.16em] text-brass">{text(eyebrow)}</div>}
        <h1 className="font-serif text-2xl tracking-tight">{text(title)}</h1>
      </div>
      {action}
    </div>
  );
}

export function DetailHeader({
  backHref,
  backLabel,
  title,
  action,
  onBack,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  action?: React.ReactNode;
  onBack?: () => void;
}) {
  const { text } = useText();
  const back = text(backLabel);
  const heading = title;
  return (
    <div className="mb-5">
      {onBack ? (
        <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-brass hover:text-ink">
          <span aria-hidden="true">←</span>
          {back}
        </button>
      ) : (
        <Link href={backHref} className="mb-3 inline-flex items-center gap-1 text-sm text-brass hover:text-ink">
          <span aria-hidden="true">←</span>
          {back}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-serif text-3xl tracking-tight">{heading}</h1>
        {action}
      </div>
    </div>
  );
}

export function Banner({ tone = "error", children }: { tone?: "error" | "ok" | "info"; children: React.ReactNode }) {
  const toneClass = tone === "ok" ? "border-pine/30 bg-pine/5 text-pine" : tone === "info" ? "border-tide/20 bg-tide/5 text-tide" : "border-clay/30 bg-clay/5 text-clay";
  return <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${toneClass}`}>{children}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { t, text } = useText();
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink/45 px-4 py-8" onMouseDown={onClose}>
      <div className="w-full max-w-2xl rounded-xl border border-line bg-paper p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-serif text-2xl">{text(title)}</h2>
          <button className="text-sm text-ink/50 hover:text-ink" onClick={onClose} type="button">
            {t("common.close")}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { text } = useText();
  return (
    <label className="block">
      <span className="label">{text(label)}</span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  const { text } = useText();
  return <div className="px-3 py-10 text-center text-sm text-ink/50">{typeof children === "string" ? text(children) : children}</div>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  const { text } = useText();
  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-ink/50">
      <span>{text(label)}</span>
    </div>
  );
}
