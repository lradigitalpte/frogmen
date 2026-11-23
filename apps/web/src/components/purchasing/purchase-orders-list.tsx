"use client";

import { Badge, Button, Icon, Pagination, Select, SkeletonBodyText, TextField } from "@shopify/polaris";
import { OrderIcon, SearchIcon } from "@shopify/polaris-icons";
import NextLink from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { formatMoney } from "@/components/sales/format-money";
import { useBranchLabels } from "@/hooks/use-branch-labels";
import { formatAppDate } from "@/lib/format-date";
import {
  listPurchaseOrders,
  type ListPurchaseOrdersParams,
  type PurchaseOrder,
  type PurchaseOrderSummary,
} from "@/lib/purchase-orders-api";
import { cn } from "@/lib/utils";

type TabId = "all" | "draft" | "outstanding" | "partial" | "received" | "cancelled";
type SortMode = "newest" | "order_date" | "number" | "amount";

const TABS: Array<{ id: TabId; label: string; key: keyof PurchaseOrderSummary; alert?: boolean }> = [
  { id: "all", label: "All", key: "all" },
  { id: "draft", label: "Drafts", key: "draft" },
  { id: "outstanding", label: "Awaiting goods", key: "outstanding", alert: true },
  { id: "partial", label: "Partly received", key: "partial" },
  { id: "received", label: "Received", key: "received" },
  { id: "cancelled", label: "Cancelled", key: "cancelled" },
];

const SORT_OPTIONS: Array<{ label: string; value: SortMode }> = [
  { label: "Newest first", value: "newest" },
  { label: "Order date", value: "order_date" },
  { label: "PO number", value: "number" },
  { label: "Largest total", value: "amount" },
];

const PAGE_SIZES = [16, 25, 50, 100];
const EMPTY_SUMMARY: PurchaseOrderSummary = {
  all: 0,
  draft: 0,
  confirmed: 0,
  cancelled: 0,
  outstanding: 0,
  partial: 0,
  received: 0,
  overdue: 0,
};

function tabParams(tab: TabId): Pick<ListPurchaseOrdersParams, "state" | "receiptStatus"> {
  if (tab === "draft") return { state: "draft" };
  if (tab === "outstanding") return { receiptStatus: "outstanding" };
  if (tab === "partial") return { state: "confirmed", receiptStatus: "partial" };
  if (tab === "received") return { receiptStatus: "received" };
  if (tab === "cancelled") return { state: "cancelled" };
  return {};
}

