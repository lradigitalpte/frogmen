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
import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/components/sales/format-money";
import { AppSearchSelect } from "@/components/ui/app-search-select";
import { useProductDocumentCurrency } from "@/hooks/use-product-document-currency";
import type { Product } from "@/types/product";
import type { Warehouse } from "@/types/warehouse";

export interface AddPurchaseOrderLineInput {
  productId: string;
  warehouseId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  productName: string;
  productSku?: string | null;
  sellingPrice?: number | null;
  warehouseName: string;
}

interface AddPurchaseOrderLineModalProps {
  open: boolean;
  products: Product[];
  warehouses: Warehouse[];
  documentCurrencyId?: string;
  currencyCode?: string;
  onClose: () => void;
  onAdd: (line: AddPurchaseOrderLineInput) => void;
  initialProductId?: string;
  initialWarehouseId?: string;
}

export function AddPurchaseOrderLineModal({
  open,
  products,
  warehouses,
  documentCurrencyId,
  currencyCode,
  onClose,
  onAdd,
  initialProductId,
  initialWarehouseId,
}: AddPurchaseOrderLineModalProps) {
  const [productId, setProductId] = useState(
    initialProductId ?? products[0]?.id ?? "",
  );
  const [warehouseId, setWarehouseId] = useState(
    initialWarehouseId ?? warehouses[0]?.id ?? "",
  );
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");
  const [pricingError, setPricingError] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  const product = useMemo(
    () => products.find((item) => item.id === productId),
    [productId, products],
  );
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
      setProductId(initialProductId ?? products[0]?.id ?? "");
      setWarehouseId(initialWarehouseId ?? warehouses[0]?.id ?? "");
      setQuantity("1");
      setUnitPrice("0");
      setPricingError(null);
    }
    wasOpenRef.current = open;
  }, [open, initialProductId, initialWarehouseId, products, warehouses]);

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

  const lineTotal = (Number(quantity) || 0) * (Number(unitPrice) || 0);
  const displayCurrencyCode = currencyCode ?? documentCurrencyCode;
  const unitCostHelpText = product
    ? `Catalog cost ${formatProductCatalogCost(product)} converted to ${displayCurrencyCode}`
    : "Defaults to catalog cost converted to PO currency";
  const productOptions = useMemo(
    () =>
      products.map((item) => ({
        value: item.id,
        label: item.name,
        description: item.sku ? `SKU: ${item.sku}` : undefined,
      })),
    [products],
  );

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
          {products.length === 0 ? (
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
              options={productOptions}
              placeholder="Search by product name or SKU..."
              value={productId}
              onChange={setProductId}
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
          </FormLayout>

          <div className="quotation-summary-panel__total">
            <Text as="span" tone="subdued">
              Line total
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
