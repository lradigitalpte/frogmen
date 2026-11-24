"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatAlertMoney } from "@/lib/alerts-api";
import { pctChange, type AnalyticsGroupBy, type AnalyticsSectionData, type QuotationStats } from "@/lib/analytics-api";
import {
  BreakdownCard,
  ChartCard,
  ChartRow,
  ChartTooltip,
  MetricCard,
  MetricGrid,
  RankingTable,
  compactNumber,
  bucketLabel,
  useChartTheme,
} from "./analytics-ui";

const STATE_ORDER = ["draft", "sent", "signed", "confirmed", "cancelled"] as const;

export function TabQuotations({
  data,
  groupBy,
}: {
  data: AnalyticsSectionData<QuotationStats>;
  groupBy: AnalyticsGroupBy;
}) {
  const router = useRouter();
  const theme = useChartTheme();
  const { baseCurrencyCode } = useOrgCurrency();
  const money = (amount: number) => formatAlertMoney(amount, baseCurrencyCode);
  const cur = data.current;
  const prev = data.compare;

  const stateColors: Record<string, string> = {
    draft: theme.series.neutral,
    sent: theme.series.info,
    signed: theme.series.secondary,
    confirmed: theme.series.primary,
    cancelled: theme.series.critical,
  };

  const chartData = cur.byMonth.map((m) => ({
    name: bucketLabel(m.month),
    "Quoted value": m.valueBase,
    Quotations: m.count,
  }));

  const states = [
    ...STATE_ORDER.filter((s) => s in cur.byState),
    ...Object.keys(cur.byState).filter((s) => !STATE_ORDER.includes(s as never)),
  ];

  return (
    <div className="an-stack">
      <MetricGrid>
        <MetricCard
          highlight
          label="Pipeline value"
          value={money(cur.totalValue)}
          delta={pctChange(cur.totalValue, prev.totalValue)}
          hint="Quoted in this period"
        />
        <MetricCard
          label="Quotations"
          value={String(cur.totalCount)}
          delta={pctChange(cur.totalCount, prev.totalCount)}
          hint="Created in this period"
        />
        <MetricCard
          label="Win rate"
          value={`${cur.winRate}%`}
          delta={pctChange(cur.winRate, prev.winRate)}
          hint="Confirmed vs cancelled"
        />
        <MetricCard
          label="Average deal size"
          value={money(cur.avgDealSize)}
          delta={pctChange(cur.avgDealSize, prev.avgDealSize)}
          hint="Per confirmed quotation"
        />
      </MetricGrid>

      <ChartRow>
        <ChartCard
          title={`Quoted value by ${groupBy}`}
          description={`Total value quoted each ${groupBy}, with the number of quotations`}
          legend={[
            { label: "Quoted value", color: theme.series.primary },
            { label: "Quotations", color: theme.series.secondary },
          ]}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={theme.grid} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="name" stroke={theme.axis} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="value"
                stroke={theme.axis}
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={compactNumber}
              />
              <YAxis yAxisId="count" orientation="right" hide allowDecimals={false} />
              <Tooltip
                cursor={{ fill: theme.cursor }}
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    label={label}
                    payload={payload?.map((p) => ({ name: p.name, value: p.value as number, color: p.color }))}
                    format={(v) => (v % 1 === 0 && v < 1000 ? String(v) : money(v))}
                  />
                )}
              />
              <Bar
                yAxisId="value"
                dataKey="Quoted value"
                fill={theme.series.primary}
                radius={[6, 6, 2, 2]}
                maxBarSize={44}
              />
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="Quotations"
                stroke={theme.series.secondary}
                strokeWidth={2.5}
                dot={{ r: 3, fill: theme.series.secondary, strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <BreakdownCard
          title="Status breakdown"
          description="Quotations by current status"
          unit="quotes"
          formatAmount={money}
          items={states.map((state) => ({
            key: state,
            label: state.charAt(0).toUpperCase() + state.slice(1),
            count: cur.byState[state]?.count ?? 0,
            amount: cur.byState[state]?.valueBase ?? 0,
            color: stateColors[state] ?? theme.series.neutral,
          }))}
        />
      </ChartRow>

      <RankingTable
        title="Top customers by confirmed value"
        description="Accounts with the highest confirmed quotations in this period"
        nameLabel="Customer"
        countLabel="Confirmed"
        valueLabel="Confirmed value"
        emptyText="No confirmed quotations in this period."
        formatValue={money}
        barColor={theme.series.primary}
        onRowClick={(row) => router.push(`/dashboard/customers/${row.id}`)}
        rows={cur.topCustomers.map((c) => ({
          id: c.customerId,
          name: c.customerName,
          count: c.count,
          value: c.valueBase,
        }))}
      />
    </div>
  );
}
