"use client";

import { IndexTable, Text } from "@shopify/polaris";
import type { FinancialReportAccount } from "@/lib/accounting-api";

interface FinancialReportTableProps {
  accounts: FinancialReportAccount[];
  formatMoney: (amount: number) => string;
  emptyMessage?: string;
}

export function FinancialReportTable({
  accounts,
  formatMoney,
  emptyMessage = "No accounts configured.",
}: FinancialReportTableProps) {
  if (accounts.length === 0) {
    return (
      <Text as="p" tone="subdued">
        {emptyMessage}
      </Text>
    );
  }

  const rowMarkup = accounts.map((account, index) => (
    <IndexTable.Row id={account.code} key={account.code} position={index}>
      <IndexTable.Cell>
        <Text as="span" fontWeight="semibold">
          {account.code}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{account.name}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" alignment="end" numeric>
          {formatMoney(account.balance)}
        </Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <div className="accounting-report-table">
      <IndexTable
        selectable={false}
        itemCount={accounts.length}
        headings={[
          { title: "Code" },
          { title: "Account" },
          { title: "Amount", alignment: "end" },
        ]}
      >
        {rowMarkup}
      </IndexTable>
    </div>
  );
}
