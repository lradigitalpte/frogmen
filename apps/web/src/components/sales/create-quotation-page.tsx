"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineStack,
  Layout,
  ResourceItem,
  ResourceList,
  Select,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { pricingAdjustmentHelpText, pricingAdjustmentLabel } from "@frog1/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { formatMoney, todayIsoDate } from "@/components/sales/format-money";
import { defaultValidityHeader } from "@/components/sales/validity-period";
import {
  QuotationHeaderForm,
  type QuotationHeaderValues,
} from "@/components/sales/quotation-header-form";
import { listCurrencies } from "@/lib/currencies-api";
import type { Currency } from "@/lib/currencies-api";
import {
  applyPricingToLines,
  computeLineFinancialSummary,
  computeLineTotal,
  formatMarginPercent,
  getMaxAllowedQuantity,
  sumStockQuantity,
} from "@/lib/line-item-utils";
import { listProducts, listProductUnits, getProductStock } from "@/lib/products-api";
import type { Product, ProductUnit, ProductStock } from "@/types/product";
import { createQuotation, addQuotationLine } from "@/lib/quotations-api";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { useProductDocumentCurrency } from "@/hooks/use-product-document-currency";
import { useSalesPricing } from "@/hooks/use-sales-pricing";
import { convertAmount, currencyInputPrefix } from "@/lib/currency-utils";
import { getLatestExchangeRate } from "@/lib/exchange-rates-api";
import { ConfiguredLineItemsList } from "@/components/sales/configured-line-items-list";
import { EditConfiguredLineModal } from "@/components/sales/edit-configured-line-modal";
import type { ConfiguredLineItem } from "@/types/configured-line-item";
import { useToast } from "@/components/providers/toast-provider";

function emptyHeader(): QuotationHeaderValues {
  const quoteDate = todayIsoDate();
  const validity = defaultValidityHeader(quoteDate);

  return {
    customer: null,
    currencyId: "",
    quoteDate,
    validityPreset: validity.validityPreset,
    validityDate: validity.validityDate,
    customerReference: "",
    internalReference: "",
    paymentReference: "",
    notes: "",
  };
}

