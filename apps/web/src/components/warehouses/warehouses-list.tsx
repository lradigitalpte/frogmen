"use client";

import {
  Badge,
  BlockStack,
  Button,
  EmptyState,
  IndexFilters,
  IndexFiltersMode,
  IndexTable,
  InlineStack,
  Link,
  Text,
  useSetIndexFiltersMode,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveWarehouse,
  listWarehouses,
  restoreWarehouse,
} from "@/lib/warehouses-api";
import { listStock } from "@/lib/products-api";
import type { Warehouse, WarehouseTab } from "@/types/warehouse";
import { AppPage, IndexSurface } from "@/components/layout/page";

const tabs: { id: WarehouseTab; content: string }[] = [
  { id: "all", content: "All" },
  { id: "archived", content: "Archived" },
];

function locationLine(warehouse: Warehouse) {
  return [warehouse.city, warehouse.countryCode].filter(Boolean).join(", ") || " ";
}

export function WarehousesListPage() {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockByWarehouse, setStockByWarehouse] = useState<Map<string, number>>(
    new Map(),
  );
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { mode, setMode } = useSetIndexFiltersMode(IndexFiltersMode.Filtering);

  const activeTab = tabs[selectedTab]?.id ?? "all";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadWarehouses = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [result, stockResult] = await Promise.all([
        listWarehouses({
          page,
          perPage: 16,
          search: debouncedQuery || undefined,
          archived: activeTab === "archived",
          sortBy: "name",
          sortDir: "asc",
        }),
        listStock({ perPage: 500 }),
      ]);

      const stockMap = new Map<string, number>();
      for (const row of stockResult.data) {
        stockMap.set(
          row.warehouseId,
          (stockMap.get(row.warehouseId) ?? 0) + (Number(row.quantity) || 0),
        );
      }

      setStockByWarehouse(stockMap);
      setWarehouses(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load warehouses",
      );
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedQuery, page]);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedQuery]);

  async function handleArchive(id: string) {
    if (activeTab === "archived") {
      await restoreWarehouse(id);
    } else {
      await archiveWarehouse(id);
    }

    await loadWarehouses();
  }

  const rowMarkup = warehouses.map((warehouse, index) => (
    <IndexTable.Row id={warehouse.id} key={warehouse.id} position={index}>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Link
            dataPrimaryLink
            url={`/dashboard/inventory/warehouses/${warehouse.id}`}
          >
            <Text as="span" fontWeight="semibold">
              {warehouse.name}
            </Text>
          </Link>
          <Badge>{warehouse.code}</Badge>
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>{locationLine(warehouse)}</IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={(stockByWarehouse.get(warehouse.id) ?? 0) > 0 ? "success" : undefined}>
          {`${stockByWarehouse.get(warehouse.id) ?? 0} units`}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button
            size="slim"
            url={`/dashboard/inventory/warehouses/${warehouse.id}`}
            variant="plain"
          >
            View
          </Button>
          <Button
            size="slim"
            url={`/dashboard/inventory/warehouses/${warehouse.id}/edit`}
            variant="plain"
          >
            Edit
          </Button>
          <Button
            size="slim"
            tone={activeTab === "archived" ? "success" : "critical"}
            variant="plain"
            onClick={() => handleArchive(warehouse.id)}
          >
            {activeTab === "archived" ? "Restore" : "Archive"}
          </Button>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const emptyState = useMemo(
    () => (
      <EmptyState
        action={{
          content: "Create warehouse",
          onAction: () => router.push("/dashboard/inventory/warehouses/new"),
        }}
        heading="Create your first warehouse"
        image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
      >
        <p>Warehouses hold stock for your goods products.</p>
      </EmptyState>
    ),
    [router],
  );

  return (
    <AppPage
      backAction={{ content: "Inventory", url: "/dashboard/inventory" }}
      fullWidth
      primaryAction={{
        content: "Create warehouse",
        onAction: () => router.push("/dashboard/inventory/warehouses/new"),
      }}
      subtitle="Storage locations for your inventory."
      title="Warehouses"
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
            queryPlaceholder="Search warehouses"
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
              { title: "Location" },
              { title: "Stock" },
              { title: "" },
            ]}
            itemCount={total}
            loading={loading}
            pagination={{
              hasNext: page * 16 < total,
              hasPrevious: page > 1,
              onNext: () => setPage((current) => current + 1),
              onPrevious: () => setPage((current) => Math.max(1, current - 1)),
            }}
            resourceName={{ singular: "warehouse", plural: "warehouses" }}
          >
            {rowMarkup}
          </IndexTable>
        </IndexSurface>
      </BlockStack>
    </AppPage>
  );
}
