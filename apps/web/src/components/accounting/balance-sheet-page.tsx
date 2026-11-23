"use client";

import { Button, ButtonGroup, Icon, SkeletonBodyText, TextField } from "@shopify/polaris";
import { AlertTriangleIcon, CheckCircleIcon, ExportIcon } from "@shopify/polaris-icons";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AS_OF_PRESETS, resolveAsOfDate, type AsOfPreset } from "@/components/accounting/as-of-date-filter";
import { AppPage } from "@/components/layout/page";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { getBalanceSheetReport, type BalanceSheetReport } from "@/lib/accounting-api";
import { downloadCsv } from "@/lib/export-csv";
import { formatAppDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const SECTION_COPY: Record<string, { label: string; hint: string; tone: string }> = {
  ASSETS: { label: "Assets", hint: "What the business owns — bank, cash, money owed to you, stock", tone: "is-assets" },
  LIABILITIES: { label: "Liabilities", hint: "What the business owes — VAT, supplier bills", tone: "is-liabilities" },
  EQUITY: { label: "Equity", hint: "What's left for the owners — capital and profits", tone: "is-equity" },
};

const PRESET_LABELS: Record<AsOfPreset, string> = {
  today: "Today",
  last_month_end: "End of last month",
  last_quarter_end: "End of last quarter",
  custom: "Custom",
};

export function BalanceSheetPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const [preset, setPreset] = useState<AsOfPreset>("today");
  const [asOf, setAsOf] = useState(todayIsoDate());
  const [report, setReport] = useState<BalanceSheetReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showZero, setShowZero] = useState(false);

  const load = useCallback(async () => {
    const date = resolveAsOfDate(preset, asOf);
    if (!date) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await getBalanceSheetReport(date));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the balance sheet");
    } finally {
      setLoading(false);
    }
  }, [preset, asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  function choosePreset(next: AsOfPreset) {
    setPreset(next);
    if (next !== "custom") setAsOf(resolveAsOfDate(next, asOf));
  }

  const section = (title: string) => report?.sections.find((s) => s.title === title);
  const assets = section("ASSETS")?.total ?? 0;
  const liabilities = section("LIABILITIES")?.total ?? 0;
  const equity = section("EQUITY")?.total ?? 0;
  const balanced = report?.isBalanced !== false;
  const claims = Math.abs(liabilities) + Math.abs(equity);
  const liabShare = claims > 0 ? (Math.abs(liabilities) / claims) * 100 : 0;
  const debtRatio = assets > 0 ? (liabilities / assets) * 100 : null;

  const hasActivity = useMemo(
    () => Boolean(report?.sections.some((s) => s.accounts.some((a) => a.balance !== 0))),
    [report],
  );

  function handleExport() {
    if (!report) return;
    const rows: string[][] = [["Balance Sheet", `As of ${formatAppDate(report.date)}`], []];
    for (const s of report.sections) {
      rows.push([s.title, ""]);
      rows.push(["Code", "Account", "Balance"]);
      for (const account of s.accounts) rows.push([account.code, account.name, String(account.balance)]);
      rows.push([`Total ${s.title}`, "", String(s.total)]);
      rows.push([]);
    }
    rows.push(["Total Assets", "", String(report.assetsTotal)]);
    rows.push(["Liabilities + Equity", "", String(report.grandTotal)]);
    downloadCsv(`balance-sheet-${report.date}.csv`, rows);
  }

  const first = loading && !report;
  const dateLabel = report ? formatAppDate(report.date) : "";

  function renderSection(title: string) {
    const s = section(title);
    if (!s) return null;
    const copy = SECTION_COPY[title] ?? { label: title, hint: "", tone: "" };
    const accounts = showZero ? s.accounts : s.accounts.filter((a) => a.balance !== 0);
    const max = Math.max(...s.accounts.map((a) => Math.abs(a.balance)), 0.01);
    return (
      <div className={cn("pl-section bs-section", copy.tone)} key={title}>
        <div className="pl-section__head">
          <div>
            <h3>{copy.label}</h3>
            <small>{copy.hint}</small>
          </div>
          <strong className={cn(s.total < 0 && "is-negative")}>{formatBaseMoney(s.total)}</strong>
        </div>
        {accounts.length === 0 ? (
          <p className="pl-section__none">Nothing on these accounts yet.</p>
        ) : (
          <ul>
            {accounts.map((account) => (
              <li className={cn(account.balance === 0 && "is-zero", account.balance < 0 && "is-neg")} key={account.code}>
                <Link className="pl-acct" href="/dashboard/accounting/chart-of-accounts">
                  <span className="pl-acct__code">{account.code}</span>
                  <span className="pl-acct__name">{account.name}</span>
                </Link>
                <span className="pl-acct__bar">
                  <b style={{ width: `${(Math.abs(account.balance) / max) * 100}%` }} />
                </span>
                <span className="pl-acct__amount">
                  {formatBaseMoney(account.balance)}
                  {account.balance < 0 && title === "ASSETS" ? <small>below zero</small> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const negativeAssets = section("ASSETS")?.accounts.filter((a) => a.balance < 0) ?? [];

  return (
    <AppPage
      secondaryActions={[
        { content: "Export CSV", icon: ExportIcon, disabled: !report, onAction: handleExport },
        { content: "Profit & Loss", url: "/dashboard/accounting/profit-loss" },
      ]}
      subtitle="What the business owns, what it owes, and what's left — on any date."
      title="Balance Sheet"
    >
      <div className="pl">
        <div className="pl-period">
          <ButtonGroup variant="segmented">
            {AS_OF_PRESETS.map((p) => (
              <Button key={p.value} pressed={preset === p.value} size="slim" onClick={() => choosePreset(p.value)}>
                {PRESET_LABELS[p.value]}
              </Button>
            ))}
          </ButtonGroup>
          {preset === "custom" ? (
            <div className="pl-period__dates">
              <span>As of</span>
              <TextField autoComplete="off" label="As of" labelHidden type="date" value={asOf} onChange={setAsOf} />
            </div>
          ) : (
            <span className="pl-period__label">As of {dateLabel || "…"}</span>
          )}
        </div>

        {error ? <div className="ac-error">{error}</div> : null}

        {/* Hero */}
        <section className={cn("pl-hero", loading && report && "is-loading")}>
          <div className="pl-hero__main">
            <span className="pl-hero__label">Net worth</span>
            <strong className={cn("pl-hero__value", equity < 0 && "is-negative")}>
              {first ? "…" : formatBaseMoney(equity)}
            </strong>
            <span className="pl-hero__period">{dateLabel ? `As of ${dateLabel}` : "Loading…"}</span>
            {report && hasActivity ? (
              <span className={cn("bs-check", !balanced && "is-off")}>
                <Icon source={balanced ? CheckCircleIcon : AlertTriangleIcon} />
                {balanced ? "Books balance" : "Books don't balance"}
              </span>
            ) : null}
          </div>
          <div className="pl-hero__tiles">
            <div className="ac-tile">
              <span>Assets</span>
              <strong>{formatBaseMoney(assets)}</strong>
              <small>What you own</small>
            </div>
            <div className="ac-tile">
              <span>Liabilities</span>
              <strong>{formatBaseMoney(liabilities)}</strong>
              <small>{debtRatio === null ? "What you owe" : `${debtRatio.toFixed(0)}% of assets`}</small>
            </div>
            <div className="ac-tile">
              <span>Equity</span>
              <strong>{formatBaseMoney(equity)}</strong>
              <small>Left for the owners</small>
            </div>
          </div>
          {claims > 0 ? (
            <div className="pl-hero__bar">
              <div className="bs-split">
                <b className="is-liab" style={{ width: `${liabShare}%` }} />
                <b className="is-eq" style={{ width: `${100 - liabShare}%` }} />
              </div>
              <div className="pl-hero__legend">
                <span>
                  <i className="bs-dot is-liab" /> Owed to others {liabShare.toFixed(0)}%
                </span>
                <span>
                  <i className="bs-dot is-eq" /> Owners&apos; share {(100 - liabShare).toFixed(0)}%
                </span>
              </div>
            </div>
          ) : null}
        </section>

        {report && !balanced ? (
          <div className="ac-error">
            Assets ({formatBaseMoney(report.assetsTotal)}) don&apos;t equal liabilities + equity (
            {formatBaseMoney(report.grandTotal)}). Review the posted journal entries.
          </div>
        ) : null}

        {/* Statement */}
        <section className="pl-statement">
          <header className="ac-card__head">
            <div>
              <h2>Statement</h2>
              <p>Assets on the left; who has a claim on them on the right.</p>
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
              <strong>Nothing on the books yet</strong>
              <p>Balances appear once you post an invoice, record a payment or log an expense.</p>
            </div>
          ) : (
            <>
              <div className="bs-columns">
                <div className="bs-col">{renderSection("ASSETS")}</div>
                <div className="bs-col">
                  {renderSection("LIABILITIES")}
                  {renderSection("EQUITY")}
                </div>
              </div>

              {negativeAssets.length ? (
                <p className="ac-warn">
                  {negativeAssets.map((a) => a.name).join(", ")} {negativeAssets.length === 1 ? "is" : "are"} below zero —
                  usually stock sold or cash spent before it was recorded coming in.
                </p>
              ) : null}

              <div className={cn("bs-equation", !balanced && "is-off")}>
                <span>
                  <small>Assets</small>
                  {formatBaseMoney(report.assetsTotal)}
                </span>
                <em>=</em>
                <span>
                  <small>Liabilities</small>
                  {formatBaseMoney(liabilities)}
                </span>
                <em>+</em>
                <span>
                  <small>Equity</small>
                  {formatBaseMoney(equity)}
                </span>
                <b>
                  <Icon source={balanced ? CheckCircleIcon : AlertTriangleIcon} />
                </b>
              </div>
            </>
          )}
        </section>

        <p className="pl-foot">
          Balances come from posted invoices, payments and expenses, using your{" "}
          <Link href="/dashboard/accounting/chart-of-accounts">chart of accounts</Link>.
        </p>
      </div>
    </AppPage>
  );
}
