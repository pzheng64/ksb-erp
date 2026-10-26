"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useText } from "@/lib/i18n";

export type Person = { id: number; full_name: string; employee_no: string; unit_name?: string | null };

function personLabel(person: Person) {
  return person.employee_no ? `${person.full_name} · ${person.employee_no}` : person.full_name;
}

export function PersonPicker({
  people,
  value,
  disabled,
  onChange,
}: {
  people: Person[];
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const { t } = useText();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const selected = people.find((item) => String(item.id) === value);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return people.filter((item) => {
      if (!needle) return true;
      return personLabel(item).toLowerCase().includes(needle) || (item.unit_name || "").toLowerCase().includes(needle);
    });
  }, [people, query]);

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
      if ((target as HTMLElement).closest?.("[data-person-menu]")) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <input
        className="field"
        disabled={disabled}
        required
        value={open ? query : selected ? personLabel(selected) : ""}
        placeholder={t("trading.searchAssignee")}
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
          data-person-menu
          className="fixed z-40 max-h-64 overflow-auto rounded-md border border-line bg-paper shadow-lg"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          {matches.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-brass/10 ${String(item.id) === value ? "bg-brass/10" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(String(item.id));
                setQuery("");
                setOpen(false);
              }}
            >
              {personLabel(item)}
              {item.unit_name ? <span className="ml-2 text-xs text-ink/40">{item.unit_name}</span> : null}
            </button>
          ))}
          {!matches.length && <div className="px-3 py-2 text-sm text-ink/50">{t("trading.noAssigneeMatch")}</div>}
        </div>
      )}
    </div>
  );
}
