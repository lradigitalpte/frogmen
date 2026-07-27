export type InspectionSeverity = "major" | "moderate" | "minor";

/** Legacy values stored in older records — normalized on read. */
export const SEVERITY_LEGACY_MAP: Record<string, InspectionSeverity> = {
  critical: "major",
  high: "major",
  medium: "moderate",
  low: "minor",
};

/** Frog production report palette: red → orange → yellow */
export const SEVERITY_COLORS: Record<InspectionSeverity, string> = {
  major: "#ef4444",
  moderate: "#f97316",
  minor: "#eab308",
};

export const SEVERITY_LABELS: Record<InspectionSeverity, string> = {
  major: "Major",
  moderate: "Moderate",
  minor: "Minor",
};

export function normalizeSeverity(
  value: string | null | undefined,
): InspectionSeverity | null {
  if (!value) return null;
  const key = value.toLowerCase().trim();
  if (key in SEVERITY_LEGACY_MAP) {
    return SEVERITY_LEGACY_MAP[key];
  }
  if (key === "major" || key === "moderate" || key === "minor") {
    return key;
  }
  return null;
}

export function severityPinColor(severity: string | null | undefined): string {
  const normalized = normalizeSeverity(severity);
  if (normalized) return SEVERITY_COLORS[normalized];
  return "#6b7280";
}

export function severityLabel(severity: string | null | undefined): string {
  const normalized = normalizeSeverity(severity);
  if (!normalized) return "Not set";
  return SEVERITY_LABELS[normalized];
}

/** For diagram canvas and other keyed lookups */
export function severityColorMap(): Record<string, string> {
  return {
    ...SEVERITY_COLORS,
    critical: SEVERITY_COLORS.major,
    high: SEVERITY_COLORS.major,
    medium: SEVERITY_COLORS.moderate,
    low: SEVERITY_COLORS.minor,
  };
}

export function countSeverity(
  severity: string | null | undefined,
): InspectionSeverity | null {
  return normalizeSeverity(severity);
}
