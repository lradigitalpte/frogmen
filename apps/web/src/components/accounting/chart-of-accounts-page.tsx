"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Card,
  IndexTable,
  InlineStack,
  Link,
  Text,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import {
  AsOfDateFilter,
  resolveAsOfDate,
  type AsOfPreset,
} from "@/components/accounting/as-of-date-filter";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  getChartOfAccounts,
  type ChartOfAccount,
} from "@/lib/accounting-api";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset_receivable: "Receivable",
  asset_cash: "Cash",
  asset_current: "Asset",
  income: "Revenue",
  income_other: "Other revenue",
  expense: "Expense",
  expense_direct_cost: "Direct cost",
  liability_current: "Liability",
};

const ACCOUNT_USAGE: Record<string, string> = {
  "1100": "Customer invoices — accounts receivable",
  "101501": "Cash payments and petty-cash expenses",
  "101401": "Bank transfers and wire payments",
  "1200": "Inventory relieved when invoices post COGS",
  "2200": "VAT / sales tax on posted invoices",
  "4000": "Sales revenue when invoices are posted",
  "5000": "COGS from product cost at invoice post",
  "600000": "Operating expenses and reimbursements",
};

function accountTypeLabel(type: string) {
  return ACCOUNT_TYPE_LABELS[type] ?? type.replaceAll("_", " ");
}

function formatAsOfDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ChartOfAccountsPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const [preset, setPreset] = useState<AsOfPreset>("today");
  const [asOf, setAsOf] = useState(todayIsoDate());
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolvedAsOf = resolveAsOfDate(preset, asOf);

  function accountLedgerUrl(accountId: string) {
    return `/dashboard/accounting/chart-of-accounts/${accountId}?asOf=${resolvedAsOf}`;
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await getChartOfAccounts(resolvedAsOf));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load chart of accounts",
      );
    } finally {
      setLoading(false);
    }
  }, [resolvedAsOf]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasActivity = useMemo(
    () => accounts.some((account) => account.hasActivity),
    [accounts],
  );

  const rowMarkup = accounts.map((account, index) => (
    <IndexTable.Row id={account.id} key={account.id} position={index}>
      <IndexTable.Cell>
        <Link url={accountLedgerUrl(account.id)}>
          <Text as="span" fontWeight="semibold">
            {account.code}
          </Text>
        </Link>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Link url={accountLedgerUrl(account.id)}>{account.name}</Link>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge>{accountTypeLabel(account.accountType)}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200" blockAlign="center">
          <Text
            as="span"
            fontWeight={account.hasActivity ? "semibold" : undefined}
            tone={account.hasActivity ? undefined : "subdued"}
          >
            {formatBaseMoney(account.balance)}
          </Text>
          {account.hasActivity ? (
            <Link url={accountLedgerUrl(account.id)}>View ledger</Link>
          ) : null}
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" tone="subdued" variant="bodySm">
          {ACCOUNT_USAGE[account.code] ?? "General ledger account"}
        </Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <AppPage
      title="Chart of Accounts"
      subtitle="Live ledger balances from posted journal entries — not a setup screen."
      primaryAction={{
        content: "Profit & Loss",
        url: "/dashboard/accounting/profit-loss",
      }}
      secondaryActions={[
        {
          content: "Balance Sheet",
          url: "/dashboard/accounting/balance-sheet",
        },
      ]}
    >
      <BlockStack gap="500">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Ledger balances
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  As of {formatAsOfDate(resolvedAsOf)} · base currency
                </Text>
              </BlockStack>
              <AsOfDateFilter
                asOf={asOf}
                loading={loading}
                onApply={() => void load()}
                onAsOfChange={setAsOf}
                onPresetChange={(nextPreset) => {
                  setPreset(nextPreset);
                  if (nextPreset !== "custom") {
                    setAsOf(resolveAsOfDate(nextPreset, asOf));
                  }
                }}
                preset={preset}
                summary={`As of ${formatAsOfDate(resolvedAsOf)}`}
              />
            </InlineStack>

            {!loading && !hasActivity ? (
              <Banner tone="info">
                <BlockStack gap="200">
                  <Text as="p">
                    All balances are zero — nothing has been posted to the
                    general ledger yet, or the selected date is before your
                    first journal entry.
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Post an invoice to book revenue (4000), VAT (2200), AR
                    (1100), COGS (5000), and inventory (1200). Unit cost on the
                    serial page drives COGS on invoice post — that flows into
                    account 5000 here.
                  </Text>
                  <InlineStack gap="200">
                    <Link url="/dashboard/invoices">View invoices</Link>
                    <Link url="/dashboard/accounting/profit-loss">
                      Profit &amp; Loss
                    </Link>
                  </InlineStack>
                </BlockStack>
              </Banner>
            ) : null}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              How postings work
            </Text>
            <Text as="p" tone="subdued">
              Accounts are created automatically — you do not add them manually.
              When you post an invoice, the system books revenue (4000), VAT
              (2200), accounts receivable (1100), COGS (5000), and inventory
              (1200). COGS uses each line&apos;s product cost at post time (see
              unit cost breakdown on serial pages). Payments clear AR into
              Bank (101401) or Cash (101501). Expenses and reimbursements hit
              600000.
            </Text>
            <InlineStack gap="200">
              <Link url="/dashboard/accounting/profit-loss">Open Profit &amp; Loss</Link>
              <Link url="/dashboard/accounting/balance-sheet">Open Balance Sheet</Link>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          {loading ? (
            <Text as="p" tone="subdued">
              Loading chart of accounts...
            </Text>
          ) : (
            <div className="accounting-report-table">
              <IndexTable
                selectable={false}
                itemCount={accounts.length}
                headings={[
                  { title: "Code" },
                  { title: "Account name" },
                  { title: "Type" },
                  { title: "Balance" },
                  { title: "Used for" },
                ]}
              >
                {rowMarkup}
              </IndexTable>
            </div>
          )}
        </Card>
      </BlockStack>
    </AppPage>
  );
}
