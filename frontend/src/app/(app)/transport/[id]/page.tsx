"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Banner, DetailHeader, Empty, Field, Loading } from "@/components/ui";
import { ImageField } from "@/components/image-field";
import { useToast } from "@/components/toast";
import { isDirty, snapshot, UnsavedDialog } from "@/components/unsaved";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { FUEL_TYPES, fuelLabel, money, num, todayInput } from "@/lib/format";
import { Page, Row } from "@/lib/types";
import { FuelHistory } from "./fuel-history";

type Summary = {
  runs: number;
  distance_km: number;
  fuel_liters: number;
  fuel_cost: Record<string, number>;
  fuel_per_100km: number | null;
};

const vehicleBlank = {
  plate_no: "",
  kind: "",
  brand: "",
  model_name: "",
  registered_on: "",
  unit_id: "",
  status: "available",
  driver_employee_id: "",
  odometer_km: "0",
  note: "",
  image_url: "",
};

const runBlank = {
  run_date: todayInput(),
  purpose: "",
  origin: "",
  destination: "",
  driver_employee_id: "",
  odometer_start: "",
  odometer_end: "",
  fuel_liters: "",
  fuel_type: "",
  fuel_cost: "",
  currency: "USD",
  note: "",
};

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { has, options, refresh } = useSession();
  const { defaultCurrency } = useSettings();
  const canWrite = has("transport.write");
  const isNew = params.id === "new";

  const [vehicle, setVehicle] = useState(vehicleBlank);
  const [baseline, setBaseline] = useState(snapshot(vehicleBlank));
  const [title, setTitle] = useState(isNew ? "New vehicle" : "Vehicle");
  const [runs, setRuns] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedRuns, setSelectedRuns] = useState<number[]>([]);
  const [runForm, setRunForm] = useState(runBlank);
  const [editingRun, setEditingRun] = useState<Row | null>(null);
  const [showRunForm, setShowRunForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const dirty = canWrite && isDirty(vehicle, baseline);

  async function loadRuns(vehicleId: string) {
    const page = await api<Page<Row> & { summary: Summary }>(`/vehicle-runs?vehicle_id=${vehicleId}`);
    setRuns(page.items);
    setSummary(page.summary);
    setSelectedRuns([]);
  }

  useEffect(() => {
    if (isNew) return;
    Promise.all([api<Row>(`/vehicles/${params.id}`), loadRuns(params.id)])
      .then(([row]) => {
        setTitle(row.plate_no || "Vehicle");
        const next = {
          plate_no: row.plate_no || "",
          kind: row.kind || "",
          brand: row.brand || "",
          model_name: row.model_name || "",
          registered_on: row.registered_on || "",
          unit_id: row.unit_id == null ? "" : String(row.unit_id),
          status: row.status || "available",
          driver_employee_id: row.driver_employee_id == null ? "" : String(row.driver_employee_id),
          odometer_km: String(row.odometer_km ?? 0),
          note: row.note || "",
          image_url: row.image_url || "",
        };
        setVehicle(next);
        setBaseline(snapshot(next));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load vehicle"))
      .finally(() => setLoading(false));
  }, [isNew, params.id]);

  const distancePreview =
    runForm.odometer_start !== "" && runForm.odometer_end !== ""
      ? Math.max(0, Number(runForm.odometer_end) - Number(runForm.odometer_start))
      : null;

  const allRunsSelected = runs.length > 0 && runs.every((row) => selectedRuns.includes(row.id));

  async function persistVehicle() {
    const body = {
      plate_no: vehicle.plate_no.trim(),
      kind: vehicle.kind.trim(),
      brand: vehicle.brand.trim() || null,
      model_name: vehicle.model_name.trim() || null,
      registered_on: vehicle.registered_on || null,
      unit_id: vehicle.unit_id ? Number(vehicle.unit_id) : null,
      status: vehicle.status,
      driver_employee_id: vehicle.driver_employee_id ? Number(vehicle.driver_employee_id) : null,
      odometer_km: Number(vehicle.odometer_km || 0),
      note: vehicle.note.trim() || null,
      image_url: vehicle.image_url.trim() || null,
    };
    if (isNew) {
      const created = await api<Row>("/vehicles", { method: "POST", body: JSON.stringify(body) });
      await refresh();
      toast.success("Saved");
      setBaseline(snapshot(vehicle));
      router.replace(`/transport/${created.id}`);
      return;
    }
    const updated = await api<Row>(`/vehicles/${params.id}`, { method: "PATCH", body: JSON.stringify(body) });
    setTitle(updated.plate_no || "Vehicle");
    setBaseline(snapshot(vehicle));
    await refresh();
    toast.success("Saved");
  }

  async function saveVehicle(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    try {
      await persistVehicle();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function requestLeave() {
    if (!dirty) {
      router.push("/transport");
      return;
    }
    setLeaveOpen(true);
  }

  async function saveAndLeave() {
    setSaving(true);
    setError(null);
    try {
      await persistVehicle();
      setLeaveOpen(false);
      router.push("/transport");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
      setLeaveOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function startRun(row?: Row) {
    if (row) {
      setEditingRun(row);
      setRunForm({
        run_date: row.run_date,
        purpose: row.purpose || "",
        origin: row.origin || "",
        destination: row.destination || "",
        driver_employee_id: row.driver_employee_id ? String(row.driver_employee_id) : "",
        odometer_start: String(row.odometer_start ?? ""),
        odometer_end: String(row.odometer_end ?? ""),
        fuel_liters: String(row.fuel_liters ?? ""),
        fuel_type: row.fuel_type || "",
        fuel_cost: String(row.fuel_cost ?? ""),
        currency: row.currency || defaultCurrency,
        note: row.note || "",
      });
    } else {
      setEditingRun(null);
      setRunForm({
        ...runBlank,
        currency: defaultCurrency,
        run_date: todayInput(),
        odometer_start: vehicle.odometer_km || "0",
        driver_employee_id: vehicle.driver_employee_id,
      });
    }
    setShowRunForm(true);
    setError(null);
  }

  async function saveRun(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || isNew) return;
    setSaving(true);
    setError(null);
    const body = {
      vehicle_id: Number(params.id),
      run_date: runForm.run_date,
      purpose: runForm.purpose || null,
      origin: runForm.origin || null,
      destination: runForm.destination || null,
      driver_employee_id: runForm.driver_employee_id ? Number(runForm.driver_employee_id) : null,
      odometer_start: runForm.odometer_start === "" ? null : Number(runForm.odometer_start),
      odometer_end: Number(runForm.odometer_end),
      fuel_liters: Number(runForm.fuel_liters || 0),
      fuel_type: runForm.fuel_type || null,
      fuel_cost: Number(runForm.fuel_cost || 0),
      currency: runForm.currency,
      note: runForm.note || null,
    };
    try {
      if (editingRun) await api(`/vehicle-runs/${editingRun.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api("/vehicle-runs", { method: "POST", body: JSON.stringify(body) });
      setShowRunForm(false);
      const updated = await api<Row>(`/vehicles/${params.id}`);
      setVehicle((current) => ({ ...current, odometer_km: String(updated.odometer_km ?? current.odometer_km) }));
      await loadRuns(params.id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the run");
    } finally {
      setSaving(false);
    }
  }

  async function bulkDeleteRuns() {
    if (!selectedRuns.length) return;
    if (!confirm(`Delete ${selectedRuns.length} run${selectedRuns.length === 1 ? "" : "s"}?`)) return;
    setError(null);
    try {
      for (const id of selectedRuns) await api(`/vehicle-runs/${id}`, { method: "DELETE" });
      const updated = await api<Row>(`/vehicles/${params.id}`);
      setVehicle((current) => ({ ...current, odometer_km: String(updated.odometer_km ?? current.odometer_km) }));
      await loadRuns(params.id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete runs");
    }
  }

  if (loading) return <Loading />;

  return (
    <div>
      <DetailHeader backHref="/transport" backLabel="Fleet" title={title} onBack={requestLeave} />
      {error && <Banner>{error}</Banner>}

      <form className="card mb-6 grid max-w-3xl gap-4 p-5 sm:grid-cols-2" onSubmit={saveVehicle}>
        <div className="sm:col-span-2">
          <Field label="Image">
            <ImageField value={vehicle.image_url} disabled={!canWrite} onChange={(url) => setVehicle({ ...vehicle, image_url: url })} />
          </Field>
        </div>
        <Field label="Plate">
          <input className="field" value={vehicle.plate_no} disabled={!canWrite} onChange={(event) => setVehicle({ ...vehicle, plate_no: event.target.value })} required />
        </Field>
        <Field label="Kind">
          <input className="field" value={vehicle.kind} disabled={!canWrite} onChange={(event) => setVehicle({ ...vehicle, kind: event.target.value })} required />
        </Field>
        <Field label="Brand">
          <input className="field" value={vehicle.brand} disabled={!canWrite} onChange={(event) => setVehicle({ ...vehicle, brand: event.target.value })} placeholder="Audi" />
        </Field>
        <Field label="Model">
          <input className="field" value={vehicle.model_name} disabled={!canWrite} onChange={(event) => setVehicle({ ...vehicle, model_name: event.target.value })} placeholder="A6L" />
        </Field>
        <Field label="Registered">
          <input className="field" type="date" value={vehicle.registered_on} disabled={!canWrite} onChange={(event) => setVehicle({ ...vehicle, registered_on: event.target.value })} />
        </Field>
        <Field label="Unit">
          <select className="field" value={vehicle.unit_id} disabled={!canWrite} onChange={(event) => setVehicle({ ...vehicle, unit_id: event.target.value })}>
            <option value="">None</option>
            {options.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="field" value={vehicle.status} disabled={!canWrite} onChange={(event) => setVehicle({ ...vehicle, status: event.target.value })} required>
            <option value="available">Available</option>
            <option value="on_route">On route</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </Field>
        <Field label="Driver">
          <select className="field" value={vehicle.driver_employee_id} disabled={!canWrite} onChange={(event) => setVehicle({ ...vehicle, driver_employee_id: event.target.value })}>
            <option value="">None</option>
            {options.employees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Odometer (km)">
          <input className="field" type="number" step="any" min="0" value={vehicle.odometer_km} disabled={!canWrite} onChange={(event) => setVehicle({ ...vehicle, odometer_km: event.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Note">
            <input className="field" value={vehicle.note} disabled={!canWrite} onChange={(event) => setVehicle({ ...vehicle, note: event.target.value })} />
          </Field>
        </div>
        {canWrite && (
          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-line pt-4">
            <button className="btn-ghost" type="button" onClick={requestLeave}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saving} type="submit">
              {saving ? "Saving" : "Save"}
            </button>
          </div>
        )}
      </form>

      <UnsavedDialog
        open={leaveOpen}
        saving={saving}
        onStay={() => setLeaveOpen(false)}
        onLeave={() => {
          setLeaveOpen(false);
          router.push("/transport");
        }}
        onSave={saveAndLeave}
      />

      {!isNew && <FuelHistory vehicleId={params.id} canWrite={canWrite} />}

      {!isNew && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl">Drive history</h2>
              <p className="text-sm text-ink/55">Route, odometer, and fuel for this vehicle.</p>
            </div>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                {selectedRuns.length > 0 && (
                  <button className="btn-ghost text-clay" onClick={bulkDeleteRuns} type="button">
                    Delete ({selectedRuns.length})
                  </button>
                )}
                <button className="btn-primary" onClick={() => startRun()} type="button">
                  Record run
                </button>
              </div>
            )}
          </div>

          {summary && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Runs" value={String(summary.runs)} />
              <Stat label="Distance" value={`${num(summary.distance_km)} km`} />
              <Stat label="Fuel used" value={`${num(summary.fuel_liters)} L`} />
              <Stat
                label="Average"
                value={summary.fuel_per_100km == null ? "–" : `${num(summary.fuel_per_100km)} L/100km`}
                hint={Object.entries(summary.fuel_cost)
                  .map(([currency, amount]) => money(amount, currency))
                  .join(" · ") || undefined}
              />
            </div>
          )}

          {showRunForm && canWrite && (
            <form className="card grid gap-3 p-4 sm:grid-cols-2" onSubmit={saveRun}>
              <Field label="Date">
                <input className="field" type="date" value={runForm.run_date} onChange={(event) => setRunForm({ ...runForm, run_date: event.target.value })} required />
              </Field>
              <Field label="Driver">
                <select className="field" value={runForm.driver_employee_id} onChange={(event) => setRunForm({ ...runForm, driver_employee_id: event.target.value })}>
                  <option value="">None</option>
                  {options.employees.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Purpose">
                <input className="field" value={runForm.purpose} onChange={(event) => setRunForm({ ...runForm, purpose: event.target.value })} />
              </Field>
              <Field label="From">
                <input className="field" value={runForm.origin} onChange={(event) => setRunForm({ ...runForm, origin: event.target.value })} />
              </Field>
              <Field label="To">
                <input className="field" value={runForm.destination} onChange={(event) => setRunForm({ ...runForm, destination: event.target.value })} />
              </Field>
              <Field label="Odometer start (km)">
                <input className="field" type="number" step="any" min="0" value={runForm.odometer_start} onChange={(event) => setRunForm({ ...runForm, odometer_start: event.target.value })} required />
              </Field>
              <Field label="Odometer end (km)">
                <input className="field" type="number" step="any" min="0" value={runForm.odometer_end} onChange={(event) => setRunForm({ ...runForm, odometer_end: event.target.value })} required />
                {distancePreview != null && <p className="mt-1 text-xs text-ink/45">Distance {num(distancePreview)} km</p>}
              </Field>
              <Field label="Fuel used (L)">
                <input className="field" type="number" step="any" min="0" value={runForm.fuel_liters} onChange={(event) => setRunForm({ ...runForm, fuel_liters: event.target.value })} />
              </Field>
              <Field label="Fuel type">
                <select className="field" value={runForm.fuel_type} onChange={(event) => setRunForm({ ...runForm, fuel_type: event.target.value })}>
                  <option value="">Unspecified</option>
                  {FUEL_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fuel cost">
                <div className="flex gap-2">
                  <input className="field" type="number" step="any" min="0" value={runForm.fuel_cost} onChange={(event) => setRunForm({ ...runForm, fuel_cost: event.target.value })} />
                  <select className="field max-w-[6rem]" value={runForm.currency} onChange={(event) => setRunForm({ ...runForm, currency: event.target.value })}>
                    <option value="USD">USD</option>
                    <option value="RMB">RMB</option>
                  </select>
                </div>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Note">
                  <input className="field" value={runForm.note} onChange={(event) => setRunForm({ ...runForm, note: event.target.value })} />
                </Field>
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <button className="btn-ghost" type="button" onClick={() => setShowRunForm(false)}>
                  Cancel
                </button>
                <button className="btn-primary" disabled={saving} type="submit">
                  {saving ? "Saving" : "Save run"}
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
                      <input
                        type="checkbox"
                        checked={allRunsSelected}
                        onChange={() =>
                          setSelectedRuns(allRunsSelected ? [] : runs.map((row) => row.id))
                        }
                        aria-label="Select all runs"
                      />
                    </th>
                  )}
                  <th>Date</th>
                  <th>Route</th>
                  <th>Driver</th>
                  <th>Distance</th>
                  <th>Fuel</th>
                  <th>L/100km</th>
                  <th>Fuel cost</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((row) => (
                  <tr
                    key={row.id}
                    className={canWrite ? "cursor-pointer hover:bg-brass/[0.06]" : undefined}
                    onClick={() => canWrite && startRun(row)}
                  >
                    {canWrite && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedRuns.includes(row.id)}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedRuns((current) =>
                              current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
                            );
                          }}
                          onChange={() => undefined}
                          aria-label={`Select run ${row.id}`}
                        />
                      </td>
                    )}
                    <td>{row.run_date}</td>
                    <td>
                      {[row.origin, row.destination].filter(Boolean).join(" → ") || row.purpose || "–"}
                      {row.purpose && (row.origin || row.destination) ? <div className="text-xs text-ink/40">{row.purpose}</div> : null}
                    </td>
                    <td>{row.driver_name || "–"}</td>
                    <td>
                      {num(row.distance_km)} km
                      <div className="text-xs text-ink/40">
                        {num(row.odometer_start)} → {num(row.odometer_end)}
                      </div>
                    </td>
                    <td>
                      {num(row.fuel_liters)} L
                      <div className="text-xs text-ink/40">{fuelLabel(row.fuel_type)}</div>
                    </td>
                    <td>{row.fuel_per_100km == null ? "–" : num(row.fuel_per_100km)}</td>
                    <td>{row.fuel_cost ? money(row.fuel_cost, row.currency, 2) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!runs.length && <Empty>No runs recorded for this vehicle.</Empty>}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="card p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-ink/45">{label}</div>
      <div className="mt-2 font-serif text-3xl tracking-tight">{value}</div>
      {hint && <p className="mt-1 text-xs text-ink/50">{hint}</p>}
    </article>
  );
}
