"use client";

import { Badge, Button, Icon, InlineStack, Pagination, Select, SkeletonBodyText, TextField } from "@shopify/polaris";
import { AlertTriangleIcon, InventoryIcon, SearchIcon } from "@shopify/polaris-icons";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { currencyById, formatCurrencyAmount } from "@/lib/currency-utils";
import { formatQuantity } from "@/lib/format-quantity";
import { formatSerialSummaryPreview, isSerialSummaryTruncated } from "@/lib/format-serial-summary";
import { listStock } from "@/lib/products-api";
import { cn } from "@/lib/utils";
import { listWarehouses } from "@/lib/warehouses-api";
import { productArea } from "@/lib/product-areas";
import type { ProductUsageType, StockOverviewRow, StockSort, StockStatusFilter, StockSummary } from "@/types/product";
import type { Warehouse } from "@/types/warehouse";

const PAGE_SIZES = [10, 25, 50, 100];

const STATUS_FILTERS: Array<{ id: StockStatusFilter; label: string; key: keyof StockSummary | null; alert?: boolean }> = [
  { id: "all", label: "All", key: "lines" },
  { id: "in_stock", label: "In stock", key: "inStock" },
  { id: "low_stock", label: "Low stock", key: "lowStock", alert: true },
  { id: "out_of_stock", label: "Out of stock", key: "outOfStock", alert: true },
  { id: "serialized", label: "Serialized", key: "serialized" },
  { id: "bulk", label: "Bulk", key: "bulk" },
];

const SORT_OPTIONS: Array<{ label: string; value: StockSort }> = [
  { label: "Recently updated", value: "recent" },
  { label: "Product name (A–Z)", value: "name" },
  { label: "Lowest quantity first", value: "qty_asc" },
  { label: "Highest quantity first", value: "qty_desc" },
];

const EMPTY_SUMMARY: StockSummary = {
  lines: 0,
  units: 0,
  inStock: 0,
  lowStock: 0,
  outOfStock: 0,
  serialized: 0,
  bulk: 0,
  assignedUnits: 0,
  products: 0,
  warehouses: 0,
  lowStockThreshold: 2,
};

function plural(n: number, word: string, many = `${word}s`) {
  return `${formatQuantity(String(n))} ${n === 1 ? word : many}`;
}

