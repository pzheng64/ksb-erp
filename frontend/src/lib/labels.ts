export const categoryLabel: Record<string, string> = {
  office: "Office",
  supply: "Supply",
  logistical_support: "Logistical support",
  maintenance: "Maintenance",
  internal: "Internal consumption",
};

export const unitKind: Record<string, string> = {
  headquarters: "Headquarters",
  bank: "Bank",
  development: "Development",
  shop: "Shop",
  other: "Other",
};

export const eventLabel: Record<string, string> = {
  join: "Joined",
  leave: "Left",
  transfer_unit: "Unit transfer",
  change_department: "Department change",
};

export const attendanceLabel: Record<string, string> = {
  present: "On time",
  late: "Late",
  absent: "Absent",
  leave: "Leave",
  not_in: "Not in",
  open: "Open",
};

export function label(map: Record<string, string>, value?: string | null) {
  if (!value) return "–";
  return map[value] || value.replaceAll("_", " ");
}
