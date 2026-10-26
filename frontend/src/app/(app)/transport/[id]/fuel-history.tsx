"use client";

import { FormEvent, useEffect, useState } from "react";
import { Banner, Empty, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { FUEL_TYPES, fuelLabel, money, num, todayInput } from "@/lib/format";
import { Page, Row } from "@/lib/types";

type Summary = {
  purchases: number;
  liters: number;
  cost: Record<string, number>;
};

const blank = {
  purchased_on: todayInput(),
  goods_id: "",
  location_id: "",
  quantity: "",
  unit_price: "",
  fuel_type: "",
  purchased_from: "",
  odometer_km: "",
  note: "",
};

export function FuelHistory({ vehicleId, canWrite }: { vehicleId: string; canWrite: boolean }) {
  const { options, refresh } = useSession();
  const fuelGoods = options.goods.filter((item) => item.category === "internal");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const page = await api<Page<Row> & { summary: Summary }>(`/fuel-purchases?vehicle_id=${vehicleId}`);
    setRows(page.items);
    setSummary(page.summary);
    setSelected([]);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load fuel purchases"));
  }, [vehicleId]);

  const locationOptions = options.locations;
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));
  const selectedGoods = fuelGoods.find((item) => String(item.id) === form.goods_id);

  function applyGoods(goodsId: string, current = form) {
    const goods = fuelGoods.find((item) => String(item.id) === goodsId);
    return {
      ...current,
      goods_id: goodsId,
      unit_price: goods ? String(goods.unit_price) : current.unit_price,
      purchased_from: current.purchased_from || goods?.purchased_from || "",
    };
  }

  function start(row?: Row) {
    if (row) {
      setEditing(row);
      setForm({
        purchased_on: row.purchased_on,
        goods_id: String(row.goods_id),
        location_id: String(row.location_id),
        quantity: String(row.quantity ?? ""),
        unit_price: String(row.unit_price ?? ""),
        fuel_type: row.fuel_type || "",
        purchased_from: row.purchased_from || "",
        odometer_km: row.odometer_km == null ? "" : String(row.odometer_km),
        note: row.note || "",
      });
    } else {
      const goods = fuelGoods.find((item) => item.sku === "FUEL") || fuelGoods[0];
      const location = locationOptions[0];
      setEditing(null);
      setForm(
        applyGoods(goods ? String(goods.id) : "", {
          ...blank,
          purchased_on: todayInput(),
          location_id: location ? String(location.id) : "",
          purchased_from: goods?.purchased_from || "",
        }),
      );
    }
    setOpen(true);
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    const body = {
      vehicle_id: Number(vehicleId),
      goods_id: Number(form.goods_id),
      location_id: Number(form.location_id),
      quantity: Number(form.quantity),
      unit_price: Number(form.unit_price || 0),
      fuel_type: form.fuel_type || null,
      purchased_from: form.purchased_from.trim() || null,
      purchased_on: form.purchased_on,
      odometer_km: form.odometer_km === "" ? null : Number(form.odometer_km),
      note: form.note.trim() || null,
    };
    try {
      if (editing) await api(`/fuel-purchases/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api("/fuel-purchases", { method: "POST", body: JSON.stringify(body) });
      setOpen(false);
      await load();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the fuel purchase");
    } finally {
      setSaving(false);
    }
  }

  async function bulkDelete() {
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} fuel purchase${selected.length === 1 ? "" : "s"}?`)) return;
    setError(null);
    try {
      for (const id of selected) await api(`/fuel-purchases/${id}`, { method: "DELETE" });
      await load();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete fuel purchases");
    }
  }

  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">Fuel purchases</h2>
          <p className="text-sm text-ink/55">Fill-ups for this vehicle. Fuel is an internal-consumption good, so each purchase is received and then consumed.</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {selected.length > 0 && (
              <button className="btn-ghost text-clay" onClick={bulkDelete} type="button">
                Delete ({selected.length})
              </button>
            )}
            <button className="btn-primary" onClick={() => start()} type="button">
              Record purchase
            </button>
          </div>
        )}
      </div>

      {error && <Banner>{error}</Banner>}

      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Purchases" value={String(summary.purchases)} />
          <Stat label="Liters" value={`${num(summary.liters)} L`} />
          <Stat
            label="Spent"
            value={
              Object.entries(summary.cost)
                .map(([currency, amount]) => money(amount, currency, 2))
                .join(" · ") || "–"
            }
          />
        </div>
      )}

      {open && canWrite && (
        <form className="card grid gap-3 p-4 sm:grid-cols-2" onSubmit={save}>
          {!fuelGoods.length && <p className="sm:col-span-2 text-sm text-clay">Add Fuel to the goods list with use set to Internal consumption before recording a purchase.</p>}
          <Field label="Date">
            <input className="field" type="date" value={form.purchased_on} onChange={(event) => setForm({ ...form, purchased_on: event.target.value })} required />
          </Field>
          <Field label="Fuel">
            <select className="field" value={form.goods_id} onChange={(event) => setForm(applyGoods(event.target.value))} required>
              <option value="">Select</option>
              {fuelGoods.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} · {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Grade">
            <select className="field" value={form.fuel_type} onChange={(event) => setForm({ ...form, fuel_type: event.target.value })}>
              <option value="">Unspecified</option>
              {FUEL_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Place">
            <select className="field" value={form.location_id} onChange={(event) => setForm({ ...form, location_id: event.target.value })} required>
              <option value="">Select</option>
              {locationOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.unit_name ? ` · ${item.unit_name}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Quantity (${selectedGoods?.uom || "L"})`}>
            <input className="field" type="number" step="any" min="0" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
          </Field>
          <Field label="Unit price">
            <div className="flex gap-2">
              <input className="field" type="number" step="any" min="0" value={form.unit_price} onChange={(event) => setForm({ ...form, unit_price: event.target.value })} required />
              <input className="field max-w-[6rem]" value={selectedGoods?.currency || "USD"} disabled />
            </div>
          </Field>
          <Field label="Purchase from">
            <input className="field" list="fuel-sources" value={form.purchased_from} onChange={(event) => setForm({ ...form, purchased_from: event.target.value })} />
            <datalist id="fuel-sources">
              {options.purchase_sources.map((item) => (
                <option key={item.id} value={item.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Odometer (km)">
            <input className="field" type="number" step="any" min="0" value={form.odometer_km} onChange={(event) => setForm({ ...form, odometer_km: event.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Note">
              <input className="field" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saving || !fuelGoods.length} type="submit">
              {saving ? "Saving" : "Save purchase"}
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              {canWrite && (
                <th className="w-10">
                  <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))} aria-label="Select all fuel purchases" />
                </th>
              )}
              <th>Date</th>
              <th>Fuel</th>
              <th>Grade</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Total</th>
              <th>From</th>
              <th>Odometer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={canWrite ? "cursor-pointer hover:bg-brass/[0.06]" : undefined} onClick={() => canWrite && start(row)}>
                {canWrite && (
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(row.id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelected((current) => (current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id]));
                      }}
                      onChange={() => undefined}
                      aria-label={`Select purchase ${row.id}`}
                    />
                  </td>
                )}
                <td>{row.purchased_on}</td>
                <td>{row.goods_name || "Fuel"}</td>
                <td>{fuelLabel(row.fuel_type)}</td>
                <td>
                  {num(row.quantity)} {row.uom || "L"}
                </td>
                <td>{money(row.unit_price, row.currency, 2)}</td>
                <td>{money(row.total, row.currency, 2)}</td>
                <td>{row.purchased_from || "–"}</td>
                <td>{row.odometer_km == null ? "–" : `${num(row.odometer_km)} km`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty>No fuel purchases for this vehicle.</Empty>}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="card p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-ink/45">{label}</div>
      <div className="mt-2 font-serif text-3xl tracking-tight">{value}</div>
    </article>
  );
}
