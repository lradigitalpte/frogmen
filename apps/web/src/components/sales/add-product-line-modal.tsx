"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  ChoiceList,
  Divider,
  FormLayout,
  InlineGrid,
  InlineStack,
  Modal,
  ResourceItem,
  ResourceList,
  Tabs,
  Text,
  TextField,
  Select,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProductCatalogSearchResults } from "@/components/products/product-catalog-search-results";
import { LineItemDescription } from "@/components/sales/line-item-description";
import {
  applyPriceAdjustment,
  pricingAdjustmentLabel,
  type SalesPricingSettings,
} from "@frog1/shared";
import { listProducts, listProductUnits, getProductStock, getProductUnit, getProduct } from "@/lib/products-api";
import {
  getMaxAllowedQuantity,
  sumStockQuantity,
} from "@/lib/line-item-utils";
import type { Product, ProductUnit, ProductStock, ProductUnitDetail } from "@/types/product";
import type { AddQuotationLineInput } from "@/lib/quotations-api";
import { WarrantyPolicyPicker } from "@/components/warranty/warranty-policy-picker";
import { useProductDocumentCurrency } from "@/hooks/use-product-document-currency";

interface ExistingLineAllocation {
  productId: string;
  productUnitId?: string | null;
  quantity: number;
}

interface AddProductLineModalProps {
  open: boolean;
  documentCurrencyId: string;
  onClose: () => void;
  onAdd: (input: AddQuotationLineInput) => Promise<void>;
  defaultTaxRate?: number;
  customerIsLocal?: boolean;
  priceAdjustmentEnabled?: boolean;
  salesPricing?: SalesPricingSettings;
  existingLines?: ExistingLineAllocation[];
}

