"use client";

import { ResourcePage } from "@/components/resource";
import { Thumb } from "@/components/image-field";
import { useSession } from "@/lib/auth";
import { num } from "@/lib/format";

export default function VehiclesPage() {
  const { has, options } = useSession();
  return (
    <ResourcePage
      title="Vehicles"
      eyebrow="Transport"
      description="Open a vehicle to edit it, record a run, or keep its fuel purchases. Every run is listed together under Running history."
      path="/vehicles"
      hrefBase="/transport"
      exportFilename="vehicles"
      canWrite={has("transport.write")}
      columns={[
        { key: "image_url", label: "", render: (row) => <Thumb src={row.image_url} alt={row.plate_no} /> },
        { key: "plate_no", label: "Plate" },
        { key: "kind", label: "Kind" },
        { key: "brand", label: "Brand", render: (row) => row.brand || "–" },
        { key: "model_name", label: "Model", render: (row) => row.model_name || "–" },
        { key: "registered_on", label: "Registered", render: (row) => row.registered_on || "–" },
        { key: "unit_name", label: "Unit" },
        { key: "status", label: "Status" },
        { key: "driver_name", label: "Driver" },
        { key: "odometer_km", label: "Odometer", render: (row) => `${num(row.odometer_km)} km` },
      ]}
      fields={[
        { name: "image_url", label: "Image", type: "image" },
        { name: "plate_no", label: "Plate", type: "text", required: true },
        { name: "kind", label: "Kind", type: "text", required: true },
        { name: "brand", label: "Brand", type: "text" },
        { name: "model_name", label: "Model", type: "text" },
        { name: "registered_on", label: "Registered", type: "date" },
        { name: "unit_id", label: "Unit", type: "select", valueType: "number", options: options.units.map((unit) => ({ value: String(unit.id), label: unit.name })) },
        {
          name: "status",
          label: "Status",
          type: "select",
          required: true,
          options: [
            { value: "available", label: "Available" },
            { value: "on_route", label: "On route" },
            { value: "maintenance", label: "Maintenance" },
          ],
        },
        {
          name: "driver_employee_id",
          label: "Driver",
          type: "select",
          valueType: "number",
          options: options.employees.map((person) => ({ value: String(person.id), label: person.full_name })),
        },
        { name: "odometer_km", label: "Odometer (km)", type: "number" },
        { name: "note", label: "Note", type: "text" },
      ]}
    />
  );
}
