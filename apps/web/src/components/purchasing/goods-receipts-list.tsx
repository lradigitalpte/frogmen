"use client";

import { Badge, Button, Icon, Pagination, Select, SkeletonBodyText, TextField } from "@shopify/polaris";
import { PackageIcon, SearchIcon } from "@shopify/polaris-icons";
import NextLink from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { useBranchLabels } from "@/hooks/use-branch-labels";
import { formatAppDate } from "@/lib/format-date";
import {
  listGoodsReceipts,
  listPurchaseOrders,
  type GoodsReceipt,
  type GoodsReceiptListSummary,
  type GoodsReceiptState,
  type ListGoodsReceiptsParams,
} from "@/lib/purchase-orders-api";
import { cn } from "@/lib/utils";

type TabId = "all" | GoodsReceiptState;
type SortMode = NonNullable<ListGoodsReceiptsParams["sort"]>;

const TABS: Array<{ id: TabId; label: string; key: keyof GoodsReceiptListSummary; alert?: boolean }> = [
  { id: "all", label: "All", key: "all" },
  { id: "draft", label: "To validate", key: "draft", alert: true },
  { id: "done", label: "Validated", key: "done" },
  { id: "cancelled", label: "Cancelled", key: "cancelled" },
];

const SORT_OPTIONS: Array<{ label: string; value: SortMode }> = [
  { label: "Newest first", value: "newest" },
  { label: "Receipt date", value: "receipt_date" },
  { label: "Receipt number", value: "number" },
];

const PAGE_SIZES = [16, 25, 50, 100];
const EMPTY_SUMMARY: GoodsReceiptListSummary = {
  all: 0,
  draft: 0,
  done: 0,
  cancelled: 0,
  doneThisMonth: 0,
  unitsThisMonth: "0",
};

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

function qty(value: string | number | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0";
}

function stateBadge(state: GoodsReceiptState) {
  if (state === "done") return <Badge tone="success">Validated</Badge>;
  if (state === "cancelled") return <Badge>Cancelled</Badge>;
  return <Badge tone="attention">Draft</Badge>;
}