export function AddProductLineModal({
  open,
  documentCurrencyId,
  onClose,
  onAdd,
  defaultTaxRate,
  customerIsLocal = false,
  priceAdjustmentEnabled = true,
  salesPricing,
  existingLines = [],
}: AddProductLineModalProps) {
  const resolvedDefaultTaxRate =
    defaultTaxRate ?? salesPricing?.defaultVatRatePercent ?? 5;
  const vatRates = useMemo(() => {
    const configured = salesPricing?.vatRates ?? [0, 5];
    return [...new Set([...configured, resolvedDefaultTaxRate])].sort(
      (a, b) => a - b,
    );
  }, [resolvedDefaultTaxRate, salesPricing?.vatRates]);
  const [selectedTab, setSelectedTab] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<ProductUnit | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("5");
  const [taxRatePercent, setTaxRatePercent] = useState(
    String(resolvedDefaultTaxRate),
  );
  const [description, setDescription] = useState("");
  const [productStock, setProductStock] = useState<ProductStock | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warrantyPolicyId, setWarrantyPolicyId] = useState("");
  const [attachedParts, setAttachedParts] = useState<
    ProductUnitDetail["childUnits"]
  >([]);
  const [selectedAttachedPartIds, setSelectedAttachedPartIds] = useState<string[]>(
    [],
  );
  const [loadingAttachedParts, setLoadingAttachedParts] = useState(false);

  const {
    currencyLoading,
    convertProductForDocument,
    documentCurrencyCode,
    exchangeRateError,
    exchangeRateLoading,
    fmt,
    formatProductCatalogPrice,
    pricePrefix,
  } = useProductDocumentCurrency(documentCurrencyId, products, selectedProduct);

  const pricingLabel = useMemo(
    () => pricingAdjustmentLabel(customerIsLocal, priceAdjustmentEnabled, salesPricing),
    [customerIsLocal, priceAdjustmentEnabled, salesPricing],
  );

  const availableQuantity = useMemo(
    () => sumStockQuantity(productStock),
    [productStock],
  );

  const allocationLines = useMemo(
    () =>
      existingLines.map((line, index) => ({
        id: `existing-${index}`,
        productId: line.productId,
        productUnitId: line.productUnitId ?? undefined,
        quantity: line.quantity,
        baseUnitPrice: 0,
        unitPrice: 0,
      })),
    [existingLines],
  );

  const remainingQuantity = useMemo(() => {
    if (!selectedProduct) {
      return 0;
    }

    if (selectedProduct.trackSerial) {
      return units.length;
    }

    return getMaxAllowedQuantity(
      availableQuantity,
      allocationLines,
      selectedProduct.id,
    );
  }, [selectedProduct, availableQuantity, allocationLines, units.length]);

  const modalTabs = [
    { id: "catalog", content: "1. Select Equipment" },
    { id: "pricing", content: "2. Manual Pricing, Discount & VAT" },
  ];

  const reset = useCallback(() => {
    setSelectedTab(0);
    setSearch("");
    setDebouncedSearch("");
    setSelectedProduct(null);
    setSelectedUnit(null);
    setUnits([]);
    setQuantity("1");
    setUnitPrice("");
    setDiscountPercent("5");
    setTaxRatePercent(String(resolvedDefaultTaxRate));
    setDescription("");
    setProductStock(null);
    setWarrantyPolicyId("");
    setAttachedParts([]);
    setSelectedAttachedPartIds([]);
    setLoadingAttachedParts(false);
    setError(null);
    setSaving(false);
  }, [resolvedDefaultTaxRate]);

  function applyAdjustedUnitPrice(basePrice: number) {
    return String(
      applyPriceAdjustment(
        basePrice,
        customerIsLocal,
        priceAdjustmentEnabled,
        salesPricing,
      ),
    );
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }

    let cancelled = false;

    async function load() {
      setLoadingProducts(true);

      try {
        const result = await listProducts({
          search: debouncedSearch || undefined,
          perPage: 25,
          sortBy: "name",
          sortDir: "asc",
          forSaleOnly: true,
          rootOnly: true,
          includeStock: true,
          inStockOnly: true,
        });

        if (!cancelled) {
          setProducts(result.data);
        }
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    }

    if (selectedTab === 0) {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [open, debouncedSearch, selectedTab, reset]);

  async function selectProduct(product: Product) {
    setSelectedProduct(product);
    setDescription(product.name);
    setWarrantyPolicyId(product.defaultWarrantyPolicyId ?? "");
    setTaxRatePercent(String(resolvedDefaultTaxRate));
    setProductStock(null);
    setStockLoading(true);
    setError(null);

    try {
      const converted = await convertProductForDocument(product);
      setUnitPrice(applyAdjustedUnitPrice(converted.unitPrice));

      const stock = await getProductStock(product.id);
      setProductStock(stock);

      if (product.trackSerial) {
        const result = await listProductUnits(product.id, {
          status: "in_stock",
          perPage: 50,
        });
        setUnits(result.data);
      } else {
        setUnits([]);
      }
    } catch (err) {
      setUnits([]);
      setProductStock(null);
      setError(err instanceof Error ? err.message : "Failed to load product pricing");
    } finally {
      setStockLoading(false);
    }

    setSelectedTab(1);
  }

  useEffect(() => {
    if (!selectedProduct) {
      return;
    }

    let cancelled = false;

    void convertProductForDocument(selectedProduct)
      .then((converted) => {
        if (!cancelled) {
          setUnitPrice(applyAdjustedUnitPrice(converted.unitPrice));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to update pricing");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    customerIsLocal,
    priceAdjustmentEnabled,
    salesPricing,
    selectedProduct,
    convertProductForDocument,
  ]);

  async function loadAttachedParts(unitId: string) {
    setLoadingAttachedParts(true);
    setAttachedParts([]);
    setSelectedAttachedPartIds([]);

    try {
      const unit = await getProductUnit(unitId);
      const available = unit.childUnits.filter(
        (child) => child.status === "assigned" || child.status === "in_stock",
      );
      setAttachedParts(available);
    } catch {
      setAttachedParts([]);
    } finally {
      setLoadingAttachedParts(false);
    }
  }

  function selectUnit(unit: ProductUnit) {
    setSelectedUnit(unit);
    void loadAttachedParts(unit.id);
    setSelectedTab(1);
  }

  // Real-time Line Calculation Preview
  const lineQty = selectedProduct?.trackSerial ? 1 : Number(quantity) || 1;
  const linePrice = Number(unitPrice) || 0;
  const lineDiscPct = Number(discountPercent) || 0;
  const lineTaxPct = Number(taxRatePercent) || 0;

  const subtotalBeforeDisc = lineQty * linePrice;
  const discountAmt = subtotalBeforeDisc * (lineDiscPct / 100);
  const netSubtotal = subtotalBeforeDisc - discountAmt;
  const taxAmt = netSubtotal * (lineTaxPct / 100);
  const calculatedTotal = netSubtotal + taxAmt;

  async function handleAdd(addAnother: boolean) {
    if (!selectedProduct) {
      setError("Please select an equipment product first.");
      setSelectedTab(0);
      return;
    }

    if (!Number.isFinite(lineQty) || lineQty <= 0) {
      setError("Enter a valid quantity");
      return;
    }

    if (!Number.isFinite(linePrice) || linePrice < 0) {
      setError("Enter a valid unit price");
      return;
    }

    if (selectedProduct.trackSerial && !selectedUnit) {
      setError("Select a serial number for this unit");
      return;
    }

    if (!selectedProduct.trackSerial && lineQty > remainingQuantity) {
      setError(`Only ${remainingQuantity} unit(s) available in stock.`);
      return;
    }

    if (remainingQuantity <= 0) {
      setError("No stock available for this product.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onAdd({
        productId: selectedProduct.id,
        productUnitId: selectedUnit?.id,
        description: description.trim() || selectedProduct.name,
        quantity: lineQty,
        unitPrice: linePrice,
        discountPercent: lineDiscPct,
        taxRatePercent: lineTaxPct,
        warrantyPolicyId: warrantyPolicyId || null,
      });

      for (const childId of selectedAttachedPartIds) {
        const child = attachedParts.find((part) => part.id === childId);
        if (!child) continue;

        const childProduct = await getProduct(child.productId);
        const converted = await convertProductForDocument(childProduct);

        await onAdd({
          productId: child.productId,
          productUnitId: child.id,
          description: `${child.productName} · S/N ${child.serialNumber}`,
          quantity: 1,
          unitPrice: Number(applyAdjustedUnitPrice(converted.unitPrice)),
          discountPercent: lineDiscPct,
          taxRatePercent: lineTaxPct,
          warrantyPolicyId: childProduct.defaultWarrantyPolicyId ?? null,
        });
      }

      if (addAnother) {
        reset();
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add line item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={() => {
        onClose();
        reset();
      }}
      open={open}
      title={
        selectedProduct
          ? `Add ${selectedProduct.name} to Quotation`
          : "Add Equipment to Quotation"
      }
      primaryAction={{
        content: selectedTab === 0 ? "Next: Configure Pricing" : "Add to Quotation",
        disabled: selectedTab === 0 && !selectedProduct,
        loading: saving || currencyLoading || exchangeRateLoading,
        onAction: () => {
          if (selectedTab === 0) {
            if (selectedProduct) setSelectedTab(1);
          } else {
            void handleAdd(false);
          }
        },
      }}
      secondaryActions={[
        ...(selectedTab === 1
          ? [
              {
                content: "Add & Add Another",
                loading: saving,
                onAction: () => void handleAdd(true),
              },
            ]
          : []),
        {
          content: selectedTab === 0 ? "Cancel" : "Back to Catalog",
          onAction: () => {
            if (selectedTab === 0) {
              onClose();
              reset();
            } else {
              setSelectedTab(0);
            }
          },
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Tabs
            tabs={modalTabs}
            selected={selectedTab}
            onSelect={(idx) => setSelectedTab(idx)}
          />

          {exchangeRateError ? (
            <Banner tone="warning">{exchangeRateError}</Banner>
          ) : null}

          {error ? (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          ) : null}

          {/* TAB 0: Select Equipment Catalog */}
          {selectedTab === 0 ? (
            <BlockStack gap="300">
              <TextField
                autoComplete="off"
                label="Search Equipment Catalog"
                onChange={setSearch}
                placeholder="Search by product name, model, or SKU (e.g. ROV, Regulator)"
                value={search}
              />
              {loadingProducts ? (
                <Text as="p" tone="subdued">
                  Loading equipment catalog…
                </Text>
              ) : (
                <ProductCatalogSearchResults>
                  <ResourceList
                    items={products}
                    renderItem={(product) => (
                      <ResourceItem
                        id={product.id}
                        onClick={() => void selectProduct(product)}
                        accessibilityLabel={`Select ${product.name}`}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="100">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                {product.name}
                              </Text>
                              {product.trackSerial ? (
                                <Badge tone="info">Serial Tracked</Badge>
                              ) : null}
                            </InlineStack>
                            <Text as="span" tone="subdued" variant="bodySm">
                              SKU: {product.sku || "N/A"}
                              {product.availableQuantity == null
                                ? ""
                                : ` · Qty on hand: ${product.availableQuantity}`}
                            </Text>
                          </BlockStack>
                          <Text as="span" variant="bodyMd" fontWeight="bold">
                            {formatProductCatalogPrice(product)}
                          </Text>
                        </InlineStack>
                      </ResourceItem>
                    )}
                  />
                </ProductCatalogSearchResults>
              )}
            </BlockStack>
          ) : null}

          {/* TAB 1: Manual Pricing, Discount & VAT Settings */}
          {selectedTab === 1 ? (
            <BlockStack gap="400">
              {selectedProduct?.trackSerial ? (
                <Card>
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">
                      Serial number
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Choose which in-stock unit to attach to this quotation line.
                    </Text>

                    {loadingUnits ? (
                      <Text as="p" tone="subdued">
                        Loading available serials…
                      </Text>
                    ) : units.length === 0 ? (
                      <Banner tone="warning">
                        No in-stock serials for this product. Add units on the
                        product page under Inventory → Products.
                      </Banner>
                    ) : (
                      <ResourceList
                        items={units}
                        renderItem={(unit) => (
                          <ResourceItem
                            id={unit.id}
                            onClick={() => selectUnit(unit)}
                            accessibilityLabel={`Select serial ${unit.serialNumber}`}
                          >
                            <InlineStack align="space-between" blockAlign="center">
                              <BlockStack gap="100">
                                <Text as="span" variant="bodyMd" fontWeight="semibold">
                                  {unit.serialNumber}
                                </Text>
                                {unit.notes ? (
                                  <Text as="span" tone="subdued" variant="bodySm">
                                    {unit.notes}
                                  </Text>
                                ) : null}
                              </BlockStack>
                              {selectedUnit?.id === unit.id ? (
                                <Badge tone="success">Selected</Badge>
                              ) : (
                                <Badge>Click to select</Badge>
                              )}
                            </InlineStack>
                          </ResourceItem>
                        )}
                      />
                    )}
                  </BlockStack>
                </Card>
              ) : null}

              {selectedProduct?.trackSerial && selectedUnit ? (
                <Card>
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">
                      Attached parts
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Optional   add linked components as separate quotation
                      lines, or leave none selected to sell the ROV only.
                    </Text>

                    {loadingAttachedParts ? (
                      <Text as="p" tone="subdued">
                        Loading attached parts…
                      </Text>
                    ) : attachedParts.length === 0 ? (
                      <Text as="p" tone="subdued" variant="bodySm">
                        No parts linked to serial {selectedUnit.serialNumber}.
                      </Text>
                    ) : (
                      <ChoiceList
                        allowMultiple
                        choices={attachedParts.map((part) => ({
                          label: `${part.productName} · S/N ${part.serialNumber}`,
                          value: part.id,
                          helpText:
                            part.status === "assigned"
                              ? "Attached to this ROV"
                              : "In stock",
                        }))}
                        selected={selectedAttachedPartIds}
                        title="Include on quotation"
                        onChange={setSelectedAttachedPartIds}
                      />
                    )}
                  </BlockStack>
                </Card>
              ) : null}

              <Banner tone="info">
                Manually adjust the Unit Price, apply commercial Discount (%), and set VAT Tax Rate (%) for this quote line.
              </Banner>

              {pricingLabel ? <Badge tone="info">{pricingLabel}</Badge> : null}

              <Text as="p" tone="subdued">
                Available: {stockLoading ? "Loading..." : selectedProduct?.trackSerial ? units.length : availableQuantity}
                {!selectedProduct?.trackSerial ? ` (${remainingQuantity} remaining on this quote)` : null}
              </Text>

              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Selected Item</Text>
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <Text as="span" fontWeight="bold">
                        {selectedProduct?.name ?? "Equipment Line"}
                      </Text>
                      {selectedProduct?.trackSerial && selectedUnit ? (
                        <Text as="span" tone="subdued" variant="bodySm">
                          Serial: {selectedUnit.serialNumber}
                        </Text>
                      ) : null}
                    </BlockStack>
                    <Badge tone="success">
                      {`${fmt(linePrice)} on quote`}
                    </Badge>
                  </InlineStack>
                </BlockStack>
              </Card>

              <FormLayout>
                <TextField
                  autoComplete="off"
                  label="Line Item Description"
                  onChange={setDescription}
                  value={description}
                  helpText="Shown as the product name on the quotation. Kit contents from the product record appear underneath when available."
                />
                {selectedProduct?.description?.trim() ? (
                  <Box
                    background="bg-surface-secondary"
                    borderRadius="200"
                    padding="300"
                  >
                    <BlockStack gap="150">
                      <Text as="p" tone="subdued" variant="bodySm">
                        Included on quotation
                      </Text>
                      <LineItemDescription
                        boldTitle={false}
                        details={selectedProduct.description}
                        title=""
                      />
                    </BlockStack>
                  </Box>
                ) : null}

                <FormLayout.Group>
                  <TextField
                    autoComplete="off"
                    label={`Unit price (${documentCurrencyCode}) [Manual Override]`}
                    onChange={setUnitPrice}
                    prefix={pricePrefix}
                    type="number"
                    value={unitPrice}
                    helpText="Change converted selling price for this quotation"
                  />
                  <TextField
                    autoComplete="off"
                    disabled={Boolean(selectedProduct?.trackSerial)}
                    label="Quantity"
                    onChange={setQuantity}
                    type="number"
                    value={quantity}
                  />
                </FormLayout.Group>

                <FormLayout.Group>
                  <TextField
                    autoComplete="off"
                    label="Discount (%)"
                    onChange={setDiscountPercent}
                    type="number"
                    value={discountPercent}
                    helpText="Apply commercial discount rate"
                  />
                  <Select
                    label="VAT / Tax Rate (%)"
                    onChange={setTaxRatePercent}
                    options={vatRates.map((rate) => ({
                      label: rate === 0 ? "0%   Zero rated / exempt" : `${rate}%`,
                      value: String(rate),
                    }))}
                    value={taxRatePercent}
                    helpText="Rates are managed in Settings → Taxes & pricing"
                  />
                </FormLayout.Group>
              </FormLayout>

              <WarrantyPolicyPicker
                helpText="Overrides the product default for this quotation line."
                onChange={setWarrantyPolicyId}
                value={warrantyPolicyId}
              />

              <Divider />

              {/* Real-time Line Calculation Box */}
              <div className="quotation-summary-panel__total">
                <Text as="h3" variant="headingSm">Line Item Calculation Preview</Text>
                <InlineGrid columns={2} gap="200">
                  <div>
                    <Text as="span" tone="subdued" variant="bodySm">Subtotal (Qty x Price):</Text>
                    <Text as="p" fontWeight="semibold">{fmt(subtotalBeforeDisc)}</Text>
                  </div>
                  <div>
                    <Text as="span" tone="subdued" variant="bodySm">Discount ({lineDiscPct}%):</Text>
                    <Text as="p" tone="success">-{fmt(discountAmt)}</Text>
                  </div>
                  <div>
                    <Text as="span" tone="subdued" variant="bodySm">VAT / Tax ({lineTaxPct}%):</Text>
                    <Text as="p" fontWeight="semibold">+{fmt(taxAmt)}</Text>
                  </div>
                  <div>
                    <Text as="span" tone="subdued" variant="bodySm">Net Line Total:</Text>
                    <Text as="p" variant="headingMd" fontWeight="bold">{fmt(calculatedTotal)}</Text>
                  </div>
                </InlineGrid>
              </div>
            </BlockStack>
          ) : null}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
