"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { Banner, Empty, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { FUEL_TYPES, fuelLabel, money, num } from "@/lib/format";
import { Page, Row } from "@/lib/types";

type Summary = {
  runs: number;
  distance_km: number;
  fuel_liters: number;
  fuel_cost: Record<string, number>;
  fuel_per_100km: number | null;
};

type Facets = {
  origins: string[];
  destinations: string[];
  fuel_types: { value: string; label: string }[];
};

const emptyFacets: Facets = { origins: [], destinations: [], fuel_types: [] };

export default function RunningHistoryPage() {
  const { options } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [facets, setFacets] = useState<Facets>(emptyFacets);
  const [q, setQ] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const filtersActive = Boolean(q.trim() || vehicleId || origin || destination || fuelType);

  function resetFilters() {
    setQ("");
    setVehicleId("");
    setOrigin("");
    setDestination("");
    setFuelType("");
  }

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (vehicleId) params.set("vehicle_id", vehicleId);
      if (origin) params.set("origin", origin);
      if (destination) params.set("destination", destination);
      if (fuelType) params.set("fuel_type", fuelType);
      api<Page<Row> & { summary: Summary; facets: Facets }>(`/vehicle-runs?${params.toString()}`)
        .then((page) => {
          if (cancelled) return;
          setRows(page.items);
          setSummary(page.summary);
          setFacets(page.facets);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof ApiError ? err.message : "Could not load running history");
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, vehicleId, origin, destination, fuelType]);

  const fuelCost = summary
    ? Object.entries(summary.fuel_cost)
        .filter(([, value]) => value)
        .map(([currency, value]) => money(value, currency, 2))
        .join(" · ")
    : "";

  const fields = useMemo(
    () => [
      { key: "date", label: "Date", value: (row: Row) => String(row.run_date || "–") },
      { key: "vehicle", label: "Vehicle", value: (row: Row) => String(row.plate_no || "Vehicle") },
      { key: "from", label: "From", value: (row: Row) => String(row.origin || "–") },
      { key: "to", label: "To", value: (row: Row) => String(row.destination || "–") },
      { key: "driver", label: "Driver", value: (row: Row) => String(row.driver_name || "–") },
      { key: "distance", label: "Distance", value: (row: Row) => `${num(row.distance_km)} km` },
      { key: "fuel", label: "Fuel type", value: (row: Row) => fuelLabel(row.fuel_type) },
      { key: "liters", label: "Fuel", value: (row: Row) => `${num(row.fuel_liters)} L` },
      { key: "cost", label: "Cost", value: (row: Row) => (row.fuel_cost ? money(row.fuel_cost, row.currency, 2) : "–") },
    ],
    [],
  );
  const list = useListControls(rows, fields);

  return (
    <div>
      <PageHeader title="Running history" eyebrow="Vehicles" />
      <p className="mb-2 text-xs text-ink/55">Every recorded run, across the fleet. Open a plate to edit that vehicle.</p>
      {error && <Banner>{error}</Banner>}
      <ListToolbar
        fields={fields}
        controls={list}
        leading={
          <>
            <input className="field h-8 w-44 shrink-0 px-2 py-0 text-xs" placeholder="Search plate, route, driver" value={q} onChange={(event) => setQ(event.target.value)} aria-label="Search runs" />
            <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} aria-label="Vehicle">
              <option value="">All vehicles</option>
              {options.vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>{vehicle.plate_no}{vehicle.kind ? ` · ${vehicle.kind}` : ""}</option>
              ))}
            </select>
            <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" value={origin} onChange={(event) => setOrigin(event.target.value)} aria-label="From">
              <option value="">All from</option>
              {facets.origins.map((place) => <option key={place} value={place}>{place}</option>)}
            </select>
            <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" value={destination} onChange={(event) => setDestination(event.target.value)} aria-label="To">
              <option value="">All destinations</option>
              {facets.destinations.map((place) => <option key={place} value={place}>{place}</option>)}
            </select>
            <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" value={fuelType} onChange={(event) => setFuelType(event.target.value)} aria-label="Fuel type">
              <option value="">All fuel types</option>
              {(facets.fuel_types.length ? facets.fuel_types : FUEL_TYPES).map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <button className="btn-ghost shrink-0 px-2 py-1 text-xs" type="button" onClick={resetFilters} disabled={!filtersActive}>Reset</button>
            {summary && (
              <span className="shrink-0 text-xs text-ink/55">
                {summary.runs} runs · {num(summary.distance_km)} km · {num(summary.fuel_liters)} L
                {summary.fuel_per_100km == null ? "" : ` · ${num(summary.fuel_per_100km)} L/100 km`}
                {fuelCost ? ` · ${fuelCost}` : ""}
              </span>
            )}
          </>
        }
      />
      <div className="card overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Vehicle</th>
              <th>From</th>
              <th>To</th>
              <th>Driver</th>
              <th>Distance</th>
              <th>Fuel type</th>
              <th>Fuel</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {list.pageRows.map((row) => (
              <tr key={row.id}>
                <td>{row.run_date}</td>
                <td>
                  <Link href={`/transport/${row.vehicle_id}`} className="text-brass hover:underline">
                    {row.plate_no || "Vehicle"}
                  </Link>
                  {row.kind ? <div className="text-xs text-ink/40">{row.kind}</div> : null}
                  {row.purpose ? <div className="text-xs text-ink/40">{row.purpose}</div> : null}
                </td>
                <td>{row.origin || "–"}</td>
                <td>{row.destination || "–"}</td>
                <td>{row.driver_name || "–"}</td>
                <td>
                  {num(row.distance_km)} km
                  <div className="text-xs text-ink/40">
                    {num(row.odometer_start)} → {num(row.odometer_end)}
                  </div>
                </td>
                <td>{fuelLabel(row.fuel_type)}</td>
                <td>
                  {num(row.fuel_liters)} L
                  <div className="text-xs text-ink/40">{row.fuel_per_100km == null ? "–" : `${num(row.fuel_per_100km)} L/100km`}</div>
                </td>
                <td>{row.fuel_cost ? money(row.fuel_cost, row.currency, 2) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.filtered.length && <Empty>No runs match this search.</Empty>}
      </div>
    </div>
  );
}
