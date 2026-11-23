"use client";

import { Badge, Button, ButtonGroup, Icon, SkeletonBodyText, TextField } from "@shopify/polaris";
import { AlertTriangleIcon, ChevronRightIcon, ExportIcon, SearchIcon } from "@shopify/polaris-icons";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AS_OF_PRESETS, resolveAsOfDate, type AsOfPreset } from "@/components/accounting/as-of-date-filter";
import { AppPage } from "@/components/layout/page";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { getChartOfAccounts, type ChartOfAccount } from "@/lib/accounting-api";
import { downloadCsv } from "@/lib/export-csv";
import { formatAppDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset_receivable: "Receivable",
  asset_cash: "Cash",
  asset_current: "Current asset",
  income: "Revenue",
  income_other: "Other revenue",
  expense: "Expense",
  expense_direct_cost: "Direct cost",
  liability_current: "Liability",
};

const ACCOUNT_USAGE: Record<string, string> = {
  "1100": "Money customers owe you on posted invoices",
  "101501": "Cash payments and petty-cash expenses",
  "101401": "Bank transfers, cards and cheques",
  "1200": "Stock value — reduced when invoices post cost of goods",
  "2200": "VAT collected on posted invoices",
  "4000": "Sales booked when invoices are posted",
  "5000": "Product cost of what you sold",
  "600000": "Running costs and staff reimbursements",
};

type GroupId = "assets" | "liabilities" | "equity" | "income" | "expenses";

const GROUPS: Array<{ id: GroupId; label: string; hint: string }> = [
  { id: "assets", label: "Assets", hint: "What the business owns" },
  { id: "liabilities", label: "Liabilities", hint: "What the business owes" },
  { id: "equity", label: "Equity", hint: "Owners' capital and retained profit" },
  { id: "income", label: "Revenue", hint: "Money earned from sales" },
  { id: "expenses", label: "Expenses", hint: "Costs of running and selling" },
];

const PRESET_LABELS: Record<AsOfPreset, string> = {
  today: "Today",
  last_month_end: "End of last month",
  last_quarter_end: "End of last quarter",
  custom: "Custom",
};

const FLOWS: Array<{ title: string; text: string; codes: string[] }> = [
  { title: "Post an invoice", text: "Books the sale, the VAT and what the customer owes.", codes: ["1100", "4000", "2200"] },
  { title: "Cost of goods", text: "Each line's product cost moves out of stock.", codes: ["5000", "1200"] },
  { title: "Get paid", text: "Clears the receivable into bank or cash.", codes: ["101401", "101501"] },
  { title: "Spend money", text: "Expenses and staff reimbursements.", codes: ["600000"] },
];

function groupOf(type: string): GroupId {
  if (type.startsWith("asset")) return "assets";
  if (type.startsWith("liability")) return "liabilities";
  if (type.startsWith("equity")) return "equity";
  if (type.startsWith("income")) return "income";
  return "expenses";
}

function accountTypeLabel(type: string) {
  return ACCOUNT_TYPE_LABELS[type] ?? type.replaceAll("_", " ");
}

function usageFor(account: ChartOfAccount) {
  if (ACCOUNT_USAGE[account.code]) return ACCOUNT_USAGE[account.code];
  if (account.accountType === "asset_cash") return "Bank or cash account — not used by postings yet";
  return "General ledger account";
}

