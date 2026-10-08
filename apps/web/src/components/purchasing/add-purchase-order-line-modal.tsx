"use client";

import {
  Banner,
  BlockStack,
  FormLayout,
  Modal,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { resolveLineDiscount } from "@frog1/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/components/sales/format-money";
import { AppSearchSelect } from "@/components/ui/app-search-select";
import { useProductDocumentCurrency } from "@/hooks/use-product-document-currency";
import { listProducts } from "@/lib/products-api";
import type { Product } from "@/types/product";
import type { Warehouse } from "@/types/warehouse";

export interface AddPurchaseOrderLineInput {
  productId: string;
  warehouseId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discountAmount?: number;
  productName: string;
  productSku?: string | null;
  sellingPrice?: number | null;
  warehouseName: string;
}

const SUGGESTION_LIMIT = 4;
const SEARCH_LIMIT = 10;

interface AddPurchaseOrderLineModalProps {
  open: boolean;
  warehouses: Warehouse[];
  documentCurrencyId?: string;
  currencyCode?: string;
  onClose: () => void;
  onAdd: (line: AddPurchaseOrderLineInput) => void;
  initialWarehouseId?: string;
}

export function AddPurchaseOrderLineModal({
  open,
  warehouses,
  documentCurrencyId,
  currencyCode,
  onClose,
  onAdd,
  initialWarehouseId,
}: AddPurchaseOrderLineModalProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [warehouseId, setWarehouseId] = useState(
    initialWarehouseId ?? warehouses[0]?.id ?? "",
  );
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");
  const [discountMode, setDiscountMode] = useState<"none" | "percent" | "amount">(
    "none",
  );
  const [discountValue, setDiscountValue] = useState("0");
  const [pricingError, setPricingError] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  const warehouse = useMemo(
    () => warehouses.find((item) => item.id === warehouseId),
    [warehouseId, warehouses],
  );
  const productsForCurrency = useMemo(
    () => (product ? [product] : []),
    [product],
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
    product,
  );

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setProduct(null);
      setProductQuery("");
      setDebouncedQuery("");
      setWarehouseId(initialWarehouseId ?? warehouses[0]?.id ?? "");
      setQuantity("1");
      setUnitPrice("0");
      setDiscountMode("none");
      setDiscountValue("0");
      setPricingError(null);
    }
    wasOpenRef.current = open;
  }, [open, initialWarehouseId, warehouses]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(productQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [productQuery]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setProductsLoading(true);

    void listProducts({
      storableOnly: true,
      search: debouncedQuery || undefined,
      perPage: debouncedQuery ? SEARCH_LIMIT : SUGGESTION_LIMIT,
      sortBy: debouncedQuery ? "name" : undefined,
      sortDir: debouncedQuery ? "asc" : undefined,
    })
      .then((result) => {
        if (!cancelled) setProductResults(result.data);
      })
      .catch(() => {
        if (!cancelled) setProductResults([]);
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open]);

  useEffect(() => {
    if (!open || !product || !documentCurrencyId) {
      return;
    }

    let cancelled = false;
    setPricingError(null);

    void convertProductForDocument(product)
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
  }, [convertProductForDocument, documentCurrencyId, open, product?.id]);

  const lineGross = (Number(quantity) || 0) * (Number(unitPrice) || 0);
  const parsedDiscount = Math.max(0, Number(discountValue) || 0);
  const lineDiscount =
    discountMode === "percent"
      ? resolveLineDiscount(lineGross, 0, parsedDiscount)
      : discountMode === "amount"
        ? resolveLineDiscount(lineGross, parsedDiscount, 0)
        : 0;
  const lineTotal = Math.round((lineGross - lineDiscount) * 100) / 100;
  const displayCurrencyCode = currencyCode ?? documentCurrencyCode;
  const unitCostHelpText = product
    ? `Catalog cost ${formatProductCatalogCost(product)} converted to ${displayCurrencyCode}`
    : "Defaults to catalog cost converted to PO currency";
  const productOptions = useMemo(
    () => productResults.map(toProductOption),
    [productResults],
  );

  function handleProductChange(nextId: string) {
    setProduct(productResults.find((item) => item.id === nextId) ?? null);
  }

  function handleAdd() {
    if (!product || !warehouse) return;
    const qty = Number(quantity);
    const price = Number(unitPrice);
    if (!qty || qty <= 0 || Number.isNaN(price)) return;

    onAdd({
      productId: product.id,
      warehouseId: warehouse.id,
      description: product.name,
      quantity: qty,
      unitPrice: price,
      discountPercent: discountMode === "percent" ? parsedDiscount : 0,
      discountAmount: discountMode === "amount" ? parsedDiscount : 0,
      productName: product.name,
      productSku: product.sku,
      sellingPrice:
        product.sellingPrice != null ? Number(product.sellingPrice) : null,
      warehouseName: warehouse.name,
    });
    onClose();
  }

  const addDisabled =
    !product ||
    !warehouse ||
    !documentCurrencyId ||
    exchangeRateLoading ||
    Boolean(exchangeRateError) ||
    Boolean(pricingError);

  return (
    <Modal
      open={open}
      primaryAction={{
        content: "Add to order",
        onAction: handleAdd,
        disabled: addDisabled,
        loading: exchangeRateLoading,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
      title="Add product line"
      onClose={onClose}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {!productsLoading && !debouncedQuery && productResults.length === 0 ? (
            <Banner tone="warning">
              No storable products found. Create a product in Inventory first.
            </Banner>
          ) : null}

          {exchangeRateError ? (
            <Banner tone="warning">{exchangeRateError}</Banner>
          ) : null}

          {pricingError ? (
            <Banner tone="critical">{pricingError}</Banner>
          ) : null}

          <FormLayout>
            <AppSearchSelect
              label="Product"
              loading={productsLoading || productQuery.trim() !== debouncedQuery}
              options={productOptions}
              placeholder="Search by product name or SKU..."
              selectedOption={product ? toProductOption(product) : null}
              value={product?.id ?? ""}
              onChange={handleProductChange}
              onQueryChange={setProductQuery}
            />
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
                helpText={unitCostHelpText}
                label="Unit cost"
                prefix={pricePrefix}
                type="number"
                value={unitPrice}
                onChange={setUnitPrice}
              />
            </FormLayout.Group>
            <FormLayout.Group>
              <Select
                label="Vendor discount"
                options={[
                  { label: "None", value: "none" },
                  { label: "Percent (%)", value: "percent" },
                  { label: "Fixed amount", value: "amount" },
                ]}
                value={discountMode}
                onChange={(value) => {
                  setDiscountMode(value as "none" | "percent" | "amount");
                  if (value === "none") {
                    setDiscountValue("0");
                  }
                }}
              />
              <TextField
                autoComplete="off"
                disabled={discountMode === "none"}
                label={discountMode === "amount" ? "Discount amount" : "Discount %"}
                prefix={discountMode === "amount" ? pricePrefix : undefined}
                suffix={discountMode === "percent" ? "%" : undefined}
                type="number"
                value={discountMode === "none" ? "" : discountValue}
                onChange={setDiscountValue}
              />
            </FormLayout.Group>
          </FormLayout>

          <div className="quotation-summary-panel__total">
            <Text as="span" tone="subdued">
              Line total{lineDiscount > 0 ? " (after discount)" : ""}
            </Text>
            <Text as="span" fontWeight="bold" variant="headingMd">
              {formatMoney(String(lineTotal), displayCurrencyCode)}
            </Text>
          </div>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function toProductOption(item: Product) {
  return {
    value: item.id,
    label: item.name,
    description: item.sku ? `SKU: ${item.sku}` : undefined,
  };
}
