"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Field, Modal } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useText } from "@/lib/i18n";

export type Supplier = { id: number | null; name: string };

export function SupplierPicker({
  suppliers,
  value,
  disabled,
  canAdd,
  onChange,
  onCreated,
}: {
  suppliers: Supplier[];
  value: string;
  disabled?: boolean;
  canAdd?: boolean;
  onChange: (name: string) => void;
  onCreated: (supplier: Supplier) => void;
}) {
  const { t } = useText();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return suppliers.filter((item) => !needle || item.name.toLowerCase().includes(needle));
  }, [suppliers, query]);

  function place() {
    const el = root.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBox({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 240) });
  }

  useEffect(() => {
    if (!open) return;
    place();
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (root.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.("[data-supplier-menu]")) return;
      setOpen(false);
    }
    function onLayout() {
      place();
    }
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open]);

  function choose(next: string) {
    onChange(next);
    setQuery("");
    setOpen(false);
  }

  function startAdd() {
    setName(query.trim());
    setError(null);
    setAdding(true);
    setOpen(false);
  }

  async function createSupplier() {
    const cleaned = name.trim();
    if (!cleaned) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api<Supplier>("/trade-suppliers", {
        method: "POST",
        body: JSON.stringify({ name: cleaned }),
      });
      onCreated(created);
      onChange(created.name);
      setAdding(false);
      setQuery("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <input
        className="field"
        disabled={disabled}
        required
        value={open ? query : value}
        placeholder={t("trading.searchSupplier")}
        onFocus={() => {
          if (disabled) return;
          setQuery("");
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />
      {open && box && (
        <div
          data-supplier-menu
          className="fixed z-40 max-h-64 overflow-auto rounded-md border border-line bg-paper shadow-lg"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          {matches.map((item) => (
            <button
              key={`${item.id ?? "name"}-${item.name}`}
              type="button"
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-brass/10 ${item.name === value ? "bg-brass/10" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item.name)}
            >
              {item.name}
            </button>
          ))}
          {!matches.length && <div className="px-3 py-2 text-sm text-ink/50">{t("trading.noSupplierMatch")}</div>}
          {canAdd && (
            <button
              type="button"
              className="sticky bottom-0 block w-full border-t border-line bg-paper px-3 py-2 text-left text-sm text-brass hover:bg-brass/10"
              onMouseDown={(event) => event.preventDefault()}
              onClick={startAdd}
            >
              + {t("trading.addSupplier")}
            </button>
          )}
        </div>
      )}
      {adding && (
        <Modal title={t("trading.addSupplier")} onClose={() => setAdding(false)}>
          <div className="grid gap-3">
            <p className="text-sm text-ink/60">{t("trading.addSupplierHint")}</p>
            {error && <p className="text-sm text-clay">{error}</p>}
            <Field label={t("common.name")}>
              <input className="field" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" type="button" onClick={() => setAdding(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn-primary" type="button" disabled={saving || !name.trim()} onClick={createSupplier}>
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
