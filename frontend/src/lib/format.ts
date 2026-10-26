export function todayInput() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function moneyParts(value?: Record<string, number> | null, digits = 2) {
  const entries = Object.entries(value || {}).filter(([, amount]) => Number(amount));
  if (!entries.length) return "–";
  return entries.map(([currency, amount]) => money(amount, currency, digits)).join(" · ");
}

export function money(value: number | undefined | null, currency = "USD", digits = 0) {
  const amount = Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return currency === "USD" ? `$${amount}` : `¥${amount}`;
}

export function num(value: number | undefined | null) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export const FUEL_TYPES = [
  { value: "gasoline", label: "Gasoline" },
  { value: "diesel", label: "Diesel" },
  { value: "electric", label: "Electric" },
  { value: "hybrid", label: "Hybrid" },
  { value: "lpg", label: "LPG" },
] as const;

export function fuelLabel(value?: string | null) {
  if (!value) return "–";
  return FUEL_TYPES.find((item) => item.value === value)?.label || value;
}

export function when(value?: string | null) {
  if (!value) return "–";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace("T", " ");
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function clock(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16);
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
