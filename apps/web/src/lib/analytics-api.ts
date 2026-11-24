import { apiFetch } from "./api";
import { formatAppDate } from "@/lib/format-date";

export interface DateRange {
  from: string;
  to: string;
}

// ── Quotations ────────────────────────────────────────────────────────────────

export interface QuotationByState {
  count: number;
  valueBase: number;
}

export interface QuotationMonth {
  month: string;
  count: number;
  valueBase: number;
}

export interface QuotationTopCustomer {
  customerId: string;
  customerName: string;
  count: number;
  valueBase: number;
}

export interface QuotationStats {
  byState: Record<string, QuotationByState>;
  totalCount: number;
  totalValue: number;
  winRate: number;
  avgDealSize: number;
  byMonth: QuotationMonth[];
  topCustomers: QuotationTopCustomer[];
}

// ── Sales ─────────────────────────────────────────────────────────────────────

export interface SalesMonth {
  month: string;
  count: number;
  revenue: number;
}

export interface SalesTopCustomer {
  customerId: string;
  customerName: string;
  count: number;
  revenue: number;
}

export interface SalesStats {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  invoiceStatusBreakdown: Record<string, { count: number; valueBase: number }>;
  byMonth: SalesMonth[];
  topCustomers: SalesTopCustomer[];
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export interface InvoiceMonth {
  month: string;
  billed: number;
  paid: number;
}

export interface InvoiceStats {
  totalInvoiced: number;
  totalPaid: number;
  collectionRate: number;
  overdueCount: number;
  overdueAmount: number;
  byMonth: InvoiceMonth[];
}

// ── Purchasing ────────────────────────────────────────────────────────────────

export interface PurchasingMonth {
  month: string;
  count: number;
  spend: number;
}

export interface PurchasingVendor {
  vendorId: string;
  vendorName: string;
  count: number;
  spend: number;
}

export interface PurchasingStats {
  totalPOs: number;
  totalSpend: number;
  avgPoValue: number;
  pendingReceipts: number;
  receiptBreakdown: Record<string, number>;
  byMonth: PurchasingMonth[];
  topVendors: PurchasingVendor[];
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export interface ExpenseStats {
  totalCount: number;
  totalSpent: number;
  avgExpense: number;
  paidFrom: Record<"cash" | "bank", { count: number; amount: number }>;
  byMonth: Array<{ month: string; count: number; spent: number }>;
  categories: Array<{ categoryId: string; categoryName: string; count: number; spent: number }>;
}

// ── Composite response ────────────────────────────────────────────────────────

export interface AnalyticsSectionData<T> {
  current: T;
  compare: T;
}

export interface AnalyticsData {
  quotations: AnalyticsSectionData<QuotationStats>;
  sales: AnalyticsSectionData<SalesStats>;
  invoices: AnalyticsSectionData<InvoiceStats>;
  purchasing: AnalyticsSectionData<PurchasingStats>;
}

// ── API call ──────────────────────────────────────────────────────────────────

export type AnalyticsGroupBy = "day" | "week" | "month";

export interface FetchAnalyticsParams {
  groupBy: AnalyticsGroupBy;
  current: DateRange;
  compare: DateRange;
}

function analyticsQuery(params: FetchAnalyticsParams) {
  return new URLSearchParams({
    from: params.current.from,
    to: params.current.to,
    compareFrom: params.compare.from,
    compareTo: params.compare.to,
    groupBy: params.groupBy,
  }).toString();
}

export function fetchAnalytics(params: FetchAnalyticsParams) {
  return apiFetch<AnalyticsData>(`/api/v1/analytics?${analyticsQuery(params)}`);
}

export function fetchExpenseAnalytics(params: FetchAnalyticsParams) {
  return apiFetch<AnalyticsSectionData<ExpenseStats>>(
    `/api/v1/analytics/expenses?${analyticsQuery(params)}`,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the % change between two values, or null if base is 0. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Format month string 'YYYY-MM' as DD/MM/YYYY (first of month). */
export function monthLabel(ym: string): string {
  return formatAppDate(`${ym}-01`) || ym;
}

/** Local calendar date; toISOString() would shift to UTC and can land on the previous day. */
export function localIso(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return localIso(new Date(year, month - 1, day + days));
}

/** Number of days in the range, counting both ends. */
export function rangeDays({ from, to }: DateRange) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

/** The period of equal length immediately before the range. */
export function previousRange(range: DateRange): DateRange {
  return { from: addDays(range.from, -rangeDays(range)), to: addDays(range.from, -1) };
}

/** Longest range that can be charted day by day. */
export const MAX_DAILY_DAYS = 92;
const MAX_RANGE_DAYS = 366 * 10;

/** Reason a custom range can't be used, or null when it's fine. */
export function rangeError({ from, to }: DateRange): string | null {
  if (!from || !to) return "Choose both dates";
  if (from < "2000-01-01") return "Choose a start date from 2000 onwards";
  if (from > to) return "The start date must be on or before the end date";
  if (rangeDays({ from, to }) > MAX_RANGE_DAYS) return "Choose a range of 10 years or less";
  return null;
}

export type GroupByChoice = "auto" | AnalyticsGroupBy;

export function resolveGroupBy(choice: GroupByChoice, range: DateRange): AnalyticsGroupBy {
  const days = rangeDays(range);
  if (choice === "day" && days > MAX_DAILY_DAYS) return "week";
  if (choice !== "auto") return choice;
  if (days <= 14) return "day";
  return days <= 100 ? "week" : "month";
}

export type PresetId = "week" | "month" | "3_months" | "6_months" | "year";

/** Preset date ranges for the filter bar */
export interface Preset {
  id: PresetId;
  label: string;
  current: DateRange;
  compare: DateRange;
}

export function getPresets(): Preset[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const today = localIso(now);
  const monthStart = (offset: number) => localIso(new Date(y, m + offset, 1));
  const monthEnd = (offset: number) => localIso(new Date(y, m + offset + 1, 0));
  const monday = addDays(today, -((now.getDay() + 6) % 7));

  return [
    {
      id: "week",
      label: "This Week",
      current: { from: monday, to: today },
      // Same weekdays of last week, so a half-finished week compares fairly.
      compare: { from: addDays(monday, -7), to: addDays(today, -7) },
    },
    {
      id: "month",
      label: "This Month",
      current: { from: monthStart(0), to: today },
      compare: { from: monthStart(-1), to: monthEnd(-1) },
    },
    {
      id: "3_months",
      label: "Last 3 Months",
      current: { from: monthStart(-2), to: today },
      compare: { from: monthStart(-5), to: monthEnd(-3) },
    },
    {
      id: "6_months",
      label: "Last 6 Months",
      current: { from: monthStart(-5), to: today },
      compare: { from: monthStart(-11), to: monthEnd(-6) },
    },
    {
      id: "year",
      label: "This Year",
      current: { from: `${y}-01-01`, to: today },
      compare: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
    },
  ];
}
