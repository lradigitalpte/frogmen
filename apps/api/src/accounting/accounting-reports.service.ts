import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  accountMoveLines,
  accountMoves,
  glAccounts,
  invoices,
  journals,
  type Database,
} from "@frog1/db";
import { roundMoney } from "@frog1/shared";
import { DATABASE } from "../database/database.constants";
import { AccountingProvisionerService } from "./accounting-provisioner.service";

const INCOME_TYPES = ["income", "income_other"] as const;
const EXPENSE_TYPES = [
  "expense",
  "expense_depreciation",
  "expense_direct_cost",
] as const;
const ASSET_TYPES = [
  "asset_receivable",
  "asset_cash",
  "asset_current",
  "asset_non_current",
  "asset_prepayments",
  "asset_fixed",
] as const;
const LIABILITY_TYPES = [
  "liability_payable",
  "liability_credit_card",
  "liability_current",
  "liability_non_current",
] as const;
const EQUITY_TYPES = ["equity", "equity_unaffected"] as const;

export interface JournalChartDataset {
  label: string;
  data: number[];
  color: string;
}

export interface JournalChart {
  type: "bar" | "line";
  labels: string[];
  datasets: JournalChartDataset[];
}

export interface JournalStat {
  label: string;
  value: number;
  amount?: number;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeek(date: Date) {
  const copy = startOfWeek(date);
  copy.setDate(copy.getDate() + 6);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function formatWeekLabel(start: Date, end: Date) {
  const fmt = (value: Date) =>
    value.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function parseIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function invoiceOutstandingBase(invoice: {
  amountTotalBase: string | null;
  amountPaid: string | null;
  exchangeRate: string | null;
}) {
  const total = Number(invoice.amountTotalBase ?? 0);
  const paid = Number(invoice.amountPaid ?? 0) * Number(invoice.exchangeRate ?? 1);
  return roundMoney(Math.max(total - paid, 0));
}

@Injectable()
export class AccountingReportsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly provisioner: AccountingProvisionerService,
  ) {}

  private async getJournalBalance(
    organizationId: string,
    journalId: string,
    accountId: string | null,
    journalType: string,
  ) {
    if (!accountId) return 0;

    const [balanceRow] = await this.db
      .select({
        balance: sql<string>`coalesce(sum(${accountMoveLines.debit}::numeric - ${accountMoveLines.credit}::numeric), 0)`,
      })
      .from(accountMoveLines)
      .innerJoin(accountMoves, eq(accountMoves.id, accountMoveLines.moveId))
      .where(
        and(
          eq(accountMoves.organizationId, organizationId),
          eq(accountMoves.journalId, journalId),
          eq(accountMoves.state, "posted"),
          eq(accountMoveLines.accountId, accountId),
        ),
      );

    const raw = Number(balanceRow?.balance ?? 0);
    return journalType === "sale" ? -raw : raw;
  }

  private async buildSalesJournalChart(organizationId: string): Promise<JournalChart> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const thisWeekStart = startOfWeek(now);
    const thisWeekEnd = endOfWeek(now);
    const prevWeekStart = new Date(thisWeekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(thisWeekEnd);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);
    const nextWeekStart = new Date(thisWeekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextWeekEnd = new Date(thisWeekEnd);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
    const futureWeekStart = new Date(thisWeekStart);
    futureWeekStart.setDate(futureWeekStart.getDate() + 14);
    const futureWeekEnd = new Date(thisWeekEnd);
    futureWeekEnd.setDate(futureWeekEnd.getDate() + 14);

    const labels = [
      "Overdue",
      formatWeekLabel(prevWeekStart, prevWeekEnd),
      "This week",
      formatWeekLabel(nextWeekStart, nextWeekEnd),
      formatWeekLabel(futureWeekStart, futureWeekEnd),
      "Not due",
    ];

    const overdue = Array.from({ length: 6 }, () => 0);
    const onTime = Array.from({ length: 6 }, () => 0);

    const rows = await this.db
      .select({
        dueDate: invoices.dueDate,
        amountTotalBase: invoices.amountTotalBase,
        amountPaid: invoices.amountPaid,
        exchangeRate: invoices.exchangeRate,
        paymentState: invoices.paymentState,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.state, "posted"),
        ),
      );

    for (const row of rows) {
      if (row.paymentState === "paid") continue;

      const residual = invoiceOutstandingBase(row);
      if (residual <= 0) continue;

      const due = parseIsoDate(row.dueDate);
      if (!due) {
        onTime[5] += residual;
        continue;
      }

      const isLate = due < today;

      if (due < today) {
        overdue[0] += residual;
      } else if (due >= prevWeekStart && due <= prevWeekEnd) {
        if (isLate) overdue[1] += residual;
        else onTime[1] += residual;
      } else if (due >= thisWeekStart && due <= thisWeekEnd) {
        if (isLate) overdue[2] += residual;
        else onTime[2] += residual;
      } else if (due >= nextWeekStart && due <= nextWeekEnd) {
        if (isLate) overdue[3] += residual;
        else onTime[3] += residual;
      } else if (due >= futureWeekStart && due <= futureWeekEnd) {
        if (isLate) overdue[4] += residual;
        else onTime[4] += residual;
      } else {
        onTime[5] += residual;
      }
    }

    return {
      type: "bar",
      labels,
      datasets: [
        { label: "Overdue", data: overdue.map(roundMoney), color: "#ef4444" },
        { label: "On time", data: onTime.map(roundMoney), color: "#22c55e" },
      ],
    };
  }

