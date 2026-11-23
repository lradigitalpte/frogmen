"use client";

import { Button, ButtonGroup, Icon, SkeletonBodyText, TextField } from "@shopify/polaris";
import { ExportIcon } from "@shopify/polaris-icons";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DATE_PRESETS, presetRange, type DatePreset } from "@/components/accounting/date-range-filter";
import { AppPage } from "@/components/layout/page";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { getProfitLossReport, type ProfitLossReport } from "@/lib/accounting-api";
import { downloadCsv } from "@/lib/export-csv";
import { formatAppDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

function formatReportPeriod(dateFrom: string, dateTo: string) {
  return `${formatAppDate(dateFrom)} – ${formatAppDate(dateTo)}`;
}

const SECTION_COPY: Record<string, { label: string; hint: string }> = {
  REVENUE: { label: "Revenue", hint: "Money earned from sales and services" },
  EXPENSES: { label: "Expenses", hint: "Cost of goods and running the business" },
};

export function ProfitLossPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [dateFrom, setDateFrom] = useState(presetRange("this_month", "", "").dateFrom);
  const [dateTo, setDateTo] = useState(todayIsoDate());
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showZero, setShowZero] = useState(false);

  const load = useCallback(async () => {
    const range = presetRange(preset, dateFrom, dateTo);
    if (!range.dateFrom || !range.dateTo) return;
    if (range.dateFrom > range.dateTo) {
      setError("The start date is after the end date.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setReport(await getProfitLossReport(range.dateFrom, range.dateTo));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the report");
    } finally {
      setLoading(false);
    }
  }, [preset, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  function choosePreset(next: DatePreset) {
    setPreset(next);
    if (next !== "custom") {
      const range = presetRange(next, dateFrom, dateTo);
      setDateFrom(range.dateFrom);
      setDateTo(range.dateTo);
    }
  }

  const revenue = report?.sections.find((s) => s.title === "REVENUE")?.total ?? 0;
  const expenses = report?.sections.find((s) => s.title === "EXPENSES")?.total ?? 0;
  const net = report?.netIncome ?? 0;
  const isProfit = report?.isProfit ?? true;
  const margin = revenue > 0 ? (net / revenue) * 100 : null;
  const revenueShare = revenue + expenses > 0 ? (revenue / (revenue + expenses)) * 100 : 50;

  const hasActivity = useMemo(
    () => Boolean(report?.sections.some((section) => section.accounts.some((account) => account.balance !== 0))),
    [report],
  );

  function handleExport() {
    if (!report) return;
    const rows: string[][] = [["Profit & Loss", formatReportPeriod(report.dateFrom, report.dateTo)], []];
    for (const section of report.sections) {
      rows.push([section.title, ""]);
      rows.push(["Code", "Account", "Amount"]);
      for (const account of section.accounts) rows.push([account.code, account.name, String(account.balance)]);
      rows.push([`Total ${section.title}`, "", String(section.total)]);
      rows.push([]);
    }
    rows.push([report.isProfit ? "Net Profit" : "Net Loss", "", String(report.netIncome)]);
    downloadCsv(`profit-loss-${report.dateFrom}-${report.dateTo}.csv`, rows);
  }

  const first = loading && !report;
  const periodLabel = report ? formatReportPeriod(report.dateFrom, report.dateTo) : "";

  return (
    <AppPage
      secondaryActions={[
        { content: "Export CSV", icon: ExportIcon, disabled: !report, onAction: handleExport },
        { content: "Balance Sheet", url: "/dashboard/accounting/balance-sheet" },
      ]}
      subtitle="What you earned, what you spent, and what's left — for any period."
      title="Profit & Loss"
    >
      <div className="pl">
        {/* Period bar */}
        <div className="pl-period">
          <ButtonGroup variant="segmented">
            {DATE_PRESETS.map((p) => (
              <Button key={p.value} pressed={preset === p.value} size="slim" onClick={() => choosePreset(p.value)}>
                {p.label === "Custom range" ? "Custom" : p.label}
              </Button>
            ))}
          </ButtonGroup>
          {preset === "custom" ? (
            <div className="pl-period__dates">
              <TextField autoComplete="off" label="From" labelHidden type="date" value={dateFrom} onChange={setDateFrom} />
              <span>→</span>
              <TextField autoComplete="off" label="To" labelHidden type="date" value={dateTo} onChange={setDateTo} />
            </div>
          ) : (
            <span className="pl-period__label">{periodLabel}</span>
          )}
        </div>

        {error ? <div className="ac-error">{error}</div> : null}

        {/* Hero */}
        <section className={cn("pl-hero", loading && report && "is-loading")}>
          <div className="pl-hero__main">
            <span className="pl-hero__label">{isProfit ? "Net profit" : "Net loss"}</span>
            <strong className={cn("pl-hero__value", !isProfit && "is-negative")}>
              {first ? "…" : formatBaseMoney(net)}
            </strong>
            <span className="pl-hero__period">{periodLabel || "Loading…"}</span>
          </div>
          <div className="pl-hero__tiles">
            <div className="ac-tile">
              <span>Revenue</span>
              <strong>{formatBaseMoney(revenue)}</strong>
              <small>Income this period</small>
            </div>
            <div className="ac-tile">
              <span>Expenses</span>
              <strong>{formatBaseMoney(expenses)}</strong>
              <small>Costs this period</small>
            </div>
            <div className="ac-tile">
              <span>Margin</span>
              <strong>{margin === null ? "—" : `${margin.toFixed(1)}%`}</strong>
              <small>
                {margin === null ? "No revenue in this period" : margin >= 20 ? "Healthy" : margin >= 0 ? "Thin — watch costs" : "Spending more than earning"}
              </small>
            </div>
          </div>
          {revenue + expenses > 0 ? (
            <div className="pl-hero__bar">
              <div className="ac-tile__split">
                <b style={{ width: `${revenueShare}%` }} />
              </div>
              <div className="pl-hero__legend">
                <span>
                  <i className="is-rev" /> Revenue {revenueShare.toFixed(0)}%
                </span>
                <span>
                  <i className="is-exp" /> Expenses {(100 - revenueShare).toFixed(0)}%
                </span>
              </div>
            </div>
          ) : null}
        </section>

        {/* Statement */}
        <section className="pl-statement">
          <header className="ac-card__head">
            <div>
              <h2>Statement</h2>
              <p>Every revenue and expense account with posted entries.</p>
            </div>
            {hasActivity ? (
              <Button size="slim" variant="plain" onClick={() => setShowZero((v) => !v)}>
                {showZero ? "Hide empty accounts" : "Show empty accounts"}
              </Button>
            ) : null}
          </header>

          {first ? (
            <SkeletonBodyText lines={10} />
          ) : !report ? null : !hasActivity ? (
            <div className="pl-empty">
              <strong>Nothing posted in this period</strong>
              <p>Amounts appear here once you post an invoice or record an expense dated {periodLabel}.</p>
              <div className="pl-empty__actions">
                {preset !== "ytd" ? (
                  <Button onClick={() => choosePreset("ytd")}>Show year to date</Button>
                ) : null}
                <Button url="/dashboard/accounting/expenses" variant="plain">
                  Record an expense
                </Button>
              </div>
            </div>
          ) : (
            <div className="pl-sections">
              {report.sections.map((section) => {
                const copy = SECTION_COPY[section.title] ?? { label: section.title, hint: "" };
                const isExpense = section.isExpense || section.title === "EXPENSES";
                const accounts = showZero ? section.accounts : section.accounts.filter((a) => a.balance !== 0);
                const max = Math.max(...section.accounts.map((a) => Math.abs(a.balance)), 0.01);
                return (
                  <div className={cn("pl-section", isExpense ? "is-expense" : "is-revenue")} key={section.title}>
                    <div className="pl-section__head">
                      <div>
                        <h3>{copy.label}</h3>
                        {copy.hint ? <small>{copy.hint}</small> : null}
                      </div>
                      <strong>{formatBaseMoney(section.total)}</strong>
                    </div>
                    {accounts.length === 0 ? (
                      <p className="pl-section__none">Nothing posted to {copy.label.toLowerCase()} accounts.</p>
                    ) : (
                      <ul>
                        {accounts.map((account) => {
                          const share = section.total !== 0 ? (account.balance / section.total) * 100 : 0;
                          return (
                            <li className={cn(account.balance === 0 && "is-zero")} key={account.code}>
                              <Link className="pl-acct" href="/dashboard/accounting/chart-of-accounts">
                                <span className="pl-acct__code">{account.code}</span>
                                <span className="pl-acct__name">{account.name}</span>
                              </Link>
                              <span className="pl-acct__bar">
                                <b style={{ width: `${(Math.abs(account.balance) / max) * 100}%` }} />
                              </span>
                              <span className="pl-acct__share">{account.balance !== 0 ? `${share.toFixed(0)}%` : ""}</span>
                              <span className="pl-acct__amount">{formatBaseMoney(account.balance)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}

              <div className={cn("pl-net", !isProfit && "is-loss")}>
                <div>
                  <span>{isProfit ? "Net profit" : "Net loss"}</span>
                  <small>
                    {formatBaseMoney(revenue)} revenue − {formatBaseMoney(expenses)} expenses
                  </small>
                </div>
                <strong>{formatBaseMoney(net)}</strong>
              </div>
            </div>
          )}
        </section>

        <p className="pl-foot">
          Accounts come from your <Link href="/dashboard/accounting/chart-of-accounts">chart of accounts</Link>. Only
          posted invoices and recorded expenses count — drafts are left out.
        </p>
      </div>
    </AppPage>
  );
}
