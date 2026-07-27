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
  DateRangeFilter,
  presetRange,
  type DatePreset,
} from "@/components/accounting/date-range-filter";
import { FinancialReportTable } from "@/components/accounting/financial-report-table";
import { todayIsoDate } from "@/components/sales/format-money";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  getProfitLossReport,
  type ProfitLossReport,
} from "@/lib/accounting-api";
import { downloadCsv } from "@/lib/export-csv";
import { MinusCircle, TrendingDown, TrendingUp } from "lucide-react";

function formatReportPeriod(dateFrom: string, dateTo: string) {
  const fmt = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
}

export function ProfitLossPage() {
  const { formatBaseMoney } = useOrgCurrency();
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [dateFrom, setDateFrom] = useState(
    presetRange("this_month", "", "").dateFrom,
  );
  const [dateTo, setDateTo] = useState(todayIsoDate());
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const range = presetRange(preset, dateFrom, dateTo);
    try {
      setReport(await getProfitLossReport(range.dateFrom, range.dateTo));
    } finally {
      setLoading(false);
    }
  }, [preset, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const revenueSection = report?.sections.find((s) => s.title === "REVENUE");
  const expenseSection = report?.sections.find((s) => s.title === "EXPENSES");

  const hasActivity = useMemo(() => {
    if (!report) return false;
    return report.sections.some((section) =>
      section.accounts.some((account) => account.balance !== 0),
    );
  }, [report]);

  function handleExport() {
    if (!report) return;

    const rows: string[][] = [
      ["Profit & Loss", formatReportPeriod(report.dateFrom, report.dateTo)],
      [],
    ];

    for (const section of report.sections) {
      rows.push([section.title, ""]);
      rows.push(["Code", "Account", "Amount"]);
      for (const account of section.accounts) {
        rows.push([account.code, account.name, String(account.balance)]);
      }
      rows.push([`Total ${section.title}`, "", String(section.total)]);
      rows.push([]);
    }

    rows.push([
      report.isProfit ? "Net Profit" : "Net Loss",
      "",
      String(report.netIncome),
    ]);

    downloadCsv(
      `profit-loss-${report.dateFrom}-${report.dateTo}.csv`,
      rows,
    );
  }

  return (
    <AppPage
      title="Profit & Loss"
      subtitle="Money in vs money out for the selected period."
      secondaryActions={[
        {
          content: "Chart of Accounts",
          url: "/dashboard/accounting/chart-of-accounts",
        },
        {
          content: "Balance Sheet",
          url: "/dashboard/accounting/balance-sheet",
        },
      ]}
    >
      <BlockStack gap="300">
        <p className="text-sm font-medium text-foreground">
          Bank (101401), VAT (2200), revenue (4000), and other accounts are set
          up automatically when your organization is created.{" "}
          <Link url="/dashboard/accounting/chart-of-accounts">
            View chart of accounts
          </Link>
        </p>

        <div className="frogmen-report-filter">
          <DateRangeFilter
            preset={preset}
            dateFrom={dateFrom}
            dateTo={dateTo}
            loading={loading}
            summary={
              report
                ? `Showing ${formatReportPeriod(report.dateFrom, report.dateTo)}`
                : undefined
            }
            onPresetChange={(nextPreset) => {
              setPreset(nextPreset);
              if (nextPreset !== "custom") {
                const range = presetRange(nextPreset, dateFrom, dateTo);
                setDateFrom(range.dateFrom);
                setDateTo(range.dateTo);
              }
            }}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onApply={() => void load()}
          />
        </div>

        {report ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              icon={<TrendingUp className="size-5" />}
              label="Revenue"
              value={formatBaseMoney(revenueSection?.total ?? 0)}
              hint="Income this period"
              tone="success"
            />
            <KpiCard
              icon={<MinusCircle className="size-5" />}
              label="Expenses"
              value={formatBaseMoney(expenseSection?.total ?? 0)}
              hint="Costs this period"
              tone="default"
            />
            <KpiCard
              icon={<TrendingDown className="size-5" />}
              label={`Net ${report.isProfit ? "Profit" : "Loss"}`}
              value={formatBaseMoney(report.netIncome)}
              hint={report.isProfit ? "Positive result" : "Review spending"}
              tone={report.isProfit ? "success" : "warning"}
            />
          </div>
        ) : null}

        {loading || !report ? (
          <p className="text-sm font-medium text-foreground">Loading profit & loss...</p>
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
                    No posted journal entries in this period yet. Post an invoice
                    or record an expense to see amounts here. Accounts below are
                    your configured chart   balances will update automatically.
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
                  />
                </BlockStack>
              ))}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </AppPage>
  );
}
