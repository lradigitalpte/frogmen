export function addMonthsToDate(dateStr: string, months: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function formatDateOnly(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

export function computeDaysLeft(endsAt: string, today = new Date()): number {
  const end = new Date(`${endsAt}T00:00:00Z`);
  const now = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const diffMs = end.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function resolveWarrantyStatus(
  endsAt: string,
  storedStatus: "active" | "expired" | "voided",
  today = new Date(),
): "active" | "expired" | "voided" {
  if (storedStatus === "voided") {
    return "voided";
  }

  return computeDaysLeft(endsAt, today) < 0 ? "expired" : "active";
}
