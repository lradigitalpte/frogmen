"use client";

import {
  Avatar,
  Badge,
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  Card,
  IndexTable,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { ChevronLeftIcon, ChevronRightIcon } from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { useSession } from "@/lib/auth-client";
import {
  formatAlertMoney,
  getAlertsSummary,
  type AlertItem,
} from "@/lib/alerts-api";
import {
  calendarStatusBadge,
  listCalendarItems,
  toIsoDate,
  type CalendarItem,
} from "@/lib/calendar-api";
import { formatAppDate } from "@/lib/format-date";
import { listInvoices, type Invoice } from "@/lib/invoices-api";
import { listQuotations } from "@/lib/quotations-api";
import { cn } from "@/lib/utils";

type BadgeTone = "success" | "warning" | "critical" | "attention" | "info" | undefined;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function invoiceAmount(invoice: Invoice) {
  return Number(invoice.amountTotalBase ?? invoice.amountTotal) || 0;
}

function invoiceDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function isBilled(invoice: Invoice) {
  return invoice.status !== "draft" && invoice.status !== "cancelled";
}

function invoiceStatus(invoice: Invoice): { label: string; tone: BadgeTone } {
  if (invoice.status === "paid") return { label: "Paid", tone: "success" };
  if (invoice.status === "posted") {
    return invoiceDate(invoice.dueDate) < new Date()
      ? { label: "Overdue", tone: "critical" }
      : { label: "Pending", tone: "attention" };
  }
  const label = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
  return { label, tone: undefined };
}

function relativeTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 0) return `Due ${formatAppDate(value.slice(0, 10)) || value}`;
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Rounds up to a "nice" axis maximum (1, 2, 2.5, 5 × 10^n). */
function niceCeil(value: number) {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function dueHint(invoice: Invoice) {
  if (invoice.status !== "posted") return null;
  const due = invoiceDate(invoice.dueDate);
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `${Math.abs(days)} day${days === -1 ? "" : "s"} late`, late: true };
  if (days === 0) return { text: "Due today", late: false };
  return { text: `in ${days} day${days === 1 ? "" : "s"}`, late: false };
}

function pct(part: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, (part / total) * 100)) : 0;
}

