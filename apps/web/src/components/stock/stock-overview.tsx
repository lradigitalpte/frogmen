"use client";

import {
  BlockStack,
  Button,
  ChoiceList,
  EmptyState,
  IndexFilters,
  IndexFiltersMode,
  IndexTable,
  InlineStack,
  Link,
  Text,
  useSetIndexFiltersMode,
} from "@shopify/polaris";
import { AlertTriangle, Boxes, Package, PackageX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { currencyById, formatCurrencyAmount } from "@/lib/currency-utils";
import { formatQuantity } from "@/lib/format-quantity";
import { listStock } from "@/lib/products-api";
import { listWarehouses } from "@/lib/warehouses-api";
import type { StockOverviewRow } from "@/types/product";
import type { Warehouse } from "@/types/warehouse";

const PER_PAGE = 20;

type StockTab = "all" | "out_of_stock" | "low_stock" | "serialized";

const tabs: { id: StockTab; content: string }[] = [
  { id: "all", content: "All stock" },
  { id: "out_of_stock", content: "Out of stock" },
  { id: "low_stock", content: "Low stock" },
  { id: "serialized", content: "Serialized" },
];

function quantityBadge(row: StockOverviewRow) {
  const qty = Number(row.quantity) || 0;
  const formatted = formatQuantity(row.quantity);
  if (qty === 0) {
    return <StatusBadge variant="destructive">0</StatusBadge>;
  }
  if (qty <= 2) {
    return <StatusBadge variant="warning">{formatted}</StatusBadge>;
  }
  return (
    <Text as="span" fontWeight="bold" variant="bodyLg">
      {formatted}
    </Text>
  );
}

export function StockOverviewPage() {
  const router = useRouter();
  const { currencies, catalogCurrencyId } = useOrgCurrency();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [selectedTab, setSelectedTab] = useState(0);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<StockOverviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { mode, setMode } = useSetIndexFiltersMode(IndexFiltersMode.Filtering);

  const activeTab = tabs[selectedTab]?.id ?? "all";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    void listWarehouses({ perPage: 100 })
      .then((result) => setWarehouses(result.data))
      .catch(() => setWarehouses([]));
  }, []);

  const loadStock = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await listStock({
        page,
        perPage: PER_PAGE,
        search: debouncedQuery || undefined,
        warehouseId: warehouseFilter || undefined,
      });

      setRows(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stock");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, page, warehouseFilter]);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, warehouseFilter, activeTab]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const qty = Number(row.quantity) || 0;
      if (activeTab === "out_of_stock") return qty === 0;
      if (activeTab === "low_stock") return qty > 0 && qty <= 2;
      if (activeTab === "serialized") return row.trackSerial;
      return true;
    });
  }, [activeTab, rows]);

  const stats = useMemo(() => {
    let zeroCount = 0;
    let lowCount = 0;
    let totalUnits = 0;

    for (const row of rows) {
      const qty = Number(row.quantity) || 0;
      totalUnits += qty;
      if (qty === 0) zeroCount += 1;
      else if (qty <= 2) lowCount += 1;
    }

    return { zeroCount, lowCount, totalUnits };
  }, [rows]);

  const warehouseChoices = useMemo(
    () => [
      { label: "All warehouses", value: "" },
      ...warehouses.map((warehouse) => ({
        label: warehouse.name,
        value: warehouse.id,
      })),
    ],
    [warehouses],
  );

  const filters = useMemo(
    () => [
      {
        key: "warehouse",
        label: "Warehouse",
        filter: (
          <ChoiceList
            allowMultiple={false}
            choices={warehouseChoices}
            selected={warehouseFilter ? [warehouseFilter] : [""]}
            title="Warehouse"
            titleHidden
            onChange={(value) => setWarehouseFilter(value[0] ?? "")}
          />
        ),
        shortcut: true,
      },
    ],
    [warehouseChoices, warehouseFilter],
  );

  const appliedFilters = useMemo(() => {
    if (!warehouseFilter) return [];
    const warehouse = warehouses.find((item) => item.id === warehouseFilter);
    return [
      {
        key: "warehouse",
        label: `Warehouse: ${warehouse?.name ?? "Selected"}`,
        onRemove: () => setWarehouseFilter(""),
      },
    ];
  }, [warehouseFilter, warehouses]);

  function formatSellingPrice(row: StockOverviewRow) {
    if (!row.sellingPrice) {
      return " ";
    }

    const currency = currencyById(
      currencies,
      row.priceCurrencyId ?? catalogCurrencyId,
    );

    return formatCurrencyAmount(row.sellingPrice, currency);
  }

  const rowMarkup = filteredRows.map((row, index) => (
    <IndexTable.Row
      id={`${row.productId}-${row.warehouseId}`}
      key={`${row.productId}-${row.warehouseId}`}
      position={index}
    >
      <IndexTable.Cell>
        <InlineStack gap="300" blockAlign="center">
          <ProductListThumbnail
            alt={row.productName}
            imagePath={row.productImage}
          />
          <BlockStack gap="100">
            <Link url={`/dashboard/inventory/products/${row.productId}`}>
              <Text as="span" fontWeight="semibold">
                {row.productName}
              </Text>
            </Link>
            <Text as="span" tone="subdued" variant="bodySm">
              {row.trackSerial && row.serialSummary
                ? row.serialSummary
                : row.productSku || "No SKU"}
            </Text>
          </BlockStack>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Link url={`/dashboard/inventory/warehouses/${row.warehouseId}`}>
          {row.warehouseName}
        </Link>
      </IndexTable.Cell>
      <IndexTable.Cell>{quantityBadge(row)}</IndexTable.Cell>
      <IndexTable.Cell>{formatSellingPrice(row)}</IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge variant={row.trackSerial ? "info" : "neutral"}>
          {row.trackSerial ? "Serialized" : "Bulk"}
        </StatusBadge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button
            size="slim"
            url={`/dashboard/inventory/update-stock?productId=${row.productId}&warehouseId=${row.warehouseId}`}
            variant="primary"
          >
            Update stock
          </Button>
          <Button
            size="slim"
            variant="plain"
            url={`/dashboard/inventory/products/${row.productId}`}
          >
            View
          </Button>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const emptyState = useMemo(
    () => (
      <EmptyState
        action={{
          content: "Add product",
          onAction: () => router.push("/dashboard/inventory/products/new"),
        }}
        heading="No stock rows found"
        image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
      >
        <p>
          {debouncedQuery || warehouseFilter || activeTab !== "all"
            ? "Try changing the filters or search term."
            : "Create a product and warehouse, then receive stock to see rows here."}
        </p>
      </EmptyState>
    ),
    [activeTab, debouncedQuery, router, warehouseFilter],
  );

  return (
    <AppPage
      fullWidth
      title="Inventory"
      subtitle="On-hand quantities across products and warehouses."
      primaryAction={{
        content: "Update stock",
        url: "/dashboard/inventory/update-stock",
      }}
      secondaryActions={[
        { content: "Add product", url: "/dashboard/inventory/products/new" },
        { content: "Products", url: "/dashboard/inventory/products" },
        { content: "Tags", url: "/dashboard/inventory/product-tags" },
        { content: "Categories", url: "/dashboard/inventory/product-categories" },
        { content: "Warehouses", url: "/dashboard/inventory/warehouses" },
      ]}
    >
      <BlockStack gap="400">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<Boxes className="size-5" />}
            label="Stock lines"
            value={String(total)}
            hint="product × warehouse rows"
            tone="default"
            loading={loading}
          />
          <KpiCard
            icon={<Package className="size-5" />}
            label="Units on page"
            value={String(stats.totalUnits)}
            hint="quantity in current view"
            tone="default"
            loading={loading}
          />
          <KpiCard
            icon={<PackageX className="size-5" />}
            label="Out of stock"
            value={String(stats.zeroCount)}
            hint="zero qty on this page"
            tone={stats.zeroCount > 0 ? "warning" : "default"}
            loading={loading}
          />
          <KpiCard
            icon={<AlertTriangle className="size-5" />}
            label="Low stock"
            value={String(stats.lowCount)}
            hint="≤2 units on this page"
            tone={stats.lowCount > 0 ? "warning" : "muted"}
            loading={loading}
          />
        </div>

        {error ? (
          <Text as="p" tone="critical">
            {error}
          </Text>
        ) : null}

        <IndexSurface>
          <IndexFilters
            appliedFilters={appliedFilters}
            canCreateNewView={false}
            cancelAction={{
              onAction: () => {
                setQuery("");
                setWarehouseFilter("");
              },
              disabled: false,
              loading: false,
            }}
            filters={filters}
            mode={mode}
            queryPlaceholder="Search products, SKU, or serials"
            queryValue={query}
            selected={selectedTab}
            tabs={tabs}
            onClearAll={() => {
              setQuery("");
              setWarehouseFilter("");
            }}
            onQueryChange={setQuery}
            onQueryClear={() => setQuery("")}
            onSelect={setSelectedTab}
            setMode={setMode}
          />

          <IndexTable
            emptyState={emptyState}
            headings={[
              { title: "Product" },
              { title: "Warehouse" },
              { title: "On hand" },
              { title: "Selling price" },
              { title: "Type" },
              { title: "" },
            ]}
            itemCount={activeTab === "all" ? total : filteredRows.length}
            loading={loading}
            pagination={{
              hasNext: activeTab === "all" && page * PER_PAGE < total,
              hasPrevious: page > 1,
              onNext: () => setPage((current) => current + 1),
              onPrevious: () => setPage((current) => Math.max(1, current - 1)),
            }}
            resourceName={{ singular: "stock row", plural: "stock rows" }}
          >
            {rowMarkup}
          </IndexTable>
        </IndexSurface>
      </BlockStack>
    </AppPage>
  );
}
