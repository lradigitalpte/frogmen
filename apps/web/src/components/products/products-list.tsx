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
  archiveProduct,
  listProducts,
  listStock,
  restoreProduct,
} from "@/lib/products-api";
import type { Product, ProductTab } from "@/types/product";
import { getProductDisplayTags } from "@/lib/product-tags";
import { getProductBadgeTone } from "@/lib/product-badges";
import { AppPage, IndexSurface } from "@/components/layout/page";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { currencyById, formatCurrencyAmount } from "@/lib/currency-utils";

const tabs: { id: ProductTab; content: string }[] = [
  { id: "all", content: "All" },
  { id: "for_sale", content: "For sale" },
  { id: "operations", content: "Operations" },
  { id: "rov", content: "ROV equipment" },
  { id: "goods", content: "Goods" },
  { id: "service", content: "Services" },
  { id: "archived", content: "Archived" },
];

export function ProductsListPage() {
  const router = useRouter();
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
  const [serialsByProduct, setSerialsByProduct] = useState<Map<string, string[]>>(
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

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [result, stockResult] = await Promise.all([
        listProducts({
          page,
          perPage: 16,
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
      const serialMap = new Map<string, string[]>();
      for (const row of stockResult.data) {
        stockMap.set(
          row.productId,
          (stockMap.get(row.productId) ?? 0) + (Number(row.quantity) || 0),
        );

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

  const rowMarkup = products.map((product, index) => (
    <IndexTable.Row id={product.id} key={product.id} position={index}>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Link
            dataPrimaryLink
            url={`/dashboard/inventory/products/${product.id}`}
          >
            <Text as="span" fontWeight="semibold">
              {product.name}
            </Text>
          </Link>
          <InlineStack gap="200">
            {getProductDisplayTags(product).map((tag) => (
              <Badge
                key={`${product.id}-${tag}`}
                tone={getProductBadgeTone(tag)}
              >
                {tag}
              </Badge>
            ))}
          </InlineStack>
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {(() => {
          const serials = serialsByProduct.get(product.id) ?? [];
          const serialLabel =
            product.trackSerial && serials.length > 0
              ? [...new Set(serials)].join(", ")
              : null;

          return product.sku || serialLabel || " ";
        })()}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {product.type === "service" || !product.isStorable ? (
          <Text as="span" tone="subdued">
            {" "}
          </Text>
        ) : (
          (() => {
            const qty = stockByProduct.get(product.id) ?? 0;
            if (qty === 0) {
              return <Badge tone="critical">0 on hand</Badge>;
            }
            return (
              <Badge tone={qty <= 2 ? "attention" : "success"}>
                {`${qty} on hand`}
              </Badge>
            );
          })()
        )}
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
  ));

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
              hasNext: page * 16 < total,
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
    </AppPage>
  );
}
