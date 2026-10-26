"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Field, Modal } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useText } from "@/lib/i18n";

export type TradeProduct = {
  id: number;
  sku: string;
  name: string;
  category: string;
  variety: string;
  uom: string;
  is_active: boolean;
};

const CATEGORIES = ["clothing", "furniture", "food", "vehicle", "other"] as const;
const SKU_PREFIX: Record<string, string> = { clothing: "CL", furniture: "FN", food: "FD", vehicle: "VH", other: "GN" };

export function productLabel(product: { category: string; name: string }, t: (key: string) => string) {
  const key = `tradeCategory.${product.category}`;
  const category = t(key);
  return `${category === key ? product.category : category} / ${product.name}`;
}

function nextSku(category: string, name: string, taken: Set<string>) {
  const prefix = SKU_PREFIX[category] || "GN";
  const ascii = name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10);
  const stem = ascii || "ITEM";
  let sku = `${prefix}-${stem}`.slice(0, 64);
  let n = 2;
  while (taken.has(sku)) {
    sku = `${prefix}-${stem}-${n}`.slice(0, 64);
    n += 1;
  }
  return sku;
}

export function GoodsPicker({
  products,
  value,
  disabled,
  canAdd,
  onChange,
  onCreated,
}: {
  products: TradeProduct[];
  value: string;
  disabled?: boolean;
  canAdd?: boolean;
  onChange: (productId: string) => void;
  onCreated: (product: TradeProduct) => void;
}) {
  const { t } = useText();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ category: "other", name: "", uom: "pcs" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = products.find((item) => String(item.id) === value);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((item) => {
      if (!needle) return true;
      return productLabel(item, t).toLowerCase().includes(needle) || item.variety.toLowerCase().includes(needle);
    });
  }, [products, query, t]);

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
      if ((target as HTMLElement).closest?.("[data-goods-menu]")) return;
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

  function choose(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  function startAdd() {
    setDraft({ category: "other", name: query.trim(), uom: "pcs" });
    setError(null);
    setAdding(true);
    setOpen(false);
  }

  async function createType() {
    if (!draft.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const name = draft.name.trim();
      const sku = nextSku(draft.category, name, new Set(products.map((item) => item.sku.toUpperCase())));
      const created = await api<TradeProduct>("/trade-products", {
        method: "POST",
        body: JSON.stringify({
          sku,
          name,
          category: draft.category,
          variety: name.slice(0, 64),
          uom: draft.uom.trim() || "pcs",
          is_active: true,
        }),
      });
      onCreated(created);
      onChange(String(created.id));
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
        value={open ? query : selected ? productLabel(selected, t) : ""}
        placeholder={t("trading.searchGoods")}
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
          data-goods-menu
          className="fixed z-40 max-h-64 overflow-auto rounded-md border border-line bg-paper shadow-lg"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          {matches.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-brass/10 ${String(item.id) === value ? "bg-brass/10" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(String(item.id))}
            >
              {productLabel(item, t)}
              <span className="ml-2 text-xs text-ink/40">{item.uom}</span>
            </button>
          ))}
          {!matches.length && <div className="px-3 py-2 text-sm text-ink/50">{t("trading.noGoodsMatch")}</div>}
          {canAdd && (
            <button
              type="button"
              className="sticky bottom-0 block w-full border-t border-line bg-paper px-3 py-2 text-left text-sm text-brass hover:bg-brass/10"
              onMouseDown={(event) => event.preventDefault()}
              onClick={startAdd}
            >
              + {t("trading.addGoodsType")}
            </button>
          )}
        </div>
      )}
      {adding && (
        <Modal title={t("trading.addGoodsType")} onClose={() => setAdding(false)}>
          <div className="grid gap-3">
            <p className="text-sm text-ink/60">{t("trading.addGoodsTypeHint")}</p>
            {error && <p className="text-sm text-clay">{error}</p>}
            <Field label={t("trading.category")}>
              <select className="field" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(`tradeCategory.${category}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("common.name")}>
              <input className="field" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Field label={t("trading.measure")}>
              <input className="field" value={draft.uom} onChange={(event) => setDraft({ ...draft, uom: event.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" type="button" onClick={() => setAdding(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn-primary" type="button" disabled={saving || !draft.name.trim()} onClick={createType}>
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