function formatDisplayDate(value: string) {
  if (!value) return " ";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ProfitSummaryPanel({
  totalCost,
  grossProfit,
  profitMarginPercent,
  formatAmount,
}: {
  totalCost: number;
  grossProfit: number;
  profitMarginPercent: number | null;
  formatAmount: (amount: number) => string;
}) {
  return (
    <>
      <Divider />
      <Text as="h3" variant="headingSm">
        Profit summary
      </Text>
      <div className="quotation-summary-panel__rows">
        <div className="quotation-summary-row">
          <Text as="span" tone="subdued" variant="bodySm">
            Total cost
          </Text>
          <Text as="span" fontWeight="semibold">
            {formatAmount(totalCost)}
          </Text>
        </div>
        <div className="quotation-summary-row">
          <Text as="span" tone="subdued" variant="bodySm">
            Gross profit
          </Text>
          <Text
            as="span"
            fontWeight="semibold"
            tone={grossProfit >= 0 ? "success" : "critical"}
          >
            {formatAmount(grossProfit)}
          </Text>
        </div>
        <div className="quotation-summary-row">
          <Text as="span" tone="subdued" variant="bodySm">
            Margin
          </Text>
          <span
            className={
              grossProfit >= 0
                ? "frogmen-margin-badge"
                : "frogmen-margin-badge frogmen-margin-badge--loss"
            }
          >
            {formatMarginPercent(profitMarginPercent)}
          </span>
        </div>
      </div>
    </>
  );
}

export function CreateQuotationPage() {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const { settings: salesPricing } = useSalesPricing();
  const { baseCurrency } = useOrgCurrency();
  const [selectedTab, setSelectedTab] = useState(0);
  const [values, setValues] = useState<QuotationHeaderValues>(emptyHeader);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [currenciesLoading, setCurrenciesLoading] = useState(true);
  const [currenciesError, setCurrenciesError] = useState<string | null>(null);

  // Product catalog state
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogTotal, setCatalogTotal] = useState(0);

  // Serial Selection State for serial-tracked items
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [inStockUnits, setInStockUnits] = useState<ProductUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");

  // Line items state
  const [lines, setLines] = useState<ConfiguredLineItem[]>([]);
  const [priceAdjustmentEnabled, setPriceAdjustmentEnabled] = useState(true);
  const [selectedProductStock, setSelectedProductStock] = useState<ProductStock | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [quantityWarning, setQuantityWarning] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [documentCurrencyError, setDocumentCurrencyError] = useState<string | null>(null);
  const prevCurrencyIdRef = useRef<string | null>(null);

  const {
    exchangeRateError: productExchangeRateError,
    exchangeRateLoading: productExchangeRateLoading,
    hasProductConversionRates,
    fmt,
    formatProductCatalogPrice,
    convertProductForDocument,
  } = useProductDocumentCurrency(values.currencyId, products, selectedProduct);

  const exchangeRateError = documentCurrencyError ?? productExchangeRateError;
  const exchangeRateLoading = productExchangeRateLoading;

  const pageTabs = [
    { id: "setup", content: "1. Customer & Setup" },
    { id: "items", content: "2. Products & Serial Selection" },
    { id: "summary", content: "3. Review & Save Draft" },
  ];

  // Fetch Currencies from Backend
  const loadCurrencies = useCallback(async () => {
    setCurrenciesLoading(true);
    setCurrenciesError(null);

    try {
      const rows = await listCurrencies();
      setCurrencies(rows);
      setValues((current) => ({
        ...current,
        currencyId: current.currencyId || baseCurrency?.id || rows[0]?.id || "",
      }));
    } catch {
      setCurrencies([]);
    } finally {
      setCurrenciesLoading(false);
    }
  }, [baseCurrency]);

  // Fetch Products from Backend
  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const result = await listProducts({
        search: catalogSearch || undefined,
        perPage: 50,
        forSaleOnly: true,
      });
      setProducts(result.data);
      setCatalogTotal(result.meta.total);
    } catch {
      setProducts([]);
      setCatalogTotal(0);
    } finally {
      setProductsLoading(false);
    }
  }, [catalogSearch]);

  useEffect(() => {
    void loadCurrencies();
  }, [loadCurrencies]);

  useEffect(() => {
    if (selectedTab === 1) {
      void loadProducts();
    }
  }, [selectedTab, loadProducts]);

  // When a product is selected, fetch in-stock serial numbers and stock levels
  async function handleSelectProduct(product: Product) {
    setSelectedProduct(product);
    setSelectedUnitId("");
    setInStockUnits([]);
    setSelectedProductStock(null);
    setQuantityWarning(null);
    setStockLoading(true);

    try {
      const stock = await getProductStock(product.id);
      setSelectedProductStock(stock);

      if (product.trackSerial) {
        const result = await listProductUnits(product.id, {
          status: "in_stock",
          perPage: 50,
        });
        setInStockUnits(result.data);
        setSelectedUnitId(result.data[0]?.id || "");
      }
    } catch {
      setInStockUnits([]);
      setSelectedUnitId("");
      setSelectedProductStock(null);
    } finally {
      setStockLoading(false);
    }
  }

  const selectedAvailableQuantity = useMemo(() => {
    if (!selectedProduct) {
      return 0;
    }

    if (selectedProduct.trackSerial) {
      return inStockUnits.length;
    }

    return sumStockQuantity(selectedProductStock);
  }, [selectedProduct, selectedProductStock, inStockUnits.length]);

  const remainingForSelectedProduct = useMemo(() => {
    if (!selectedProduct) {
      return 0;
    }

    return getMaxAllowedQuantity(
      selectedAvailableQuantity,
      lines,
      selectedProduct.id,
    );
  }, [selectedProduct, selectedAvailableQuantity, lines]);

  // Add Product with Serial Number to Line Items
  async function handleAddSelectedProduct() {
    if (!selectedProduct) return;

    if (remainingForSelectedProduct <= 0) {
      setQuantityWarning("No stock available for this product.");
      return;
    }

    if (exchangeRateLoading) {
      setQuantityWarning("Loading exchange rate before adding products...");
      return;
    }

    let baseUnitPrice: number;
    let unitCost: number;

    try {
      const converted = await convertProductForDocument(selectedProduct);
      baseUnitPrice = converted.unitPrice;
      unitCost = converted.unitCost;
    } catch (err) {
      setQuantityWarning(
        err instanceof Error ? err.message : "Failed to convert product price",
      );
      return;
    }

    const unit = inStockUnits.find((u) => u.id === selectedUnitId);
    const draftLine: ConfiguredLineItem = {
      id: `line-${Date.now()}`,
      productId: selectedProduct.id,
      productUnitId: unit?.id,
      serialNumber: unit?.serialNumber,
      name: selectedProduct.name,
      sku: selectedProduct.sku || "N/A",
      quantity: selectedProduct.trackSerial ? 1 : 1,
      baseUnitPrice,
      unitPrice: baseUnitPrice,
      unitCost,
      discountPercent: 0,
      taxRatePercent: salesPricing.defaultVatRatePercent ?? 5,
      availableQuantity: selectedAvailableQuantity,
    };

    const [pricedLine] = applyPricingToLines<ConfiguredLineItem>(
      [draftLine],
      customerIsLocal,
      priceAdjustmentEnabled,
      salesPricing,
    );

    setLines((prev) => [...prev, pricedLine]);
    setEditingLineId(pricedLine.id);
    setSelectedProduct(null);
    setSelectedUnitId("");
    setSelectedProductStock(null);
    setQuantityWarning(null);
  }

  const selectedCurrency = useMemo(
    () => currencies.find((currency) => currency.id === values.currencyId),
    [currencies, values.currencyId],
  );

  const displayCurrency = selectedCurrency ?? baseCurrency;
  const pricePrefix = currencyInputPrefix(displayCurrency);

  useEffect(() => {
    const previousCurrencyId = prevCurrencyIdRef.current;
    const nextCurrencyId = values.currencyId;

    if (!nextCurrencyId) {
      return;
    }

    if (!previousCurrencyId || previousCurrencyId === nextCurrencyId) {
      prevCurrencyIdRef.current = nextCurrencyId;
      return;
    }

    let cancelled = false;

    void getLatestExchangeRate(previousCurrencyId, nextCurrencyId)
      .then(({ rate, configured }) => {
        if (cancelled) {
          return;
        }

        if (!configured) {
          setDocumentCurrencyError(
            "No exchange rate is configured for this currency change. Add a rate under Settings → Currencies.",
          );
          setValues((current) => ({
            ...current,
            currencyId: previousCurrencyId,
          }));
          return;
        }

        setLines((current) =>
          current.length === 0
            ? current
            : current.map((line) => ({
                ...line,
                baseUnitPrice: convertAmount(line.baseUnitPrice, rate),
                unitPrice: convertAmount(line.unitPrice, rate),
                unitCost: convertAmount(line.unitCost, rate),
              })),
        );
        setDocumentCurrencyError(null);
        prevCurrencyIdRef.current = nextCurrencyId;
      })
      .catch((err) => {
        if (!cancelled) {
          setDocumentCurrencyError(
            err instanceof Error ? err.message : "Failed to convert line amounts",
          );
          setValues((current) => ({
            ...current,
            currencyId: previousCurrencyId,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [values.currencyId]);

  useEffect(() => {
    if (baseCurrency && !values.currencyId) {
      setValues((current) => ({ ...current, currencyId: baseCurrency.id }));
    }
  }, [baseCurrency, values.currencyId]);

  const customerIsLocal = values.customer?.isLocal ?? false;

  const pricingLabel = useMemo(
    () => pricingAdjustmentLabel(customerIsLocal, priceAdjustmentEnabled, salesPricing),
    [customerIsLocal, priceAdjustmentEnabled, salesPricing],
  );

  const pricingHelpText = useMemo(
    () => pricingAdjustmentHelpText(salesPricing),
    [salesPricing],
  );

  useEffect(() => {
    if (!values.customer) {
      setPriceAdjustmentEnabled(false);
      return;
    }

    setPriceAdjustmentEnabled(true);
  }, [values.customer?.id]);

  useEffect(() => {
    setLines((current) =>
      applyPricingToLines<ConfiguredLineItem>(
        current,
        customerIsLocal,
        priceAdjustmentEnabled,
        salesPricing,
      ),
    );
  }, [customerIsLocal, priceAdjustmentEnabled, salesPricing]);

  // Financial Calculations
  const financials = useMemo(
    () => computeLineFinancialSummary(lines),
    [lines],
  );

  const {
    catalogSubtotal,
    pricingAdjustmentTotal,
    lineSubtotal: rawSubtotal,
    totalDiscount,
    netSubtotal,
    totalVat,
    grandTotal: estimatedGrandTotal,
    totalCost,
    grossProfit,
    profitMarginPercent,
  } = financials;

  const showPricingAdjustment =
    priceAdjustmentEnabled && Math.abs(pricingAdjustmentTotal) >= 0.005;

  const editingLine = useMemo(
    () => lines.find((line) => line.id === editingLineId) ?? null,
    [lines, editingLineId],
  );

  function saveLine(updated: ConfiguredLineItem) {
    setQuantityWarning(null);
    setLines((prev) =>
      prev.map((line) => (line.id === updated.id ? updated : line)),
    );
  }

  function removeLine(lineId: string) {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  }

  // Create quotation as draft, then open workspace for send / confirm / invoice
  async function handleSaveQuotation() {
    setError(null);
    if (!values.customer) {
      const message = "Select a customer first.";
      setError(message);
      showError(message);
      setSelectedTab(0);
      return;
    }

    if (lines.length === 0) {
      const message = "Add at least one product before saving.";
      setError(message);
      showError(message);
      setSelectedTab(1);
      return;
    }

    setSaving(true);

    try {
      const quotation = await createQuotation({
        customerId: values.customer.id,
        currencyId: values.currencyId,
        quoteDate: values.quoteDate,
        validityDate: values.validityDate || undefined,
        customerReference: values.customerReference || undefined,
        internalReference: values.internalReference || undefined,
        paymentReference: values.paymentReference || undefined,
        notes: values.notes || undefined,
      });

      // Add each configured line item to backend quotation
      for (const line of lines) {
        await addQuotationLine(quotation.id, {
          productId: line.productId,
          productUnitId: line.productUnitId,
          description: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          taxRatePercent: line.taxRatePercent,
        });
      }

      showSuccess(`Quotation ${quotation.number} created as draft.`);
      router.push(`/dashboard/sales/quotations/${quotation.id}?created=draft`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save quotation";
      setError(message);
      showError(message);
      setSaving(false);
    }
  }

  return (
    <AppPage
      backAction={{ content: "Quotations Directory", url: "/dashboard/sales/quotations" }}
      primaryAction={{
        content:
          selectedTab === 0
            ? "Next: Select Products & Serials →"
            : selectedTab === 1
              ? "Next: Review & Save Draft →"
              : "Save Quotation (Draft)",
        loading: saving,
        onAction: () => {
          if (selectedTab === 0) setSelectedTab(1);
          else if (selectedTab === 1) setSelectedTab(2);
          else void handleSaveQuotation();
        },
      }}
      secondaryActions={[
        ...(selectedTab > 0
          ? [
              {
                content: `← Back to Step ${selectedTab}`,
                onAction: () => setSelectedTab((prev) => Math.max(0, prev - 1)),
              },
            ]
          : []),
        {
          content: "Cancel",
          onAction: () => router.push("/dashboard/sales/quotations"),
        },
      ]}
      subtitle="Create a customer quotation with products, serial numbers, pricing, and VAT."
      title="Create Quotation Studio"
    >
      <BlockStack gap="500">
        {/* Step Navigation Bar */}
        <InlineStack align="space-between" blockAlign="center">
          <Tabs
            tabs={pageTabs}
            selected={selectedTab}
            onSelect={(idx) => setSelectedTab(idx)}
          />

          <InlineStack gap="200">
            {selectedTab > 0 ? (
              <Button onClick={() => setSelectedTab((prev) => prev - 1)}>
                ← Back to Step {String(selectedTab)}
              </Button>
            ) : null}

            {selectedTab < 2 ? (
              <Button variant="primary" onClick={() => setSelectedTab((prev) => prev + 1)}>
                Next Step →
              </Button>
            ) : (
              <Button variant="primary" loading={saving} onClick={() => void handleSaveQuotation()}>
                Save Quotation (Draft)
              </Button>
            )}
          </InlineStack>
        </InlineStack>

        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        {exchangeRateError ? (
          <Banner tone="warning">
            {exchangeRateError}
          </Banner>
        ) : null}

        {hasProductConversionRates && !exchangeRateError ? (
          <Banner tone="info">
            Product prices are converted into {displayCurrency?.code ?? "quotation"} using
            your saved exchange rates before line totals are calculated.
          </Banner>
        ) : null}

        {/* ── TAB 0: CUSTOMER & SETUP ── */}
        {selectedTab === 0 ? (
          <Layout>
            <Layout.Section>
              <QuotationHeaderForm
                currencies={currencies}
                currenciesError={currenciesError}
                currenciesLoading={currenciesLoading}
                errors={{}}
                onChange={setValues}
                values={values}
              />
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Setup Summary
                  </Text>
                  <div className="quotation-summary-panel__rows">
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Customer Account
                      </Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {values.customer?.name ?? "Not Selected"}
                      </Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Currency & Tax Rate
                      </Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {selectedCurrency?.code ?? "USD"} (5% VAT)
                      </Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Quote Date
                      </Text>
                      <Text as="span" variant="bodyMd">
                        {formatDisplayDate(values.quoteDate)}
                      </Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Valid Until
                      </Text>
                      <Text as="span" variant="bodyMd">
                        {formatDisplayDate(values.validityDate)}
                      </Text>
                    </div>
                  </div>

                  <Checkbox
                    checked={priceAdjustmentEnabled}
                    disabled={!values.customer}
                    helpText={pricingHelpText}
                    label="Apply local/non-local pricing adjustment"
                    onChange={setPriceAdjustmentEnabled}
                  />

                  {pricingLabel ? (
                    <Badge tone="info">{pricingLabel}</Badge>
                  ) : null}

                  <Button
                    variant="primary"
                    fullWidth
                    onClick={() => setSelectedTab(1)}
                  >
                    Next: Select Products & Serials →
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        ) : null}

        {/* ── TAB 1: BACKEND PRODUCTS & SERIAL NUMBER SELECTION ── */}
        {selectedTab === 1 ? (
          <Layout>
            <Layout.Section>
              <BlockStack gap="500">
                <Card>
                  <BlockStack gap="300">
                    <Checkbox
                      checked={priceAdjustmentEnabled}
                      disabled={!values.customer}
                      helpText="Automatically adjusts unit prices when adding products."
                      label="Apply local/non-local pricing adjustment"
                      onChange={setPriceAdjustmentEnabled}
                    />
                    {pricingLabel ? <Badge tone="info">{pricingLabel}</Badge> : null}
                  </BlockStack>
                </Card>

                {/* Product & Serial Number Selection Card */}
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Choose products
                    </Text>
                    <TextField
                      autoComplete="off"
                      label="Search product catalog"
                      labelHidden
                      onChange={setCatalogSearch}
                      placeholder="Search by product name, SKU, or barcode..."
                      value={catalogSearch}
                    />

                    {productsLoading ? (
                      <Text as="p" tone="subdued">Loading products...</Text>
                    ) : (
                      <>
                        <Text as="p" tone="subdued" variant="bodySm">
                          {catalogTotal === 0
                            ? "No saleable products found."
                            : `Showing ${products.length} of ${catalogTotal} saleable product${catalogTotal === 1 ? "" : "s"}.`}
                        </Text>
                        <ResourceList
                          items={products}
                          renderItem={(product) => (
                          <ResourceItem
                            id={product.id}
                            onClick={() => void handleSelectProduct(product)}
                            accessibilityLabel={`Select ${product.name}`}
                          >
                            <InlineStack align="space-between" blockAlign="center">
                              <BlockStack gap="050">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="span" fontWeight="bold">
                                    {product.name}
                                  </Text>
                                  {product.trackSerial ? (
                                    <Badge tone="info">Serialized</Badge>
                                  ) : null}
                                </InlineStack>
                                <Text as="span" tone="subdued" variant="bodySm">
                                  SKU: {product.sku || "N/A"}
                                </Text>
                              </BlockStack>
                              <InlineStack gap="300" blockAlign="center">
                                <Text as="span" fontWeight="bold">
                                  {formatProductCatalogPrice(product)}
                                </Text>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="slim"
                                    variant="primary"
                                    onClick={() => void handleSelectProduct(product)}
                                  >
                                    Select Item
                                  </Button>
                                </div>
                              </InlineStack>
                            </InlineStack>
                          </ResourceItem>
                          )}
                        />
                      </>
                    )}
                  </BlockStack>
                </Card>

                {/* Serial Number Selector (If serial-tracked product is selected) */}
                {selectedProduct ? (
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingMd">
                          Configure Item: {selectedProduct.name}
                        </Text>
                        <Badge tone="success">
                          {`${selectedProduct ? formatProductCatalogPrice(selectedProduct) : " "} on quote`}
                        </Badge>
                      </InlineStack>

                      <Text as="p" tone="subdued">
                        Available: {stockLoading ? "Loading..." : selectedAvailableQuantity}
                        {!selectedProduct.trackSerial && remainingForSelectedProduct < selectedAvailableQuantity
                          ? ` (${remainingForSelectedProduct} remaining after lines on this quote)`
                          : null}
                      </Text>

                      {selectedProduct.trackSerial ? (
                        <BlockStack gap="200">
                          <Text as="p" fontWeight="semibold">
                            Choose the stock unit by serial number
                          </Text>
                          {stockLoading ? (
                            <Text as="p" tone="subdued">Loading serial numbers...</Text>
                          ) : inStockUnits.length === 0 ? (
                            <Banner tone="warning">No in-stock serial numbers available.</Banner>
                          ) : (
                            <Select
                              label="Available Serial Numbers"
                              options={inStockUnits.map((u) => ({
                                label: `${u.serialNumber} (${u.notes || "In Stock"})`,
                                value: u.id,
                              }))}
                              value={selectedUnitId}
                              onChange={setSelectedUnitId}
                            />
                          )}
                        </BlockStack>
                      ) : null}

                      <InlineStack align="end" gap="200">
                        <Button onClick={() => setSelectedProduct(null)}>Cancel</Button>
                        <Button
                          variant="primary"
                          disabled={
                            remainingForSelectedProduct <= 0 || exchangeRateLoading
                          }
                          onClick={() => void handleAddSelectedProduct()}
                        >
                          + Add Line Item to Quote
                        </Button>
                      </InlineStack>
                      {quantityWarning ? (
                        <Banner tone="warning">{quantityWarning}</Banner>
                      ) : null}
                    </BlockStack>
                  </Card>
                ) : null}

                {/* Configured Line Items */}
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">
                        Configured Line Items ({lines.length})
                      </Text>
                      <Text as="p" tone="subdued">
                        Each line is shown as a summary card. Use Edit to set
                        quantity, pricing, discount, VAT, and review profit.
                      </Text>
                    </BlockStack>

                    {quantityWarning ? (
                      <Banner tone="warning" onDismiss={() => setQuantityWarning(null)}>
                        {quantityWarning}
                      </Banner>
                    ) : null}

                    <ConfiguredLineItemsList
                      formatAmount={fmt}
                      lines={lines}
                      onEdit={setEditingLineId}
                      onRemove={removeLine}
                    />

                    <InlineStack align="space-between" blockAlign="center">
                      <Button onClick={() => setSelectedTab(0)}>
                        ← Back to Customer Setup
                      </Button>
                      <Button variant="primary" onClick={() => setSelectedTab(2)}>
                        Next: Review & Save Draft →
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Price breakdown
                  </Text>
                  <div className="quotation-summary-panel__rows">
                    {showPricingAdjustment ? (
                      <>
                        <div className="quotation-summary-row">
                          <Text as="span" tone="subdued" variant="bodySm">
                            Catalog subtotal
                          </Text>
                          <Text as="span" fontWeight="semibold">
                            {fmt(catalogSubtotal)}
                          </Text>
                        </div>
                        <div className="quotation-summary-row">
                          <Text as="span" tone="subdued" variant="bodySm">
                            {pricingLabel ?? "Pricing adjustment"}
                          </Text>
                          <Text
                            as="span"
                            tone={pricingAdjustmentTotal > 0 ? "success" : undefined}
                          >
                            {pricingAdjustmentTotal > 0 ? "-" : "+"}
                            {fmt(Math.abs(pricingAdjustmentTotal))}
                          </Text>
                        </div>
                      </>
                    ) : null}
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        {showPricingAdjustment ? "Adjusted subtotal" : "Line subtotal"}
                      </Text>
                      <Text as="span" fontWeight="semibold">
                        {fmt(rawSubtotal)}
                      </Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Line discounts
                      </Text>
                      <Text as="span" tone="success">
                        -{fmt(totalDiscount)}
                      </Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Net before tax
                      </Text>
                      <Text as="span" fontWeight="semibold">
                        {fmt(netSubtotal)}
                      </Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        VAT / tax
                      </Text>
                      <Text as="span" fontWeight="semibold">
                        +{fmt(totalVat)}
                      </Text>
                    </div>
                  </div>

                  <ProfitSummaryPanel
                    formatAmount={fmt}
                    grossProfit={grossProfit}
                    profitMarginPercent={profitMarginPercent}
                    totalCost={totalCost}
                  />

                  <Divider />

                  <div className="quotation-summary-panel__total">
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">
                        Grand Total
                      </Text>
                      <Text as="span" variant="headingLg" fontWeight="bold">
                        {fmt(estimatedGrandTotal)}
                      </Text>
                    </InlineStack>
                  </div>

                  <Button
                    variant="primary"
                    fullWidth
                    onClick={() => setSelectedTab(2)}
                  >
                    Next: Summary & Confirm →
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        ) : null}

        {/* ── TAB 2: FINANCIAL SUMMARY & CONFIRMATION ── */}
        {selectedTab === 2 ? (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="500">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h1" variant="headingLg">
                        Commercial Quotation Preview
                      </Text>
                      <Text as="p" tone="subdued">
                        Customer: {values.customer?.name ?? "Frank / Subsea Ltd"} • Date: {formatDisplayDate(values.quoteDate)}
                      </Text>
                    </BlockStack>
                    <Badge tone="info">Draft preview</Badge>
                  </InlineStack>

                  <Banner tone="info">
                    <p>
                      Saving creates a <strong>draft quotation</strong>. Next
                      steps: send or preview PDF for the customer, confirm when
                      approved, then create an invoice from the confirmed sales
                      order.
                    </p>
                  </Banner>

                  <Divider />

                  {/* Commercial Invoice Table */}
                  <div className="frogmen-recent-table-wrapper">
                    <table className="frogmen-recent-table">
                      <thead>
                        <tr>
                          <th style={{ width: "35%" }}>Equipment Line Item</th>
                          <th style={{ width: "20%" }}>Serial Number</th>
                          <th style={{ width: "8%", textAlign: "right" }}>Qty</th>
                          <th style={{ width: "15%", textAlign: "right" }}>Unit Price ({displayCurrency?.code ?? " "})</th>
                          <th style={{ width: "10%", textAlign: "right" }}>Disc (%)</th>
                          <th style={{ width: "10%", textAlign: "right" }}>VAT (%)</th>
                          <th style={{ width: "12%", textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((item) => {
                          const lineTotal = computeLineTotal(item);
                          const hasCatalogDifference =
                            Math.abs(item.baseUnitPrice - item.unitPrice) >= 0.005;

                          return (
                            <tr key={item.id}>
                              <td className="frogmen-font-bold">{item.name}</td>
                              <td>
                                {item.serialNumber ? (
                                  <Badge tone="info">{item.serialNumber}</Badge>
                                ) : (
                                  <Text as="span" tone="subdued"> </Text>
                                )}
                              </td>
                              <td style={{ textAlign: "right" }}>{item.quantity}</td>
                              <td style={{ textAlign: "right" }}>
                                <BlockStack gap="050">
                                  <Text as="span">{fmt(item.unitPrice)}</Text>
                                  {hasCatalogDifference ? (
                                    <Text as="span" tone="subdued" variant="bodySm">
                                      Catalog {fmt(item.baseUnitPrice)}
                                    </Text>
                                  ) : null}
                                </BlockStack>
                              </td>
                              <td style={{ textAlign: "right" }} className="frogmen-text-muted">{item.discountPercent}%</td>
                              <td style={{ textAlign: "right" }} className="frogmen-text-muted">{item.taxRatePercent}%</td>
                              <td style={{ textAlign: "right" }} className="frogmen-font-bold">
                                {fmt(lineTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <InlineStack align="space-between" blockAlign="center">
                    <Button onClick={() => setSelectedTab(1)}>
                      ← Back to Products & Serials
                    </Button>
                    <Button variant="primary" loading={saving} onClick={() => void handleSaveQuotation()}>
                      Save Quotation (Draft)
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Final Financial Summary
                  </Text>

                  <div className="quotation-summary-panel__rows">
                    {showPricingAdjustment ? (
                      <>
                        <div className="quotation-summary-row">
                          <Text as="span" tone="subdued" variant="bodySm">
                            Catalog subtotal
                          </Text>
                          <Text as="span" fontWeight="semibold">
                            {fmt(catalogSubtotal)}
                          </Text>
                        </div>
                        <div className="quotation-summary-row">
                          <Text as="span" tone="subdued" variant="bodySm">
                            {pricingLabel ?? "Pricing adjustment"}
                          </Text>
                          <Text
                            as="span"
                            tone={pricingAdjustmentTotal > 0 ? "success" : undefined}
                          >
                            {pricingAdjustmentTotal > 0 ? "-" : "+"}
                            {fmt(Math.abs(pricingAdjustmentTotal))}
                          </Text>
                        </div>
                      </>
                    ) : null}
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        {showPricingAdjustment ? "Adjusted subtotal" : "Line subtotal"}
                      </Text>
                      <Text as="span" fontWeight="semibold">
                        {fmt(rawSubtotal)}
                      </Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Line discounts
                      </Text>
                      <Text as="span" tone="success">
                        -{fmt(totalDiscount)}
                      </Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Net before tax
                      </Text>
                      <Text as="span" fontWeight="semibold">
                        {fmt(netSubtotal)}
                      </Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        VAT / tax
                      </Text>
                      <Text as="span" fontWeight="semibold">
                        +{fmt(totalVat)}
                      </Text>
                    </div>
                  </div>

                  <ProfitSummaryPanel
                    formatAmount={fmt}
                    grossProfit={grossProfit}
                    profitMarginPercent={profitMarginPercent}
                    totalCost={totalCost}
                  />

                  <Divider />

                  <div className="quotation-summary-panel__total">
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">
                        Grand Total
                      </Text>
                      <Text as="span" variant="headingLg" fontWeight="bold">
                        {fmt(estimatedGrandTotal)}
                      </Text>
                    </InlineStack>
                  </div>

                  <Button
                    variant="primary"
                    fullWidth
                    loading={saving}
                    onClick={() => void handleSaveQuotation()}
                  >
                    Save Quotation (Draft)
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        ) : null}
      </BlockStack>

      <EditConfiguredLineModal
        allLines={lines}
        documentCurrencyId={values.currencyId}
        line={editingLine}
        open={Boolean(editingLine)}
        onClose={() => setEditingLineId(null)}
        onSave={saveLine}
      />
    </AppPage>
  );
}