function sortParams(sort: SortMode): Pick<ListPurchaseOrdersParams, "sortBy" | "sortDir"> {
  if (sort === "order_date") return { sortBy: "orderDate", sortDir: "desc" };
  if (sort === "number") return { sortBy: "number", sortDir: "desc" };
  if (sort === "amount") return { sortBy: "amountTotal", sortDir: "desc" };
  return { sortBy: "createdAt", sortDir: "desc" };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** One status that combines the document state and the receipt progress. */
function stage(order: PurchaseOrder): {
  label: string;
  tone?: "success" | "warning" | "attention" | "info" | "critical";
  step: number;
} {
  if (order.state === "cancelled") return { label: "Cancelled", step: 0 };
  if (order.state === "draft") return { label: "Draft", step: 1 };
  if (order.receiptStatus === "received") return { label: "Received", tone: "success", step: 4 };
  if (order.receiptStatus === "partial") return { label: "Partly received", tone: "warning", step: 3 };
  if (order.receiptStatus === "to_receive") return { label: "Awaiting goods", tone: "attention", step: 2 };
  return { label: "Confirmed", tone: "info", step: 2 };
}

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

export function PurchaseOrdersListPage() {
  const { showBranchColumn, branchLabel } = useBranchLabels();
  const [tab, setTab] = useState<TabId>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(16);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<PurchaseOrderSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listPurchaseOrders({
        page,
        perPage,
        search: debouncedQuery || undefined,
        ...tabParams(tab),
        ...sortParams(sort),
      });
      if (request !== requestRef.current) return;
      setOrders(result.data);
      setTotal(result.meta.total);
      setSummary(result.summary ?? EMPTY_SUMMARY);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load purchase orders");
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [debouncedQuery, page, perPage, sort, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  function chooseTab(next: TabId) {
    setTab(next);
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setTab("all");
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const first = loading && !loaded;
  const filtersActive = Boolean(debouncedQuery) || tab !== "all";
  const now = today();
  const active = summary.all - summary.cancelled;
  const flow = active > 0 ? active : 1;
  const fullyReceived = summary.received;
  const waiting = summary.outstanding - summary.partial;

  return (
    <AppPage
      fullWidth
      primaryAction={{ content: "New purchase order", url: "/dashboard/purchasing/orders/new" }}
      secondaryActions={[
        { content: "Vendors", url: "/dashboard/purchasing/vendors" },
        { content: "Receipts", url: "/dashboard/purchasing/receipts" },
      ]}
      subtitle="Order stock from vendors and receive it into inventory."
      title="Purchase orders"
    >
      <div className="pl po">
        {error ? <div className="ac-error">{error}</div> : null}

        <section className={cn("pl-hero", loading && loaded && "is-loading")}>
          <div className="pl-hero__main">
            <span className="pl-hero__label">Waiting on vendors</span>
            <strong className="pl-hero__value">{first ? "…" : summary.outstanding.toLocaleString()}</strong>
            <span className="pl-hero__period">
              {first
                ? "Loading…"
                : summary.outstanding === 0
                  ? "Nothing on order right now"
                  : `${plural(summary.outstanding, "order")} confirmed and not fully received`}
            </span>
          </div>

          <div className="pl-hero__tiles">
            <button
              className="ac-tile is-link"
              type="button"
              onClick={() => chooseTab("draft")}
            >
              <span>Drafts</span>
              <strong>{summary.draft}</strong>
              <small>{summary.draft > 0 ? "Confirm to send to the vendor" : "None waiting"}</small>
            </button>
            <button className="ac-tile is-link" type="button" onClick={() => chooseTab("partial")}>
              <span>Partly received</span>
              <strong>{summary.partial}</strong>
              <small>Some lines still to come</small>
            </button>
            <button
              className={cn("ac-tile is-link", summary.overdue > 0 && "is-alert")}
              type="button"
              onClick={() => chooseTab("outstanding")}
            >
              <span>Overdue</span>
              <strong>{summary.overdue}</strong>
              <small>{summary.overdue > 0 ? "Past the expected date" : "Nothing late"}</small>
            </button>
          </div>

          {active > 0 ? (
            <div className="pl-hero__bar">
              <div className="st-split">
                <b className="is-ok" style={{ width: `${(fullyReceived / flow) * 100}%` }} />
                <b className="is-low" style={{ width: `${(summary.outstanding / flow) * 100}%` }} />
                <b className="is-muted" style={{ width: `${(summary.draft / flow) * 100}%` }} />
              </div>
              <div className="pl-hero__legend">
                <span>
                  <i className="st-dot is-ok" /> Received {fullyReceived}
                </span>
                <span>
                  <i className="st-dot is-low" /> On order {summary.outstanding}
                  {summary.partial > 0 ? ` (${waiting} waiting, ${summary.partial} partly in)` : ""}
                </span>
                <span>
                  <i className="st-dot is-muted" /> Draft {summary.draft}
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="ex-surface">
          <div className="st-toolbar">
            <div className="iv-filters">
              {TABS.map((t) => {
                const count = summary[t.key];
                return (
                  <button
                    className={cn("iv-filter", tab === t.id && "is-active", t.alert && count > 0 && "is-alert")}
                    key={t.id}
                    type="button"
                    onClick={() => chooseTab(t.id)}
                  >
                    {t.label} <span>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="st-toolbar__controls">
              <div className="st-toolbar__search">
                <TextField
                  autoComplete="off"
                  clearButton
                  label="Search purchase orders"
                  labelHidden
                  placeholder="PO number, vendor or reference"
                  prefix={<Icon source={SearchIcon} />}
                  value={query}
                  onChange={setQuery}
                  onClearButtonClick={() => setQuery("")}
                />
              </div>
              <Select
                label="Sort"
                labelInline
                options={SORT_OPTIONS}
                value={sort}
                onChange={(value) => {
                  setSort(value as SortMode);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {first ? (
            <div className="ex-pad">
              <SkeletonBodyText lines={8} />
            </div>
          ) : orders.length === 0 ? (
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Icon source={OrderIcon} />
              </span>
              <strong>
                {debouncedQuery
                  ? `No purchase orders match “${debouncedQuery}”`
                  : summary.all === 0
                    ? "No purchase orders yet"
                    : "Nothing in this view"}
              </strong>
              <p>
                {summary.all === 0
                  ? "Create a purchase order to order stock from a vendor."
                  : "Try another search or status."}
              </p>
              {summary.all === 0 ? (
                <Button url="/dashboard/purchasing/orders/new" variant="primary">
                  New purchase order
                </Button>
              ) : filtersActive ? (
                <Button onClick={clearFilters}>Show all purchase orders</Button>
              ) : null}
            </div>
          ) : (
            <ul className={cn("ex-list", loading && "st-dim")}>
              <li className={cn("po-row is-head", showBranchColumn && "has-branch")} aria-hidden>
                <span>Purchase order</span>
                <span>Vendor</span>
                <span>Dates</span>
                {showBranchColumn ? <span>Branch</span> : null}
                <span>Status</span>
                <span>Total</span>
                <span />
              </li>
              {orders.map((order) => {
                const url = `/dashboard/purchasing/orders/${order.id}`;
                const st = stage(order);
                const waitingGoods = order.state === "confirmed" && (order.receiptStatus === "to_receive" || order.receiptStatus === "partial");
                const overdue = waitingGoods && Boolean(order.expectedDate) && order.expectedDate!.slice(0, 10) < now;
                const ref = order.vendorReference || order.internalReference;
                const vendor = order.vendorName ?? "Vendor";
                return (
                  <li
                    className={cn("po-row", showBranchColumn && "has-branch", order.state === "cancelled" && "is-muted")}
                    key={order.id}
                  >
                    <NextLink className="po-row__number" href={url}>
                      <strong>{order.number}</strong>
                      {ref ? <small>Ref {ref}</small> : null}
                    </NextLink>

                    <span className="wr-customer">
                      <i aria-hidden>{vendor.charAt(0).toUpperCase()}</i>
                      <NextLink href={`/dashboard/purchasing/vendors/${order.vendorId}`}>{vendor}</NextLink>
                    </span>

                    <span className="po-row__dates">
                      <span>{formatAppDate(order.orderDate) || order.orderDate}</span>
                      {order.expectedDate ? (
                        <small className={cn(overdue && "is-overdue")}>
                          {overdue ? "Overdue · expected " : "Expected "}
                          {formatAppDate(order.expectedDate)}
                        </small>
                      ) : waitingGoods ? (
                        <small>No expected date</small>
                      ) : null}
                    </span>

                    {showBranchColumn ? <span className="po-row__branch">{branchLabel(order.branchId)}</span> : null}

                    <span className="po-row__status">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {st.step > 0 ? (
                        <span className="po-steps" aria-label={`Step ${st.step} of 4`}>
                          {[1, 2, 3, 4].map((n) => (
                            <b className={cn(n <= st.step && "is-on")} key={n} />
                          ))}
                        </span>
                      ) : null}
                    </span>

                    <span className="po-row__total">
                      <strong>{formatMoney(order.amountTotal, order.currencyCode)}</strong>
                      {Number(order.amountTax) > 0 ? (
                        <small>incl. {formatMoney(order.amountTax, order.currencyCode)} tax</small>
                      ) : null}
                    </span>

                    <span className="po-row__actions">
                      {waitingGoods ? (
                        <Button size="slim" url={url} variant="primary">
                          Receive
                        </Button>
                      ) : order.state === "draft" ? (
                        <Button size="slim" url={url}>
                          Review
                        </Button>
                      ) : (
                        <Button size="slim" url={url}>
                          Open
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {!first && total > 0 ? (
            <div className="iv-pager">
              <span>
                Showing{" "}
                <strong>
                  {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, total)}
                </strong>{" "}
                of <strong>{total}</strong> purchase order{total === 1 ? "" : "s"}
                {filtersActive ? (
                  <>
                    {" "}
                    ·{" "}
                    <button className="st-link" type="button" onClick={clearFilters}>
                      Show all
                    </button>
                  </>
                ) : null}
              </span>
              <div className="iv-pager__controls">
                <div className="ex-perpage">
                  <Select
                    label="Rows per page"
                    labelInline
                    options={PAGE_SIZES.map((n) => ({ label: String(n), value: String(n) }))}
                    value={String(perPage)}
                    onChange={(value) => {
                      setPerPage(Number(value));
                      setPage(1);
                    }}
                  />
                </div>
                <Pagination
                  hasNext={safePage < totalPages}
                  hasPrevious={safePage > 1}
                  label={`${safePage} / ${totalPages}`}
                  onNext={() => setPage(safePage + 1)}
                  onPrevious={() => setPage(safePage - 1)}
                />
              </div>
            </div>
          ) : null}
        </section>

        <p className="pl-foot">
          Draft → confirmed → goods received. Receiving creates a receipt and adds the stock to the warehouse on each
          line.
        </p>
      </div>
    </AppPage>
  );
}
