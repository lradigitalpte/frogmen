"use client";

import {
  ActionList,
  Badge,
  Banner,
  BlockStack,
  Button,
  Checkbox,
  DropZone,
  Icon,
  InlineStack,
  Modal,
  Pagination,
  Popover,
  Select,
  SkeletonBodyText,
  Text,
  TextField,
} from "@shopify/polaris";
import { ChevronDownIcon, ChevronRightIcon, MenuHorizontalIcon, SearchIcon } from "@shopify/polaris-icons";
import { Package } from "lucide-react";
import NextLink from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeleteProductModal } from "@/components/products/delete-product-modal";
import {
  archiveProduct,
  exportProductCatalog,
  importProductCatalog,
  listProducts,
  listStock,
  restoreProduct,
  permanentlyDeleteProduct,
  previewProductCatalog,
  type ProductTransferField,
  type ProductTransferPreview,
} from "@/lib/products-api";
import type { ListProductsParams, Product, ProductTab, ProductUsageType } from "@/types/product";
import { useAccess } from "@/components/providers/access-provider";
import { MoveProductModal, otherUsageType } from "@/components/products/move-product-modal";
import { productArea, productUrl } from "@/lib/product-areas";
import { getProductDisplayTags } from "@/lib/product-tags";
import { getProductBadgeTone } from "@/lib/product-badges";
import { AppPage } from "@/components/layout/page";
import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { currencyById, formatCurrencyAmount } from "@/lib/currency-utils";
import { useToast } from "@/components/providers/toast-provider";
import { formatSerialSummaryPreview } from "@/lib/format-serial-summary";
import { cn } from "@/lib/utils";

const TABS: Array<{ id: ProductTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "rov", label: "ROV equipment" },
  { id: "goods", label: "Goods" },
  { id: "service", label: "Services" },
  { id: "archived", label: "Archived" },
];

type SortMode = "newest" | "name" | "sku";

const SORT_OPTIONS: Array<{ label: string; value: SortMode }> = [
  { label: "Newest first", value: "newest" },
  { label: "Name (A–Z)", value: "name" },
  { label: "SKU", value: "sku" },
];

const PAGE_SIZES = [16, 25, 50, 100];
const REDUNDANT_TAGS = new Set(["goods", "for sale", "operations"]);
const LOW_STOCK_MAX = 2;

function tabParams(tab: ProductTab): ListProductsParams {
  return {
    archived: tab === "archived",
    type: tab === "goods" || tab === "service" ? tab : undefined,
    isRovEquipment: tab === "rov" ? true : undefined,
  };
}

function sortParams(sort: SortMode): Pick<ListProductsParams, "sortBy" | "sortDir"> {
  if (sort === "name") return { sortBy: "name", sortDir: "asc" };
  if (sort === "sku") return { sortBy: "sku", sortDir: "asc" };
  return { sortBy: "createdAt", sortDir: "desc" };
}

interface StockInfo {
  qty: number;
  assigned: number;
  serials: string[];
}

