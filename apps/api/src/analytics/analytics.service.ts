import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, gte, isNull, lte, sql, sum } from "drizzle-orm";
import type { Database } from "@frog1/db";
import {
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

export interface AnalyticsQuery {
  current: DateRange;
  compare: DateRange;
  organizationId: string;
}

function safeNum(v: string | number | null | undefined): number {
  return Number(v) || 0;
}

function buildMonthBuckets(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59`);
  const buckets: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    buckets.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`,
    );
    cur.setMonth(cur.getMonth() + 1);
  }
  return buckets;
}

@Injectable()
export class AnalyticsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getAnalytics(query: AnalyticsQuery) {
    const { current, compare, organizationId } = query;

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
      this.getQuotationStats(organizationId, current),
      this.getQuotationStats(organizationId, compare),
      this.getSalesStats(organizationId, current),
      this.getSalesStats(organizationId, compare),
      this.getInvoiceStats(organizationId, current),
      this.getInvoiceStats(organizationId, compare),
      this.getPurchasingStats(organizationId, current),
      this.getPurchasingStats(organizationId, compare),
    ]);

    return {
      quotations: { current: quotationsCurrent, compare: quotationsCompare },
      sales: { current: salesCurrent, compare: salesCompare },
      invoices: { current: invoicesCurrent, compare: invoicesCompare },
      purchasing: { current: purchasingCurrent, compare: purchasingCompare },
    };
  }

  // ── Quotations ─────────────────────────────────────────────────────────────

  private async getQuotationStats(orgId: string, range: DateRange) {
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

    // Monthly series
    const monthBuckets = buildMonthBuckets(range.from, range.to);
    const monthlyRows = await this.db
      .select({
        month: sql<string>`to_char(${salesOrders.quoteDate}, 'YYYY-MM')`,
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
      .groupBy(sql`to_char(${salesOrders.quoteDate}, 'YYYY-MM')`);

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

  private async getSalesStats(orgId: string, range: DateRange) {
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

    // Monthly revenue
    const monthBuckets = buildMonthBuckets(range.from, range.to);
    const monthlyRows = await this.db
      .select({
        month: sql<string>`to_char(${salesOrders.quoteDate}, 'YYYY-MM')`,
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
      .groupBy(sql`to_char(${salesOrders.quoteDate}, 'YYYY-MM')`);

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

  private async getInvoiceStats(orgId: string, range: DateRange) {
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

    const monthBuckets = buildMonthBuckets(range.from, range.to);
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

      const month = row.invoiceDate?.toString().slice(0, 7) ?? "";
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

  private async getPurchasingStats(orgId: string, range: DateRange) {
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

    // Monthly spend
    const monthBuckets = buildMonthBuckets(range.from, range.to);
    const monthlyRows = await this.db
      .select({
        month: sql<string>`to_char(${purchaseOrders.orderDate}, 'YYYY-MM')`,
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
      .groupBy(sql`to_char(${purchaseOrders.orderDate}, 'YYYY-MM')`);

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
