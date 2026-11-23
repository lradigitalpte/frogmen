"use client";

import {
  Banner,
  BlockStack,
  Button,
  EmptyState,
  Icon,
  IndexTable,
  Pagination,
  Select,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useBranchLabels } from "@/hooks/use-branch-labels";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { formatCurrencyAmount } from "@/lib/currency-utils";
import { formatAppDate } from "@/lib/format-date";
import { listInvoices, type Invoice } from "@/lib/invoices-api";
import { cn } from "@/lib/utils";
import { computeOutstandingInBase } from "@frog1/shared";

type Filter = "all" | "draft" | "unpaid" | "overdue" | "paid" | "cancelled";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unpaid", label: "Unpaid" },
  { id: "overdue", label: "Overdue" },
  { id: "draft", label: "Drafts" },
  { id: "paid", label: "Paid" },
  { id: "cancelled", label: "Cancelled" },
];

const SUB_PAGES = [
  { id: "invoices", content: "Invoices", url: "/dashboard/invoices" },
  { id: "credit-notes", content: "Credit notes", url: "/dashboard/invoices/credit-notes" },
  { id: "payments", content: "Payments", url: "/dashboard/invoices/payments" },
];

function daysFromToday(date: string) {
  const target = new Date(`${date.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const outstandingBase = (inv: Invoice) =>
  computeOutstandingInBase({
    amountTotal: inv.amountTotal,
    amountPaid: inv.amountPaid ?? 0,
    amountTotalBase: inv.amountTotalBase,
    exchangeRate: inv.exchangeRate,
  });

function isOverdue(inv: Invoice) {
  return inv.status === "posted" && Boolean(inv.dueDate) && daysFromToday(inv.dueDate) < 0;
}

export function InvoicesListPage() {
  const router = useRouter();
  const { formatBaseMoney, resolveCurrency, baseCurrencyCode } = useOrgCurrency();
  const { showBranchColumn, branchLabel } = useBranchLabels();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInvoices(await listInvoices());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [query, filter, sortDir, perPage]);

  // ── Numbers ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const posted = invoices.filter((i) => i.status === "posted");
    const paid = invoices.filter((i) => i.status === "paid");
    const overdue = posted.filter(isOverdue);
    const dueSoon = posted.filter((i) => i.dueDate && daysFromToday(i.dueDate) >= 0 && daysFromToday(i.dueDate) <= 15);
    const outstanding = posted.reduce((s, i) => s + outstandingBase(i), 0);
    const collected =
      paid.reduce((s, i) => s + i.amountTotalBase, 0) + posted.reduce((s, i) => s + (i.amountTotalBase - outstandingBase(i)), 0);
    const billed = outstanding + collected;
    return {
      outstanding,
      outstandingCount: posted.length,
      overdue: overdue.reduce((s, i) => s + outstandingBase(i), 0),
      overdueCount: overdue.length,
      dueSoon: dueSoon.reduce((s, i) => s + outstandingBase(i), 0),
      dueSoonCount: dueSoon.length,
      collected,
      collectedShare: billed > 0 ? (collected / billed) * 100 : 0,
      counts: {
        all: invoices.length,
        draft: invoices.filter((i) => i.status === "draft").length,
        unpaid: posted.length,
        overdue: overdue.length,
        paid: paid.length,
        cancelled: invoices.filter((i) => i.status === "cancelled").length,
      } as Record<Filter, number>,
    };
  }, [invoices]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices
      .filter((inv) => {
        if (filter === "draft" && inv.status !== "draft") return false;
        if (filter === "unpaid" && inv.status !== "posted") return false;
        if (filter === "overdue" && !isOverdue(inv)) return false;
        if (filter === "paid" && inv.status !== "paid") return false;
        if (filter === "cancelled" && inv.status !== "cancelled") return false;
        if (!q) return true;
        return [inv.number, inv.customerName, inv.customerEmail, inv.customerReference]
          .some((v) => (v || "").toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const byDate = a.invoiceDate.localeCompare(b.invoiceDate);
        const byNumber = a.number.localeCompare(b.number, undefined, { numeric: true });
        return sortDir === "desc" ? -(byDate || byNumber) : byDate || byNumber;
      });
  }, [invoices, query, filter, sortDir]);

  const totalPages = Math.max(1, Math.ceil(visible.length / perPage));
  const pageItems = visible.slice((page - 1) * perPage, page * perPage);

  const money = (inv: Invoice, amount: number) => formatCurrencyAmount(amount, resolveCurrency(inv.currencyId));

  return (
    <AppPage
      backAction={{ content: "Home", url: "/dashboard" }}
      fullWidth
      primaryAction={{ content: "New invoice", onAction: () => router.push("/dashboard/invoices/new") }}
      subtitle="Bill customers, track what's owed and record payments as they come in."
      title="Invoices"
    >
      <BlockStack gap="400">
        <div className="iv-subnav">
          <Tabs
            selected={0}
            tabs={SUB_PAGES.map(({ id, content }) => ({ id, content }))}
            onSelect={(index) => {
              if (index !== 0) router.push(SUB_PAGES[index].url);
            }}
          />
        </div>

        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {/* Summary */}
        <section className="iv-hero">
          <div className="iv-hero__main">
            <span className="iv-hero__label">Outstanding</span>
            <span className="iv-hero__value">{loading ? "…" : formatBaseMoney(stats.outstanding)}</span>
            <span className="iv-hero__hint">
              {stats.outstandingCount
                ? `across ${stats.outstandingCount} unpaid invoice${stats.outstandingCount === 1 ? "" : "s"}`
                : "Nothing owed to you right now"}
            </span>
          </div>

          <div className="iv-hero__stats">
            <button
              className={stats.overdueCount ? "is-alert" : undefined}
              type="button"
              onClick={() => setFilter("overdue")}
            >
              <span>Overdue</span>
              <strong>{formatBaseMoney(stats.overdue)}</strong>
              <small>{stats.overdueCount ? `${stats.overdueCount} past due` : "none late"}</small>
            </button>
            <button type="button" onClick={() => setFilter("unpaid")}>
              <span>Due in 15 days</span>
              <strong>{formatBaseMoney(stats.dueSoon)}</strong>
              <small>{stats.dueSoonCount} invoice{stats.dueSoonCount === 1 ? "" : "s"}</small>
            </button>
            <div className="iv-hero__gauge">
              <span>Collected</span>
              <strong>{formatBaseMoney(stats.collected)}</strong>
              <i>
                <b style={{ width: `${stats.collectedShare}%` }} />
              </i>
              <small>{Math.round(stats.collectedShare)}% of everything billed</small>
            </div>
          </div>
        </section>

        <div className="iv-surface">
          <div className="iv-toolbar">
            <div className="iv-filters" role="tablist" aria-label="Invoice status">
              {FILTERS.map((f) => (
                <button
                  aria-selected={filter === f.id}
                  className={cn("iv-filter", filter === f.id && "is-active", f.id === "overdue" && stats.counts.overdue > 0 && "is-alert")}
                  key={f.id}
                  role="tab"
                  type="button"
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span>{stats.counts[f.id]}</span>
                </button>
              ))}
            </div>
            <div className="iv-toolbar__right">
              <div className="iv-toolbar__search">
                <TextField
                  autoComplete="off"
                  clearButton
                  label="Search invoices"
                  labelHidden
                  placeholder="Invoice number, customer or PO"
                  prefix={<Icon source={SearchIcon} />}
                  value={query}
                  onChange={setQuery}
                  onClearButtonClick={() => setQuery("")}
                />
              </div>
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

          <IndexTable
            emptyState={
              query || filter !== "all" ? (
                <div className="iv-none">
                  <Text as="p" fontWeight="semibold">
                    {filter === "overdue" ? "Nothing overdue" : filter === "unpaid" ? "Everything is paid" : "No invoices match"}
                  </Text>
                  <Text as="p" tone="subdued">
                    {filter === "overdue" || filter === "unpaid" ? "Nice — no money is waiting to be collected." : "Try another filter or search."}
                  </Text>
                </div>
              ) : (
                <EmptyState
                  action={{ content: "Create invoice", onAction: () => router.push("/dashboard/invoices/new") }}
                  heading="No invoices yet"
                  image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
                >
                  <p>Invoice a confirmed sales order, or create one from scratch.</p>
                </EmptyState>
              )
            }
            headings={[
              { title: "Invoice" },
              { title: "Customer" },
              { title: "Due" },
              ...(showBranchColumn ? [{ title: "Branch" }] : []),
              { title: "Payment" },
              { title: "Amount", alignment: "end" as const },
              { title: "", hidden: true },
            ]}
            itemCount={pageItems.length}
            loading={loading}
            resourceName={{ singular: "invoice", plural: "invoices" }}
            selectable={false}
          >
            {pageItems.map((inv, index) => {
              const href = `/dashboard/invoices/${inv.id}`;
              const paidAmount = Math.min(inv.amountPaid ?? 0, inv.amountTotal);
              const paidShare = inv.status === "paid" ? 100 : inv.amountTotal > 0 ? (paidAmount / inv.amountTotal) * 100 : 0;
              const balance = inv.status === "paid" ? 0 : Math.max(0, inv.amountTotal - paidAmount);
              const days = inv.dueDate ? daysFromToday(inv.dueDate) : null;
              const late = isOverdue(inv);
              const foreign = inv.currencyCode && inv.currencyCode !== baseCurrencyCode;

              let due: React.ReactNode;
              if (inv.status === "paid") due = <span className="iv-due is-done">Paid</span>;
              else if (inv.status === "cancelled") due = <span className="iv-due is-muted">Cancelled</span>;
              else if (inv.status === "draft") due = <span className="iv-due is-muted">Not issued yet</span>;
              else if (days === null) due = <span className="iv-due">No due date</span>;
              else if (days < 0) due = <span className="iv-due is-late">{Math.abs(days)}d overdue</span>;
              else if (days === 0) due = <span className="iv-due is-soon">Due today</span>;
              else due = <span className={cn("iv-due", days <= 7 && "is-soon")}>Due in {days}d</span>;

              return (
                <IndexTable.Row
                  id={inv.id}
                  key={inv.id}
                  position={index}
                  tone={late ? "critical" : undefined}
                  onClick={() => router.push(href)}
                >
                  <IndexTable.Cell>
                    <div className={cn("iv-num", inv.status === "cancelled" && "is-cancelled")}>
                      <strong>{inv.number}</strong>
                      <small>
                        {formatAppDate(inv.invoiceDate)}
                        {inv.customerReference ? ` · PO ${inv.customerReference}` : ""}
                      </small>
                    </div>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <div className="iv-cust">
                      <i>{initials(inv.customerName)}</i>
                      <span>
                        <strong>{inv.customerName}</strong>
                        {inv.customerEmail ? <small>{inv.customerEmail}</small> : null}
                      </span>
                    </div>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <div className="iv-duecell">
                      {due}
                      {inv.dueDate && inv.status !== "draft" ? <small>{formatAppDate(inv.dueDate)}</small> : null}
                    </div>
                  </IndexTable.Cell>
                  {showBranchColumn ? <IndexTable.Cell>{branchLabel(inv.branchId)}</IndexTable.Cell> : null}
                  <IndexTable.Cell>
                    {inv.status === "draft" || inv.status === "cancelled" ? (
                      <Text as="span" tone="subdued" variant="bodySm">
                        —
                      </Text>
                    ) : (
                      <div className={cn("iv-pay", inv.status === "paid" && "is-done", late && "is-late")}>
                        <span className="iv-pay__track">
                          <b style={{ width: `${paidShare}%` }} />
                        </span>
                        <small>
                          {inv.status === "paid"
                            ? "Fully paid"
                            : paidAmount > 0
                              ? `${money(inv, balance)} left`
                              : "Nothing paid yet"}
                        </small>
                      </div>
                    )}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <div className="iv-amount">
                      <strong>{money(inv, inv.amountTotal)}</strong>
                      {foreign ? <small>≈ {formatBaseMoney(inv.amountTotalBase)}</small> : null}
                    </div>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <div className="iv-action" onClick={(event) => event.stopPropagation()}>
                      {inv.status === "posted" ? (
                        <Button size="slim" variant={late ? "primary" : "secondary"} onClick={() => router.push(href)}>
                          Record payment
                        </Button>
                      ) : inv.status === "draft" ? (
                        <Button size="slim" onClick={() => router.push(href)}>
                          Finish draft
                        </Button>
                      ) : (
                        <Button size="slim" variant="tertiary" onClick={() => router.push(href)}>
                          View
                        </Button>
                      )}
                    </div>
                  </IndexTable.Cell>
                </IndexTable.Row>
              );
            })}
          </IndexTable>

          {visible.length > 0 ? (
            <div className="iv-pager">
              <span>
                Showing <strong>{(page - 1) * perPage + 1}–{Math.min(page * perPage, visible.length)}</strong> of{" "}
                <strong>{visible.length}</strong> invoice{visible.length === 1 ? "" : "s"}
              </span>
              <div className="iv-pager__controls">
                <Select
                  label="Rows per page"
                  labelInline
                  options={["10", "20", "50"].map((v) => ({ label: v, value: v }))}
                  value={String(perPage)}
                  onChange={(value) => setPerPage(Number(value))}
                />
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
        </div>
      </BlockStack>
    </AppPage>
  );
}