  private async buildSalesJournalStats(
    organizationId: string,
  ): Promise<JournalStat[]> {
    const todayIso = new Date().toISOString().slice(0, 10);

    const rows = await this.db
      .select({
        dueDate: invoices.dueDate,
        amountTotalBase: invoices.amountTotalBase,
        amountPaid: invoices.amountPaid,
        exchangeRate: invoices.exchangeRate,
        paymentState: invoices.paymentState,
        state: invoices.state,
      })
      .from(invoices)
      .where(eq(invoices.organizationId, organizationId));

    let unpaidCount = 0;
    let unpaidAmount = 0;
    let overdueCount = 0;
    let overdueAmount = 0;

    for (const row of rows) {
      if (row.state !== "posted" || row.paymentState === "paid") continue;

      const residual = invoiceOutstandingBase(row);
      if (residual <= 0) continue;

      unpaidCount += 1;
      unpaidAmount += residual;

      if (row.dueDate && row.dueDate < todayIso) {
        overdueCount += 1;
        overdueAmount += residual;
      }
    }

    return [
      { label: "Unpaid", value: unpaidCount, amount: roundMoney(unpaidAmount) },
      { label: "Overdue", value: overdueCount, amount: roundMoney(overdueAmount) },
    ].filter((stat) => stat.value > 0 || (stat.amount ?? 0) > 0);
  }

  private async buildLiquidityJournalChart(
    organizationId: string,
    journalId: string,
    accountId: string | null,
  ): Promise<JournalChart> {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 42);

    const rows = await this.db
      .select({
        moveDate: accountMoves.moveDate,
        debit: accountMoveLines.debit,
        credit: accountMoveLines.credit,
      })
      .from(accountMoveLines)
      .innerJoin(accountMoves, eq(accountMoves.id, accountMoveLines.moveId))
      .where(
        and(
          eq(accountMoves.organizationId, organizationId),
          eq(accountMoves.journalId, journalId),
          eq(accountMoves.state, "posted"),
          ...(accountId ? [eq(accountMoveLines.accountId, accountId)] : []),
          gte(accountMoves.moveDate, start.toISOString().slice(0, 10)),
          lte(accountMoves.moveDate, end.toISOString().slice(0, 10)),
        ),
      )
      .orderBy(accountMoves.moveDate);

    const weekBuckets = new Map<string, number>();
    for (let i = 5; i >= 0; i -= 1) {
      const weekStart = startOfWeek(new Date(end));
      weekStart.setDate(weekStart.getDate() - i * 7);
      weekBuckets.set(weekStart.toISOString().slice(0, 10), 0);
    }

    let running = 0;
    for (const row of rows) {
      running += Number(row.debit ?? 0) - Number(row.credit ?? 0);
      const moveDate = parseIsoDate(row.moveDate);
      if (!moveDate) continue;

      const bucketStart = startOfWeek(moveDate).toISOString().slice(0, 10);
      if (weekBuckets.has(bucketStart)) {
        weekBuckets.set(bucketStart, roundMoney(running));
      }
    }

