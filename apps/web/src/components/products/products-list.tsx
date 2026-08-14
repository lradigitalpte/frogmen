"use client";

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Checkbox,
  DropZone,
  EmptyState,
  IndexFilters,
  IndexFiltersMode,
  IndexTable,
  InlineStack,
  Link,
  Modal,
  Text,
  useSetIndexFiltersMode,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveProduct,
  exportProductCatalog,
  importProductCatalog,
  listProducts,
  listStock,
  restoreProduct,
  previewProductCatalog,
  type ProductTransferField,
  type ProductTransferPreview,
} from "@/lib/products-api";
import type { Product, ProductTab } from "@/types/product";
import { getProductDisplayTags } from "@/lib/product-tags";
import { getProductBadgeTone } from "@/lib/product-badges";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { currencyById, formatCurrencyAmount } from "@/lib/currency-utils";
import { useToast } from "@/components/providers/toast-provider";

const tabs: { id: ProductTab; content: string }[] = [
  { id: "all", content: "All" },
  { id: "for_sale", content: "For sale" },
  { id: "operations", content: "Operations" },
  { id: "rov", content: "ROV equipment" },
  { id: "goods", content: "Goods" },
  { id: "service", content: "Services" },
  { id: "archived", content: "Archived" },
];

const REDUNDANT_TABLE_TAGS = new Set(["goods", "for sale"]);
const PRODUCTS_PER_PAGE = 16;

function getTableDisplayTags(product: Product): string[] {
  const allTags = getProductDisplayTags(product);
  return allTags.filter((t) => !REDUNDANT_TABLE_TAGS.has(t.trim().toLowerCase()));
}

function renderOnHandBadge(
  product: Product,
  qty: number,
  assignedQty: number,
  isLinkedComponent: boolean,
) {
  if (product.type === "service" || !product.isStorable) {
    return (
      <Text as="span" tone="subdued">
        {" "}
      </Text>
    );
  }

  if (isLinkedComponent && assignedQty > 0 && qty === 0) {
    return (
      <Badge tone="info">
        {assignedQty === 1 ? "Assigned" : `${assignedQty} assigned`}
      </Badge>
    );
  }

  if (qty === 0) {
    return <Badge tone="critical">0 on hand</Badge>;
  }

  if (isLinkedComponent && assignedQty > 0) {
    return (
      <Badge tone={qty <= 2 ? "attention" : "success"}>
        {`${qty} spare · ${assignedQty} assigned`}
      </Badge>
    );
  }

  return (
    <Badge tone={qty <= 2 ? "attention" : "success"}>
      {`${qty} on hand`}
    </Badge>
  );
}