export function ChartOfAccountsPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const [preset, setPreset] = useState<AsOfPreset>("today");
  const [asOf, setAsOf] = useState(todayIsoDate());
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupId | "all">("all");
  const [query, setQuery] = useState("");
  const [showFlows, setShowFlows] = useState(false);

  const resolvedAsOf = resolveAsOfDate(preset, asOf);

  const load = useCallback(async () => {
    if (!resolvedAsOf) return;
    setLoading(true);
    try {
      setAccounts(await getChartOfAccounts(resolvedAsOf));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chart of accounts");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [resolvedAsOf]);

  useEffect(() => {
    void load();
  }, [load]);

  function choosePreset(next: AsOfPreset) {
    setPreset(next);
    if (next !== "custom") setAsOf(resolveAsOfDate(next, asOf));
  }

  const ledgerUrl = (id: string) => `/dashboard/accounting/chart-of-accounts/${id}?asOf=${resolvedAsOf}`;

  const sorted = useMemo(
    () => [...accounts].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [accounts],
  );

  const byGroup = useMemo(() => {
    const map = new Map<GroupId, ChartOfAccount[]>();
    for (const account of sorted) {
      const g = groupOf(account.accountType);
      map.set(g, [...(map.get(g) ?? []), account]);
    }
    return map;
  }, [sorted]);

  const groupTotal = (g: GroupId) => (byGroup.get(g) ?? []).reduce((sum, a) => sum + a.balance, 0);
  const activeCount = accounts.filter((a) => a.hasActivity).length;
  const hasActivity = activeCount > 0;
  const negatives = accounts.filter((a) => groupOf(a.accountType) === "assets" && a.balance < 0);
  const byCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);

  const q = query.trim().toLowerCase();
  const matches = (a: ChartOfAccount) =>
    !q ||
    a.code.toLowerCase().includes(q) ||
    a.name.toLowerCase().includes(q) ||
    accountTypeLabel(a.accountType).toLowerCase().includes(q);

  const visibleGroups = GROUPS.filter((g) => (group === "all" || group === g.id) && (byGroup.get(g.id)?.length ?? 0) > 0);
  const visibleCount = visibleGroups.reduce((n, g) => n + (byGroup.get(g.id) ?? []).filter(matches).length, 0);
  const dateLabel = resolvedAsOf ? formatAppDate(resolvedAsOf) : "";

  function handleExport() {
    const rows: string[][] = [["Chart of Accounts", `As of ${dateLabel}`], [], ["Code", "Account", "Type", "Balance"]];
    for (const a of sorted) rows.push([a.code, a.name, accountTypeLabel(a.accountType), String(a.balance)]);
    downloadCsv(`chart-of-accounts-${resolvedAsOf}.csv`, rows);
  }

  const first = loading && !loaded;

  return (
    <AppPage
      secondaryActions={[
        { content: "Export CSV", icon: ExportIcon, disabled: !accounts.length, onAction: handleExport },
        { content: "Balance Sheet", url: "/dashboard/accounting/balance-sheet" },
      ]}
      primaryAction={{ content: "Profit & Loss", url: "/dashboard/accounting/profit-loss" }}
      subtitle="Every account your books post to, with its live balance. Click one to see its ledger."
      title="Chart of Accounts"
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
            <span className="pl-period__label">Balances as of {dateLabel || "…"}</span>
          )}
        </div>

        {error ? <div className="ac-error">{error}</div> : null}

        {/* Group summary */}
        <div className={cn("coa-groups", loading && loaded && "is-loading")}>
          {GROUPS.filter((g) => g.id !== "equity" || (byGroup.get("equity")?.length ?? 0) > 0).map((g) => {
            const list = byGroup.get(g.id) ?? [];
            return (
              <button
                className={cn("coa-group", `is-${g.id}`, group === g.id && "is-active")}
                key={g.id}
                type="button"
                onClick={() => setGroup(group === g.id ? "all" : g.id)}
              >
                <span className="coa-group__label">
                  <i className="coa-dot" /> {g.label}
                </span>
                <strong>{first ? "…" : formatBaseMoney(groupTotal(g.id))}</strong>
                <small>
                  {list.length} account{list.length === 1 ? "" : "s"} · {g.hint.toLowerCase()}
                </small>
              </button>
            );
          })}
        </div>

        {/* Accounts */}
        <section className="ex-surface">
          <div className="ex-toolbar">
            <div className="iv-filters">
              <button className={cn("iv-filter", group === "all" && "is-active")} type="button" onClick={() => setGroup("all")}>
                All <span>{accounts.length}</span>
              </button>
              {GROUPS.filter((g) => (byGroup.get(g.id)?.length ?? 0) > 0).map((g) => (
                <button
                  className={cn("iv-filter", group === g.id && "is-active")}
                  key={g.id}
                  type="button"
                  onClick={() => setGroup(g.id)}
                >
                  {g.label} <span>{byGroup.get(g.id)?.length ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="ex-toolbar__search">
              <TextField
                autoComplete="off"
                clearButton
                label="Search accounts"
                labelHidden
                placeholder="Search by code or name"
                prefix={<Icon source={SearchIcon} />}
                value={query}
                onChange={setQuery}
                onClearButtonClick={() => setQuery("")}
              />
            </div>
          </div>

          {first ? (
            <div className="ex-pad">
              <SkeletonBodyText lines={8} />
            </div>
          ) : accounts.length === 0 ? (
            <div className="pl-empty">
              <strong>No accounts yet</strong>
              <p>Accounts are created automatically the first time you post an invoice, payment or expense.</p>
            </div>
          ) : visibleCount === 0 ? (
            <div className="pl-empty">
              <strong>No matching accounts</strong>
              <p>Try a different code or name.</p>
              <div className="pl-empty__actions">
                <Button
                  onClick={() => {
                    setQuery("");
                    setGroup("all");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </div>
          ) : (
            <div className={cn("coa-body", loading && "is-loading")}>
              {!hasActivity ? (
                <p className="coa-note">
                  All balances are zero on {dateLabel} — nothing was posted to the ledger by then. Post an invoice, record a
                  payment or log an expense and the balances fill in.
                </p>
              ) : null}
              {visibleGroups.map((g) => {
                const list = (byGroup.get(g.id) ?? []).filter(matches);
                if (!list.length) return null;
                return (
                  <div className={cn("coa-section", `is-${g.id}`)} key={g.id}>
                    <div className="coa-section__head">
                      <span>
                        <i className="coa-dot" /> {g.label}
                        <small>{g.hint}</small>
                      </span>
                      <strong>{formatBaseMoney(groupTotal(g.id))}</strong>
                    </div>
                    <ul>
                      {list.map((account) => {
                        const negative = g.id === "assets" && account.balance < 0;
                        return (
                          <li key={account.id}>
                            <Link className={cn("coa-row", !account.hasActivity && "is-idle")} href={ledgerUrl(account.id)}>
                              <span className="pl-acct__code">{account.code}</span>
                              <span className="coa-row__name">
                                <strong>{account.name}</strong>
                                <small>{usageFor(account)}</small>
                              </span>
                              <span className="coa-row__type">
                                <Badge size="small">{accountTypeLabel(account.accountType)}</Badge>
                              </span>
                              <span className={cn("coa-row__amount", negative && "is-negative")}>
                                {formatBaseMoney(account.balance)}
                                <small>{negative ? "below zero" : account.hasActivity ? "View ledger" : "No postings"}</small>
                              </span>
                              <span className="coa-row__chev">
                                <Icon source={ChevronRightIcon} />
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {negatives.length ? (
          <p className="ac-warn coa-warn">
            <Icon source={AlertTriangleIcon} />
            {negatives.map((a) => `${a.name} (${a.code})`).join(", ")} {negatives.length === 1 ? "is" : "are"} below zero —
            usually stock sold or cash spent before it was recorded coming in.
          </p>
        ) : null}

        {/* How postings work */}
        <section className="pl-statement">
          <header className="ac-card__head">
            <div>
              <h2>How postings work</h2>
              <p>You never add accounts by hand — every document posts to these automatically.</p>
            </div>
            <Button size="slim" variant="plain" onClick={() => setShowFlows((v) => !v)}>
              {showFlows ? "Hide" : "Show how"}
            </Button>
          </header>
          {showFlows ? (
            <div className="coa-flows">
              {FLOWS.map((flow, i) => (
                <div className="coa-flow" key={flow.title}>
                  <span className="coa-flow__num">{i + 1}</span>
                  <strong>{flow.title}</strong>
                  <p>{flow.text}</p>
                  <div className="coa-flow__codes">
                    {flow.codes.map((code) => {
                      const account = byCode.get(code);
                      return account ? (
                        <Link href={ledgerUrl(account.id)} key={code} title={account.name}>
                          {code} · {account.name}
                        </Link>
                      ) : (
                        <span key={code}>{code}</span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <p className="pl-foot">
          {activeCount} of {accounts.length} accounts have postings as of {dateLabel}. Totals feed{" "}
          <Link href="/dashboard/accounting/profit-loss">Profit &amp; Loss</Link> and the{" "}
          <Link href="/dashboard/accounting/balance-sheet">Balance Sheet</Link>.
        </p>
      </div>
    </AppPage>
  );
}
