export const OUT_CASES = [
  { value: "usage", label: "Supply" },
  { value: "issue", label: "Issue" },
  { value: "scrap", label: "Scrap" },
  { value: "internal", label: "Internal consumption" },
  { value: "other", label: "Other" },
];

export function caseLabel(value?: string | null) {
  if (!value) return "–";
  return OUT_CASES.find((item) => item.value === value)?.label || value;
}
