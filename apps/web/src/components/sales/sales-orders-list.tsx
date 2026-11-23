"use client";

import {
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  EmptyState,
  Icon,
  Pagination,
  Select,
  SkeletonBodyText,
  Text,
  TextField,
} from "@shopify/polaris";
import { ReceiptIcon, SearchIcon } from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatCurrencyAmount } from "@/lib/currency-utils";
import { listQuotations, type Quotation } from "@/lib/quotations-api";
import { cn } from "@/lib/utils";

const PAGE_SIZES = ["10", "20", "50"];

type Filter = "all" | "to_invoice" | "invoiced";

interface Stats {
  count: number;
  totalValue: number;
  toInvoiceCount: number;
  toInvoiceValue: number;
  invoicedCount: number;
  invoicedValue: number;
  partialCount: number;
  oldestToInvoiceDays: number | null;
}

function parseDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`);
}

function daysSince(value: string) {
  const d = parseDate(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - d.getTime()) / 86_400_000));
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function SalesOrdersListPage() {
  const router = useRouter();
  const { formatOrgMoney, formatBaseMoney, baseCurrencyCode } = useOrgCurrency();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [orders, setOrders] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, filter, perPage, sortDir]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listQuotations({
        page,
        perPage,
        search: debouncedQuery || undefined,
        state: "confirmed",
        invoiceStatus: filter === "all" ? undefined : filter,
        sortBy: "quoteDate",
        sortDir,
      });
      // Same-day orders: newest number first (or oldest when sorting oldest first).
      const sorted = [...result.data].sort((a, b) => {
        const byDate = a.quoteDate.localeCompare(b.quoteDate);
        const byNumber = a.number.localeCompare(b.number, undefined, { numeric: true });
        return sortDir === "desc" ? -(byDate || byNumber) : byDate || byNumber;
      });
      setOrders(sorted);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sales orders");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, filter, page, perPage, sortDir]);

  // Totals across every confirmed order, not just the visible page.
  const loadStats = useCallback(async () => {
    try {
      const result = await listQuotations({ state: "confirmed", perPage: 100, sortBy: "quoteDate", sortDir: "asc" });
      const rows = result.data;
      const value = (q: Quotation) => parseFloat(q.amountTotalBase ?? "0") || 0;
      const toInvoice = rows.filter((q) => q.invoiceStatus !== "invoiced");
      const invoiced = rows.filter((q) => q.invoiceStatus === "invoiced");
      setStats({
        count: result.meta.total,
        totalValue: rows.reduce((s, q) => s + value(q), 0),
        toInvoiceCount: toInvoice.length,
        toInvoiceValue: toInvoice.reduce((s, q) => s + value(q), 0),
        invoicedCount: invoiced.length,
        invoicedValue: invoiced.reduce((s, q) => s + value(q), 0),
        partialCount: rows.filter((q) => q.invoiceStatus === "partial").length,
        oldestToInvoiceDays: toInvoice.length ? daysSince(toInvoice[0].quoteDate) : null,
      });
    } catch {
      // Summary stays empty; the list still works.
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const amountOf = (order: Quotation) =>
    order.currencyCode
      ? formatCurrencyAmount(order.amountTotal, { code: order.currencyCode, decimalPlaces: 2, symbol: "" })
      : formatOrgMoney(order.amountTotal);

  // Group the visible page by month, newest first.
  const months = useMemo(() => {
    const map = new Map<string, Quotation[]>();
    for (const order of orders) {
      const key = monthKey(order.quoteDate);
      const list = map.get(key) ?? [];
      list.push(order);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [orders]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const invoicedShare = stats && stats.totalValue > 0 ? (stats.invoicedValue / stats.totalValue) * 100 : 0;

  return (
    <AppPage
      backAction={{ content: "Home", url: "/dashboard" }}
      fullWidth
      primaryAction={{ content: "New quotation", onAction: () => router.push("/dashboard/sales/quotations/new") }}
      subtitle="Orders your customers have confirmed — deliver them, then invoice."
      title="Sales orders"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {/* Summary */}
        <section className="so-hero">
          <div className="so-hero__top">
            <div className="so-hero__main">
              <span className="so-hero__label">Ready to invoice</span>
              <span className="so-hero__value">{stats ? formatBaseMoney(stats.toInvoiceValue) : "…"}</span>
              <span className="so-hero__hint">
                {stats
                  ? stats.toInvoiceCount
                    ? `${stats.toInvoiceCount} order${stats.toInvoiceCount === 1 ? "" : "s"} waiting${
                        stats.oldestToInvoiceDays ? ` · oldest ${stats.oldestToInvoiceDays} days` : ""
                      }`
                    : "Everything confirmed has been invoiced"
                  : ""}
              </span>
            </div>
            {stats && stats.toInvoiceCount ? (
              <Button onClick={() => setFilter("to_invoice")}>Show orders to invoice</Button>
            ) : null}
          </div>

          <div className="so-hero__progress">
            <div className="so-hero__bar">
              <b style={{ width: `${invoicedShare}%` }} />
            </div>
            <div className="so-hero__legend">
              <span className="is-done">
                <i />
                Invoiced {stats ? formatBaseMoney(stats.invoicedValue) : "…"}
                <small>{stats ? ` · ${stats.invoicedCount} orders` : ""}</small>
              </span>
              <span className="is-todo">
                <i />
                To invoice {stats ? formatBaseMoney(stats.toInvoiceValue) : "…"}
                <small>{stats ? ` · ${stats.toInvoiceCount} orders` : ""}</small>
              </span>
              <span className="is-total">
                {stats ? `${stats.count} orders · ${formatBaseMoney(stats.totalValue)} total · avg ${formatBaseMoney(stats.count ? stats.totalValue / stats.count : 0)}` : ""}
              </span>
            </div>
          </div>
        </section>

        {/* Toolbar */}
        <div className="so-toolbar">
          <ButtonGroup variant="segmented">
            <Button pressed={filter === "all"} onClick={() => setFilter("all")}>
              {`All${stats ? ` ${stats.count}` : ""}`}
            </Button>
            <Button pressed={filter === "to_invoice"} onClick={() => setFilter("to_invoice")}>
              {`To invoice${stats ? ` ${stats.toInvoiceCount}` : ""}`}
            </Button>
            <Button pressed={filter === "invoiced"} onClick={() => setFilter("invoiced")}>
              {`Invoiced${stats ? ` ${stats.invoicedCount}` : ""}`}
            </Button>
          </ButtonGroup>
          <div className="so-toolbar__search">
            <TextField
              autoComplete="off"
              clearButton
              label="Search sales orders"
              labelHidden
              placeholder="Order number, customer or PO"
              prefix={<Icon source={SearchIcon} />}
              value={query}
              onChange={setQuery}
              onClearButtonClick={() => setQuery("")}
            />
          </div>
          <div className="so-toolbar__sort">
            <Select
              label="Sort"
              labelInline
              options={[
                { label: "Newest first", value: "desc" },
                { label: "Oldest first", value: "asc" },
              ]}
              value={sortDir}
              onChange={(value) => setSortDir(value as "desc" | "asc")}
            />
          </div>
        </div>

        {/* Ledger */}
        {loading && orders.length === 0 ? (
          <div className="so-month">
            <SkeletonBodyText lines={6} />
          </div>
        ) : orders.length === 0 ? (
          <div className="so-month">
            {debouncedQuery || filter !== "all" ? (
              <div className="so-none">
                <Text as="p" fontWeight="semibold">
                  {filter === "to_invoice" ? "Nothing left to invoice" : "No orders match"}
                </Text>
                <Text as="p" tone="subdued">
                  {filter === "to_invoice" ? "Every confirmed order has been invoiced." : "Try another filter or search."}
                </Text>
              </div>
            ) : (
              <EmptyState
                action={{ content: "View quotations", onAction: () => router.push("/dashboard/sales/quotations") }}
                heading="No sales orders yet"
                image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
              >
                <p>When a customer approves a quotation, confirm it and it becomes a sales order here.</p>
              </EmptyState>
            )}
          </div>
        ) : (
          <div className={cn("so-ledger", loading && "is-loading")}>
            {months.map(([key, list]) => {
              const subtotal = list.reduce((s, o) => s + (parseFloat(o.amountTotalBase ?? "0") || 0), 0);
              return (
                <section className="so-month" key={key}>
                  <header className="so-month__head">
                    <h2>{monthLabel(key)}</h2>
                    <span>
                      {list.length} order{list.length === 1 ? "" : "s"} · {formatBaseMoney(subtotal)}
                    </span>
                  </header>
                  <div className="so-month__rows">
                    {list.map((order) => {
                      const date = parseDate(order.quoteDate);
                      const invoiced = order.invoiceStatus === "invoiced";
                      const partial = order.invoiceStatus === "partial";
                      const waiting = !invoiced ? daysSince(order.quoteDate) : 0;
                      const viewHref = `/dashboard/sales/quotations/${order.id}`;
                      const name = order.customerName ?? "Customer";
                      const foreign = order.currencyCode && order.currencyCode !== baseCurrencyCode;
                      return (
                        <div className="so-row" key={order.id}>
                          <button className="so-row__open" type="button" onClick={() => router.push(viewHref)}>
                            <span className="so-date">
                              <small>{date.toLocaleDateString(undefined, { weekday: "short" })}</small>
                              <strong>{date.getDate()}</strong>
                            </span>
                            <span className="so-row__order">
                              <strong>{order.number}</strong>
                              <small>{order.customerReference ? `PO ${order.customerReference}` : "No customer PO"}</small>
                            </span>
                            <span className="so-row__cust">
                              <i>{initials(name)}</i>
                              <span>{name}</span>
                            </span>
                            <span className={cn("so-inv", invoiced ? "is-done" : partial ? "is-partial" : "is-todo")}>
                              <span className="so-inv__track">
                                <b />
                              </span>
                              <span className="so-inv__text">
                                {invoiced ? "Invoiced" : partial ? "Partly invoiced" : "To invoice"}
                                {!invoiced && waiting > 0 ? <small>{` · ${waiting}d`}</small> : null}
                              </span>
                            </span>
                            <span className="so-row__amount">
                              <strong>{amountOf(order)}</strong>
                              {foreign ? <small>≈ {formatBaseMoney(parseFloat(order.amountTotalBase) || 0)}</small> : null}
                            </span>
                          </button>
                          <div className="so-row__action">
                            {invoiced ? (
                              <Button variant="tertiary" onClick={() => router.push(viewHref)}>
                                View
                              </Button>
                            ) : (
                              <Button
                                icon={ReceiptIcon}
                                variant="primary"
                                onClick={() => router.push(`/dashboard/invoices/new?quotationId=${order.id}`)}
                              >
                                {partial ? "Invoice rest" : "Create invoice"}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {total > 0 ? (
          <div className="so-pager">
            <span className="so-pager__info">
              Showing <strong>{(page - 1) * perPage + 1}–{Math.min(page * perPage, total)}</strong> of{" "}
              <strong>{total}</strong> order{total === 1 ? "" : "s"} · {sortDir === "desc" ? "newest first" : "oldest first"}
            </span>
            <div className="so-pager__controls">
              <div className="so-pager__size">
                <Select
                  label="Rows per page"
                  labelInline
                  options={PAGE_SIZES.map((v) => ({ label: v, value: v }))}
                  value={String(perPage)}
                  onChange={(value) => setPerPage(Number(value))}
                />
              </div>
              <Pagination
                hasNext={page < totalPages}
                hasPrevious={page > 1}
                label={`Page ${page} of ${totalPages}`}
                onNext={() => setPage((p) => Math.min(p + 1, totalPages))}
                onPrevious={() => setPage((p) => Math.max(p - 1, 1))}
              />
            </div>
          </div>
        ) : null}
      </BlockStack>
    </AppPage>
  );
}
