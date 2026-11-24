"use client";

import { BlockStack, Card, InlineStack, ProgressBar, Text } from "@shopify/polaris";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatAlertMoney } from "@/lib/alerts-api";
import { pctChange, type AnalyticsGroupBy, type AnalyticsSectionData, type InvoiceStats } from "@/lib/analytics-api";
import {
  ChartCard,
  ChartRow,
  ChartTooltip,
  MetricCard,
  MetricGrid,
  compactNumber,
  bucketLabel,
  useChartTheme,
} from "./analytics-ui";

export function TabInvoices({
  data,
  groupBy,
}: {
  data: AnalyticsSectionData<InvoiceStats>;
  groupBy: AnalyticsGroupBy;
}) {
  const theme = useChartTheme();
  const { baseCurrencyCode } = useOrgCurrency();
  const money = (amount: number) => formatAlertMoney(amount, baseCurrencyCode);
  const cur = data.current;
  const prev = data.compare;

  const outstanding = Math.max(0, cur.totalInvoiced - cur.totalPaid);
  const chartData = cur.byMonth.map((m) => ({
    name: bucketLabel(m.month),
    Billed: m.billed,
    Collected: m.paid,
  }));
  const bestBucket = [...cur.byMonth].sort((a, b) => b.paid - a.paid)[0];

  return (
    <div className="an-stack">
      <MetricGrid>
        <MetricCard
          highlight
          label="Invoiced"
          value={money(cur.totalInvoiced)}
          delta={pctChange(cur.totalInvoiced, prev.totalInvoiced)}
          hint="Billed in this period"
        />
        <MetricCard
          label="Collected"
          value={money(cur.totalPaid)}
          delta={pctChange(cur.totalPaid, prev.totalPaid)}
          hint="Payments received"
        />
        <MetricCard
          label="Collection rate"
          value={`${cur.collectionRate}%`}
          delta={pctChange(cur.collectionRate, prev.collectionRate)}
          hint="Collected ÷ invoiced"
        />
        <MetricCard
          label="Overdue receivables"
          value={money(cur.overdueAmount)}
          delta={pctChange(cur.overdueAmount, prev.overdueAmount)}
          hint={`${cur.overdueCount} overdue invoice${cur.overdueCount === 1 ? "" : "s"}`}
          lowerIsBetter
        />
      </MetricGrid>

      <ChartRow>
        <ChartCard
          title="Billed vs collected"
          description={`Invoiced amounts against cash collected each ${groupBy}`}
          legend={[
            { label: "Billed", color: theme.series.info },
            { label: "Collected", color: theme.series.primary },
          ]}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={4}>
              <CartesianGrid stroke={theme.grid} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="name" stroke={theme.axis} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                stroke={theme.axis}
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={compactNumber}
              />
              <Tooltip
                cursor={{ fill: theme.cursor }}
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    label={label}
                    payload={payload?.map((p) => ({ name: p.name, value: p.value as number, color: p.color }))}
                    format={money}
                  />
                )}
              />
              <Bar dataKey="Billed" fill={theme.series.info} radius={[6, 6, 2, 2]} maxBarSize={28} />
              <Bar dataKey="Collected" fill={theme.series.primary} radius={[6, 6, 2, 2]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <BlockStack gap="500">
            <BlockStack gap="050">
              <Text as="h2" variant="headingMd">Cash position</Text>
              <Text as="p" tone="subdued" variant="bodySm">Where this period&apos;s invoices stand</Text>
            </BlockStack>

            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text as="span" variant="bodySm" tone="subdued">Collected</Text>
                <Text as="span" variant="bodySm" fontWeight="semibold">{cur.collectionRate}%</Text>
              </InlineStack>
              <ProgressBar progress={Math.min(100, cur.collectionRate)} tone="success" size="small" />
            </BlockStack>

            <div className="an-kv">
              <div>
                <span>Collected</span>
                <strong>{money(cur.totalPaid)}</strong>
              </div>
              <div>
                <span>Still outstanding</span>
                <strong>{money(outstanding)}</strong>
              </div>
              <div>
                <span>Overdue</span>
                <strong className={cur.overdueAmount > 0 ? "is-critical" : undefined}>
                  {money(cur.overdueAmount)}
                </strong>
              </div>
              <div>
                <span>Best collection {groupBy}</span>
                <strong>{bestBucket && bestBucket.paid > 0 ? bucketLabel(bestBucket.month) : "—"}</strong>
              </div>
            </div>
          </BlockStack>
        </Card>
      </ChartRow>
    </div>
  );
}
