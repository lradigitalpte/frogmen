"use client";

import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatAlertMoney } from "@/lib/alerts-api";
import {
  monthLabel,
  pctChange,
  type AnalyticsSectionData,
  type PurchasingStats,
} from "@/lib/analytics-api";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowDownRight, ArrowUpRight, BarChart3, Building2, PackageCheck, ShoppingCart, Wallet } from "lucide-react";
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

interface TabPurchasingProps {
  data: AnalyticsSectionData<PurchasingStats>;
}

const RECEIPT_COLORS: Record<string, string> = {
  none: "#94a3b8",
  to_receive: "#f59e0b",
  partial: "#3b82f6",
  received: "#10b981",
};

export function TabPurchasing({ data }: TabPurchasingProps) {
  const { baseCurrencyCode } = useOrgCurrency();
  const formatMoney = (amt: number) => formatAlertMoney(amt, baseCurrencyCode);

  const cur = data.current;
  const prev = data.compare;

  const spendDiff = pctChange(cur.totalSpend, prev.totalSpend);
  const posDiff = pctChange(cur.totalPOs, prev.totalPOs);
  const avgPoDiff = pctChange(cur.avgPoValue, prev.avgPoValue);

  const monthlyChartData = cur.byMonth.map((m) => ({
    name: monthLabel(m.month),
    Spend: m.spend,
    POs: m.count,
  }));

  const pieData = Object.entries(cur.receiptBreakdown).map(([status, count]) => ({
    name: status === "to_receive" ? "To Receive" : status.charAt(0).toUpperCase() + status.slice(1),
    value: count,
    color: RECEIPT_COLORS[status] || "#64748b",
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Wallet className="size-5" />}
          label="Total Purchasing Spend"
          value={formatMoney(cur.totalSpend)}
          hint={
            spendDiff !== null ? (
              <span className="flex items-center gap-1">
                {spendDiff <= 0 ? (
                  <ArrowDownRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowUpRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={spendDiff <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {spendDiff >= 0 ? `+${spendDiff}%` : `${spendDiff}%`}
                </span>{" "}
                vs prev period
              </span>
            ) : (
              "Confirmed purchase orders"
            )
          }
          tone="default"
        />

        <KpiCard
          icon={<ShoppingCart className="size-5" />}
          label="Confirmed POs"
          value={String(cur.totalPOs)}
          hint={
            posDiff !== null ? (
              <span className="flex items-center gap-1">
                {posDiff >= 0 ? (
                  <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={posDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {posDiff >= 0 ? `+${posDiff}%` : `${posDiff}%`}
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
          icon={<Building2 className="size-5" />}
          label="Avg Purchase Order"
          value={formatMoney(cur.avgPoValue)}
          hint={
            avgPoDiff !== null ? (
              <span className="flex items-center gap-1">
                {avgPoDiff >= 0 ? (
                  <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={avgPoDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {avgPoDiff >= 0 ? `+${avgPoDiff}%` : `${avgPoDiff}%`}
                </span>{" "}
                vs prev period
              </span>
            ) : (
              "Avg spend per PO"
            )
          }
          tone="default"
        />

        <KpiCard
          icon={<PackageCheck className="size-5" />}
          label="Pending Receipts"
          value={String(cur.pendingReceipts)}
          hint="POs awaiting goods receipt"
          tone={cur.pendingReceipts > 0 ? "warning" : "success"}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly Spend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Monthly Purchasing Spend</span>
              <BarChart3 className="size-4 text-muted-foreground" />
            </CardTitle>
            <CardDescription>Monthly spend timeline</CardDescription>
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
                <Tooltip formatter={(val: any) => [formatMoney(Number(val) || 0), "Spend"]} />
                <Bar dataKey="Spend" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Goods Receipt Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Goods Receipt Status</CardTitle>
            <CardDescription>Delivery status of POs</CardDescription>
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
                  <Tooltip />
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

      {/* Top Vendors Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Vendors by Spend</CardTitle>
          <CardDescription>Suppliers receiving the largest purchase orders</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <th className="px-6 py-3">Vendor</th>
                  <th className="px-4 py-3 text-center">POs Issued</th>
                  <th className="px-6 py-3 text-right">Total Spend</th>
                </tr>
              </thead>
              <tbody>
                {cur.topVendors.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                      No confirmed purchase orders in this time range.
                    </td>
                  </tr>
                ) : (
                  cur.topVendors.map((vend) => (
                    <tr key={vend.vendorId} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                      <td className="px-6 py-3.5 font-semibold text-primary">{vend.vendorName}</td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge variant="info">{vend.count}</StatusBadge>
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium">{formatMoney(vend.spend)}</td>
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