export function ProductsListPage() {
  const router = useRouter();
  const { showSuccess } = useToast();
  const { currencies, catalogCurrencyId } = useOrgCurrency();

  function formatProductPrice(product: Product) {
    const currency = currencyById(
      currencies,
      product.priceCurrencyId ?? catalogCurrencyId,
    );

    return product.sellingPrice
      ? formatCurrencyAmount(product.sellingPrice, currency)
      : " ";
  }
  const [selectedTab, setSelectedTab] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Map<string, number>>(
    new Map(),
  );
  const [assignedByProduct, setAssignedByProduct] = useState<
    Map<string, number>
  >(new Map());
  const [serialsByProduct, setSerialsByProduct] = useState<Map<string, string[]>>(
    new Map(),
  );
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferFile, setTransferFile] = useState<File | null>(null);
  const [transferPreview, setTransferPreview] = useState<ProductTransferPreview | null>(null);
  const [existingStrategy, setExistingStrategy] = useState<"skip" | "update">("skip");
  const [createCategories, setCreateCategories] = useState(true);
  const [includeCost, setIncludeCost] = useState(false);
  const [exportFields, setExportFields] = useState<ProductTransferField[]>([
    "description", "barcode", "sellingPrice", "category", "tags", "dimensions", "images",
  ]);
  const { mode, setMode } = useSetIndexFiltersMode(IndexFiltersMode.Filtering);

  const activeTab = tabs[selectedTab]?.id ?? "all";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [result, stockResult] = await Promise.all([
        listProducts({
          page,
          perPage: PRODUCTS_PER_PAGE,
          search: debouncedQuery || undefined,
          archived: activeTab === "archived",
          type:
            activeTab === "goods" || activeTab === "service"
              ? activeTab
              : undefined,
          usageType:
            activeTab === "for_sale" || activeTab === "operations"
              ? activeTab
              : undefined,
          isRovEquipment: activeTab === "rov" ? true : undefined,
          sortBy: "name",
          sortDir: "asc",
        }),
        listStock({ perPage: 500 }),
      ]);

      const stockMap = new Map<string, number>();
      const assignedMap = new Map<string, number>();
      const serialMap = new Map<string, string[]>();
      for (const row of stockResult.data) {
        stockMap.set(
          row.productId,
          (stockMap.get(row.productId) ?? 0) + (Number(row.quantity) || 0),
        );

        if (row.assignedQuantity) {
          assignedMap.set(
            row.productId,
            (assignedMap.get(row.productId) ?? 0) +
              (Number(row.assignedQuantity) || 0),
          );
        }

        if (row.serialSummary) {
          const existing = serialMap.get(row.productId) ?? [];
          const serials = row.serialSummary
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
          serialMap.set(row.productId, [...existing, ...serials]);
        }
      }

      setStockByProduct(stockMap);
      setAssignedByProduct(assignedMap);
      setSerialsByProduct(serialMap);
      setProducts(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedQuery, page]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedQuery]);

  async function handleArchive(id: string) {
    if (activeTab === "archived") {
      await restoreProduct(id);
    } else {
      await archiveProduct(id);
    }

    await loadProducts();
  }

  function toggleExportField(field: ProductTransferField, checked: boolean) {
    setExportFields((current) =>
      checked ? [...new Set([...current, field])] : current.filter((item) => item !== field),
    );
  }

  async function handleExport() {
    setTransferBusy(true);
    try {
      await exportProductCatalog({ fields: exportFields });
      setExportOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally { setTransferBusy(false); }
  }

  async function handleTransferFile(file: File | undefined) {
    if (!file) return;
    setTransferBusy(true); setTransferFile(file); setTransferPreview(null);
    try { setTransferPreview(await previewProductCatalog(file)); }
    catch (err) { setError(err instanceof Error ? err.message : "Preview failed"); }
    finally { setTransferBusy(false); }
  }

  async function handleImport() {
    if (!transferFile || !transferPreview || transferPreview.summary.conflict) return;
    setTransferBusy(true);
    try {
      const result = await importProductCatalog(transferFile, { existingStrategy, createCategories, includeCost });
      setImportOpen(false); setTransferFile(null); setTransferPreview(null);
      setError(null);
      await loadProducts();
      showSuccess(`Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Import failed"); }
    finally { setTransferBusy(false); }
  }

  // Collapsed parent products state (map of parentId -> boolean)
  const [collapsedParents, setCollapsedParents] = useState<Record<string, boolean>>({});

  const toggleParentCollapse = (parentId: string) => {
    setCollapsedParents((prev) => ({
      ...prev,
      [parentId]: !prev[parentId],
    }));
  };

  // Group products into parent-child hierarchy
  const groupedProducts = useMemo(() => {
    const parentMap = new Map<string, Product[]>();
    const rootProducts: Product[] = [];
    const childProductIds = new Set<string>();

    // First pass: identify children and map by parentId
    products.forEach((p) => {
      if (p.parentId) {
        childProductIds.add(p.id);
        if (!parentMap.has(p.parentId)) {
          parentMap.set(p.parentId, []);
        }
        parentMap.get(p.parentId)!.push(p);
      }
    });

    // Second pass: root products and orphaned child products
    products.forEach((p) => {
      if (!p.parentId) {
        rootProducts.push(p);
      } else if (!products.some((parent) => parent.id === p.parentId)) {
        // Parent is not in current list, treat as root for display
        rootProducts.push(p);
      }
    });

    return { rootProducts, parentMap };
  }, [products]);

  let rowIndexCounter = 0;

  const renderSingleProductRow = (
    product: Product,
    isChild: boolean = false,
  ) => {
    const serials = serialsByProduct.get(product.id) ?? [];
    const serialLabel =
      product.trackSerial && serials.length > 0
        ? [...new Set(serials)].join(", ")
        : null;

    const qty = stockByProduct.get(product.id) ?? 0;
    const assignedQty = assignedByProduct.get(product.id) ?? 0;
    const isLinkedComponent = Boolean(product.parentId);

    return (
      <IndexTable.Row id={product.id} key={product.id} position={rowIndexCounter++}>
        <IndexTable.Cell>
          <div style={{ paddingLeft: isChild ? 24 : 0, display: "flex", alignItems: "center", gap: 8 }}>
            {isChild && (
              <span style={{ color: "var(--p-color-text-subdued)", fontSize: 14 }}>└──</span>
            )}
            <InlineStack gap="300" blockAlign="center">
              <ProductListThumbnail
                alt={product.name}
                imagePath={product.images[0]}
              />
              <BlockStack gap="100">
                <Link
                  dataPrimaryLink
                  url={`/dashboard/inventory/products/${product.id}`}
                >
                  <Text as="span" fontWeight="semibold">
                    {product.name}
                  </Text>
                </Link>
                <InlineStack gap="150">
                  {getTableDisplayTags(product).map((tag) => (
                    <Badge key={`${product.id}-${tag}`}>
                      {tag}
                    </Badge>
                  ))}
                </InlineStack>
              </BlockStack>
            </InlineStack>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {product.sku || serialLabel || " "}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {renderOnHandBadge(product, qty, assignedQty, isLinkedComponent)}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {formatProductPrice(product)}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200">
            <Button
              size="slim"
              url={`/dashboard/inventory/products/${product.id}`}
              variant="plain"
            >
              View
            </Button>
            <Button
              size="slim"
              url={`/dashboard/inventory/products/${product.id}/edit`}
              variant="plain"
            >
              Edit
            </Button>
            <Button
              size="slim"
              tone={activeTab === "archived" ? "success" : "critical"}
              variant="plain"
              onClick={() => handleArchive(product.id)}
            >
              {activeTab === "archived" ? "Restore" : "Archive"}
            </Button>
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  };

  const rowMarkup = groupedProducts.rootProducts.map((rootProduct) => {
    const children = groupedProducts.parentMap.get(rootProduct.id) ?? [];
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedParents[rootProduct.id] ?? true;

    if (!hasChildren) {
      return renderSingleProductRow(rootProduct, false);
    }

    return (
      <React.Fragment key={`group-${rootProduct.id}`}>
        {/* Parent Header Row with Expand/Collapse */}
        <IndexTable.Row id={`parent-${rootProduct.id}`} position={rowIndexCounter++}>
          <IndexTable.Cell>
            <InlineStack gap="200" blockAlign="center">
              <Button
                size="slim"
                variant="plain"
                accessibilityLabel={isCollapsed ? "Expand linked components" : "Collapse linked components"}
                onClick={(e?: React.MouseEvent) => {
                  e?.stopPropagation?.();
                  toggleParentCollapse(rootProduct.id);
                }}
              >
                {isCollapsed ? "▶" : "▼"}
              </Button>
              <ProductListThumbnail
                alt={rootProduct.name}
                imagePath={rootProduct.images[0]}
              />
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Link
                    dataPrimaryLink
                    url={`/dashboard/inventory/products/${rootProduct.id}`}
                  >
                    <Text as="span" fontWeight="bold">
                      {rootProduct.name}
                    </Text>
                  </Link>
                  <Badge tone="info">{`${children.length} Linked Component${children.length > 1 ? "s" : ""}`}</Badge>
                </InlineStack>
                <InlineStack gap="150">
                  {getTableDisplayTags(rootProduct).map((tag) => (
                    <Badge key={`${rootProduct.id}-${tag}`}>
                      {tag}
                    </Badge>
                  ))}
                </InlineStack>
              </BlockStack>
            </InlineStack>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {(() => {
              const serials = serialsByProduct.get(rootProduct.id) ?? [];
              const serialLabel =
                rootProduct.trackSerial && serials.length > 0
                  ? [...new Set(serials)].join(", ")
                  : null;
              return rootProduct.sku || serialLabel || " ";
            })()}
          </IndexTable.Cell>
          <IndexTable.Cell>
            {renderOnHandBadge(
              rootProduct,
              stockByProduct.get(rootProduct.id) ?? 0,
              assignedByProduct.get(rootProduct.id) ?? 0,
              false,
            )}
          </IndexTable.Cell>
          <IndexTable.Cell>
            {formatProductPrice(rootProduct)}
          </IndexTable.Cell>
          <IndexTable.Cell>
            <InlineStack gap="200">
              <Button
                size="slim"
                url={`/dashboard/inventory/products/${rootProduct.id}`}
                variant="plain"
              >
                View
              </Button>
              <Button
                size="slim"
                url={`/dashboard/inventory/products/${rootProduct.id}/edit`}
                variant="plain"
              >
                Edit
              </Button>
              <Button
                size="slim"
                tone={activeTab === "archived" ? "success" : "critical"}
                variant="plain"
                onClick={() => handleArchive(rootProduct.id)}
              >
                {activeTab === "archived" ? "Restore" : "Archive"}
              </Button>
            </InlineStack>
          </IndexTable.Cell>
        </IndexTable.Row>

        {/* Linked Child Rows (when expanded) */}
        {!isCollapsed &&
          children.map((child) => renderSingleProductRow(child, true))}
      </React.Fragment>
    );
  });

  const emptyState = useMemo(
    () => (
      <EmptyState
        action={{
          content: "Create product",
          onAction: () => router.push("/dashboard/inventory/products/new"),
        }}
        heading="Create your first product"
        image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
      >
        <p>Add goods and services for your inventory.</p>
      </EmptyState>
    ),
    [router],
  );

  return (
    <AppPage
      backAction={{ content: "Inventory", url: "/dashboard/inventory" }}
      fullWidth
      primaryAction={{
        content: "Create product",
        onAction: () => router.push("/dashboard/inventory/products/new"),
      }}
      secondaryActions={[
        { content: "Export catalog", onAction: () => setExportOpen(true) },
        { content: "Import catalog", onAction: () => setImportOpen(true) },
      ]}
      subtitle="Goods, services, and sub-products."
      title="Products"
    >
      <BlockStack gap="400">
        {error ? (
          <Text as="p" tone="critical">
            {error}
          </Text>
        ) : null}

        <IndexSurface>
          <IndexFilters
            canCreateNewView={false}
            cancelAction={{
              onAction: () => setQuery(""),
              disabled: false,
              loading: false,
            }}
            filters={[]}
            mode={mode}
            queryPlaceholder="Search products"
            queryValue={query}
            selected={selectedTab}
            tabs={tabs}
            onClearAll={() => setQuery("")}
            onQueryChange={setQuery}
            onQueryClear={() => setQuery("")}
            onSelect={setSelectedTab}
            setMode={setMode}
          />

          <IndexTable
            emptyState={emptyState}
            headings={[
              { title: "Name" },
              { title: "SKU / Serial" },
              { title: "On hand" },
              { title: "Selling price" },
              { title: "" },
            ]}
            itemCount={total}
            loading={loading}
            pagination={{
              hasNext: page * PRODUCTS_PER_PAGE < total,
              hasPrevious: page > 1,
              onNext: () => setPage((current) => current + 1),
              onPrevious: () => setPage((current) => Math.max(1, current - 1)),
            }}
            resourceName={{ singular: "product", plural: "products" }}
          >
            {rowMarkup}
          </IndexTable>
        </IndexSurface>
      </BlockStack>

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export product catalog"
        primaryAction={{ content: "Download ZIP", loading: transferBusy, disabled: exportFields.length === 0, onAction: () => void handleExport() }}
        secondaryActions={[{ content: "Cancel", onAction: () => setExportOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">Exports all products matching the current organization catalog. Product IDs, live stock, warehouses, assigned units, and serial numbers are never copied.</Text>
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
        onClose={() => { setImportOpen(false); setTransferFile(null); setTransferPreview(null); }}
        title="Import product catalog"
        primaryAction={{
          content: "Apply import", loading: transferBusy,
          disabled: !transferPreview || transferPreview.summary.conflict > 0,
          onAction: () => void handleImport(),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setImportOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <DropZone accept=".zip,application/zip" allowMultiple={false} onDrop={(_files, accepted) => void handleTransferFile(accepted[0])}>
              <DropZone.FileUpload actionTitle={transferFile ? "Choose another transfer package" : "Choose transfer ZIP"} />
            </DropZone>
            {transferPreview ? (
              <>
                <InlineStack gap="300">
                  <Badge tone="success">{`${transferPreview.summary.create} create`}</Badge>
                  <Badge tone="info">{`${transferPreview.summary.update} existing`}</Badge>
                  <Badge tone={transferPreview.summary.conflict ? "critical" : "success"}>{`${transferPreview.summary.conflict} conflicts`}</Badge>
                </InlineStack>
                <Checkbox label="Update products whose SKU already exists" checked={existingStrategy === "update"} onChange={(checked) => setExistingStrategy(checked ? "update" : "skip")} />
                <Checkbox label="Create missing categories by name" checked={createCategories} onChange={setCreateCategories} />
                <Checkbox label="Import cost prices when included" checked={includeCost} onChange={setIncludeCost} />
                <div style={{ maxHeight: 280, overflow: "auto" }}>
                  <BlockStack gap="200">
                    {transferPreview.rows.map((row) => (
                      <InlineStack key={row.sku} align="space-between" blockAlign="center">
                        <BlockStack gap="050"><Text as="span" fontWeight="semibold">{row.name}</Text><Text as="span" tone="subdued" variant="bodySm">{row.sku}{row.conflicts.length ? ` · ${row.conflicts.join(", ")}` : ""}</Text></BlockStack>
                        <Badge tone={row.action === "conflict" ? "critical" : row.action === "create" ? "success" : "info"}>{row.action}</Badge>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </div>
              </>
            ) : null}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </AppPage>
  );
}