export function DashboardHome() {
  const router = useRouter();
  const { data: session } = useSession();
  const { baseCurrencyCode } = useOrgCurrency();
  const money = (amount: number) => formatAlertMoney(amount, baseCurrencyCode);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overdueAmount, setOverdueAmount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [dueSoonAmount, setDueSoonAmount] = useState(0);
  const [dueSoonCount, setDueSoonCount] = useState(0);
  const [activeQuotations, setActiveQuotations] = useState(0);
  const [pipelineValue, setPipelineValue] = useState(0);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  // Locale/time-zone dependent text renders only after mount to avoid
  // server/client hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDay, setSelectedDay] = useState(() => toIsoDate(today));
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      const [alertsResult, quotationsResult, invoicesResult] = await Promise.allSettled([
        getAlertsSummary(),
        listQuotations({ state: "sent", perPage: 100, sortBy: "quoteDate", sortDir: "desc" }),
        listInvoices(),
      ]);
      if (cancelled) return;

      if (alertsResult.status === "fulfilled") {
        const { metrics, alerts: feed } = alertsResult.value;
        setOverdueAmount(metrics.totalOverdueAmount);
        setOverdueCount(metrics.totalOverdueCount);
        setDueSoonAmount(metrics.totalDueSoonAmount);
        setDueSoonCount(metrics.totalDueSoonCount);
        setAlerts(feed.slice(0, 5));
      }
      if (quotationsResult.status === "fulfilled") {
        setActiveQuotations(quotationsResult.value.meta.total);
        setPipelineValue(
          quotationsResult.value.data.reduce(
            (sum, quote) => sum + (parseFloat(quote.amountTotalBase ?? "0") || 0),
            0,
          ),
        );
      }
      if (invoicesResult.status === "fulfilled") {
        setInvoices(invoicesResult.value);
      }
      if ([alertsResult, quotationsResult, invoicesResult].every((r) => r.status === "rejected")) {
        setLoadError("Dashboard data could not be loaded. Check that the API is running.");
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const from = toIsoDate(month);
    const to = toIsoDate(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    setCalendarLoading(true);
    listCalendarItems({ from, to })
      .then((items) => {
        if (!cancelled) setCalendarItems(items);
      })
      .catch(() => {
        if (!cancelled) setCalendarItems([]);
      })
      .finally(() => {
        if (!cancelled) setCalendarLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  /* ── Derived numbers ── */
  const year = today.getFullYear();
  const billedThisYear = invoices.filter(
    (invoice) => isBilled(invoice) && invoiceDate(invoice.invoiceDate).getFullYear() === year,
  );
  const salesYtd = billedThisYear.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0);
  const collectedYtd = billedThisYear
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoiceAmount(invoice), 0);
  const collectionRate = Math.round(pct(collectedYtd, salesYtd));
  const otherOutstanding = Math.max(0, salesYtd - collectedYtd - dueSoonAmount - overdueAmount);

  const [range, setRange] = useState<6 | 12>(6);
  const monthlySales = useMemo(() => {
    return Array.from({ length: range }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth() - (range - 1) + index, 1);
      const inMonth = invoices.filter((invoice) => {
        const d = invoiceDate(invoice.invoiceDate);
        return (
          isBilled(invoice) &&
          d.getFullYear() === date.getFullYear() &&
          d.getMonth() === date.getMonth()
        );
      });
      const amount = inMonth.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0);
      const collected = inMonth
        .filter((invoice) => invoice.status === "paid")
        .reduce((sum, invoice) => sum + invoiceAmount(invoice), 0);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: date.toLocaleString(undefined, { month: "short" }),
        longLabel: date.toLocaleString(undefined, { month: "long", year: "numeric" }),
        amount,
        collected,
        count: inMonth.length,
      };
    });
  }, [invoices, today, range]);
  const rangeTotal = monthlySales.reduce((sum, m) => sum + m.amount, 0);
  const rangeCollected = monthlySales.reduce((sum, m) => sum + m.collected, 0);
  const rangeInvoiceCount = monthlySales.reduce((sum, m) => sum + m.count, 0);
  const bestMonth = monthlySales.reduce<(typeof monthlySales)[number] | null>(
    (best, m) => (m.amount > 0 && (!best || m.amount > best.amount) ? m : best),
    null,
  );
  const axisMax = niceCeil(Math.max(...monthlySales.map((m) => m.amount), 0));
  const axisTicks = [axisMax, axisMax / 2, 0];

  const recentInvoices = useMemo(
    () =>
      [...invoices]
        .sort(
          (a, b) =>
            invoiceDate(b.invoiceDate).getTime() - invoiceDate(a.invoiceDate).getTime(),
        )
        .slice(0, 6),
    [invoices],
  );

  /* ── Calendar ── */
  const calendarCells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return { iso: toIsoDate(date), day: date.getDate(), inMonth: date.getMonth() === month.getMonth() };
    });
  }, [month]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of calendarItems) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [calendarItems]);

  const todayIso = toIsoDate(today);
  const selectedItems = itemsByDay.get(selectedDay) ?? [];
  const selectedLabel =
    selectedDay === todayIso ? "Today" : formatAppDate(selectedDay) || selectedDay;
  const monthLabel = mounted
    ? month.toLocaleString(undefined, { month: "long", year: "numeric" })
    : "";

  function shiftMonth(delta: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  const userName = session?.user?.name ?? "";
  const firstName = userName.split(" ")[0];
  const [leadAlert, ...otherAlerts] = alerts;

  return (
    <AppPage
      title="Dashboard"
      subtitle={
        mounted
          ? today.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : undefined
      }
      primaryAction={{ content: "New quotation", url: "/dashboard/sales/quotations/new" }}
      secondaryActions={[{ content: "Add customer", url: "/dashboard/customers/new" }]}
    >
      <BlockStack gap="400">
        {loadError ? <Banner tone="critical">{loadError}</Banner> : null}

        <div className="dash-grid">
          <div className="dash-main">
            {/* Hero summary */}
            <section className="dash-hero">
              <div className="dash-hero__top">
                <div>
                  <p className="dash-hero__eyebrow">
                    {mounted ? `${greeting()}${firstName ? `, ${firstName}` : ""}. ` : ""}
                    Sales this year
                  </p>
                  <p className="dash-hero__value">{loading ? "—" : money(salesYtd)}</p>
                </div>
                <span className="dash-hero__chip">{collectionRate}% collected</span>
              </div>

              <div className="dash-hero__bar" aria-hidden>
                <i className="is-collected" style={{ width: `${pct(collectedYtd, salesYtd)}%` }} />
                <i className="is-open" style={{ width: `${pct(otherOutstanding, salesYtd)}%` }} />
                <i className="is-soon" style={{ width: `${pct(dueSoonAmount, salesYtd)}%` }} />
                <i className="is-overdue" style={{ width: `${pct(overdueAmount, salesYtd)}%` }} />
              </div>
              <div className="dash-hero__legend">
                <span><i className="is-collected" />Collected {money(collectedYtd)}</span>
                <span><i className="is-soon" />Due in 7 days {money(dueSoonAmount)}</span>
                <span><i className="is-overdue" />Overdue {money(overdueAmount)}</span>
              </div>

              <div className="dash-hero__stats">
                <button type="button" onClick={() => router.push("/dashboard/invoices")}>
                  <span>Collected</span>
                  <strong>{money(collectedYtd)}</strong>
                </button>
                <button type="button" onClick={() => router.push("/dashboard/alerts")}>
                  <span>Due in 7 days</span>
                  <strong>
                    {dueSoonCount} invoice{dueSoonCount === 1 ? "" : "s"}
                  </strong>
                </button>
                <button type="button" onClick={() => router.push("/dashboard/alerts")}>
                  <span>Overdue</span>
                  <strong className={overdueCount > 0 ? "is-alert" : undefined}>
                    {overdueCount} account{overdueCount === 1 ? "" : "s"}
                  </strong>
                </button>
                <button type="button" onClick={() => router.push("/dashboard/sales/quotations")}>
                  <span>Open quotes</span>
                  <strong>
                    {activeQuotations} · {money(pipelineValue)}
                  </strong>
                </button>
              </div>
            </section>

            {/* Sales trend */}
            <Card>
              <BlockStack gap="500">
                <InlineStack align="space-between" blockAlign="start" gap="300" wrap>
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Sales &amp; collections</Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Invoiced per month, split by what has been collected
                    </Text>
                  </BlockStack>
                  <ButtonGroup variant="segmented">
                    <Button pressed={range === 6} size="slim" onClick={() => setRange(6)}>
                      6 months
                    </Button>
                    <Button pressed={range === 12} size="slim" onClick={() => setRange(12)}>
                      12 months
                    </Button>
                  </ButtonGroup>
                </InlineStack>

                <div className="dash-chart-stats">
                  <div>
                    <span>Invoiced</span>
                    <strong>{loading ? "—" : money(rangeTotal)}</strong>
                    <small>
                      {rangeInvoiceCount} invoice{rangeInvoiceCount === 1 ? "" : "s"}
                    </small>
                  </div>
                  <div>
                    <span>Collected</span>
                    <strong>{loading ? "—" : money(rangeCollected)}</strong>
                    <small>{Math.round(pct(rangeCollected, rangeTotal))}% of invoiced</small>
                  </div>
                  <div>
                    <span>Outstanding</span>
                    <strong>{loading ? "—" : money(rangeTotal - rangeCollected)}</strong>
                    <small>From this period</small>
                  </div>
                  <div>
                    <span>Best month</span>
                    <strong>{bestMonth && mounted ? bestMonth.label : "—"}</strong>
                    <small>{bestMonth ? money(bestMonth.amount) : "No sales yet"}</small>
                  </div>
                </div>

                <div className="dash-chart" role="img" aria-label="Invoiced and collected amount per month">
                  <div className="dash-chart__axis" aria-hidden>
                    {axisTicks.map((tick) => (
                      <span key={tick}>{compactNumber.format(tick)}</span>
                    ))}
                  </div>
                  <div className="dash-chart__plot">
                    <div className="dash-chart__grid" aria-hidden>
                      {axisTicks.map((tick) => (
                        <i key={tick} />
                      ))}
                    </div>
                    <div
                      className="dash-chart__bars"
                      style={{ gridTemplateColumns: `repeat(${monthlySales.length}, minmax(0, 1fr))` }}
                    >
                      {monthlySales.map((m, index) => {
                        const current = index === monthlySales.length - 1;
                        const height = pct(m.amount, axisMax);
                        const collectedShare = pct(m.collected, m.amount);
                        return (
                          <div className={cn("dash-chart__col", current && "is-current")} key={m.key}>
                            <div className="dash-chart__track" tabIndex={0}>
                              {m.amount > 0 ? (
                                <div className="dash-chart__bar" style={{ height: `${height}%` }}>
                                  <i className="is-outstanding" style={{ height: `${100 - collectedShare}%` }} />
                                  <i className="is-collected" style={{ height: `${collectedShare}%` }} />
                                </div>
                              ) : (
                                <div className="dash-chart__zero" />
                              )}
                              {mounted ? (
                                <div className="dash-chart__tip" role="tooltip">
                                  <strong>{m.longLabel}</strong>
                                  <span>Invoiced {money(m.amount)}</span>
                                  <span>Collected {money(m.collected)}</span>
                                  <span>
                                    {m.count} invoice{m.count === 1 ? "" : "s"}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                            <b>{mounted ? m.label : ""}</b>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="dash-chart__legend">
                  <span><i className="is-collected" />Collected</span>
                  <span><i className="is-outstanding" />Outstanding</span>
                  <span className="dash-chart__legend-note">Hover a bar for details</span>
                </div>
              </BlockStack>
            </Card>

            {/* Recent invoices */}
            <Card padding="0">
              <div className="dash-card-head">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingMd">Recent invoices</Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Latest billing activity and collection status
                  </Text>
                </BlockStack>
                <Button variant="plain" url="/dashboard/invoices">View all</Button>
              </div>
              <IndexTable
                resourceName={{ singular: "invoice", plural: "invoices" }}
                itemCount={recentInvoices.length}
                selectable={false}
                loading={loading}
                emptyState={
                  <div className="dash-empty">
                    No invoices yet. Create one from a confirmed sales order or the invoices workspace.
                  </div>
                }
                headings={[
                  { title: "Invoice" },
                  { title: "Customer" },
                  { title: "Due date" },
                  { title: "Status" },
                  { title: "Amount", alignment: "end" },
                ]}
              >
                {recentInvoices.map((invoice, index) => {
                  const status = invoiceStatus(invoice);
                  const hint = mounted ? dueHint(invoice) : null;
                  return (
                    <IndexTable.Row
                      id={invoice.id}
                      key={invoice.id}
                      position={index}
                      onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}
                    >
                      <IndexTable.Cell>
                        <BlockStack gap="050">
                          <Text as="span" fontWeight="semibold">{invoice.number}</Text>
                          <Text as="span" tone="subdued" variant="bodySm">
                            Issued {formatAppDate(invoice.invoiceDate) || invoice.invoiceDate}
                          </Text>
                        </BlockStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200" blockAlign="center" wrap={false}>
                          <Avatar size="sm" initials={initials(invoice.customerName)} name={invoice.customerName} />
                          <Text as="span">{invoice.customerName}</Text>
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <BlockStack gap="050">
                          <Text as="span">{formatAppDate(invoice.dueDate) || invoice.dueDate}</Text>
                          {hint ? (
                            <Text as="span" variant="bodySm" tone={hint.late ? "critical" : "subdued"}>
                              {hint.text}
                            </Text>
                          ) : null}
                        </BlockStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" alignment="end" fontWeight="semibold" numeric>
                          {money(invoice.amountTotal)}
                        </Text>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </Card>
          </div>

          <div className="dash-side">
            {/* Calendar */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingLg">{monthLabel}</Text>
                  <InlineStack gap="100">
                    <Button
                      accessibilityLabel="Previous month"
                      icon={ChevronLeftIcon}
                      variant="tertiary"
                      onClick={() => shiftMonth(-1)}
                    />
                    <Button
                      accessibilityLabel="Next month"
                      icon={ChevronRightIcon}
                      variant="tertiary"
                      onClick={() => shiftMonth(1)}
                    />
                  </InlineStack>
                </InlineStack>

                <div className="dash-cal">
                  {WEEKDAYS.map((day) => (
                    <span className="dash-cal__dow" key={day}>{day}</span>
                  ))}
                  {calendarCells.map((cell) => {
                    const count = itemsByDay.get(cell.iso)?.length ?? 0;
                    return (
                      <button
                        type="button"
                        key={cell.iso}
                        className={cn(
                          "dash-cal__day",
                          !cell.inMonth && "is-outside",
                          cell.iso === todayIso && "is-today",
                          cell.iso === selectedDay && "is-selected",
                        )}
                        aria-label={`${cell.iso}${count ? `, ${count} item${count === 1 ? "" : "s"}` : ""}`}
                        aria-pressed={cell.iso === selectedDay}
                        onClick={() => setSelectedDay(cell.iso)}
                      >
                        {cell.day}
                        {count > 0 ? <i /> : null}
                      </button>
                    );
                  })}
                </div>

                <div className="dash-agenda">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">
                      {selectedLabel}
                      {selectedItems.length ? ` (${selectedItems.length})` : ""}
                    </Text>
                    <Button variant="plain" url="/dashboard/calendar">Open calendar</Button>
                  </InlineStack>
                  {calendarLoading ? (
                    <Text as="p" tone="subdued" variant="bodySm">Loading…</Text>
                  ) : selectedItems.length === 0 ? (
                    <Text as="p" tone="subdued" variant="bodySm">Nothing scheduled.</Text>
                  ) : (
                    selectedItems.slice(0, 4).map((item) => {
                      const badge = calendarStatusBadge(item.status);
                      return (
                        <button
                          type="button"
                          key={`${item.source}-${item.id}`}
                          className="dash-agenda__item"
                          onClick={() => router.push(item.url || "/dashboard/calendar")}
                        >
                          <span className="dash-agenda__time">
                            {item.startTime ? item.startTime.slice(0, 5) : "All day"}
                          </span>
                          <span className="dash-agenda__copy">
                            <strong>{item.title}</strong>
                            {item.subtitle ? <small>{item.subtitle}</small> : null}
                          </span>
                          {badge ? <Badge size="small" tone={badge.tone}>{badge.label}</Badge> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </BlockStack>
            </Card>

            {/* Notifications */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Notifications</Text>
                  <Button variant="plain" url="/dashboard/alerts">View all</Button>
                </InlineStack>

                {leadAlert ? (
                  <div className="dash-notice">
                    <p className="dash-notice__title">
                      {leadAlert.status === "Overdue" ? "Invoice overdue" : "Payment due soon"}:{" "}
                      #{leadAlert.invoiceNumber}
                    </p>
                    <p className="dash-notice__meta">
                      {leadAlert.customerName} ·{" "}
                      {money(leadAlert.amountOutstandingBase ?? leadAlert.amountOutstanding)}
                    </p>
                    <p className="dash-notice__meta">
                      {relativeTime(leadAlert.lastReminderSent ?? leadAlert.dueDate)}
                    </p>
                    <div className="dash-notice__action">
                      <Button size="slim" url="/dashboard/alerts">Follow up</Button>
                    </div>
                  </div>
                ) : (
                  <Text as="p" tone="subdued">
                    You&apos;re all caught up. Overdue and upcoming invoices will show up here.
                  </Text>
                )}

                {otherAlerts.map((alert) => (
                  <div className="dash-alert-row" key={alert.id}>
                    <span className="dash-alert-row__copy">
                      <strong>#{alert.invoiceNumber} · {alert.customerName}</strong>
                      <small>{money(alert.amountOutstandingBase ?? alert.amountOutstanding)}</small>
                    </span>
                    <Badge size="small" tone={alert.status === "Overdue" ? "critical" : "info"}>
                      {alert.status === "Overdue" ? "Overdue" : "Due soon"}
                    </Badge>
                  </div>
                ))}
              </BlockStack>
            </Card>
          </div>
        </div>
      </BlockStack>
    </AppPage>
  );
}