export function ProductsListPage({ usageType }: { usageType: ProductUsageType }) {
  const area = productArea(usageType);
  const operational = usageType === "operations";
  const { can } = useAccess();
  const showCost = operational && can("cost.read");
  const { showSuccess } = useToast();
  const { currencies, catalogCurrencyId } = useOrgCurrency();

  const [tab, setTab] = useState<ProductTab>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [salesHistoryOnly, setSalesHistoryOnly] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [tabCounts, setTabCounts] = useState<Partial<Record<ProductTab, number>>>({});
  const [stock, setStock] = useState<Map<string, StockInfo>>(new Map());
  const [stockSummary, setStockSummary] = useState({ units: 0, low: 0, out: 0 });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [pendingArchive, setPendingArchive] = useState<Product | null>(null);
  const [archiving, setArchiving] = useState(false);
  const requestRef = useRef(0);

  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferFile, setTransferFile] = useState<File | null>(null);
  const [transferPreview, setTransferPreview] = useState<ProductTransferPreview | null>(null);
  const [existingStrategy, setExistingStrategy] = useState<"skip" | "update">("skip");
  const [createCategories, setCreateCategories] = useState(true);
  const [includeCost, setIncludeCost] = useState(false);
  const [exportFields, setExportFields] = useState<ProductTransferField[]>([
    "description", "barcode", "sellingPrice", "category", "tags", "dimensions", "images",
  ]);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [pendingMove, setPendingMove] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadCounts = useCallback(async () => {
    const results = await Promise.all(
      TABS.map((t) =>
        listProducts({ perPage: 1, usageType, ...tabParams(t.id) })
          .then((r) => [t.id, r.meta.total] as const)
          .catch(() => [t.id, undefined] as const),
      ),
    );
    setTabCounts(Object.fromEntries(results.filter(([, n]) => n !== undefined)));
  }, [usageType]);

  const loadStock = useCallback(async () => {
    try {
      const result = await listStock({ perPage: 1000, usageType });
      const map = new Map<string, StockInfo>();
      for (const row of result.data) {
        const entry = map.get(row.productId) ?? { qty: 0, assigned: 0, serials: [] };
        entry.qty += Number(row.quantity) || 0;
        entry.assigned += Number(row.assignedQuantity) || 0;
        if (row.serialSummary) {
          entry.serials.push(...row.serialSummary.split(",").map((s) => s.trim()).filter(Boolean));
        }
        map.set(row.productId, entry);
      }
      setStock(map);
      setStockSummary({
        units: result.summary?.units ?? [...map.values()].reduce((s, e) => s + e.qty, 0),
        low: result.summary?.lowStock ?? 0,
        out: result.summary?.outOfStock ?? 0,
      });
    } catch {
      // Stock badges are a nice-to-have; the list still works without them.
    }
  }, [usageType]);

  const loadProducts = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listProducts({
        page,
        perPage,
        search: debouncedQuery || undefined,
        hasSalesHistory: salesHistoryOnly || undefined,
        usageType,
        ...tabParams(tab),
        ...sortParams(sort),
      });
      if (request !== requestRef.current) return;
      setProducts(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [debouncedQuery, page, perPage, salesHistoryOnly, sort, tab, usageType]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    void loadCounts();
    void loadStock();
  }, [loadCounts, loadStock]);

  async function refreshAll() {
    await Promise.all([loadProducts(), loadCounts(), loadStock()]);
  }

  function chooseTab(next: ProductTab) {
    setTab(next);
    setPage(1);
    setExpanded({});
  }

  function formatPrice(product: Product) {
    const amount = operational ? (showCost ? product.costPrice : null) : product.sellingPrice;
    if (!amount || Number(amount) === 0) return null;
    const currency = currencyById(currencies, product.priceCurrencyId ?? catalogCurrencyId);
    return formatCurrencyAmount(amount, currency);
  }

  async function handleArchiveConfirm() {
    if (!pendingArchive) return;
    setArchiving(true);
    try {
      if (pendingArchive.deletedAt || tab === "archived") {
        await restoreProduct(pendingArchive.id);
        showSuccess(`${pendingArchive.name} restored`);
      } else {
        await archiveProduct(pendingArchive.id);
        showSuccess(`${pendingArchive.name} archived`);
      }
      setPendingArchive(null);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the product");
      setPendingArchive(null);
    } finally {
      setArchiving(false);
    }
  }

  async function handlePermanentDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await permanentlyDeleteProduct(pendingDelete.id);
      showSuccess(`${pendingDelete.name} deleted`);
      setPendingDelete(null);
      await refreshAll();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete product");
    } finally {
      setDeleting(false);
    }
  }

  function toggleExportField(field: ProductTransferField, checked: boolean) {
    setExportFields((current) =>
      checked ? [...new Set([...current, field])] : current.filter((item) => item !== field),
    );
  }

  async function handleExport() {
    setTransferBusy(true);
    setTransferError(null);
    try {
      await exportProductCatalog({ fields: exportFields });
      setExportOpen(false);
      showSuccess("Catalog exported");
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setTransferBusy(false);
    }
  }

  async function handleTransferFile(file: File | undefined) {
    if (!file) return;
    setTransferBusy(true);
    setTransferError(null);
    setTransferFile(file);
    setTransferPreview(null);
    try {
      setTransferPreview(await previewProductCatalog(file));
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setTransferBusy(false);
    }
  }

  function closeImport() {
    setImportOpen(false);
    setTransferFile(null);
    setTransferPreview(null);
    setTransferError(null);
  }

  async function handleImport() {
    if (!transferFile || !transferPreview || transferPreview.summary.conflict) return;
    setTransferBusy(true);
    setTransferError(null);
    try {
      const result = await importProductCatalog(transferFile, { existingStrategy, createCategories, includeCost });
      closeImport();
      await refreshAll();
      showSuccess(`Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`);
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setTransferBusy(false);
    }
  }

  // Group sub-products under their parent when both are on this page.
  const { roots, childrenOf } = useMemo(() => {
    const ids = new Set(products.map((p) => p.id));
    const childrenOf = new Map<string, Product[]>();
    const roots: Product[] = [];
    for (const p of products) {
      if (p.parentId && ids.has(p.parentId)) {
        childrenOf.set(p.parentId, [...(childrenOf.get(p.parentId) ?? []), p]);
      } else {
        roots.push(p);
      }
    }
    return { roots, childrenOf };
  }, [products]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const first = loading && !loaded;
  const filtersActive = Boolean(debouncedQuery || salesHistoryOnly || tab !== "all");
  const archivedView = tab === "archived";

  function renderRow(product: Product, opts: { child?: boolean; kids?: number } = {}) {
    const info = stock.get(product.id) ?? { qty: 0, assigned: 0, serials: [] };
    const stocked = product.type === "goods" && product.isStorable;
    const level = info.qty <= 0 ? "is-out" : info.qty <= LOW_STOCK_MAX ? "is-low" : "is-ok";
    const tags = getProductDisplayTags(product).filter((t) => !REDUNDANT_TAGS.has(t.trim().toLowerCase()));
    const serialPreview =
      product.trackSerial && info.serials.length ? formatSerialSummaryPreview([...new Set(info.serials)].join(", "), 2) : null;
    const price = formatPrice(product);
    const url = productUrl(product);
    const isOpen = expanded[product.id] ?? false;
    const archived = archivedView || Boolean(product.deletedAt);

    return (
      <li className={cn("pr-row", opts.child && "is-child")} key={product.id}>
        <span className="pr-row__toggle">
          {opts.kids ? (
            <Button
              accessibilityLabel={isOpen ? "Hide sub-products" : "Show sub-products"}
              icon={isOpen ? ChevronDownIcon : ChevronRightIcon}
              size="micro"
              variant="tertiary"
              onClick={() => setExpanded((prev) => ({ ...prev, [product.id]: !isOpen }))}
            />
          ) : opts.child ? (
            <span className="pr-row__branch" aria-hidden>
              ↳
            </span>
          ) : null}
        </span>
        <NextLink className="st-thumb" href={url}>
          <ProductListThumbnail alt={product.name} imagePath={product.images?.[0] ?? null} />
        </NextLink>
        <NextLink className="pr-row__main" href={url}>
          <strong>
            {product.name}
            {opts.kids ? (
              <em>
                {opts.kids} sub-product{opts.kids === 1 ? "" : "s"}
              </em>
            ) : null}
          </strong>
          <small>
            {product.sku ? <span className="ex-num">{product.sku}</span> : <span>No SKU</span>}
            {serialPreview ? <span className="st-serials">{serialPreview}</span> : null}
          </small>
          {tags.length ? (
            <span className="pr-row__tags">
              {tags.map((tag) => (
                <Badge key={`${product.id}-${tag}`} size="small" tone={getProductBadgeTone(tag)}>
                  {tag}
                </Badge>
              ))}
            </span>
          ) : null}
        </NextLink>
        <span className={cn("st-qty", stocked ? level : "is-na")}>
          {stocked ? (
            <>
              <b>{info.qty}</b>
              <small>
                {level === "is-out" ? "Out of stock" : level === "is-low" ? "Low stock" : "On hand"}
                {info.assigned ? ` · ${info.assigned} assigned` : ""}
              </small>
            </>
          ) : (
            <small>{product.type === "service" ? "Service" : "Not tracked"}</small>
          )}
        </span>
        <span className="st-price">
          {price ?? <span className="st-muted">{operational ? (showCost ? "No cost" : "Internal") : "No price"}</span>}
        </span>
        <span className="pr-row__actions">
          {archived ? (
            <Button size="slim" onClick={() => setPendingArchive(product)}>
              Restore
            </Button>
          ) : (
            <Button size="slim" url={`${url}/edit`}>
              Edit
            </Button>
          )}
          <Popover
            active={menuFor === product.id}
            activator={
              <Button
                accessibilityLabel={`More actions for ${product.name}`}
                icon={MenuHorizontalIcon}
                size="slim"
                variant="tertiary"
                onClick={() => setMenuFor(menuFor === product.id ? null : product.id)}
              />
            }
            preferredAlignment="right"
            onClose={() => setMenuFor(null)}
          >
            <ActionList
              actionRole="menuitem"
              items={[
                { content: "View product", url },
                ...(stocked && !archived
                  ? [{ content: product.trackSerial ? "Manage serials" : "Update stock", url: `/dashboard/inventory/update-stock?productId=${product.id}` }]
                  : []),
                ...(!product.parentId && !archived
                  ? [{ content: "Add sub-product", url: `${area.url}/new?parentId=${product.id}` }]
                  : []),
                ...(!archived && can("products.write")
                  ? [
                      {
                        content: `Move to ${productArea(otherUsageType(product)).label}`,
                        onAction: () => {
                          setMenuFor(null);
                          setPendingMove(product);
                        },
                      },
                    ]
                  : []),
                archived
                  ? {
                      content: "Delete forever",
                      destructive: true,
                      onAction: () => {
                        setMenuFor(null);
                        setDeleteError(null);
                        setPendingDelete(product);
                      },
                    }
                  : {
                      content: "Archive",
                      destructive: true,
                      onAction: () => {
                        setMenuFor(null);
                        setPendingArchive(product);
                      },
                    },
              ]}
            />
          </Popover>
        </span>
      </li>
    );
  }

  return (
    <AppPage
      backAction={{ content: "Inventory", url: "/dashboard/inventory" }}
      fullWidth
      primaryAction={{ content: area.addLabel, url: `${area.url}/new` }}
      secondaryActions={[
        { content: "Export catalog", onAction: () => setExportOpen(true) },
        { content: "Import catalog", onAction: () => setImportOpen(true) },
      ]}
      subtitle={
        operational
          ? "Equipment, parts and consumables you use internally. These are never sold."
          : "Goods, services and parts you sell. These appear on quotations and invoices."
      }
      title={area.label}
    >
      <div className="pl pr">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {/* Summary */}
        <div className="pc-stats">
          <button className="pc-stat pr-stat" type="button" onClick={() => chooseTab("all")}>
            <small>Active products</small>
            <strong>{tabCounts.all ?? "…"}</strong>
          </button>
          <button className="pc-stat pr-stat" type="button" onClick={() => chooseTab("rov")}>
            <small>ROV equipment</small>
            <strong>{tabCounts.rov ?? "…"}</strong>
          </button>
          <NextLink className="pc-stat pr-stat" href="/dashboard/inventory">
            <small>Units in stock</small>
            <strong>{stockSummary.units.toLocaleString()}</strong>
          </NextLink>
          <NextLink className={cn("pc-stat pr-stat", stockSummary.low + stockSummary.out > 0 && "is-alert")} href="/dashboard/inventory">
            <small>Stock lines low or out</small>
            <strong>{stockSummary.low + stockSummary.out}</strong>
          </NextLink>
        </div>

        <section className="ex-surface">
          <div className="st-toolbar">
            <div className="iv-filters">
              {TABS.map((t) => (
                <button
                  className={cn("iv-filter", tab === t.id && "is-active")}
                  key={t.id}
                  type="button"
                  onClick={() => chooseTab(t.id)}
                >
                  {t.label} {tabCounts[t.id] !== undefined ? <span>{tabCounts[t.id]}</span> : null}
                </button>
              ))}
            </div>
            <div className="st-toolbar__controls">
              <div className="st-toolbar__search">
                <TextField
                  autoComplete="off"
                  clearButton
                  label="Search products"
                  labelHidden
                  placeholder="Search name, SKU or barcode"
                  prefix={<Icon source={SearchIcon} />}
                  value={query}
                  onChange={setQuery}
                  onClearButtonClick={() => setQuery("")}
                />
              </div>
              {operational ? null : (
                <Checkbox
                  checked={salesHistoryOnly}
                  label="Sold before"
                  onChange={(checked) => {
                    setSalesHistoryOnly(checked);
                    setPage(1);
                  }}
                />
              )}
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
          ) : products.length === 0 ? (
            <div className="ex-empty">
              <span className="ex-empty__icon">
                <Package aria-hidden size={20} />
              </span>
              <strong>
                {filtersActive ? "No products match" : operational ? "Add your first operational product" : "Add your first product for sale"}
              </strong>
              <p>
                {filtersActive
                  ? "Try another search or tab."
                  : operational
                    ? "Items your team uses on jobs — equipment, tools, spares and consumables."
                    : "What you sell to customers — ROVs, parts, consumables and services."}
              </p>
              {filtersActive ? (
                <Button
                  onClick={() => {
                    setQuery("");
                    setSalesHistoryOnly(false);
                    chooseTab("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button url={`${area.url}/new`} variant="primary">
                  {area.addLabel}
                </Button>
              )}
            </div>
          ) : (
            <ul className={cn("ex-list", loading && "st-dim")}>
              <li className="pr-row is-head" aria-hidden>
                <span />
                <span />
                <span>Product</span>
                <span>Stock</span>
                <span>{operational ? (showCost ? "Cost" : "Use") : "Selling price"}</span>
                <span />
              </li>
              {roots.map((root) => {
                const kids = childrenOf.get(root.id) ?? [];
                return (
                  <React.Fragment key={root.id}>
                    {renderRow(root, { kids: kids.length })}
                    {kids.length && expanded[root.id] ? kids.map((kid) => renderRow(kid, { child: true })) : null}
                  </React.Fragment>
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
                of <strong>{total}</strong> product{total === 1 ? "" : "s"}
                {roots.length !== products.length ? ` · ${products.length - roots.length} grouped under their parent` : ""}
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
      </div>

      <Modal
        open={Boolean(pendingArchive)}
        primaryAction={{
          content: archivedView ? "Restore product" : "Archive product",
          destructive: !archivedView,
          loading: archiving,
          onAction: () => void handleArchiveConfirm(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setPendingArchive(null) }]}
        title={pendingArchive ? `${archivedView ? "Restore" : "Archive"} ${pendingArchive.name}?` : "Product"}
        onClose={() => setPendingArchive(null)}
      >
        <Modal.Section>
          <Text as="p">
            {archivedView
              ? "It will show up again on quotations, orders and invoices."
              : (stock.get(pendingArchive?.id ?? "")?.qty ?? 0) > 0
                ? `It still has ${stock.get(pendingArchive?.id ?? "")?.qty} in stock. Archiving hides it from new quotations, orders and invoices; stock and history stay as they are.`
                : "It will be hidden from new quotations, orders and invoices. Existing documents and history stay as they are, and you can restore it any time."}
          </Text>
        </Modal.Section>
      </Modal>

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export product catalog"
        primaryAction={{ content: "Download ZIP", loading: transferBusy, disabled: exportFields.length === 0, onAction: () => void handleExport() }}
        secondaryActions={[{ content: "Cancel", onAction: () => setExportOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {transferError ? <Banner tone="critical">{transferError}</Banner> : null}
            <Text as="p">
              Exports every product in this organisation, both for sale and operational. IDs, live stock, warehouses, assigned units and serial numbers are
              never copied.
            </Text>
            {([
              ["description", "Descriptions"], ["barcode", "Barcodes"],
              ["sellingPrice", "Selling prices and currency codes"], ["costPrice", "Cost prices (sensitive)"],
              ["category", "Categories"], ["tags", "Tags"],
              ["dimensions", "Weight and volume"], ["images", "Product images"],
            ] as Array<[ProductTransferField, string]>).map(([field, label]) => (
              <Checkbox key={field} label={label} checked={exportFields.includes(field)} onChange={(checked) => toggleExportField(field, checked)} />
            ))}
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={importOpen}
        onClose={closeImport}
        title="Import product catalog"
        primaryAction={{
          content: "Apply import",
          loading: transferBusy,
          disabled: !transferPreview || transferPreview.summary.conflict > 0,
          onAction: () => void handleImport(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: closeImport }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {transferError ? <Banner tone="critical">{transferError}</Banner> : null}
            <DropZone accept=".zip,application/zip" allowMultiple={false} onDrop={(_files, accepted) => void handleTransferFile(accepted[0])}>
              <DropZone.FileUpload actionTitle={transferFile ? "Choose another transfer package" : "Choose transfer ZIP"} />
            </DropZone>
            <Text as="p" tone="subdued">
              Each product goes to For sale or Operational as set in the file, whichever page you import from.
            </Text>
            {transferPreview ? (
              <>
                <InlineStack gap="300">
                  <Badge tone="success">{`${transferPreview.summary.create} new`}</Badge>
                  <Badge tone="info">{`${transferPreview.summary.update} already exist`}</Badge>
                  <Badge tone={transferPreview.summary.conflict ? "critical" : "success"}>{`${transferPreview.summary.conflict} conflicts`}</Badge>
                </InlineStack>
                {transferPreview.summary.conflict ? (
                  <Banner tone="warning">Fix the conflicts below in the file, then choose it again.</Banner>
                ) : null}
                <Checkbox label="Update products whose SKU already exists" checked={existingStrategy === "update"} onChange={(checked) => setExistingStrategy(checked ? "update" : "skip")} />
                <Checkbox label="Create missing categories by name" checked={createCategories} onChange={setCreateCategories} />
                <Checkbox label="Import cost prices when included" checked={includeCost} onChange={setIncludeCost} />
                <div className="pr-import-list">
                  {transferPreview.rows.map((row) => (
                    <div className="pr-import-row" key={row.sku}>
                      <span>
                        <strong>{row.name}</strong>
                        <small>
                          {row.sku}
                          {row.conflicts.length ? ` · ${row.conflicts.join(", ")}` : ""}
                        </small>
                      </span>
                      <Badge tone={row.action === "conflict" ? "critical" : row.action === "create" ? "success" : "info"}>
                        {row.action}
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </BlockStack>
        </Modal.Section>
      </Modal>

      <MoveProductModal
        product={pendingMove}
        onClose={() => setPendingMove(null)}
        onMoved={(product) => {
          setPendingMove(null);
          showSuccess(`${product.name} moved to ${productArea(otherUsageType(product)).label}`);
          void refreshAll();
        }}
      />

      <DeleteProductModal
        error={deleteError}
        loading={deleting}
        open={Boolean(pendingDelete)}
        productName={pendingDelete?.name ?? ""}
        onClose={() => {
          if (deleting) return;
          setPendingDelete(null);
          setDeleteError(null);
        }}
        onConfirm={() => void handlePermanentDelete()}
      />
    </AppPage>
  );
}
