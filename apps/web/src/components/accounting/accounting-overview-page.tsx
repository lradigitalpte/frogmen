"use client";

import { Button, ButtonGroup, Icon, SkeletonBodyText, SkeletonDisplayText, type IconSource } from "@shopify/polaris";
import {
  ArrowRightIcon,
  BankIcon,
  BookIcon,
  CashDollarIcon,
  ChartVerticalIcon,
  FinanceIcon,
  ListBulletedIcon,
  PersonIcon,
  PlusIcon,
  ReceiptDollarIcon,
  ReceiptIcon,
} from "@shopify/polaris-icons";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppPage } from "@/components/layout/page";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { getAccountingOverview, type AccountingJournalCard, type AccountingOverview, type JournalChart } from "@/lib/accounting-api";
import { cn } from "@/lib/utils";

type Filter = "all" | "sale" | "bank" | "cash" | "general";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "sale", label: "Sales" },
  { id: "bank", label: "Bank" },
  { id: "cash", label: "Cash" },
  { id: "general", label: "Other" },
];

/** Brand colours for the series the API sends (it ships its own palette). */
const SERIES_COLORS: Record<string, string> = {
  Overdue: "#d0342c",
  "On time": "var(--ac-primary)",
  Balance: "var(--ac-primary)",
  Activity: "var(--ac-muted)",
  Revenue: "var(--ac-primary)",
  Expenses: "#e0a100",
  "Net profit": "#1f7a52",
};

const JOURNAL_META: Record<string, { icon: IconSource; hint: string }> = {
  sale: { icon: ReceiptIcon, hint: "What customers owe, by due week" },
  bank: { icon: BankIcon, hint: "Bank balance over time" },
  cash: { icon: CashDollarIcon, hint: "Cash balance over time" },
  general: { icon: BookIcon, hint: "Manual and adjusting entries" },
};

const QUICK_LINKS: Array<{ href: string; label: string; hint: string; icon: IconSource }> = [
  { href: "/dashboard/accounting/expenses", label: "Record expense", hint: "Bills, fuel, supplies", icon: PlusIcon },
  { href: "/dashboard/accounting/profit-loss", label: "Profit & Loss", hint: "Income vs costs", icon: ChartVerticalIcon },
  { href: "/dashboard/accounting/balance-sheet", label: "Balance Sheet", hint: "What you own and owe", icon: FinanceIcon },
  { href: "/dashboard/accounting/expense-reimbursements", label: "Reimbursements", hint: "Pay back your team", icon: PersonIcon },
  { href: "/dashboard/accounting/chart-of-accounts", label: "Chart of accounts", hint: "All ledger accounts", icon: ListBulletedIcon },
];

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

function colorFor(label: string, fallback: string) {
  return SERIES_COLORS[label] ?? fallback;
}

function toRows(chart: JournalChart) {
  return chart.labels.map((label, index) => {
    const row: Record<string, string | number> = { label };
    for (const dataset of chart.datasets) row[dataset.label] = dataset.data[index] ?? 0;
    return row;
  });
}

function hasData(chart: JournalChart) {
  return chart.datasets.some((d) => d.data.some((v) => Math.abs(v) > 0.004));
}

function ChartTip({
  active,
  payload,
  label,
  formatMoney,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  formatMoney: (amount: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ac-tip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <span key={entry.name}>
          <i style={{ background: entry.color }} />
          {entry.name}
          <b>{formatMoney(Number(entry.value ?? 0))}</b>
        </span>
      ))}
    </div>
  );
}

