"use client";

import { AppPage } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { invoiceStatusVariant, StatusBadge } from "@/components/ui/status-badge";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import {
  formatAlertMoney,
  getAlertsSummary,
  type AlertItem,
} from "@/lib/alerts-api";
import { listInvoices, type Invoice } from "@/lib/invoices-api";
import { listQuotations } from "@/lib/quotations-api";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  FileText,
  Plus,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function formatInvoiceDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function invoiceStatusLabel(invoice: Invoice) {
  if (invoice.status === "paid") return "Paid";
  const due = new Date(`${invoice.dueDate}T12:00:00`);
  if (invoice.status === "posted" && due < new Date()) return "Overdue";
  if (invoice.status === "posted") return "Pending";
  return invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
}

function relativeTime(value?: string) {
  if (!value) return " ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return " ";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function DashboardHome() {
  const router = useRouter();
  const { baseCurrencyCode } = useOrgCurrency();
  const formatDashboardMoney = (amount: number) =>
    formatAlertMoney(amount, baseCurrencyCode);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overdueAmount, setOverdueAmount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [dueSoonAmount, setDueSoonAmount] = useState(0);
  const [dueSoonCount, setDueSoonCount] = useState(0);
  const [activeQuotations, setActiveQuotations] = useState(0);
  const [pipelineValue, setPipelineValue] = useState(0);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [alertFeed, setAlertFeed] = useState<AlertItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setLoadError(null);

      try {
        const [alertsResult, quotationsResult, invoicesResult] = await Promise.allSettled([
          getAlertsSummary(),
          listQuotations({ state: "sent", perPage: 100, sortBy: "quoteDate", sortDir: "desc" }),
          listInvoices(),
        ]);

        if (cancelled) return;

        if (alertsResult.status === "fulfilled") {
          const { metrics, alerts } = alertsResult.value;
          setOverdueAmount(metrics.totalOverdueAmount);
          setOverdueCount(metrics.totalOverdueCount);
          setDueSoonAmount(metrics.totalDueSoonAmount);
          setDueSoonCount(metrics.totalDueSoonCount);
          setAlertFeed(alerts.slice(0, 5));
        }

        if (quotationsResult.status === "fulfilled") {
          const quotes = quotationsResult.value.data;
          setActiveQuotations(quotationsResult.value.meta.total);
          setPipelineValue(
            quotes.reduce(
              (sum, quote) => sum + (parseFloat(quote.amountTotalBase ?? "0") || 0),
              0,
            ),
          );
        }

        if (invoicesResult.status === "fulfilled") {
          setAllInvoices(invoicesResult.value);
          const sorted = [...invoicesResult.value].sort(
            (a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime(),
          );
          setRecentInvoices(sorted.slice(0, 5));
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load dashboard data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const totalReceivables = overdueAmount + dueSoonAmount;
  const currentYear = new Date().getFullYear();
  const salesYtd = allInvoices
    .filter((invoice) => {
      const year = new Date(`${invoice.invoiceDate}T12:00:00`).getFullYear();
      return year === currentYear && invoice.status !== "draft" && invoice.status !== "cancelled";
    })
    .reduce((sum, invoice) => sum + (Number(invoice.amountTotalBase ?? invoice.amountTotal) || 0), 0);
  const collectedYtd = allInvoices
    .filter((invoice) => {
      const year = new Date(`${invoice.invoiceDate}T12:00:00`).getFullYear();
      return year === currentYear && invoice.status === "paid";
    })
    .reduce((sum, invoice) => sum + (Number(invoice.amountTotalBase ?? invoice.amountTotal) || 0), 0);
  const collectionRate = salesYtd > 0 ? Math.round((collectedYtd / salesYtd) * 100) : 0;
  const monthlySales = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const amount = allInvoices
        .filter((invoice) => {
          const invoiceDate = new Date(`${invoice.invoiceDate}T12:00:00`);
          return invoiceDate.getFullYear() === date.getFullYear() &&
            invoiceDate.getMonth() === date.getMonth() &&
            invoice.status !== "draft" &&
            invoice.status !== "cancelled";
        })
        .reduce((sum, invoice) => sum + (Number(invoice.amountTotalBase ?? invoice.amountTotal) || 0), 0);
      return { label: date.toLocaleDateString(undefined, { month: "short" }), amount };
    });
  }, [allInvoices]);
  const maxMonthlySales = Math.max(...monthlySales.map((month) => month.amount), 1);
  const overdueShare =
    totalReceivables > 0 ? Math.round((overdueAmount / totalReceivables) * 100) : 0;
  const dueSoonShare =
    totalReceivables > 0 ? Math.round((dueSoonAmount / totalReceivables) * 100) : 0;

  const activityItems = useMemo(() => {
    return alertFeed.map((alert) => ({
      id: alert.id,
      title:
        alert.status === "Overdue"
          ? "Overdue Invoice Alert"
          : alert.status === "Due Soon"
            ? "Upcoming Payment Due"
            : "Payment Alert",
      subtitle: `Invoice #${alert.invoiceNumber} (${formatDashboardMoney(alert.amountOutstandingBase ?? alert.amountOutstanding)})   ${alert.customerName}`,
      time: relativeTime(alert.lastReminderSent ?? alert.dueDate),
      severity: alert.severity,
      status: alert.status,
    }));
  }, [alertFeed, baseCurrencyCode]);

  return (
    <AppPage
      fullWidth
      subtitle="Executive command center for revenue, collections, overdue alerts, and pipeline health."
      title="ERP Dashboard"
    >
      <div className="flex flex-col gap-6">
        {/* Header strip */}
        <div className="erp-command-hero">
          <div className="erp-command-hero__copy">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-3 py-1 text-xs font-semibold text-secondary">
              <span className="size-1.5 animate-pulse rounded-full bg-secondary" />
              ERP Live Workspace
            </span>
            {overdueCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-xs font-semibold text-destructive">
                <AlertTriangle className="size-3.5" />
                {overdueCount} overdue alert{overdueCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <h2>Good morning. Here’s what needs attention.</h2>
          <p>Monitor revenue, payment risk, and the active sales pipeline from one live workspace.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push("/dashboard/sales/quotations/new")}>
              <Plus data-icon="inline-start" />
              New Quotation
            </Button>
            <Button variant="outline" onClick={() => router.push("/dashboard/customers/new")}>
              <UserPlus data-icon="inline-start" />
              Add Customer
            </Button>
          </div>
        </div>

        {loadError ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="text-sm text-destructive">{loadError}</CardContent>
          </Card>
        ) : null}

        {/* KPI grid */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={<TrendingUp className="size-5" />}
            label="Total Sales (YTD)"
            value={formatDashboardMoney(salesYtd)}
            hint={`${collectionRate}% collected · ${formatDashboardMoney(collectedYtd)} paid`}
            tone="success"
            loading={loading}
          />
          <KpiCard
            icon={<CalendarClock className="size-5" />}
            label="Due Within 7 Days"
            value={formatDashboardMoney(dueSoonAmount)}
            hint={`${dueSoonCount} pending invoice${dueSoonCount === 1 ? "" : "s"}`}
            tone="default"
            loading={loading}
          />
          <KpiCard
            icon={<AlertTriangle className="size-5" />}
            label="Overdue Invoices"
            value={formatDashboardMoney(overdueAmount)}
            hint={`${overdueCount} account${overdueCount === 1 ? "" : "s"} need follow-up`}
            tone="warning"
            loading={loading}
          />
          <KpiCard
            icon={<FileText className="size-5" />}
            label="Active Quotations"
            value={`${activeQuotations} quote${activeQuotations === 1 ? "" : "s"}`}
            hint={`${formatDashboardMoney(pipelineValue)} pipeline`}
            tone="success"
            loading={loading}
          />
        </div>

        {/* Collection aging */}
        <Card>
          <CardHeader>
            <CardTitle>Collection Status & Payment Aging</CardTitle>
            <CardDescription>
              Real-time tracking of receivables, collections progress, and overdue risks
            </CardDescription>
            {overdueCount > 0 ? (
              <CardAction>
                <span className="rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-semibold text-destructive">
                  {overdueCount} overdue
                </span>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border/90 bg-white p-4 shadow-sm dark:border-border dark:bg-muted/30 dark:shadow-none">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Wallet className="size-4 text-secondary" />
                Due within 7 days
              </div>
              <p className="mt-2 text-2xl font-bold">
                {loading ? " " : formatDashboardMoney(dueSoonAmount)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {dueSoonCount} invoice{dueSoonCount === 1 ? "" : "s"} approaching due date
              </p>
            </div>
            <div
              className={cn(
                "rounded-xl border p-4 shadow-sm",
                overdueCount > 0
                  ? "border-destructive/30 bg-white dark:border-destructive/30 dark:bg-destructive/5"
                  : "border-border/90 bg-white dark:border-border dark:bg-muted/30",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <AlertTriangle
                  className={cn("size-4", overdueCount > 0 ? "text-destructive" : "text-muted-foreground")}
                />
                Overdue receivables
              </div>
              <p
                className={cn(
                  "mt-2 text-2xl font-bold",
                  overdueCount > 0 && "text-destructive",
                )}
              >
                {loading ? " " : formatDashboardMoney(overdueAmount)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {overdueCount > 0
                  ? `${overdueCount} account${overdueCount === 1 ? "" : "s"} need follow-up`
                  : "No overdue invoices right now"}
              </p>
            </div>
          </CardContent>
          {totalReceivables > 0 ? (
            <CardContent className="border-t pt-4">
              <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Receivables mix
              </p>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                {dueSoonShare > 0 ? (
                  <div
                    className="bg-secondary transition-all"
                    style={{ width: `${dueSoonShare}%` }}
                    title={`Due soon: ${dueSoonShare}%`}
                  />
                ) : null}
                {overdueShare > 0 ? (
                  <div
                    className="bg-destructive transition-all"
                    style={{ width: `${overdueShare}%` }}
                    title={`Overdue: ${overdueShare}%`}
                  />
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-secondary" />
                  Due soon {dueSoonShare}%
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-destructive" />
                  Overdue {overdueShare}%
                </span>
              </div>
            </CardContent>
          ) : null}
        </Card>

        {/* Main + sidebar */}
        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <div className="flex flex-col gap-6">
            {/* Chart placeholder */}
            <Card>
              <CardHeader>
                <CardTitle>Sales & Collections</CardTitle>
                <CardDescription>
                  Monthly sales and collection trends
                </CardDescription>
                <CardAction>
                  <BarChart3 className="size-5 text-muted-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="erp-sales-chart">
                  <div className="erp-sales-chart__summary">
                    <div><span>6-month invoiced</span><strong>{formatDashboardMoney(monthlySales.reduce((sum, month) => sum + month.amount, 0))}</strong></div>
                    <div><span>YTD collection rate</span><strong>{collectionRate}%</strong></div>
                  </div>
                  <div className="erp-sales-chart__plot">
                    {monthlySales.map((month) => (
                      <div className="erp-sales-chart__month" key={month.label}>
                        <span>{month.amount > 0 ? formatDashboardMoney(month.amount) : ""}</span>
                        <i style={{ height: `${Math.max(6, (month.amount / maxMonthlySales) * 100)}%` }} />
                        <b>{month.label}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent invoices */}
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Recent Invoices</CardTitle>
                <CardDescription>Latest billing activity and collection status</CardDescription>
                <CardAction>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/dashboard/invoices")}
                  >
                    View all
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                {recentInvoices.length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                    No invoices yet. Create your first invoice from a confirmed sales order or
                    directly from the invoices workspace.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          <th className="px-6 py-3">Invoice</th>
                          <th className="px-4 py-3">Customer</th>
                          <th className="px-4 py-3 text-right">Amount</th>
                          <th className="px-4 py-3">Due</th>
                          <th className="px-6 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentInvoices.map((inv) => {
                          const status = invoiceStatusLabel(inv);
                          return (
                            <tr
                              key={inv.id}
                              className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30"
                            >
                              <td className="px-6 py-3.5 font-semibold">{inv.number}</td>
                              <td className="px-4 py-3.5 text-muted-foreground">
                                {inv.customerName}
                              </td>
                              <td className="px-4 py-3.5 text-right font-medium">
                                {formatDashboardMoney(inv.amountTotal)}
                              </td>
                              <td className="px-4 py-3.5 text-muted-foreground">
                                {formatInvoiceDate(inv.dueDate)}
                              </td>
                              <td className="px-6 py-3.5">
                                <StatusBadge variant={invoiceStatusVariant(status)}>
                                  {status}
                                </StatusBadge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Alerts sidebar */}
          <Card className="h-fit xl:sticky xl:top-4">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Bell className="size-4 text-secondary" />
                Alerts
              </CardTitle>
              <CardDescription>Live payment & collection feed</CardDescription>
              <CardAction>
                <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-secondary uppercase">
                  Live
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4">
              {activityItems.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No payment alerts right now. Overdue and upcoming invoices will appear here
                  automatically.
                </p>
              ) : (
                activityItems.map((act) => (
                  <div
                    key={act.id}
                    className={cn(
                      "rounded-lg border p-3",
                      act.severity === "critical"
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-border bg-muted/20",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-snug">{act.title}</p>
                      <StatusBadge
                        variant={
                          act.status === "Overdue"
                            ? "destructive"
                            : act.status === "Due Soon"
                              ? "info"
                              : "info"
                        }
                      >
                        {act.status === "Overdue"
                          ? "Overdue"
                          : act.status === "Due Soon"
                            ? "Due Soon"
                            : "Pending"}
                      </StatusBadge>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {act.subtitle}
                    </p>
                    <p className="mt-2 text-[0.7rem] text-muted-foreground/80">{act.time}</p>
                  </div>
                ))
              )}
              <Button
                className="mt-1 w-full"
                variant="outline"
                onClick={() => router.push("/dashboard/alerts")}
              >
                Open Alerts & Reminders
                <ArrowRight data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppPage>
  );
}
