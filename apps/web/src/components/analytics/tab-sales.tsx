"use client";

import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatAlertMoney } from "@/lib/alerts-api";
import {
  monthLabel,
  pctChange,
  type AnalyticsSectionData,
  type SalesStats,
} from "@/lib/analytics-api";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowDownRight, ArrowUpRight, BarChart3, CreditCard, DollarSign, ShoppingBag, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TabSalesProps {
  data: AnalyticsSectionData<SalesStats>;
}

const INVOICE_STATUS_COLORS: Record<string, string> = {
  none: "#94a3b8",
  to_invoice: "#f59e0b",
  partial: "#3b82f6",
  invoiced: "#10b981",
};

export function TabSales({ data }: TabSalesProps) {
  const { baseCurrencyCode } = useOrgCurrency();
  const formatMoney = (amt: number) => formatAlertMoney(amt, baseCurrencyCode);

  const cur = data.current;
  const prev = data.compare;

  const revDiff = pctChange(cur.totalRevenue, prev.totalRevenue);
  const ordersDiff = pctChange(cur.totalOrders, prev.totalOrders);
  const aovDiff = pctChange(cur.avgOrderValue, prev.avgOrderValue);

  const lineChartData = cur.byMonth.map((m, idx) => {
    const prevMonthData = prev.byMonth[idx];
    return {
      name: monthLabel(m.month),
      Current: m.revenue,
      Previous: prevMonthData?.revenue ?? 0,
    };
  });

  const pieData = Object.entries(cur.invoiceStatusBreakdown).map(([status, stat]) => ({
    name: status === "to_invoice" ? "To Invoice" : status.charAt(0).toUpperCase() + status.slice(1),
    value: stat.count,
    amount: stat.valueBase,
    color: INVOICE_STATUS_COLORS[status] || "#64748b",
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          icon={<DollarSign className="size-5" />}
          label="Total Confirmed Revenue"
          value={formatMoney(cur.totalRevenue)}
          hint={
            revDiff !== null ? (
              <span className="flex items-center gap-1">
                {revDiff >= 0 ? (
                  <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={revDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {revDiff >= 0 ? `+${revDiff}%` : `${revDiff}%`}
                </span>{" "}
                vs prev period
              </span>
            ) : (
              "Confirmed sales orders"
            )
          }
          tone="success"
        />

        <KpiCard
          icon={<ShoppingBag className="size-5" />}
          label="Confirmed Sales Orders"
          value={String(cur.totalOrders)}
          hint={
            ordersDiff !== null ? (
              <span className="flex items-center gap-1">
                {ordersDiff >= 0 ? (
                  <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={ordersDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {ordersDiff >= 0 ? `+${ordersDiff}%` : `${ordersDiff}%`}
                </span>{" "}
                vs prev period
              </span>
            ) : (
              "Orders in period"
            )
          }
          tone="default"
        />

        <KpiCard
          icon={<TrendingUp className="size-5" />}
          label="Average Order Value"
          value={formatMoney(cur.avgOrderValue)}
          hint={
            aovDiff !== null ? (
              <span className="flex items-center gap-1">
                {aovDiff >= 0 ? (
                  <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={aovDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {aovDiff >= 0 ? `+${aovDiff}%` : `${aovDiff}%`}
                </span>{" "}
                vs prev period
              </span>
            ) : (
              "Avg per confirmed order"
            )
          }
          tone="default"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Comparison Line Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Revenue Growth (Current vs Previous Period)</span>
              <TrendingUp className="size-4 text-muted-foreground" />
            </CardTitle>
            <CardDescription>Monthly comparison overlay</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineChartData}>
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
                <Tooltip formatter={(val: any) => [formatMoney(Number(val) || 0)]} />
                <Line type="monotone" dataKey="Current" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Previous" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Invoice Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoicing Progress</CardTitle>
            <CardDescription>Sales orders by billing status</CardDescription>
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
                      `${val} orders (${formatMoney(Number(item.payload.amount) || 0)})`,
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

      {/* Top Revenue Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Customers by Revenue</CardTitle>
          <CardDescription>Accounts generating the highest confirmed sales</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-4 py-3 text-center">Orders</th>
                  <th className="px-6 py-3 text-right">Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {cur.topCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                      No confirmed sales in this time range.
                    </td>
                  </tr>
                ) : (
                  cur.topCustomers.map((cust) => (
                    <tr key={cust.customerId} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-3.5 font-semibold text-primary">{cust.customerName}</td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge variant="success">{cust.count}</StatusBadge>
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium">{formatMoney(cust.revenue)}</td>
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
