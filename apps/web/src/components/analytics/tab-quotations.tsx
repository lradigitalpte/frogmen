"use client";

import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatAlertMoney } from "@/lib/alerts-api";
import {
  monthLabel,
  pctChange,
  type AnalyticsSectionData,
  type QuotationStats,
} from "@/lib/analytics-api";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2, DollarSign, FileText, Target } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TabQuotationsProps {
  data: AnalyticsSectionData<QuotationStats>;
}

const STATE_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  sent: "#3b82f6",
  signed: "#8b5cf6",
  confirmed: "#10b981",
  cancelled: "#ef4444",
};

export function TabQuotations({ data }: TabQuotationsProps) {
  const { baseCurrencyCode } = useOrgCurrency();
  const formatMoney = (amt: number) => formatAlertMoney(amt, baseCurrencyCode);

  const cur = data.current;
  const prev = data.compare;

  const pipelineDiff = pctChange(cur.totalValue, prev.totalValue);
  const countDiff = pctChange(cur.totalCount, prev.totalCount);
  const winRateDiff = pctChange(cur.winRate, prev.winRate);
  const avgSizeDiff = pctChange(cur.avgDealSize, prev.avgDealSize);

  const monthlyChartData = cur.byMonth.map((m) => ({
    name: monthLabel(m.month),
    Value: m.valueBase,
    Count: m.count,
  }));

  const pieData = Object.entries(cur.byState).map(([state, stat]) => ({
    name: state.charAt(0).toUpperCase() + state.slice(1),
    value: stat.count,
    amount: stat.valueBase,
    color: STATE_COLORS[state] || "#64748b",
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<DollarSign className="size-5" />}
          label="Total Pipeline Value"
          value={formatMoney(cur.totalValue)}
          hint={
            pipelineDiff !== null ? (
              <span className="flex items-center gap-1">
                {pipelineDiff >= 0 ? (
                  <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={pipelineDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {pipelineDiff >= 0 ? `+${pipelineDiff}%` : `${pipelineDiff}%`}
                </span>{" "}
                vs prev period
              </span>
            ) : (
              "Current period pipeline"
            )
          }
          tone="default"
        />

        <KpiCard
          icon={<FileText className="size-5" />}
          label="Total Quotations"
          value={String(cur.totalCount)}
          hint={
            countDiff !== null ? (
              <span className="flex items-center gap-1">
                {countDiff >= 0 ? (
                  <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={countDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {countDiff >= 0 ? `+${countDiff}%` : `${countDiff}%`}
                </span>{" "}
                vs prev period
              </span>
            ) : (
              "Created in period"
            )
          }
          tone="default"
        />

        <KpiCard
          icon={<CheckCircle2 className="size-5" />}
          label="Win Rate"
          value={`${cur.winRate}%`}
          hint={
            winRateDiff !== null ? (
              <span className="flex items-center gap-1">
                {winRateDiff >= 0 ? (
                  <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={winRateDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {winRateDiff >= 0 ? `+${winRateDiff}%` : `${winRateDiff}%`}
                </span>{" "}
                vs prev period
              </span>
            ) : (
              "Confirmed vs Cancelled"
            )
          }
          tone="success"
        />

        <KpiCard
          icon={<Target className="size-5" />}
          label="Avg Deal Size"
          value={formatMoney(cur.avgDealSize)}
          hint={
            avgSizeDiff !== null ? (
              <span className="flex items-center gap-1">
                {avgSizeDiff >= 0 ? (
                  <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={avgSizeDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {avgSizeDiff >= 0 ? `+${avgSizeDiff}%` : `${avgSizeDiff}%`}
                </span>{" "}
                vs prev period
              </span>
            ) : (
              "Confirmed quote avg"
            )
          }
          tone="default"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly Trend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Quotation Value Trend</span>
              <BarChart3 className="size-4 text-muted-foreground" />
            </CardTitle>
            <CardDescription>Monthly breakdown of quoted amounts</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) =>
                    baseCurrencyCode
                      ? `${baseCurrencyCode} ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                      : `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                  }
                />
                <Tooltip
                  formatter={(val: any) => [formatMoney(Number(val) || 0), "Value"]}
                  contentStyle={{ backgroundColor: "rgba(15,23,42,0.9)", borderColor: "transparent", color: "#fff", borderRadius: "8px" }}
                />
                <Bar dataKey="Value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* State Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Breakdown</CardTitle>
            <CardDescription>Quotations by current status</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any, name: any, item: any) => [
                      `${val} quotes (${formatMoney(Number(item.payload.amount) || 0)})`,
                      name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
              {pieData.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground">({item.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Customers by Confirmed Pipeline</CardTitle>
          <CardDescription>Highest value accounts in this period</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-4 py-3 text-center">Confirmed Quotes</th>
                  <th className="px-6 py-3 text-right">Total Quoted Value</th>
                </tr>
              </thead>
              <tbody>
                {cur.topCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                      No confirmed quotations in this time range.
                    </td>
                  </tr>
                ) : (
                  cur.topCustomers.map((cust) => (
                    <tr key={cust.customerId} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-3.5 font-semibold text-primary">{cust.customerName}</td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge variant="info">{cust.count}</StatusBadge>
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium">{formatMoney(cust.valueBase)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
