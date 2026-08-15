import { apiFetch } from "./api";

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

export interface FetchAnalyticsParams {
  current: DateRange;
  compare: DateRange;
}

export function fetchAnalytics(params: FetchAnalyticsParams) {
  const qs = new URLSearchParams({
    from: params.current.from,
    to: params.current.to,
    compareFrom: params.compare.from,
    compareTo: params.compare.to,
  });
  return apiFetch<AnalyticsData>(`/api/v1/analytics?${qs.toString()}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the % change between two values, or null if base is 0. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Format month string 'YYYY-MM' to short label e.g. 'Aug' */
export function monthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short" });
}

/** Preset date ranges for the filter bar */
export interface Preset {
  label: string;
  current: DateRange;
  compare: DateRange;
}

export function getPresets(): Preset[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const today = now.toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");

  const lastMonth = m === 0 ? new Date(y - 1, 11, 1) : new Date(y, m - 1, 1);
  const lmYear = lastMonth.getFullYear();
  const lmMonth = lastMonth.getMonth();
  const lmLast = new Date(lmYear, lmMonth + 1, 0);

  return [
    {
      label: "This Month",
      current: { from: `${y}-${pad(m + 1)}-01`, to: today },
      compare: {
        from: `${lmYear}-${pad(lmMonth + 1)}-01`,
        to: lmLast.toISOString().slice(0, 10),
      },
    },
    {
      label: "Last 3 Months",
      current: {
        from: new Date(y, m - 2, 1).toISOString().slice(0, 10),
        to: today,
      },
      compare: {
        from: new Date(y, m - 5, 1).toISOString().slice(0, 10),
        to: new Date(y, m - 2, 0).toISOString().slice(0, 10),
      },
    },
    {
      label: "Last 6 Months",
      current: {
        from: new Date(y, m - 5, 1).toISOString().slice(0, 10),
        to: today,
      },
      compare: {
        from: new Date(y, m - 11, 1).toISOString().slice(0, 10),
        to: new Date(y, m - 5, 0).toISOString().slice(0, 10),
      },
    },
    {
      label: "This Year",
      current: { from: `${y}-01-01`, to: today },
      compare: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
    },
  ];
}
