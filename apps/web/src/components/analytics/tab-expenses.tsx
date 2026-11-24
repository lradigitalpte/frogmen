"use client";

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
import { pctChange, type AnalyticsGroupBy, type AnalyticsSectionData, type ExpenseStats } from "@/lib/analytics-api";
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

export function TabExpenses({
  data,
  groupBy,
}: {
  data: AnalyticsSectionData<ExpenseStats>;
  groupBy: AnalyticsGroupBy;
}) {
  const theme = useChartTheme();
  const { baseCurrencyCode } = useOrgCurrency();
  const money = (amount: number) => formatAlertMoney(amount, baseCurrencyCode);
  const cur = data.current;
  const prev = data.compare;

  const chartData = cur.byMonth.map((m) => ({
    name: bucketLabel(m.month),
    Spent: m.spent,
    Expenses: m.count,
  }));

  return (
    <div className="an-stack">
      <MetricGrid>
        <MetricCard
          highlight
          label="Total spent"
          value={money(cur.totalSpent)}
          delta={pctChange(cur.totalSpent, prev.totalSpent)}
          hint="Expenses in this period"
          lowerIsBetter
        />
        <MetricCard
          label="Expenses"
          value={String(cur.totalCount)}
          delta={pctChange(cur.totalCount, prev.totalCount)}
          hint="Recorded in this period"
          lowerIsBetter
        />
        <MetricCard
          label="Average expense"
          value={money(cur.avgExpense)}
          delta={pctChange(cur.avgExpense, prev.avgExpense)}
          hint="Per expense"
          lowerIsBetter
        />
        <MetricCard
          label="Paid from petty cash"
          value={money(cur.paidFrom.cash.amount)}
          delta={pctChange(cur.paidFrom.cash.amount, prev.paidFrom.cash.amount)}
          hint="The rest was paid from the bank"
          lowerIsBetter
        />
      </MetricGrid>

      <ChartRow>
        <ChartCard
          title={`Expenses by ${groupBy}`}
          description={`Amount spent each ${groupBy}, with the number of expenses`}
          legend={[
            { label: "Spent", color: theme.series.primary },
            { label: "Expenses", color: theme.series.secondary },
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
                    format={(v, name) => (name === "Expenses" ? String(v) : money(v))}
                  />
                )}
              />
              <Bar yAxisId="value" dataKey="Spent" fill={theme.series.primary} radius={[6, 6, 2, 2]} maxBarSize={44} />
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="Expenses"
                stroke={theme.series.secondary}
                strokeWidth={2.5}
                dot={{ r: 3, fill: theme.series.secondary, strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <BreakdownCard
          title="Paid from"
          description="Petty cash or bank"
          unit="expenses"
          formatAmount={money}
          items={[
            { key: "bank", label: "Bank", ...cur.paidFrom.bank, color: theme.series.primary },
            { key: "cash", label: "Petty cash", ...cur.paidFrom.cash, color: theme.series.secondary },
          ]}
        />
      </ChartRow>

      <RankingTable
        title="Spend by category"
        description="Where the money went in this period"
        nameLabel="Category"
        countLabel="Expenses"
        valueLabel="Spent"
        emptyText="No expenses in this period."
        formatValue={money}
        barColor={theme.series.primary}
        rows={cur.categories.map((c) => ({
          id: c.categoryId,
          name: c.categoryName,
          count: c.count,
          value: c.spent,
        }))}
      />
    </div>
  );
}