export function StockOverviewPage() {
  const { currencies, catalogCurrencyId } = useOrgCurrency();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [usageType, setUsageType] = useState<ProductUsageType | "">("");
  const [status, setStatus] = useState<StockStatusFilter>("all");
  const [sort, setSort] = useState<StockSort>("recent");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZES[1]);
  const [rows, setRows] = useState<StockOverviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<StockSummary>(EMPTY_SUMMARY);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
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

  useEffect(() => {
    void listWarehouses({ perPage: 100 })
      .then((result) => setWarehouses(result.data))
      .catch(() => setWarehouses([]));
  }, []);

  const loadStock = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listStock({
        page,
        perPage,
        search: debouncedQuery || undefined,
        warehouseId: warehouseFilter || undefined,
        usageType: usageType || undefined,
        status: status === "all" ? undefined : status,
        sort,
      });
      if (request !== requestRef.current) return;
      setRows(result.data);
      setTotal(result.meta.total);
      setSummary(result.summary ?? EMPTY_SUMMARY);
      // If filters shrank the result set, jump back to the last real page.
      if (result.data.length === 0 && result.meta.total > 0 && page > 1) {
        setPage(Math.max(1, Math.ceil(result.meta.total / perPage)));
      }
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load stock");
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [debouncedQuery, page, perPage, sort, status, usageType, warehouseFilter]);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  function chooseStatus(next: StockStatusFilter) {
    setStatus(next);
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setWarehouseFilter("");
    setUsageType("");
    setStatus("all");
    setPage(1);
  }

  function formatSellingPrice(row: StockOverviewRow) {
    if (!row.sellingPrice || Number(row.sellingPrice) === 0) return null;
    const currency = currencyById(currencies, row.priceCurrencyId ?? catalogCurrencyId);
    return formatCurrencyAmount(row.sellingPrice, currency);
  }

  const threshold = summary.lowStockThreshold;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const first = loading && !loaded;
  const filtersActive = Boolean(debouncedQuery || warehouseFilter || usageType || status !== "all");
  const warehouseName = warehouses.find((w) => w.id === warehouseFilter)?.name;
  const attention = summary.lowStock + summary.outOfStock;

  return (
    <AppPage
      fullWidth
      primaryAction={{ content: "Update stock", url: "/dashboard/inventory/update-stock" }}
      secondaryActions={[
        { content: "Products for sale", url: "/dashboard/inventory/products" },
        { content: "Operational products", url: "/dashboard/inventory/operations" },
        { content: "Warehouses", url: "/dashboard/inventory/warehouses" },
        { content: "Categories", url: "/dashboard/inventory/product-categories" },
        { content: "Tags", url: "/dashboard/inventory/product-tags" },
      ]}
      subtitle="What you have on hand, where it is, and what needs restocking."
      title="Inventory"
    >
      <div className="pl st">
        {error ? <div className="ac-error">{error}</div> : null}

        {/* Hero */}
        <section className={cn("pl-hero", loading && loaded && "is-loading")}>
          <div className="pl-hero__main">
            <span className="pl-hero__label">Units on hand{usageType ? ` · ${productArea(usageType).label}` : ""}{warehouseName ? ` · ${warehouseName}` : ""}</span>
            <strong className="pl-hero__value">{first ? "…" : formatQuantity(String(summary.units))}</strong>
            <span className="pl-hero__period">
              {first
                ? "Loading…"
                : `${plural(summary.products, "product")} · ${plural(summary.warehouses, "warehouse")} · ${plural(summary.lines, "stock line")}`}
            </span>
            {summary.assignedUnits > 0 ? (
              <span className="pl-hero__period">
                + {plural(summary.assignedUnits, "serialized unit")} assigned to customers or jobs
              </span>
            ) : null}
          </div>
          <div className="pl-hero__tiles">
            <button className="ac-tile is-link" type="button" onClick={() => chooseStatus("in_stock")}>
              <span>Healthy</span>
              <strong>{summary.inStock}</strong>
              <small>More than {threshold} units</small>
            </button>
            <button
              className={cn("ac-tile is-link", summary.lowStock > 0 && "is-alert-soft")}
              type="button"
              onClick={() => chooseStatus("low_stock")}
            >
              <span>Low stock</span>
              <strong>{summary.lowStock}</strong>
              <small>{threshold} units or fewer</small>
            </button>
            <button
              className={cn("ac-tile is-link", summary.outOfStock > 0 && "is-alert-soft")}
              type="button"
              onClick={() => chooseStatus("out_of_stock")}
            >
              <span>Out of stock</span>
              <strong>{summary.outOfStock}</strong>
              <small>{summary.outOfStock ? "Needs restocking" : "Nothing at zero"}</small>
            </button>
          </div>
          {summary.lines > 0 ? (
            <div className="pl-hero__bar">
              <div className="st-split">
                <b className="is-ok" style={{ width: `${(summary.inStock / summary.lines) * 100}%` }} />
                <b className="is-low" style={{ width: `${(summary.lowStock / summary.lines) * 100}%` }} />
                <b className="is-out" style={{ width: `${(summary.outOfStock / summary.lines) * 100}%` }} />
              </div>
              <div className="pl-hero__legend">
                <span>
                  <i className="st-dot is-ok" /> Healthy {summary.inStock}
                </span>
                <span>
                  <i className="st-dot is-low" /> Low {summary.lowStock}
                </span>
                <span>
                  <i className="st-dot is-out" /> Out {summary.outOfStock}
                </span>
              </div>
            </div>
          ) : null}
        </section>

        {attention > 0 && status === "all" && !first ? (
          <p className="ac-warn st-warn">
            <Icon source={AlertTriangleIcon} />
            {plural(attention, "stock line")} {attention === 1 ? "is" : "are"} low or out of stock.{" "}
            <button className="st-link" type="button" onClick={() => chooseStatus("low_stock")}>
              Show low stock
            </button>
          </p>
        ) : null}

        {/* List */}
        <section className="ex-surface">
          <div className="st-toolbar">
            <div className="iv-filters">
              {STATUS_FILTERS.map((f) => {
                const count = f.key ? Number(summary[f.key]) : 0;
                return (
                  <button
                    className={cn("iv-filter", status === f.id && "is-active", f.alert && count > 0 && "is-alert")}
                    key={f.id}
                    type="button"
                    onClick={() => chooseStatus(f.id)}
                  >
                    {f.label} <span>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="st-toolbar__controls">
              <div className="st-toolbar__search">
                <TextField
                  autoComplete="off"
                  clearButton
                  label="Search stock"
                  labelHidden
                  placeholder="Search products, SKU or serial"
                  prefix={<Icon source={SearchIcon} />}
                  value={query}
                  onChange={setQuery}
                  onClearButtonClick={() => setQuery("")}
                />
              </div>
              <Select
                label="Product type"
                labelHidden
                options={[
                  { label: "All products", value: "" },
                  { label: "For sale", value: "for_sale" },
                  { label: "Operational", value: "operations" },
                ]}
                value={usageType}
                onChange={(value) => {
                  setUsageType(value as ProductUsageType | "");
                  setPage(1);
                }}
              />
              <Select
                label="Warehouse"
                labelHidden
                options={[
                  { label: "All warehouses", value: "" },
                  ...warehouses.map((w) => ({ label: w.name, value: w.id })),
                ]}
                value={warehouseFilter}
                onChange={(value) => {
                  setWarehouseFilter(value);
                  setPage(1);
                }}
              />
              <Select
                label="Sort"
                labelInline
                options={SORT_OPTIONS}
                value={sort}
                onChange={(value) => {
                  setSort(value as StockSort);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {first ? (
            <div className="ex-pad">
              <SkeletonBodyText lines={8} />
            </div>
          ) : rows.length === 0 ? (
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Icon source={InventoryIcon} />
              </span>
              <strong>{filtersActive ? "No stock matches these filters" : "No stock yet"}</strong>
              <p>
                {filtersActive
                  ? "Try another search, type, warehouse or status."
                  : "Add a product and a warehouse, then receive stock to see it here."}
              </p>
              {filtersActive ? (
                <Button onClick={clearFilters}>Clear filters</Button>
              ) : (
                <InlineStack align="center" gap="200">
                  <Button url="/dashboard/inventory/products/new">Add product for sale</Button>
                  <Button url="/dashboard/inventory/operations/new">Add operational product</Button>
                </InlineStack>
              )}
            </div>
          ) : (
            <ul className={cn("ex-list", loading && "st-dim")}>
              <li className="st-row is-head" aria-hidden>
                <span />
                <span>Product</span>
                <span>Warehouse</span>
                <span>On hand</span>
                <span>Selling price</span>
                <span>Type</span>
                <span />
              </li>
              {rows.map((row) => {
                const qty = Number(row.quantity) || 0;
                const level = qty <= 0 ? "is-out" : qty <= threshold ? "is-low" : "is-ok";
                const assigned = Number(row.assignedQuantity) || 0;
                const price = formatSellingPrice(row);
                const serials = row.trackSerial && row.serialSummary ? row.serialSummary : null;
                const productUrl = `/dashboard/inventory/products/${row.productId}`;
                return (
                  <li className="ex-row st-row" key={`${row.productId}-${row.warehouseId}`}>
                    <Link className="st-thumb" href={productUrl}>
                      <ProductListThumbnail alt={row.productName} imagePath={row.productImage} />
                    </Link>
                    <Link className="st-product" href={productUrl}>
                      <strong>{row.productName}</strong>
                      <small title={serials && isSerialSummaryTruncated(serials) ? serials : undefined}>
                        {row.productSku ? <span className="ex-num">{row.productSku}</span> : null}
                        {serials ? (
                          <span className="st-serials">{formatSerialSummaryPreview(serials, 2)}</span>
                        ) : !row.productSku ? (
                          <span>No SKU</span>
                        ) : null}
                      </small>
                    </Link>
                    <Link className="st-wh" href={`/dashboard/inventory/warehouses/${row.warehouseId}`}>
                      {row.warehouseName}
                      {row.warehouseCode && row.warehouseCode !== row.warehouseName ? <small>{row.warehouseCode}</small> : null}
                    </Link>
                    <span className={cn("st-qty", level)}>
                      <b>{formatQuantity(row.quantity)}</b>
                      <small>
                        {level === "is-out" ? "Out of stock" : level === "is-low" ? "Low stock" : "In stock"}
                        {assigned ? ` · ${assigned} assigned` : ""}
                      </small>
                    </span>
                    <span className="st-price">{price ?? <span className="st-muted">No price</span>}</span>
                    <span className="st-type">
                      <Badge tone={row.trackSerial ? "info" : undefined}>{row.trackSerial ? "Serialized" : "Bulk"}</Badge>
                    </span>
                    <span className="st-actions">
                      <Button
                        size="slim"
                        url={`/dashboard/inventory/update-stock?productId=${row.productId}&warehouseId=${row.warehouseId}`}
                      >
                        {row.trackSerial ? "Manage serials" : "Update stock"}
                      </Button>
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
                of <strong>{total}</strong> stock line{total === 1 ? "" : "s"}
                {filtersActive ? (
                  <>
                    {" "}
                    ·{" "}
                    <button className="st-link" type="button" onClick={clearFilters}>
                      Clear filters
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
          {`Low stock means ${threshold} units or fewer in a warehouse. Serialized products count one unit per available serial; sold or assigned serials aren't counted as on hand.`}
        </p>
      </div>
    </AppPage>
  );
}
