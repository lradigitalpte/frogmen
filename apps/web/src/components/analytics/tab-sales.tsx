"use client";

import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatAlertMoney } from "@/lib/alerts-api";
import { pctChange, type AnalyticsSectionData, type SalesStats } from "@/lib/analytics-api";
import {
  BreakdownCard,
  ChartCard,
  ChartRow,
  ChartTooltip,
  MetricCard,
  MetricGrid,
  RankingTable,
  compactNumber,
  shortMonth,
  useChartTheme,
} from "./analytics-ui";

const STATUS_LABELS: Record<string, string> = {
  none: "Not invoiced",
  to_invoice: "To invoice",
  partial: "Partially invoiced",
  invoiced: "Fully invoiced",
};

export function TabSales({ data }: { data: AnalyticsSectionData<SalesStats> }) {
  const router = useRouter();
  const theme = useChartTheme();
  const { baseCurrencyCode } = useOrgCurrency();
  const money = (amount: number) => formatAlertMoney(amount, baseCurrencyCode);
  const cur = data.current;
  const prev = data.compare;

  const statusColors: Record<string, string> = {
    none: theme.series.neutral,
    to_invoice: theme.series.secondary,
    partial: theme.series.info,
    invoiced: theme.series.primary,
  };

  const chartData = cur.byMonth.map((m, index) => ({
    name: shortMonth(m.month),
    "This period": m.revenue,
    "Previous period": prev.byMonth[index]?.revenue ?? 0,
  }));

  return (
    <div className="an-stack">
      <MetricGrid>
        <MetricCard
          highlight
          label="Confirmed revenue"
          value={money(cur.totalRevenue)}
          delta={pctChange(cur.totalRevenue, prev.totalRevenue)}
          hint="From confirmed sales orders"
        />
        <MetricCard
          label="Sales orders"
          value={String(cur.totalOrders)}
          delta={pctChange(cur.totalOrders, prev.totalOrders)}
          hint="Confirmed in this period"
        />
        <MetricCard
          label="Average order value"
          value={money(cur.avgOrderValue)}
          delta={pctChange(cur.avgOrderValue, prev.avgOrderValue)}
          hint="Per confirmed order"
        />
        <MetricCard
          label="Previous period revenue"
          value={money(prev.totalRevenue)}
          delta={null}
          hint={`${prev.totalOrders} orders`}
        />
      </MetricGrid>

      <ChartRow>
        <ChartCard
          title="Revenue by month"
          description="This period compared with the same months of the previous period"
          legend={[
            { label: "This period", color: theme.series.primary },
            { label: "Previous period", color: theme.series.previous, dashed: true },
          ]}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="an-sales-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.series.primary} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={theme.series.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
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
                cursor={{ stroke: theme.grid }}
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    label={label}
                    payload={payload?.map((p) => ({ name: p.name, value: p.value as number, color: p.color }))}
                    format={money}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey="This period"
                stroke={theme.series.primary}
                strokeWidth={2.5}
                fill="url(#an-sales-fill)"
                dot={{ r: 3, fill: theme.series.primary, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Previous period"
                stroke={theme.series.previous}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <BreakdownCard
          title="Invoicing progress"
          description="Sales orders by billing status"
          unit="orders"
          formatAmount={money}
          items={Object.entries(cur.invoiceStatusBreakdown).map(([status, stat]) => ({
            key: status,
            label: STATUS_LABELS[status] ?? status,
            count: stat.count,
            amount: stat.valueBase,
            color: statusColors[status] ?? theme.series.neutral,
          }))}
        />
      </ChartRow>

      <RankingTable
        title="Top customers by revenue"
        description="Accounts generating the most confirmed sales in this period"
        nameLabel="Customer"
        countLabel="Orders"
        valueLabel="Revenue"
        emptyText="No confirmed sales in this period."
        formatValue={money}
        barColor={theme.series.primary}
        onRowClick={(row) => router.push(`/dashboard/customers/${row.id}`)}
        rows={cur.topCustomers.map((c) => ({
          id: c.customerId,
          name: c.customerName,
          count: c.count,
          value: c.revenue,
        }))}
      />
    </div>
  );
}