function JournalCard({ journal, formatMoney }: { journal: AccountingJournalCard; formatMoney: (n: number) => string }) {
  const meta = JOURNAL_META[journal.journalType] ?? JOURNAL_META.general;
  const rows = toRows(journal.chart);
  const empty = !hasData(journal.chart);
  const isBar = journal.chart.type !== "line";

  return (
    <article className="ac-journal">
      <header>
        <span className="ac-journal__icon">
          <Icon source={meta.icon} />
        </span>
        <div>
          <strong>{journal.name}</strong>
          <small>{meta.hint}</small>
        </div>
        <span className="ac-journal__code">{journal.code}</span>
      </header>
      <div className={cn("ac-journal__balance", journal.balance < 0 && "is-negative")}>
        {formatMoney(journal.balance)}
        <small>{journal.journalType === "sale" ? "owed to you" : "balance"}</small>
      </div>
      <div className="ac-journal__chart">
        {empty ? (
          <div className="ac-journal__empty">No movement in this period</div>
        ) : (
          <ResponsiveContainer height={130} width="100%">
            {isBar ? (
              <BarChart data={rows} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="label" hide />
                <Tooltip content={<ChartTip formatMoney={formatMoney} />} cursor={{ fill: "rgba(43,71,110,0.06)" }} />
                {journal.chart.datasets.map((d, i) => (
                  <Bar
                    dataKey={d.label}
                    fill={colorFor(d.label, d.color)}
                    key={d.label}
                    radius={i === journal.chart.datasets.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    stackId={journal.chart.datasets.length > 1 ? "s" : undefined}
                  />
                ))}
              </BarChart>
            ) : (
              <AreaChart data={rows} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  {journal.chart.datasets.map((d) => (
                    <linearGradient id={`ac-g-${journal.id}-${d.label.replace(/\W/g, "")}`} key={d.label} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={colorFor(d.label, d.color)} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={colorFor(d.label, d.color)} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <XAxis dataKey="label" hide />
                <Tooltip content={<ChartTip formatMoney={formatMoney} />} />
                {journal.chart.datasets.map((d) => (
                  <Area
                    dataKey={d.label}
                    fill={`url(#ac-g-${journal.id}-${d.label.replace(/\W/g, "")})`}
                    key={d.label}
                    stroke={colorFor(d.label, d.color)}
                    strokeWidth={2}
                    type="linear"
                  />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      {!empty && journal.chart.labels.length ? (
        <footer>
          <span>{journal.chart.labels[0]}</span>
          <span>{journal.chart.labels[journal.chart.labels.length - 1]}</span>
        </footer>
      ) : null}
    </article>
  );
}

export function AccountingOverviewPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AccountingOverview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await getAccountingOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load accounting data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allJournals = overview?.journals ?? [];
  const pnl = allJournals.find((j) => j.journalType === "profit_loss") ?? null;
  const journals = useMemo(
    () =>
      allJournals.filter((j) => {
        if (j.journalType === "profit_loss") return false;
        if (filter === "all") return true;
        if (filter === "general") return !["sale", "bank", "cash"].includes(j.journalType);
        return j.journalType === filter;
      }),
    [allJournals, filter],
  );

  const sumType = (type: string) => allJournals.filter((j) => j.journalType === type).reduce((s, j) => s + j.balance, 0);
  const cash = sumType("cash");
  const bank = sumType("bank");
  const available = cash + bank;
  const revenue = pnl?.stats.find((s) => s.label === "Revenue")?.amount ?? 0;
  const expenses = pnl?.stats.find((s) => s.label === "Expenses")?.amount ?? 0;
  const profit = pnl?.balance ?? revenue - expenses;
  const margin = revenue > 0 ? (profit / revenue) * 100 : null;
  const unpaidCount = overview?.unpaidInvoiceCount ?? 0;
  const unpaidTotal = overview?.unpaidInvoiceTotalBase ?? 0;
  const bankAccounts = overview?.bankAccounts ?? [];
  const revenueShare = revenue + expenses > 0 ? (revenue / (revenue + expenses)) * 100 : 50;
  const pnlRows = pnl ? toRows(pnl.chart) : [];
  const first = loading && !overview;

  return (
    <AppPage
      primaryAction={{ content: "Record expense", url: "/dashboard/accounting/expenses" }}
      secondaryActions={[
        { content: "Profit & Loss", url: "/dashboard/accounting/profit-loss" },
        { content: "Balance Sheet", url: "/dashboard/accounting/balance-sheet" },
      ]}
      subtitle="Updated automatically when you post invoices, record payments and log expenses."
      title="Accounting"
    >
      <div className="ac">
        {error ? (
          <div className="ac-error">
            <span>{error}</span>
            <Button size="slim" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : null}

        {/* Hero */}
        <section className="ac-hero">
          <div className="ac-hero__main">
            <span className="ac-hero__label">Money available</span>
            {first ? (
              <div className="ac-hero__skel">
                <SkeletonDisplayText size="large" />
              </div>
            ) : (
              <strong className={cn("ac-hero__value", available < 0 && "is-negative")}>{formatBaseMoney(available)}</strong>
            )}
            <div className="ac-hero__split">
              <span>
                <Icon source={BankIcon} /> Bank {formatBaseMoney(bank)}
              </span>
              <span className={cn(cash < 0 && "is-negative")}>
                <Icon source={CashDollarIcon} /> Cash {formatBaseMoney(cash)}
              </span>
            </div>
          </div>

          <div className="ac-hero__tiles">
            <div className="ac-tile">
              <span>Net profit · 6 months</span>
              <strong className={cn(profit < 0 && "is-negative")}>{formatBaseMoney(profit)}</strong>
              <div className="ac-tile__split" title={`Revenue ${formatBaseMoney(revenue)} · Expenses ${formatBaseMoney(expenses)}`}>
                <b style={{ width: `${revenueShare}%` }} />
              </div>
              <small>
                {formatBaseMoney(revenue)} in · {formatBaseMoney(expenses)} out
              </small>
            </div>
            <Link className={cn("ac-tile is-link", unpaidCount > 0 && "is-alert")} href="/dashboard/invoices">
              <span>Unpaid invoices</span>
              <strong>{formatBaseMoney(unpaidTotal)}</strong>
              <small>
                {unpaidCount === 0 ? "Everything is collected" : `${unpaidCount} invoice${unpaidCount === 1 ? "" : "s"} waiting`}
                <Icon source={ArrowRightIcon} />
              </small>
            </Link>
            <div className="ac-tile">
              <span>Profit margin</span>
              <strong>{margin === null ? "—" : `${margin.toFixed(1)}%`}</strong>
              <small>{margin === null ? "No revenue yet" : margin >= 20 ? "Healthy" : margin >= 0 ? "Thin — watch costs" : "Spending more than earning"}</small>
            </div>
          </div>
        </section>

        {/* Shortcuts */}
        <nav className="ac-links" aria-label="Accounting shortcuts">
          {QUICK_LINKS.map((link) => (
            <Link className="ac-link" href={link.href} key={link.href}>
              <span className="ac-link__icon">
                <Icon source={link.icon} />
              </span>
              <span className="ac-link__text">
                <strong>{link.label}</strong>
                <small>{link.hint}</small>
              </span>
            </Link>
          ))}
        </nav>

        {/* P&L + banks */}
        <div className="ac-grid">
          <section className="ac-card ac-pnl">
            <header className="ac-card__head">
              <div>
                <h2>Profit &amp; Loss</h2>
                <p>Revenue and expenses by month, with the net result.</p>
              </div>
              <Button url="/dashboard/accounting/profit-loss" variant="plain">
                Full report
              </Button>
            </header>
            <div className="ac-pnl__legend">
              <span>
                <i style={{ background: SERIES_COLORS.Revenue }} />
                Revenue <b>{formatBaseMoney(revenue)}</b>
              </span>
              <span>
                <i style={{ background: SERIES_COLORS.Expenses }} />
                Expenses <b>{formatBaseMoney(expenses)}</b>
              </span>
              <span>
                <i className="is-line" style={{ background: SERIES_COLORS["Net profit"] }} />
                Net profit <b>{formatBaseMoney(profit)}</b>
              </span>
            </div>
            <div className="ac-pnl__chart">
              {first ? (
                <SkeletonBodyText lines={8} />
              ) : pnl && hasData(pnl.chart) ? (
                <ResponsiveContainer height={260} width="100%">
                  <ComposedChart data={pnlRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--p-color-border-secondary)" strokeDasharray="3 4" vertical={false} />
                    <XAxis
                      axisLine={false}
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "var(--p-color-text-secondary)" }}
                      tickFormatter={(v: string) => {
                        const d = new Date(`${v.split("/").reverse().join("-")}T00:00:00`);
                        return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { month: "short" });
                      }}
                      tickLine={false}
                    />
                    <YAxis
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--p-color-text-secondary)" }}
                      tickFormatter={(v: number) => compact.format(v)}
                      tickLine={false}
                      width={44}
                    />
                    <Tooltip content={<ChartTip formatMoney={formatBaseMoney} />} cursor={{ fill: "rgba(43,71,110,0.06)" }} />
                    <Bar dataKey="Revenue" fill={SERIES_COLORS.Revenue} maxBarSize={28} radius={[5, 5, 0, 0]} />
                    <Bar dataKey="Expenses" fill={SERIES_COLORS.Expenses} maxBarSize={28} radius={[5, 5, 0, 0]} />
                    <Line dataKey="Net profit" dot={{ r: 3 }} stroke={SERIES_COLORS["Net profit"]} strokeWidth={2} type="linear" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="ac-journal__empty is-tall">No income or expenses posted in the last 6 months</div>
              )}
            </div>
          </section>

          <section className="ac-card ac-banks">
            <header className="ac-card__head">
              <div>
                <h2>Bank accounts</h2>
                <p>Balances and this month&apos;s movement.</p>
              </div>
              <Button url="/dashboard/settings/bank-accounts" variant="plain">
                Manage
              </Button>
            </header>
            {first ? (
              <SkeletonBodyText lines={4} />
            ) : bankAccounts.length === 0 ? (
              <div className="ac-journal__empty">
                No bank accounts yet.{" "}
                <Link href="/dashboard/settings/bank-accounts">Add one</Link>
              </div>
            ) : (
              <ul className="ac-banklist">
                {bankAccounts.map((account) => (
                  <li key={account.id}>
                    <span className="ac-banklist__icon">
                      <Icon source={BankIcon} />
                    </span>
                    <div className="ac-banklist__text">
                      <strong>{account.name}</strong>
                      <small>
                        {account.currencyCode ? `${account.currencyCode} · ` : ""}GL {account.glAccountCode}
                        {account.id.startsWith("journal-") ? " · not linked to a bank account" : ""}
                      </small>
                    </div>
                    <div className="ac-banklist__amount">
                      <strong className={cn(account.balance < 0 && "is-negative")}>{formatBaseMoney(account.balance)}</strong>
                      <small>
                        <em className="is-in">+{formatBaseMoney(account.receiptsInPeriod)}</em>
                        <em className="is-out">−{formatBaseMoney(account.expensesInPeriod)}</em>
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="ac-cashrow">
              <span className="ac-banklist__icon is-cash">
                <Icon source={ReceiptDollarIcon} />
              </span>
              <div className="ac-banklist__text">
                <strong>Cash on hand</strong>
                <small>Petty cash and cash sales</small>
              </div>
              <strong className={cn("ac-cashrow__amount", cash < 0 && "is-negative")}>{formatBaseMoney(cash)}</strong>
            </div>
            {cash < 0 ? <p className="ac-warn">Cash is negative — an expense was probably paid from cash before any cash came in.</p> : null}
          </section>
        </div>

        {/* Journals */}
        <section className="ac-journals">
          <div className="ac-journals__head">
            <div>
              <h2>Journals</h2>
              <p>Every posting lands in one of these books.</p>
            </div>
            <ButtonGroup variant="segmented">
              {FILTERS.map((f) => (
                <Button key={f.id} pressed={filter === f.id} size="slim" onClick={() => setFilter(f.id)}>
                  {f.label}
                </Button>
              ))}
            </ButtonGroup>
          </div>
          {first ? (
            <div className="ac-journals__grid">
              {[0, 1, 2, 3].map((i) => (
                <article className="ac-journal" key={i}>
                  <SkeletonBodyText lines={6} />
                </article>
              ))}
            </div>
          ) : journals.length === 0 ? (
            <div className="ac-journal__empty is-tall">No journals of this type.</div>
          ) : (
            <div className="ac-journals__grid">
              {journals.map((journal) => (
                <JournalCard formatMoney={formatBaseMoney} journal={journal} key={journal.id} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppPage>
  );
}