export function GoodsReceiptsListPage() {
  const { showBranchColumn, branchLabel } = useBranchLabels();
  const [tab, setTab] = useState<TabId>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(16);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<GoodsReceiptListSummary>(EMPTY_SUMMARY);
  const [awaiting, setAwaiting] = useState<{ outstanding: number; overdue: number } | null>(null);
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

  // Purchase orders still waiting on goods, for the hero tile.
  useEffect(() => {
    void listPurchaseOrders({ perPage: 1, receiptStatus: "outstanding" })
      .then((result) =>
        setAwaiting({ outstanding: result.summary?.outstanding ?? result.meta.total, overdue: result.summary?.overdue ?? 0 }),
      )
      .catch(() => setAwaiting(null));
  }, []);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listGoodsReceipts({
        page,
        perPage,
        search: debouncedQuery || undefined,
        state: tab === "all" ? undefined : tab,
        sort,
      });
      if (request !== requestRef.current) return;
      setReceipts(result.data);
      setTotal(result.meta.total);
      setSummary(result.summary ?? EMPTY_SUMMARY);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load receipts");
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

  const first = loading && !loaded;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const filtersActive = tab !== "all" || Boolean(debouncedQuery);
  const flow = summary.all > 0 ? summary.all : 1;

  return (
    <AppPage
      fullWidth
      primaryAction={{ content: "Receive goods", url: "/dashboard/purchasing/orders" }}
      secondaryActions={[
        { content: "Purchase orders", url: "/dashboard/purchasing/orders" },
        { content: "Vendors", url: "/dashboard/purchasing/vendors" },
      ]}
      subtitle="Goods received against purchase orders. Validating a receipt adds the stock."
      title="Goods receipts"
    >
      <div className="pl gr">
        {error ? <div className="ac-error">{error}</div> : null}

        <section className={cn("pl-hero", loading && loaded && "is-loading")}>
          <div className="pl-hero__main">
            <span className="pl-hero__label">Received this month</span>
            <strong className="pl-hero__value">{first ? "…" : qty(summary.unitsThisMonth)}</strong>
            <span className="pl-hero__period">
              {first
                ? "Loading…"
                : summary.doneThisMonth === 0
                  ? "No receipts validated this month yet"
                  : `units across ${plural(summary.doneThisMonth, "validated receipt")}`}
            </span>
          </div>

          <div className="pl-hero__tiles">
            <button
              className={cn("ac-tile is-link", summary.draft > 0 && "is-alert")}
              type="button"
              onClick={() => chooseTab("draft")}
            >
              <span>To validate</span>
              <strong>{summary.draft}</strong>
              <small>{summary.draft > 0 ? "Drafts not in stock yet" : "Nothing waiting"}</small>
            </button>
            <NextLink className={cn("ac-tile is-link", (awaiting?.overdue ?? 0) > 0 && "is-alert")} href="/dashboard/purchasing/orders">
              <span>Awaiting goods</span>
              <strong>{awaiting ? awaiting.outstanding : "—"}</strong>
              <small>
                {!awaiting
                  ? "Purchase orders"
                  : awaiting.overdue > 0
                    ? `${awaiting.overdue} overdue`
                    : awaiting.outstanding > 0
                      ? "Open purchase orders"
                      : "Nothing on order"}
              </small>
            </NextLink>
            <button className="ac-tile is-link" type="button" onClick={() => chooseTab("done")}>
              <span>Validated</span>
              <strong>{summary.done}</strong>
              <small>All-time receipts</small>
            </button>
          </div>

          {summary.all > 0 ? (
            <div className="pl-hero__bar">
              <div className="st-split">
                <b className="is-ok" style={{ width: `${(summary.done / flow) * 100}%` }} />
                <b className="is-low" style={{ width: `${(summary.draft / flow) * 100}%` }} />
                <b className="is-muted" style={{ width: `${(summary.cancelled / flow) * 100}%` }} />
              </div>
              <div className="pl-hero__legend">
                <span>
                  <i className="st-dot is-ok" /> Validated {summary.done}
                </span>
                <span>
                  <i className="st-dot is-low" /> Draft {summary.draft}
                </span>
                <span>
                  <i className="st-dot is-muted" /> Cancelled {summary.cancelled}
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="ex-surface">
          <div className="st-toolbar">
            <div className="iv-filters">
              {TABS.map((t) => {
                const count = summary[t.key] as number;
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
                  label="Search receipts"
                  labelHidden
                  placeholder="Receipt, PO number, vendor or ref"
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
          ) : receipts.length === 0 ? (
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Icon source={PackageIcon} />
              </span>
              <strong>
                {debouncedQuery
                  ? `No receipts match “${debouncedQuery}”`
                  : summary.all === 0
                    ? "No receipts yet"
                    : tab === "draft"
                      ? "Nothing waiting to validate"
                      : "Nothing in this view"}
              </strong>
              <p>
                {summary.all === 0
                  ? "Open a confirmed purchase order and choose Receive when the goods arrive."
                  : "Try another search or status."}
              </p>
              {summary.all === 0 ? (
                <Button url="/dashboard/purchasing/orders" variant="primary">
                  Go to purchase orders
                </Button>
              ) : filtersActive ? (
                <Button onClick={clearFilters}>Show all receipts</Button>
              ) : null}
            </div>
          ) : (
            <ul className={cn("ex-list", loading && "st-dim")}>
              <li className={cn("gr-row is-head", showBranchColumn && "has-branch")} aria-hidden>
                <span>Receipt</span>
                <span>Purchase order</span>
                <span>Received</span>
                {showBranchColumn ? <span>Branch</span> : null}
                <span>Items</span>
                <span>Status</span>
                <span />
              </li>
              {receipts.map((receipt) => {
                const url = `/dashboard/purchasing/receipts/${receipt.id}`;
                const vendor = receipt.vendorName ?? "Vendor";
                const lines = receipt.lineCount ?? 0;
                const products = receipt.productNames ?? [];
                const warehousesLabel = (receipt.warehouseNames ?? []).join(", ");
                const serials = receipt.serialCount ?? 0;
                return (
                  <li
                    className={cn("gr-row", showBranchColumn && "has-branch", receipt.state === "cancelled" && "is-muted")}
                    key={receipt.id}
                  >
                    <NextLink className="gr-row__number" href={url}>
                      <strong>{receipt.number}</strong>
                      <small>
                        {lines > 0
                          ? `${products.join(", ")}${lines > products.length ? ` +${lines - products.length} more` : ""}`
                          : "No lines"}
                      </small>
                    </NextLink>

                    <span className="gr-row__po">
                      <NextLink href={`/dashboard/purchasing/orders/${receipt.purchaseOrderId}`}>
                        {receipt.purchaseOrderNumber ?? "Purchase order"}
                      </NextLink>
                      <span className="wr-customer">
                        <i aria-hidden>{vendor.charAt(0).toUpperCase()}</i>
                        {receipt.vendorId ? (
                          <NextLink href={`/dashboard/purchasing/vendors/${receipt.vendorId}`}>{vendor}</NextLink>
                        ) : (
                          <span>{vendor}</span>
                        )}
                      </span>
                    </span>

                    <span className="gr-row__date">
                      <span>{formatAppDate(receipt.receiptDate) || receipt.receiptDate}</span>
                      {warehousesLabel ? <small>Into {warehousesLabel}</small> : null}
                    </span>

                    {showBranchColumn ? (
                      <span className="gr-row__branch">{receipt.branchId ? branchLabel(receipt.branchId) : "—"}</span>
                    ) : null}

                    <span className="gr-row__qty">
                      <strong>{qty(receipt.totalQuantity)} {Number(receipt.totalQuantity) === 1 ? "unit" : "units"}</strong>
                      <small>
                        {plural(lines, "line")}
                        {serials > 0 ? ` · ${plural(serials, "serial")}` : ""}
                      </small>
                    </span>

                    <span className="gr-row__status">
                      {stateBadge(receipt.state)}
                      <small>
                        {receipt.state === "done"
                          ? receipt.validatedAt
                            ? `Stock added ${formatAppDate(receipt.validatedAt)}`
                            : "Stock added"
                          : receipt.state === "draft"
                            ? "Not in stock yet"
                            : "No stock change"}
                      </small>
                    </span>

                    <span className="gr-row__actions">
                      {receipt.state === "draft" ? (
                        <Button size="slim" url={url} variant="primary">
                          Validate
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
                of <strong>{total}</strong> receipt{total === 1 ? "" : "s"}
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
          Receipts start as drafts when you choose Receive on a purchase order. Validating a draft adds the stock to each
          line&apos;s warehouse.
        </p>
      </div>
    </AppPage>
  );
}
