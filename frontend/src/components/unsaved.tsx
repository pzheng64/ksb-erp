"use client";

import { useText } from "@/lib/i18n";

export function UnsavedDialog({
  open,
  saving,
  onStay,
  onLeave,
  onSave,
}: {
  open: boolean;
  saving?: boolean;
  onStay: () => void;
  onLeave: () => void;
  onSave: () => void;
}) {
  const { t } = useText();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-ink/45 px-4 py-16" onMouseDown={onStay}>
      <div className="w-full max-w-md rounded-xl border border-line bg-paper p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <h2 className="font-serif text-2xl">{t("unsaved.title")}</h2>
        <p className="mt-2 text-sm text-ink/60">{t("unsaved.body")}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className="btn-ghost" type="button" onClick={onStay}>
            {t("unsaved.keep")}
          </button>
          <button className="btn-ghost text-clay" type="button" disabled={saving} onClick={onLeave}>
            {t("unsaved.leave")}
          </button>
          <button className="btn-primary" type="button" disabled={saving} onClick={onSave}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function isDirty(current: unknown, baseline: string) {
  return JSON.stringify(current) !== baseline;
}

export function snapshot(value: unknown) {
  return JSON.stringify(value);
}
