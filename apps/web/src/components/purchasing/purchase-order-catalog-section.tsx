"use client";

import {
  Badge,
  BlockStack,
  Button,
  Card,
  FormLayout,
  InlineStack,
  ResourceItem,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useMemo, useState } from "react";
import { ProductCatalogResourceList } from "@/components/products/product-catalog-resource-list";
import { ProductCatalogSearchResults } from "@/components/products/product-catalog-search-results";
import { formatMoney } from "@/components/sales/format-money";
import { useProductDocumentCurrency } from "@/hooks/use-product-document-currency";
import { listProducts } from "@/lib/products-api";
import type { AddPurchaseOrderLineInput } from "@/components/purchasing/add-purchase-order-line-modal";
import type { Product } from "@/types/product";
import type { Warehouse } from "@/types/warehouse";

const SUGGESTION_LIMIT = 6;
const SEARCH_LIMIT = 12;

interface PurchaseOrderCatalogSectionProps {
  warehouses: Warehouse[];
  documentCurrencyId?: string;
  currencyCode?: string;
  defaultWarehouseId?: string;
  onAdd: (line: AddPurchaseOrderLineInput) => void;
}

export function PurchaseOrderCatalogSection({
  warehouses,
  documentCurrencyId,
  currencyCode,
  defaultWarehouseId,
  onAdd,
}: PurchaseOrderCatalogSectionProps) {
  const [catalogSearch, setCatalogSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [warehouseId, setWarehouseId] = useState(
    defaultWarehouseId ?? warehouses[0]?.id ?? "",
  );
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");
  const [pricingError, setPricingError] = useState<string | null>(null);

  const warehouse = useMemo(
    () => warehouses.find((item) => item.id === warehouseId),
    [warehouseId, warehouses],
  );

  const productsForCurrency = useMemo(
    () => (selectedProduct ? [selectedProduct] : []),
    [selectedProduct],
  );

  const {
    convertProductForDocument,
    documentCurrencyCode,
    exchangeRateError,
    exchangeRateLoading,
    formatProductCatalogCost,
    pricePrefix,
  } = useProductDocumentCurrency(
    documentCurrencyId,
    productsForCurrency,
    selectedProduct,
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(catalogSearch.trim()), 250);
    return () => clearTimeout(timer);
  }, [catalogSearch]);

  useEffect(() => {
    let cancelled = false;
    setProductsLoading(true);

    void listProducts({
      storableOnly: true,
      search: debouncedSearch || undefined,
      perPage: debouncedSearch ? SEARCH_LIMIT : SUGGESTION_LIMIT,
      sortBy: debouncedSearch ? "name" : undefined,
      sortDir: debouncedSearch ? "asc" : undefined,
    })
      .then((result) => {
        if (!cancelled) {
          setProducts(result.data);
          setCatalogTotal(result.meta?.total ?? result.data.length);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProducts([]);
          setCatalogTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  useEffect(() => {
    if (!selectedProduct || !documentCurrencyId) {
      return;
    }

    let cancelled = false;
    setPricingError(null);

    void convertProductForDocument(selectedProduct)
      .then((converted) => {
        if (!cancelled) {
          setUnitPrice(String(converted.unitCost));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPricingError(
            err instanceof Error ? err.message : "Failed to convert unit cost",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [convertProductForDocument, documentCurrencyId, selectedProduct?.id]);

  useEffect(() => {
    if (defaultWarehouseId) {
      setWarehouseId(defaultWarehouseId);
    }
  }, [defaultWarehouseId]);

  const displayCurrencyCode = currencyCode ?? documentCurrencyCode;

  function handleSelectProduct(product: Product) {
    setSelectedProduct(product);
    setQuantity("1");
    setPricingError(null);
  }

  function handleAddLine() {
    if (!selectedProduct || !warehouse) return;
    const qty = Number(quantity);
    const price = Number(unitPrice);
    if (!qty || qty <= 0 || Number.isNaN(price)) return;

    onAdd({
      productId: selectedProduct.id,
      warehouseId: warehouse.id,
      description: selectedProduct.name,
      quantity: qty,
      unitPrice: price,
      discountPercent: 0,
      discountAmount: 0,
      productName: selectedProduct.name,
      productSku: selectedProduct.sku,
      productDescription: selectedProduct.description,
      sellingPrice:
        selectedProduct.sellingPrice != null
          ? Number(selectedProduct.sellingPrice)
          : null,
      warehouseName: warehouse.name,
    });
    setSelectedProduct(null);
    setCatalogSearch("");
    setDebouncedSearch("");
  }

  const lineTotal =
    Math.round((Number(quantity) || 0) * (Number(unitPrice) || 0) * 100) / 100;

  const addDisabled =
    !selectedProduct ||
    !warehouse ||
    !documentCurrencyId ||
    exchangeRateLoading ||
    Boolean(exchangeRateError) ||
    Boolean(pricingError);

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              Choose products
            </Text>
            <Text as="p" tone="subdued">
              Search storable inventory, select a product, then set quantity and
              unit cost. Add as many lines as you need.
            </Text>
          </BlockStack>

          <TextField
            autoComplete="off"
            label="Search product catalog"
            labelHidden
            onChange={setCatalogSearch}
            placeholder="Search by product name or SKU..."
            value={catalogSearch}
          />

          <Text as="p" tone="subdued" variant="bodySm">
            {productsLoading && products.length === 0
              ? "Loading products..."
              : catalogTotal === 0
                ? "No storable products found."
                : debouncedSearch
                  ? `Showing ${products.length} of ${catalogTotal} matching products.`
                  : `${products.length} suggested products from your catalog — search to browse all ${catalogTotal}.`}
          </Text>

          {products.length > 0 ? (
            <ProductCatalogSearchResults>
              <ProductCatalogResourceList
                products={products}
                renderItem={(product) => (
                  <ResourceItem
                    id={product.id}
                    accessibilityLabel={`Select ${product.name}`}
                    onClick={() => handleSelectProduct(product)}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="050">
                        <Text as="span" fontWeight="bold">
                          {product.name}
                        </Text>
                        <Text as="span" tone="subdued" variant="bodySm">
                          SKU: {product.sku || "N/A"}
                        </Text>
                      </BlockStack>
                      <InlineStack gap="300" blockAlign="center">
                        <Text as="span" fontWeight="bold">
                          {formatProductCatalogCost(product)}
                        </Text>
                        <div onClick={(event) => event.stopPropagation()}>
                          <Button
                            size="slim"
                            variant="primary"
                            onClick={() => handleSelectProduct(product)}
                          >
                            Select
                          </Button>
                        </div>
                      </InlineStack>
                    </InlineStack>
                  </ResourceItem>
                )}
              />
            </ProductCatalogSearchResults>
          ) : null}
        </BlockStack>
      </Card>

      {selectedProduct ? (
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingMd">
                Configure: {selectedProduct.name}
              </Text>
              <Badge tone="info">
                {`Catalog cost ${formatProductCatalogCost(selectedProduct)}`}
              </Badge>
            </InlineStack>

            {exchangeRateError ? (
              <Text as="p" tone="critical">
                {exchangeRateError}
              </Text>
            ) : null}
            {pricingError ? (
              <Text as="p" tone="critical">
                {pricingError}
              </Text>
            ) : null}

            <FormLayout>
              <Select
                label="Receive into warehouse"
                options={warehouses.map((item) => ({
                  label: item.code ? `${item.name} (${item.code})` : item.name,
                  value: item.id,
                }))}
                value={warehouseId}
                onChange={setWarehouseId}
              />
              <FormLayout.Group>
                <TextField
                  autoComplete="off"
                  label="Quantity"
                  type="number"
                  value={quantity}
                  onChange={setQuantity}
                />
                <TextField
                  autoComplete="off"
                  disabled={exchangeRateLoading || !documentCurrencyId}
                  helpText={`Converted to ${displayCurrencyCode} for this PO`}
                  label="Unit cost"
                  prefix={pricePrefix}
                  type="number"
                  value={unitPrice}
                  onChange={setUnitPrice}
                />
              </FormLayout.Group>
            </FormLayout>

            <InlineStack align="space-between" blockAlign="center">
              <Text as="span" tone="subdued">
                Line total (before order discount):{" "}
                <Text as="span" fontWeight="bold">
                  {formatMoney(String(lineTotal), displayCurrencyCode)}
                </Text>
              </Text>
              <InlineStack gap="200">
                <Button onClick={() => setSelectedProduct(null)}>Cancel</Button>
                <Button
                  disabled={addDisabled}
                  loading={exchangeRateLoading}
                  variant="primary"
                  onClick={handleAddLine}
                >
                  Add to purchase order
                </Button>
              </InlineStack>
            </InlineStack>
          </BlockStack>
        </Card>
      ) : null}
    </BlockStack>
  );
}
