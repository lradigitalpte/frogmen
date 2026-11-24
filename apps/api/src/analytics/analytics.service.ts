import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, gte, isNull, lte, sql, sum, type AnyColumn } from "drizzle-orm";
import type { Database } from "@frog1/db";
import {
  expenseCategories,
  expenses,
  salesOrders,
  invoices,
  purchaseOrders,
  customers,
  vendors,
} from "@frog1/db";
import { DATABASE } from "../database/database.constants";

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
}

export type AnalyticsGroupBy = "day" | "week" | "month";

export interface AnalyticsQuery {
  groupBy: AnalyticsGroupBy;
  current: DateRange;
  compare: DateRange;
  organizationId: string;
}

function safeNum(v: string | number | null | undefined): number {
  return Number(v) || 0;
}

/** Bucket key for a YYYY-MM-DD date: the day, the week's Monday, or YYYY-MM. */
function bucketKey(isoDate: string, groupBy: AnalyticsGroupBy): string {
  if (groupBy === "month") return isoDate.slice(0, 7);
  if (groupBy === "day") return isoDate.slice(0, 10);
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/** SQL counterpart of bucketKey (Postgres weeks also start on Monday). */
function bucketSql(column: AnyColumn, groupBy: AnalyticsGroupBy) {
  if (groupBy === "month") return sql<string>`to_char(${column}, 'YYYY-MM')`;
  if (groupBy === "day") return sql<string>`to_char(${column}, 'YYYY-MM-DD')`;
  return sql<string>`to_char(date_trunc('week', ${column}::timestamp), 'YYYY-MM-DD')`;
}

function buildBuckets({ from, to }: DateRange, groupBy: AnalyticsGroupBy): string[] {
  const buckets = new Set<string>();
  const end = new Date(`${to}T00:00:00Z`);
  for (
    const cur = new Date(`${from}T00:00:00Z`);
    cur <= end;
    cur.setUTCDate(cur.getUTCDate() + 1)
  ) {
    buckets.add(bucketKey(cur.toISOString().slice(0, 10), groupBy));
  }
  return [...buckets];
}

@Injectable()
export class AnalyticsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getAnalytics(query: AnalyticsQuery) {
    const { current, compare, organizationId, groupBy } = query;

    const [
      quotationsCurrent,
      quotationsCompare,
      salesCurrent,
      salesCompare,
      invoicesCurrent,
      invoicesCompare,
      purchasingCurrent,
      purchasingCompare,
    ] = await Promise.all([
      this.getQuotationStats(organizationId, current, groupBy),
      this.getQuotationStats(organizationId, compare, groupBy),
      this.getSalesStats(organizationId, current, groupBy),
      this.getSalesStats(organizationId, compare, groupBy),
      this.getInvoiceStats(organizationId, current, groupBy),
      this.getInvoiceStats(organizationId, compare, groupBy),
      this.getPurchasingStats(organizationId, current, groupBy),
      this.getPurchasingStats(organizationId, compare, groupBy),
    ]);

    return {
      quotations: { current: quotationsCurrent, compare: quotationsCompare },
      sales: { current: salesCurrent, compare: salesCompare },
      invoices: { current: invoicesCurrent, compare: invoicesCompare },
      purchasing: { current: purchasingCurrent, compare: purchasingCompare },
    };
  }

  async getExpenseAnalytics(query: AnalyticsQuery) {
    const { current, compare, organizationId, groupBy } = query;
    const [currentStats, compareStats] = await Promise.all([
      this.getExpenseStats(organizationId, current, groupBy),
      this.getExpenseStats(organizationId, compare, groupBy),
    ]);
    return { current: currentStats, compare: compareStats };
  }

  // ── Expenses ───────────────────────────────────────────────────────────────

  private async getExpenseStats(orgId: string, range: DateRange, groupBy: AnalyticsGroupBy) {
    const rows = await this.db
      .select({
        expenseDate: expenses.expenseDate,
        amount: expenses.amount,
        paymentMethod: expenses.paymentMethod,
        categoryId: expenses.categoryId,
        categoryName: expenseCategories.name,
      })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .where(
        and(
          eq(expenses.organizationId, orgId),
          gte(expenses.expenseDate, range.from),
          lte(expenses.expenseDate, range.to),
          isNull(expenses.deletedAt),
        ),
      );

    let totalSpent = 0;
    const paidFrom = {
      cash: { count: 0, amount: 0 },
      bank: { count: 0, amount: 0 },
    };
    const byMonth = buildBuckets(range, groupBy).map((month) => ({ month, count: 0, spent: 0 }));
    const buckets = new Map(byMonth.map((bucket) => [bucket.month, bucket]));
    const categories = new Map<
      string,
      { categoryId: string; categoryName: string; count: number; spent: number }
    >();

    for (const row of rows) {
      const amount = safeNum(row.amount);
      totalSpent += amount;

      const source = row.paymentMethod === "cash" ? paidFrom.cash : paidFrom.bank;
      source.count += 1;
      source.amount += amount;

      const bucket = buckets.get(bucketKey(row.expenseDate, groupBy));
      if (bucket) {
        bucket.count += 1;
        bucket.spent += amount;
      }

      const categoryId = row.categoryId ?? "none";
      const category = categories.get(categoryId) ?? {
        categoryId,
        categoryName: row.categoryName ?? "Uncategorised",
        count: 0,
        spent: 0,
      };
      category.count += 1;
      category.spent += amount;
      categories.set(categoryId, category);
    }

    return {
      totalCount: rows.length,
      totalSpent,
      avgExpense: rows.length ? totalSpent / rows.length : 0,
      paidFrom,
      byMonth,
      categories: [...categories.values()].sort((a, b) => b.spent - a.spent),
    };
  }

  // ── Quotations ─────────────────────────────────────────────────────────────

  private async getQuotationStats(orgId: string, range: DateRange, groupBy: AnalyticsGroupBy) {
    // By-state counts + values
    const byStateRows = await this.db
      .select({
        state: salesOrders.state,
        count: count(),
        valueBase: sum(salesOrders.amountTotalBase),
      })
      .from(salesOrders)
      .where(
        and(
          eq(salesOrders.organizationId, orgId),
          gte(salesOrders.quoteDate, range.from),
          lte(salesOrders.quoteDate, range.to),
          isNull(salesOrders.deletedAt),
        ),
      )
      .groupBy(salesOrders.state);

    const byState: Record<string, { count: number; valueBase: number }> = {};
    let totalCount = 0;
    let totalValue = 0;

    for (const row of byStateRows) {
      byState[row.state] = {
        count: Number(row.count),
        valueBase: safeNum(row.valueBase),
      };
      totalCount += Number(row.count);
      totalValue += safeNum(row.valueBase);
    }

    const confirmed = byState["confirmed"]?.count ?? 0;
    const cancelled = byState["cancelled"]?.count ?? 0;
    const winRate =
      confirmed + cancelled > 0
        ? Math.round((confirmed / (confirmed + cancelled)) * 100)
        : 0;
    const avgDealSize =
      confirmed > 0 ? (byState["confirmed"]?.valueBase ?? 0) / confirmed : 0;

    // Per-bucket series
    const monthBuckets = buildBuckets(range, groupBy);
    const monthlyRows = await this.db
      .select({
        month: bucketSql(salesOrders.quoteDate, groupBy),
        count: count(),
        valueBase: sum(salesOrders.amountTotalBase),
      })
      .from(salesOrders)
      .where(
        and(
          eq(salesOrders.organizationId, orgId),
          gte(salesOrders.quoteDate, range.from),
          lte(salesOrders.quoteDate, range.to),
          isNull(salesOrders.deletedAt),
        ),
      )
      .groupBy(bucketSql(salesOrders.quoteDate, groupBy));

    const monthlyMap = new Map(monthlyRows.map((r) => [r.month, r]));
    const byMonth = monthBuckets.map((m) => ({
      month: m,
      count: Number(monthlyMap.get(m)?.count ?? 0),
      valueBase: safeNum(monthlyMap.get(m)?.valueBase),
    }));

    // Top 5 customers (confirmed)
    const topCustomersRows = await this.db
      .select({
        customerId: salesOrders.customerId,
        customerName: customers.name,
        orderCount: count(),
        valueBase: sum(salesOrders.amountTotalBase),
      })
      .from(salesOrders)
      .leftJoin(customers, eq(salesOrders.customerId, customers.id))
      .where(
        and(
          eq(salesOrders.organizationId, orgId),
          eq(salesOrders.state, "confirmed"),
          gte(salesOrders.quoteDate, range.from),
          lte(salesOrders.quoteDate, range.to),
          isNull(salesOrders.deletedAt),
        ),
      )
      .groupBy(salesOrders.customerId, customers.name)
      .orderBy(sql`sum(${salesOrders.amountTotalBase}) desc nulls last`)
      .limit(5);

    return {
      byState,
      totalCount,
      totalValue,
      winRate,
      avgDealSize,
      byMonth,
      topCustomers: topCustomersRows.map((r) => ({
        customerId: r.customerId,
        customerName: r.customerName ?? "Unknown",
        count: Number(r.orderCount),
        valueBase: safeNum(r.valueBase),
      })),
    };
  }

  // ── Sales ──────────────────────────────────────────────────────────────────

  private async getSalesStats(orgId: string, range: DateRange, groupBy: AnalyticsGroupBy) {
    const [totals] = await this.db
      .select({
        orderCount: count(),
        revenue: sum(salesOrders.amountTotalBase),
      })
      .from(salesOrders)
      .where(
        and(
          eq(salesOrders.organizationId, orgId),
          eq(salesOrders.state, "confirmed"),
          gte(salesOrders.quoteDate, range.from),
          lte(salesOrders.quoteDate, range.to),
          isNull(salesOrders.deletedAt),
        ),
      );

    const totalOrders = Number(totals?.orderCount ?? 0);
    const totalRevenue = safeNum(totals?.revenue);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Invoice status breakdown
    const invoiceStatusRows = await this.db
      .select({
        invoiceStatus: salesOrders.invoiceStatus,
        orderCount: count(),
        valueBase: sum(salesOrders.amountTotalBase),
      })
      .from(salesOrders)
      .where(
        and(
          eq(salesOrders.organizationId, orgId),
          eq(salesOrders.state, "confirmed"),
          gte(salesOrders.quoteDate, range.from),
          lte(salesOrders.quoteDate, range.to),
          isNull(salesOrders.deletedAt),
        ),
      )
      .groupBy(salesOrders.invoiceStatus);

    const invoiceStatusBreakdown: Record<
      string,
      { count: number; valueBase: number }
    > = {};
    for (const row of invoiceStatusRows) {
      invoiceStatusBreakdown[row.invoiceStatus ?? "none"] = {
        count: Number(row.orderCount),
        valueBase: safeNum(row.valueBase),
      };
    }

    // Per-bucket revenue
    const monthBuckets = buildBuckets(range, groupBy);
    const monthlyRows = await this.db
      .select({
        month: bucketSql(salesOrders.quoteDate, groupBy),
        orderCount: count(),
        revenue: sum(salesOrders.amountTotalBase),
      })
      .from(salesOrders)
      .where(
        and(
          eq(salesOrders.organizationId, orgId),
          eq(salesOrders.state, "confirmed"),
          gte(salesOrders.quoteDate, range.from),
          lte(salesOrders.quoteDate, range.to),
          isNull(salesOrders.deletedAt),
        ),
      )
      .groupBy(bucketSql(salesOrders.quoteDate, groupBy));

    const monthlyMap = new Map(monthlyRows.map((r) => [r.month, r]));
    const byMonth = monthBuckets.map((m) => ({
      month: m,
      count: Number(monthlyMap.get(m)?.orderCount ?? 0),
      revenue: safeNum(monthlyMap.get(m)?.revenue),
    }));

    // Top 5 customers by revenue
    const topCustomersRows = await this.db
      .select({
        customerId: salesOrders.customerId,
        customerName: customers.name,
        orderCount: count(),
        revenue: sum(salesOrders.amountTotalBase),
      })
      .from(salesOrders)
      .leftJoin(customers, eq(salesOrders.customerId, customers.id))
      .where(
        and(
          eq(salesOrders.organizationId, orgId),
          eq(salesOrders.state, "confirmed"),
          gte(salesOrders.quoteDate, range.from),
          lte(salesOrders.quoteDate, range.to),
          isNull(salesOrders.deletedAt),
        ),
      )
      .groupBy(salesOrders.customerId, customers.name)
      .orderBy(sql`sum(${salesOrders.amountTotalBase}) desc nulls last`)
      .limit(5);

    return {
      totalOrders,
      totalRevenue,
      avgOrderValue,
      invoiceStatusBreakdown,
      byMonth,
      topCustomers: topCustomersRows.map((r) => ({
        customerId: r.customerId,
        customerName: r.customerName ?? "Unknown",
        count: Number(r.orderCount),
        revenue: safeNum(r.revenue),
      })),
    };
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  private async getInvoiceStats(orgId: string, range: DateRange, groupBy: AnalyticsGroupBy) {
    const today = new Date().toISOString().slice(0, 10);

    const allRows = await this.db
      .select({
        state: invoices.state,
        paymentState: invoices.paymentState,
        invoiceDate: invoices.invoiceDate,
        dueDate: invoices.dueDate,
        amountTotal: invoices.amountTotalBase,
        amountPaid: invoices.amountPaid,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, orgId),
          gte(invoices.invoiceDate, range.from),
          lte(invoices.invoiceDate, range.to),
          isNull(invoices.deletedAt),
        ),
      );

    let totalInvoiced = 0;
    let totalPaid = 0;
    let overdueCount = 0;
    let overdueAmount = 0;

    const monthBuckets = buildBuckets(range, groupBy);
    const monthlyBilled: Record<string, number> = {};
    const monthlyPaidMap: Record<string, number> = {};
    for (const b of monthBuckets) {
      monthlyBilled[b] = 0;
      monthlyPaidMap[b] = 0;
    }

    for (const row of allRows) {
      if (row.state === "cancelled") continue;
      const amt = safeNum(row.amountTotal);
      const paid = safeNum(row.amountPaid);
      totalInvoiced += amt;
      totalPaid += paid;

      const month = row.invoiceDate ? bucketKey(row.invoiceDate, groupBy) : "";
      if (month in monthlyBilled) {
        monthlyBilled[month] += amt;
        if (row.paymentState === "paid") monthlyPaidMap[month] += paid;
      }

      // Overdue: posted + past due date
      if (
        row.state === "posted" &&
        row.dueDate &&
        row.dueDate.toString() < today
      ) {
        overdueCount++;
        overdueAmount += Math.max(0, amt - paid);
      }
    }

    const collectionRate =
      totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0;

    const byMonth = monthBuckets.map((m) => ({
      month: m,
      billed: monthlyBilled[m] ?? 0,
      paid: monthlyPaidMap[m] ?? 0,
    }));

    return {
      totalInvoiced,
      totalPaid,
      collectionRate,
      overdueCount,
      overdueAmount,
      byMonth,
    };
  }

  // ── Purchasing ─────────────────────────────────────────────────────────────

  private async getPurchasingStats(orgId: string, range: DateRange, groupBy: AnalyticsGroupBy) {
    const [totals] = await this.db
      .select({
        poCount: count(),
        spend: sum(purchaseOrders.amountTotalBase),
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.organizationId, orgId),
          eq(purchaseOrders.state, "confirmed"),
          gte(purchaseOrders.orderDate, range.from),
          lte(purchaseOrders.orderDate, range.to),
          isNull(purchaseOrders.deletedAt),
        ),
      );

    const totalPOs = Number(totals?.poCount ?? 0);
    const totalSpend = safeNum(totals?.spend);
    const avgPoValue = totalPOs > 0 ? totalSpend / totalPOs : 0;

    // Receipt status breakdown
    const receiptRows = await this.db
      .select({
        receiptStatus: purchaseOrders.receiptStatus,
        poCount: count(),
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.organizationId, orgId),
          eq(purchaseOrders.state, "confirmed"),
          gte(purchaseOrders.orderDate, range.from),
          lte(purchaseOrders.orderDate, range.to),
          isNull(purchaseOrders.deletedAt),
        ),
      )
      .groupBy(purchaseOrders.receiptStatus);

    const receiptBreakdown: Record<string, number> = {};
    for (const row of receiptRows) {
      receiptBreakdown[row.receiptStatus ?? "none"] = Number(row.poCount);
    }
    const pendingReceipts =
      (receiptBreakdown["to_receive"] ?? 0) +
      (receiptBreakdown["partial"] ?? 0);

    // Per-bucket spend
    const monthBuckets = buildBuckets(range, groupBy);
    const monthlyRows = await this.db
      .select({
        month: bucketSql(purchaseOrders.orderDate, groupBy),
        poCount: count(),
        spend: sum(purchaseOrders.amountTotalBase),
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.organizationId, orgId),
          eq(purchaseOrders.state, "confirmed"),
          gte(purchaseOrders.orderDate, range.from),
          lte(purchaseOrders.orderDate, range.to),
          isNull(purchaseOrders.deletedAt),
        ),
      )
      .groupBy(bucketSql(purchaseOrders.orderDate, groupBy));

    const monthlyMap = new Map(monthlyRows.map((r) => [r.month, r]));
    const byMonth = monthBuckets.map((m) => ({
      month: m,
      count: Number(monthlyMap.get(m)?.poCount ?? 0),
      spend: safeNum(monthlyMap.get(m)?.spend),
    }));

    // Top 6 vendors by spend
    const topVendorsRows = await this.db
      .select({
        vendorId: purchaseOrders.vendorId,
        vendorName: vendors.name,
        poCount: count(),
        spend: sum(purchaseOrders.amountTotalBase),
      })
      .from(purchaseOrders)
      .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .where(
        and(
          eq(purchaseOrders.organizationId, orgId),
          eq(purchaseOrders.state, "confirmed"),
          gte(purchaseOrders.orderDate, range.from),
          lte(purchaseOrders.orderDate, range.to),
          isNull(purchaseOrders.deletedAt),
        ),
      )
      .groupBy(purchaseOrders.vendorId, vendors.name)
      .orderBy(sql`sum(${purchaseOrders.amountTotalBase}) desc nulls last`)
      .limit(6);

    return {
      totalPOs,
      totalSpend,
      avgPoValue,
      pendingReceipts,
      receiptBreakdown,
      byMonth,
      topVendors: topVendorsRows.map((r) => ({
        vendorId: r.vendorId,
        vendorName: r.vendorName ?? "Unknown",
        count: Number(r.poCount),
        spend: safeNum(r.spend),
      })),
    };
  }
}
