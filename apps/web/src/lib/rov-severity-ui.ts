import { normalizeSeverity } from "@frog1/shared";

/** Polaris badge tones aligned to severity colors (red / orange / yellow). */
export function severityBadgeTone(
  severity: string | null | undefined,
): "critical" | "warning" | "attention" | "info" {
  const normalized = normalizeSeverity(severity);
  if (normalized === "major") return "critical";
  if (normalized === "moderate") return "warning";
  if (normalized === "minor") return "attention";
  return "info";
}
