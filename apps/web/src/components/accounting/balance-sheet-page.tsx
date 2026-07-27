"use client";

import {
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Link,
  Text,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  AsOfDateFilter,
  resolveAsOfDate,
  type AsOfPreset,
} from "@/components/accounting/as-of-date-filter";
import { FinancialReportTable } from "@/components/accounting/financial-report-table";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  getBalanceSheetReport,
  type BalanceSheetReport,
} from "@/lib/accounting-api";
import { downloadCsv } from "@/lib/export-csv";
import { Landmark, Scale, Wallet } from "lucide-react";

function formatAsOfDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BalanceSheetPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const [preset, setPreset] = useState<AsOfPreset>("today");
  const [asOf, setAsOf] = useState(todayIsoDate());
  const [report, setReport] = useState<BalanceSheetReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const date = resolveAsOfDate(preset, asOf);
    try {
      setReport(await getBalanceSheetReport(date));
    } finally {
      setLoading(false);
    }
  }, [preset, asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  const assetsSection = report?.sections.find((s) => s.title === "ASSETS");
  const liabilitiesSection = report?.sections.find(
    (s) => s.title === "LIABILITIES",
  );
  const equitySection = report?.sections.find((s) => s.title === "EQUITY");

  const hasActivity = useMemo(() => {
    if (!report) return false;
    return report.sections.some((section) =>
      section.accounts.some((account) => account.balance !== 0),
    );
  }, [report]);

  function handleExport() {
    if (!report) return;

    const rows: string[][] = [
      ["Balance Sheet", `As of ${formatAsOfDate(report.date)}`],
      [],
    ];

    for (const section of report.sections) {
      rows.push([section.title, ""]);
      rows.push(["Code", "Account", "Balance"]);
      for (const account of section.accounts) {
        rows.push([account.code, account.name, String(account.balance)]);
      }
      rows.push([`Total ${section.title}`, "", String(section.total)]);
      rows.push([]);
    }

    rows.push(["Total Assets", "", String(report.assetsTotal)]);
    rows.push(["Liabilities + Equity", "", String(report.grandTotal)]);

    downloadCsv(`balance-sheet-${report.date}.csv`, rows);
  }

  return (
    <AppPage
      title="Balance Sheet"
      subtitle="What you own vs what you owe as of the selected date."
      secondaryActions={[
        {
          content: "Chart of Accounts",
          url: "/dashboard/accounting/chart-of-accounts",
        },
        {
          content: "Profit & Loss",
          url: "/dashboard/accounting/profit-loss",
        },
      ]}
    >
      <BlockStack gap="300">
        <p className="text-sm font-medium text-foreground">
          Asset accounts (cash, bank, receivables, inventory) and liability
          accounts (VAT) are tracked automatically from posted invoices and
          payments.{" "}
          <Link url="/dashboard/accounting/chart-of-accounts">
            View chart of accounts
          </Link>
        </p>

        <div className="frogmen-report-filter">
          <AsOfDateFilter
            preset={preset}
            asOf={asOf}
            loading={loading}
            summary={report ? `As of ${formatAsOfDate(report.date)}` : undefined}
            onPresetChange={(nextPreset) => {
              setPreset(nextPreset);
              if (nextPreset !== "custom") {
                setAsOf(resolveAsOfDate(nextPreset, asOf));
              }
            }}
            onAsOfChange={setAsOf}
            onApply={() => void load()}
          />
        </div>

        {report ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              icon={<Wallet className="size-5" />}
              label="Total Assets"
              value={formatBaseMoney(assetsSection?.total ?? 0)}
              hint="What you own"
              tone="success"
            />
            <KpiCard
              icon={<Landmark className="size-5" />}
              label="Total Liabilities"
              value={formatBaseMoney(liabilitiesSection?.total ?? 0)}
              hint="What you owe"
              tone="warning"
            />
            <KpiCard
              icon={<Scale className="size-5" />}
              label="Total Equity"
              value={formatBaseMoney(equitySection?.total ?? 0)}
              hint="Net worth"
              tone="default"
            />
          </div>
        ) : null}

        {loading || !report ? (
          <p className="text-sm font-medium text-foreground">Loading balance sheet...</p>
        ) : (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Account breakdown
                </Text>
                <Button onClick={handleExport}>Export CSV</Button>
              </InlineStack>

              {!hasActivity ? (
                <Banner tone="warning">
                  <p>
                    No posted journal entries yet. Post an invoice or record a
                    payment and asset/liability balances will appear here.
                    Accounts below are your configured chart.
                  </p>
                </Banner>
              ) : null}

              {report.isBalanced === false ? (
                <Banner tone="critical">
                  <p>
                    Assets ({formatBaseMoney(report.assetsTotal)}) do not equal
                    liabilities + equity ({formatBaseMoney(report.grandTotal)}).
                    Review posted journal entries.
                  </p>
                </Banner>
              ) : hasActivity ? (
                <Banner tone="success">
                  <p>
                    Assets = Liabilities + Equity ({formatBaseMoney(report.assetsTotal)})
                  </p>
                </Banner>
              ) : null}

              {report.sections.map((section) => (
                <BlockStack gap="300" key={section.title}>
                  <InlineStack align="space-between">
                    <Text as="h3" variant="headingSm">
                      {section.title}
                    </Text>
                    <Text as="span" fontWeight="bold">
                      {formatBaseMoney(section.total)}
                    </Text>
                  </InlineStack>

                  <FinancialReportTable
                    accounts={section.accounts}
                    formatMoney={formatBaseMoney}
                    emptyMessage="No accounts in this section."
                  />
                </BlockStack>
              ))}

              <div className="accounting-report-total">
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text as="span" fontWeight="bold">
                      Total assets
                    </Text>
                    <Text as="span" tone="subdued" variant="bodySm">
                      Liabilities + equity
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" variant="headingMd" fontWeight="bold">
                      {formatBaseMoney(report.assetsTotal)}
                    </Text>
                    <Text
                      as="span"
                      variant="headingMd"
                      fontWeight="bold"
                      alignment="end"
                    >
                      {formatBaseMoney(report.grandTotal)}
                    </Text>
                  </BlockStack>
                </InlineStack>
              </div>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </AppPage>
  );
}
