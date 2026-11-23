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
import { pctChange, type AnalyticsSectionData, type PurchasingStats } from "@/lib/analytics-api";
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

const RECEIPT_LABELS: Record<string, string> = {
  none: "Not started",
  to_receive: "To receive",
  partial: "Partially received",
  received: "Fully received",
};

export function TabPurchasing({ data }: { data: AnalyticsSectionData<PurchasingStats> }) {
  const router = useRouter();
  const theme = useChartTheme();
  const { baseCurrencyCode } = useOrgCurrency();
  const money = (amount: number) => formatAlertMoney(amount, baseCurrencyCode);
  const cur = data.current;
  const prev = data.compare;

  const receiptColors: Record<string, string> = {
    none: theme.series.neutral,
    to_receive: theme.series.secondary,
    partial: theme.series.info,
    received: theme.series.primary,
  };

  const chartData = cur.byMonth.map((m) => ({
    name: shortMonth(m.month),
    Spend: m.spend,
    "Purchase orders": m.count,
  }));

  return (
    <div className="an-stack">
      <MetricGrid>
        <MetricCard
          highlight
          label="Purchasing spend"
          value={money(cur.totalSpend)}
          delta={pctChange(cur.totalSpend, prev.totalSpend)}
          hint="Confirmed purchase orders"
          lowerIsBetter
        />
        <MetricCard
          label="Purchase orders"
          value={String(cur.totalPOs)}
          delta={pctChange(cur.totalPOs, prev.totalPOs)}
          hint="Confirmed in this period"
        />
        <MetricCard
          label="Average PO value"
          value={money(cur.avgPoValue)}
          delta={pctChange(cur.avgPoValue, prev.avgPoValue)}
          hint="Per purchase order"
          lowerIsBetter
        />
        <MetricCard
          label="Pending receipts"
          value={String(cur.pendingReceipts)}
          delta={null}
          hint="Orders awaiting goods"
        />
      </MetricGrid>

      <ChartRow>
        <ChartCard
          title="Spend by month"
          description="Purchase order spend, with the number of orders placed"
          legend={[
            { label: "Spend", color: theme.series.info },
            { label: "Purchase orders", color: theme.series.secondary },
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
              <Bar yAxisId="value" dataKey="Spend" fill={theme.series.info} radius={[6, 6, 2, 2]} maxBarSize={44} />
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="Purchase orders"
                stroke={theme.series.secondary}
                strokeWidth={2.5}
                dot={{ r: 3, fill: theme.series.secondary, strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <BreakdownCard
          title="Goods receipt status"
          description="Purchase orders by delivery progress"
          unit="orders"
          items={Object.entries(cur.receiptBreakdown).map(([status, count]) => ({
            key: status,
            label: RECEIPT_LABELS[status] ?? status,
            count,
            color: receiptColors[status] ?? theme.series.neutral,
          }))}
        />
      </ChartRow>

      <RankingTable
        title="Top vendors by spend"
        description="Suppliers receiving the largest purchase orders in this period"
        nameLabel="Vendor"
        countLabel="Orders"
        valueLabel="Spend"
        emptyText="No purchase orders in this period."
        formatValue={money}
        barColor={theme.series.info}
        onRowClick={(row) => router.push(`/dashboard/purchasing/vendors/${row.id}`)}
        rows={cur.topVendors.map((v) => ({
          id: v.vendorId,
          name: v.vendorName,
          count: v.count,
          value: v.spend,
        }))}
      />
    </div>
  );
}
