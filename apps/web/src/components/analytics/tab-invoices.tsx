"use client";

import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatAlertMoney } from "@/lib/alerts-api";
import {
  monthLabel,
  pctChange,
  type AnalyticsSectionData,
  type InvoiceStats,
} from "@/lib/analytics-api";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2, DollarSign, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TabInvoicesProps {
  data: AnalyticsSectionData<InvoiceStats>;
}

export function TabInvoices({ data }: TabInvoicesProps) {
  const { baseCurrencyCode } = useOrgCurrency();
  const formatMoney = (amt: number) => formatAlertMoney(amt, baseCurrencyCode);

  const cur = data.current;
  const prev = data.compare;

  const invoicedDiff = pctChange(cur.totalInvoiced, prev.totalInvoiced);
  const paidDiff = pctChange(cur.totalPaid, prev.totalPaid);
  const colRateDiff = pctChange(cur.collectionRate, prev.collectionRate);
  const overdueDiff = pctChange(cur.overdueAmount, prev.overdueAmount);

  const monthlyData = cur.byMonth.map((m) => ({
    name: monthLabel(m.month),
    Billed: m.billed,
    Collected: m.paid,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<DollarSign className="size-5" />}
          label="Total Invoiced"
          value={formatMoney(cur.totalInvoiced)}
          hint={
            invoicedDiff !== null ? (
              <span className="flex items-center gap-1">
                {invoicedDiff >= 0 ? (
                  <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={invoicedDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {invoicedDiff >= 0 ? `+${invoicedDiff}%` : `${invoicedDiff}%`}
                </span>{" "}
                vs prev period
              </span>
            ) : (
              "Billed in period"
            )
          }
          tone="default"
        />

        <KpiCard
          icon={<Wallet className="size-5" />}
          label="Total Collected"
          value={formatMoney(cur.totalPaid)}
          hint={
            paidDiff !== null ? (
              <span className="flex items-center gap-1">
                {paidDiff >= 0 ? (
                  <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={paidDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {paidDiff >= 0 ? `+${paidDiff}%` : `${paidDiff}%`}
                </span>{" "}
                vs prev period
              </span>
            ) : (
              "Received payments"
            )
          }
          tone="success"
        />

        <KpiCard
          icon={<CheckCircle2 className="size-5" />}
          label="Collection Rate"
          value={`${cur.collectionRate}%`}
          hint={
            colRateDiff !== null ? (
              <span className="flex items-center gap-1">
                {colRateDiff >= 0 ? (
                  <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowDownRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={colRateDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {colRateDiff >= 0 ? `+${colRateDiff}%` : `${colRateDiff}%`}
                </span>{" "}
                vs prev period
              </span>
            ) : (
              "Collected vs Total Invoiced"
            )
          }
          tone="success"
        />

        <KpiCard
          icon={<AlertTriangle className="size-5" />}
          label="Overdue Receivables"
          value={formatMoney(cur.overdueAmount)}
          hint={
            overdueDiff !== null ? (
              <span className="flex items-center gap-1">
                {overdueDiff <= 0 ? (
                  <ArrowDownRight className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ArrowUpRight className="size-4 text-rose-600 dark:text-rose-400" />
                )}
                <span className={overdueDiff <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {overdueDiff >= 0 ? `+${overdueDiff}%` : `${overdueDiff}%`}
                </span>{" "}
                vs prev period
              </span>
            ) : (
              `${cur.overdueCount} account(s) overdue`
            )
          }
          tone="warning"
        />
      </div>

      {/* Billed vs Paid Grouped Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Billed vs Collected by Month</span>
            <BarChart3 className="size-4 text-muted-foreground" />
          </CardTitle>
          <CardDescription>Comparison of invoiced amounts against cash collected</CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
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
              <Legend wrapperStyle={{ paddingTop: "10px" }} />
              <Bar dataKey="Billed" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Collected" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