    const labels: string[] = [];
    const balances: number[] = [];
    for (const [key, balance] of weekBuckets.entries()) {
      const date = parseIsoDate(key);
      labels.push(
        date?.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) ??
          key,
      );
      balances.push(balance);
    }

    return {
      type: "line",
      labels,
      datasets: [
        {
          label: "Balance",
          data: balances,
          color: "#2563eb",
        },
      ],
    };
  }

  private async buildActivityJournalChart(
    organizationId: string,
    journalId: string,
  ): Promise<JournalChart> {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 42);

    const rows = await this.db
      .select({
        moveDate: accountMoves.moveDate,
        amount: sql<string>`coalesce(sum(${accountMoveLines.debit}::numeric - ${accountMoveLines.credit}::numeric), 0)`,
      })
      .from(accountMoves)
      .innerJoin(accountMoveLines, eq(accountMoveLines.moveId, accountMoves.id))
      .where(
        and(
          eq(accountMoves.organizationId, organizationId),
          eq(accountMoves.journalId, journalId),
          eq(accountMoves.state, "posted"),
          gte(accountMoves.moveDate, start.toISOString().slice(0, 10)),
          lte(accountMoves.moveDate, end.toISOString().slice(0, 10)),
        ),
      )
      .groupBy(accountMoves.moveDate)
      .orderBy(accountMoves.moveDate);

    const weekBuckets = new Map<string, number>();
    for (let i = 5; i >= 0; i -= 1) {
      const weekStart = startOfWeek(new Date(end));
      weekStart.setDate(weekStart.getDate() - i * 7);
      weekBuckets.set(weekStart.toISOString().slice(0, 10), 0);
    }

    for (const row of rows) {
      const moveDate = parseIsoDate(row.moveDate);
      if (!moveDate) continue;
      const bucketStart = startOfWeek(moveDate).toISOString().slice(0, 10);
      if (weekBuckets.has(bucketStart)) {
        weekBuckets.set(
          bucketStart,
          roundMoney((weekBuckets.get(bucketStart) ?? 0) + Number(row.amount)),
        );
      }
    }

    const labels: string[] = [];
    const values: number[] = [];
    for (const [key, amount] of weekBuckets.entries()) {
      const date = parseIsoDate(key);
      labels.push(
        date?.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) ??
          key,
      );
      values.push(amount);
    }

    return {
      type: "bar",
      labels,
      datasets: [
        {
          label: "Activity",
          data: values,
          color: "#6b7280",
        },
      ],
    };
  }

  private async buildJournalChart(
    organizationId: string,
    journalId: string,
    journalType: string,
    accountId: string | null,
  ): Promise<JournalChart> {
    if (journalType === "sale") {
      return this.buildSalesJournalChart(organizationId);
    }

    if (journalType === "bank" || journalType === "cash") {
      return this.buildLiquidityJournalChart(organizationId, journalId, accountId);
    }

    return this.buildActivityJournalChart(organizationId, journalId);
  }

  private async buildProfitLossCard(organizationId: string) {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - 5, 1);
    const rows = await this.db
      .select({
        moveDate: accountMoves.moveDate,
        accountType: glAccounts.accountType,
        balance: sql<string>`coalesce(sum(${accountMoveLines.debit}::numeric - ${accountMoveLines.credit}::numeric), 0)`,
      })
      .from(accountMoveLines)
      .innerJoin(accountMoves, eq(accountMoves.id, accountMoveLines.moveId))
      .innerJoin(glAccounts, eq(glAccounts.id, accountMoveLines.accountId))
      .where(
        and(
          eq(accountMoves.organizationId, organizationId),
          eq(accountMoves.state, "posted"),
          gte(accountMoves.moveDate, start.toISOString().slice(0, 10)),
          lte(accountMoves.moveDate, end.toISOString().slice(0, 10)),
          inArray(glAccounts.accountType, [...INCOME_TYPES, ...EXPENSE_TYPES]),
        ),
      )
      .groupBy(accountMoves.moveDate, glAccounts.accountType);

    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(end.getFullYear(), end.getMonth() - 5 + index, 1);
      return {
        key: date.toISOString().slice(0, 7),
        label: date.toLocaleDateString("en-GB", { month: "short" }),
        revenue: 0,
        expenses: 0,
      };
    });
    const monthByKey = new Map(months.map((month) => [month.key, month]));

    for (const row of rows) {
      const month = monthByKey.get(row.moveDate.slice(0, 7));
      if (!month) continue;
      const raw = Number(row.balance);
      if (INCOME_TYPES.includes(row.accountType as (typeof INCOME_TYPES)[number])) {
        month.revenue += -raw;
      } else {
        month.expenses += raw;
      }
    }

    const revenue = roundMoney(months.reduce((sum, month) => sum + month.revenue, 0));
    const expenses = roundMoney(months.reduce((sum, month) => sum + month.expenses, 0));
    const profit = roundMoney(revenue - expenses);

    return {
      id: "profit-loss",
      code: "P&L",
      name: "Profit & Loss",
      journalType: "profit_loss",
      balance: profit,
      stats: [
        { label: "Revenue", value: 0, amount: revenue },
        { label: "Expenses", value: 0, amount: expenses },
      ],
      chart: {
        type: "line" as const,
        labels: months.map((month) => month.label),
        datasets: [
          {
            label: "Revenue",
            data: months.map((month) => roundMoney(month.revenue)),
            color: "#16a34a",
          },
          {
            label: "Expenses",
            data: months.map((month) => roundMoney(month.expenses)),
            color: "#dc2626",
          },
          {
            label: "Net profit",
            data: months.map((month) =>
              roundMoney(month.revenue - month.expenses),
            ),
            color: "#2563eb",
          },
        ],
      },
    };
  }

  private async buildJournalStats(
    organizationId: string,
    journalType: string,
  ): Promise<JournalStat[]> {
    if (journalType === "sale") {
      return this.buildSalesJournalStats(organizationId);
    }

    return [];
  }

  async getOverview(organizationId: string) {
    await this.provisioner.ensureProvisioned(organizationId);

    const journalRows = await this.db
      .select()
      .from(journals)
      .where(eq(journals.organizationId, organizationId));

    const unpaidRows = await this.db
      .select({
        amountTotalBase: invoices.amountTotalBase,
        amountPaid: invoices.amountPaid,
        exchangeRate: invoices.exchangeRate,
        paymentState: invoices.paymentState,
        state: invoices.state,
      })
      .from(invoices)
      .where(eq(invoices.organizationId, organizationId));

    let unpaidInvoiceCount = 0;
    let unpaidInvoiceTotalBase = 0;

    for (const row of unpaidRows) {
      if (row.state !== "posted" || row.paymentState === "paid") continue;
      const residual = invoiceOutstandingBase(row);
      if (residual <= 0) continue;
      unpaidInvoiceCount += 1;
      unpaidInvoiceTotalBase += residual;
    }

    const cards = await Promise.all(
      journalRows.map(async (journal) => {
        const balance = await this.getJournalBalance(
          organizationId,
          journal.id,
          journal.defaultAccountId,
          journal.journalType,
        );
        const chart = await this.buildJournalChart(
          organizationId,
          journal.id,
          journal.journalType,
          journal.defaultAccountId,
        );
        const stats = await this.buildJournalStats(
          organizationId,
          journal.journalType,
        );

        return {
          id: journal.id,
          code: journal.code,
          name: journal.name,
          journalType: journal.journalType,
          balance: roundMoney(balance),
          stats,
          chart,
        };
      }),
    );
    const profitLossCard = await this.buildProfitLossCard(organizationId);

    return {
      journals: [...cards, profitLossCard],
      unpaidInvoiceCount,
      unpaidInvoiceTotalBase: roundMoney(unpaidInvoiceTotalBase),
    };
  }

  async listAccounts(organizationId: string) {
    await this.provisioner.ensureProvisioned(organizationId);

    return this.db
      .select({
        id: glAccounts.id,
        code: glAccounts.code,
        name: glAccounts.name,
        accountType: glAccounts.accountType,
        isActive: glAccounts.isActive,
      })
      .from(glAccounts)
      .where(eq(glAccounts.organizationId, organizationId))
      .orderBy(glAccounts.code);
  }

  async getProfitLoss(
    organizationId: string,
    dateFrom: string,
    dateTo: string,
  ) {
    await this.provisioner.ensureProvisioned(organizationId);

    const rows = await this.db
      .select({
        accountId: glAccounts.id,
        code: glAccounts.code,
        name: glAccounts.name,
        accountType: glAccounts.accountType,
        balance: sql<string>`coalesce(sum(${accountMoveLines.credit}::numeric - ${accountMoveLines.debit}::numeric), 0)`,
      })
      .from(accountMoveLines)
      .innerJoin(accountMoves, eq(accountMoves.id, accountMoveLines.moveId))
      .innerJoin(glAccounts, eq(glAccounts.id, accountMoveLines.accountId))
      .where(
        and(
          eq(accountMoves.organizationId, organizationId),
          eq(accountMoves.state, "posted"),
          gte(accountMoves.moveDate, dateFrom),
          lte(accountMoves.moveDate, dateTo),
        ),
      )
      .groupBy(glAccounts.id, glAccounts.code, glAccounts.name, glAccounts.accountType);

    const chartAccounts = await this.db
      .select({
        code: glAccounts.code,
        name: glAccounts.name,
        accountType: glAccounts.accountType,
      })
      .from(glAccounts)
      .where(
        and(
          eq(glAccounts.organizationId, organizationId),
          inArray(glAccounts.accountType, [
            ...INCOME_TYPES,
            ...EXPENSE_TYPES,
          ]),
        ),
      )
      .orderBy(glAccounts.code);

    const activityByCode = new Map(
      rows.map((row) => [row.code, Number(row.balance)]),
    );

    const buildSection = (
      title: string,
      types: readonly string[],
      isExpense = false,
    ) => {
      const accounts = chartAccounts
        .filter((account) => types.includes(account.accountType))
        .map((account) => {
          const raw = activityByCode.get(account.code) ?? 0;
          return {
            code: account.code,
            name: account.name,
            balance: roundMoney(isExpense ? Math.abs(raw) : raw),
          };
        });

      const total = roundMoney(
        accounts.reduce((sum, account) => sum + account.balance, 0),
      );

      return { title, accounts, total, isExpense };
    };

    const revenueSection = buildSection("REVENUE", INCOME_TYPES);
    const expenseSection = buildSection("EXPENSES", EXPENSE_TYPES, true);
    const netIncome = roundMoney(revenueSection.total - expenseSection.total);

    return {
      dateFrom,
      dateTo,
      sections: [revenueSection, expenseSection],
      netIncome,
      isProfit: netIncome >= 0,
    };
  }

  async getBalanceSheet(organizationId: string, asOf: string) {
    await this.provisioner.ensureProvisioned(organizationId);

    const rows = await this.db
      .select({
        code: glAccounts.code,
        name: glAccounts.name,
        accountType: glAccounts.accountType,
        balance: sql<string>`coalesce(sum(${accountMoveLines.debit}::numeric - ${accountMoveLines.credit}::numeric), 0)`,
      })
      .from(accountMoveLines)
      .innerJoin(accountMoves, eq(accountMoves.id, accountMoveLines.moveId))
      .innerJoin(glAccounts, eq(glAccounts.id, accountMoveLines.accountId))
      .where(
        and(
          eq(accountMoves.organizationId, organizationId),
          eq(accountMoves.state, "posted"),
          lte(accountMoves.moveDate, asOf),
        ),
      )
      .groupBy(glAccounts.code, glAccounts.name, glAccounts.accountType);

    const chartAccounts = await this.db
      .select({
        code: glAccounts.code,
        name: glAccounts.name,
        accountType: glAccounts.accountType,
      })
      .from(glAccounts)
      .where(
        and(
          eq(glAccounts.organizationId, organizationId),
          inArray(glAccounts.accountType, [
            ...ASSET_TYPES,
            ...LIABILITY_TYPES,
            ...EQUITY_TYPES,
          ]),
        ),
      )
      .orderBy(glAccounts.code);

    const activityByCode = new Map(
      rows.map((row) => [row.code, Number(row.balance)]),
    );

    const mapSection = (
      title: string,
      types: readonly string[],
      flip = false,
    ) => {
      const accountsInSection = chartAccounts
        .filter((account) => types.includes(account.accountType))
        .map((account) => {
          const raw = activityByCode.get(account.code) ?? 0;
          const balance = roundMoney(flip ? -raw : raw);
          return {
            code: account.code,
            name: account.name,
            balance,
          };
        });

      const total = roundMoney(
        accountsInSection.reduce((sum, row) => sum + row.balance, 0),
      );

      return { title, accounts: accountsInSection, total };
    };

    const assets = mapSection("ASSETS", ASSET_TYPES);
    const liabilities = mapSection("LIABILITIES", LIABILITY_TYPES, true);
    const equity = mapSection("EQUITY", EQUITY_TYPES, true);

    const currentEarnings = roundMoney(
      rows.reduce((total, row) => {
        const raw = Number(row.balance);
        if (INCOME_TYPES.includes(row.accountType as (typeof INCOME_TYPES)[number])) {
          return total - raw;
        }
        if (EXPENSE_TYPES.includes(row.accountType as (typeof EXPENSE_TYPES)[number])) {
          return total - raw;
        }
        return total;
      }, 0),
    );
    equity.accounts.push({
      code: "CURRENT",
      name: "Current earnings",
      balance: currentEarnings,
    });
    equity.total = roundMoney(equity.total + currentEarnings);

    const grandTotal = roundMoney(liabilities.total + equity.total);

    return {
      date: asOf,
      sections: [assets, liabilities, equity],
      assetsTotal: assets.total,
      grandTotal,
      isBalanced: Math.abs(assets.total - grandTotal) < 0.01,
    };
  }
}
