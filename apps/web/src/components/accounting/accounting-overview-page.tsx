"use client";

import {
  BlockStack,
  InlineStack,
  Spinner,
  Tabs,
  Text,
} from "@shopify/polaris";
import { Banknote, Landmark, Receipt, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { JournalChartCard } from "@/components/accounting/journal-chart-card";
import { KpiCard } from "@/components/ui/kpi-card";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  getAccountingOverview,
  type AccountingJournalCard,
} from "@/lib/accounting-api";

const tabs = [
  { id: "all", content: "All" },
  { id: "sale", content: "Sales" },
  { id: "bank", content: "Bank" },
  { id: "cash", content: "Cash" },
  { id: "profit_loss", content: "Profit & Loss" },
];

function journalBalance(journals: AccountingJournalCard[], type: string) {
  return journals
    .filter((journal) => journal.journalType === type)
    .reduce((sum, journal) => sum + journal.balance, 0);
}

export function AccountingOverviewPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const [selectedTab, setSelectedTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Awaited<
    ReturnType<typeof getAccountingOverview>
  > | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await getAccountingOverview());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filterType = selectedTab === 0 ? null : tabs[selectedTab]?.id;

  const journals = useMemo(() => {
    if (!overview) return [];
    if (!filterType) return overview.journals;
    return overview.journals.filter(
      (journal) => journal.journalType === filterType,
    );
  }, [overview, filterType]);

  const cashBalance = journalBalance(overview?.journals ?? [], "cash");
  const bankBalance = journalBalance(overview?.journals ?? [], "bank");
  const bankAccounts = overview?.bankAccounts ?? [];
  const unpaidCount = overview?.unpaidInvoiceCount ?? 0;
  const unpaidTotal = overview?.unpaidInvoiceTotalBase ?? 0;
  const netProfit =
    overview?.journals.find((journal) => journal.journalType === "profit_loss")
      ?.balance ?? 0;

  return (
    <AppPage
      title="Accounting"
      subtitle="Money in, money out, and journal balances   updated automatically when you post invoices and record payments."
      secondaryActions={[
        {
          content: "Profit & Loss",
          url: "/dashboard/accounting/profit-loss",
        },
        {
          content: "Balance Sheet",
          url: "/dashboard/accounting/balance-sheet",
        },
        {
          content: "Record expense",
          url: "/dashboard/accounting/expenses",
        },
      ]}
    >
      <BlockStack gap="300">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<Receipt className="size-5" />}
            label="Unpaid Invoices"
            value={String(unpaidCount)}
            hint={`${formatBaseMoney(unpaidTotal)} outstanding`}
            tone={unpaidCount > 0 ? "warning" : "default"}
            loading={loading && !overview}
          />
          <KpiCard
            icon={<TrendingUp className="size-5" />}
            label="Net Profit"
            value={formatBaseMoney(netProfit)}
            hint="Last 6 months"
            tone={netProfit >= 0 ? "success" : "warning"}
            loading={loading && !overview}
          />
          <KpiCard
            icon={<Banknote className="size-5" />}
            label="Cash on Hand"
            value={formatBaseMoney(cashBalance)}
            hint="CASH journal"
            tone="success"
            loading={loading && !overview}
          />
          <KpiCard
            icon={<Landmark className="size-5" />}
            label="Bank Balance"
            value={formatBaseMoney(bankBalance)}
            hint="BANK journal (all accounts)"
            tone="default"
            loading={loading && !overview}
          />
        </div>

        {bankAccounts.length > 0 ? (
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Bank accounts
            </Text>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bankAccounts.map((account) => (
                <KpiCard
                  key={account.id}
                  icon={<Landmark className="size-5" />}
                  label={account.name}
                  value={formatBaseMoney(account.balance)}
                  hint={`${account.currencyCode} · ${account.glAccountCode} · ${formatBaseMoney(account.receiptsInPeriod)} in / ${formatBaseMoney(account.expensesInPeriod)} out this month`}
                  tone={account.balance >= 0 ? "success" : "warning"}
                  loading={loading && !overview}
                />
              ))}
            </div>
          </BlockStack>
        ) : null}

        <BlockStack gap="400">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />

          {loading ? (
            <InlineStack align="center" blockAlign="center" gap="200">
              <Spinner size="small" />
              <Text as="span" tone="subdued">
                Loading journals...
              </Text>
            </InlineStack>
          ) : journals.length === 0 ? (
            <Text as="p" tone="subdued">
              No journals match this filter.
            </Text>
          ) : (
            <div className="accounting-journal-chart-grid">
              {journals.map((journal) => (
                <JournalChartCard
                  key={journal.id}
                  journal={journal}
                  formatMoney={formatBaseMoney}
                />
              ))}
            </div>
          )}
        </BlockStack>
      </BlockStack>
    </AppPage>
  );
}
