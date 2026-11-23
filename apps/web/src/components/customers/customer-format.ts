import { formatAlertMoney } from "@/lib/alerts-api";
import type { Customer } from "@/types/customer";

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function countryName(code: string | null) {
  if (!code) return null;
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function titleCase(value: string) {
  return value.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function locationLine(customer: Customer) {
  return [customer.city ? titleCase(customer.city) : null, countryName(customer.countryCode)]
    .filter(Boolean)
    .join(", ");
}

export function customerSubtitle(customer: Customer) {
  if (customer.accountType === "company") return customer.reference || "Company account";
  return customer.jobTitle || "Individual client";
}

export function customerSinceLabel(customer: Customer) {
  const raw = customer.memberSince ?? customer.createdAt;
  return raw ? raw.slice(0, 10) : null;
}

export function documentStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function documentStatusTone(
  status: string,
): "success" | "info" | "attention" | "critical" | undefined {
  switch (status) {
    case "paid":
    case "confirmed":
      return "success";
    case "sent":
    case "posted":
    case "signed":
      return "info";
    case "partial":
    case "not_paid":
    case "unpaid":
      return "attention";
    case "cancelled":
      return "critical";
    default:
      return undefined;
  }
}

/**
 * Totals amounts per currency so mixed-currency documents are never added
 * together. Returns e.g. "AED 1,612.94 + $190.00", or a zero in the fallback.
 */
export function sumByCurrency(
  items: { amount: number; currencyCode: string }[],
  fallbackCurrency: string | undefined,
) {
  return sumByCurrencyParts(items, fallbackCurrency).join(" + ");
}

/** Same as sumByCurrency, but one formatted amount per currency (largest first). */
export function sumByCurrencyParts(
  items: { amount: number; currencyCode: string }[],
  fallbackCurrency: string | undefined,
): string[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const code = item.currencyCode || fallbackCurrency || "";
    totals.set(code, (totals.get(code) ?? 0) + (Number(item.amount) || 0));
  }
  if (totals.size === 0) return [formatAlertMoney(0, fallbackCurrency)];
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, amount]) => formatAlertMoney(amount, code || fallbackCurrency));
}
