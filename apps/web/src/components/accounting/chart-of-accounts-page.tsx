"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Card,
  IndexTable,
  Text,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import { AppPage } from "@/components/layout/page";
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
  "1100": "Customer invoices   accounts receivable",
  "101501": "Cash payments and petty-cash expenses",
  "101401": "Bank transfers and wire payments",
  "1200": "Inventory asset when invoices are posted",
  "2200": "VAT / sales tax on posted invoices",
  "4000": "Sales revenue when invoices are posted",
  "5000": "Cost of goods sold on invoice post",
  "600000": "Operating expenses via quick expense entry",
};

function accountTypeLabel(type: string) {
  return ACCOUNT_TYPE_LABELS[type] ?? type.replaceAll("_", " ");
}

export function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await getChartOfAccounts());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load chart of accounts",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rowMarkup = accounts.map((account, index) => (
    <IndexTable.Row id={account.id} key={account.id} position={index}>
      <IndexTable.Cell>
        <Text as="span" fontWeight="semibold">
          {account.code}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{account.name}</IndexTable.Cell>
      <IndexTable.Cell>
        <Badge>{accountTypeLabel(account.accountType)}</Badge>
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
      subtitle="Bank, VAT, revenue, and expense accounts are created automatically   no manual accounting setup required."
    >
      <BlockStack gap="500">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              How it works
            </Text>
            <Text as="p" tone="subdued">
              When you post an invoice, the system books revenue (4000), VAT
              (2200), accounts receivable (1100), COGS (5000), and inventory
              (1200) automatically. Payments clear AR into Bank (101401) or Cash
              (101501). Expenses use account 600000.
            </Text>
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
