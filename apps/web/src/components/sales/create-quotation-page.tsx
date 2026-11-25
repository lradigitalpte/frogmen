"use client";

import { useAccess } from "@/components/providers/access-provider";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  ButtonGroup,
  Checkbox,
  Icon,
  InlineStack,
  Select,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  CheckIcon,
  LockIcon,
  PersonIcon,
  PlusIcon,
  ProductIcon,
  SearchIcon,
  XIcon,
} from "@shopify/polaris-icons";
import {
  defaultBillingDocumentTypeForCustomer,
  pricingAdjustmentHelpText,
  pricingAdjustmentLabel,
  type BillingDocumentType,
} from "@frog1/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DocumentNotesField } from "@/components/documents/document-notes-field";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { ConfiguredLineItemsList } from "@/components/sales/configured-line-items-list";
import { CurrencyPicker } from "@/components/sales/currency-picker";
import { CustomerPicker } from "@/components/sales/customer-picker";
import { EditConfiguredLineModal, type DeliveryFeeMode } from "@/components/sales/edit-configured-line-modal";
import { todayIsoDate } from "@/components/sales/format-money";
import type { QuotationHeaderValues } from "@/components/sales/quotation-header-form";
import { computeValidityDate, defaultValidityHeader } from "@/components/sales/validity-period";
import { ValidityPeriodPicker } from "@/components/sales/validity-period-picker";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { useProductDocumentCurrency } from "@/hooks/use-product-document-currency";
import { useSalesPricing } from "@/hooks/use-sales-pricing";
import { listCurrencies, type Currency } from "@/lib/currencies-api";
import { convertAmount, currencyInputPrefix } from "@/lib/currency-utils";
import { getLatestExchangeRate } from "@/lib/exchange-rates-api";
import {
  applyGlobalDiscountToLines,
  applyPricingToLines,
  computeLineFinancialSummary,
  formatMarginPercent,
  getMaxAllowedQuantity,
  sumStockQuantity,
  type DiscountMode,
} from "@/lib/line-item-utils";
import { getProductStock, listProducts, listProductUnits } from "@/lib/products-api";
import { addQuotationLine, createQuotation } from "@/lib/quotations-api";
import { cn } from "@/lib/utils";
import type { ConfiguredLineItem } from "@/types/configured-line-item";
import type { Product, ProductStock, ProductUnit } from "@/types/product";

function buildDeliveryFeePayload(mode: DeliveryFeeMode, value: string) {
  const parsed = Number(value);
  if (mode === "none" || !Number.isFinite(parsed) || parsed <= 0) {
    return { deliveryFeeAmount: null, deliveryFeePercent: null };
  }
  return mode === "amount"
    ? { deliveryFeeAmount: parsed, deliveryFeePercent: null }
    : { deliveryFeeAmount: null, deliveryFeePercent: parsed };
}

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
    internalNotes: "",
    billingDocumentType: "tax_invoice",
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Numbered section card used down the main column. */
function Section({
  id,
  step,
  title,
  hint,
  done,
  aside,
  children,
}: {
  id: string;
  step: number;
  title: string;
  hint?: string;
  done?: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="cq-section" id={id}>
      <header className="cq-section__head">
        <span className={cn("cq-section__num", done && "is-done")}>{done ? <Icon source={CheckIcon} /> : step}</span>
        <div className="cq-section__title">
          <h2>{title}</h2>
          {hint ? <p>{hint}</p> : null}
        </div>
        {aside ? <div className="cq-section__aside">{aside}</div> : null}
      </header>
      <div className="cq-section__body">{children}</div>
    </section>
  );
}

export function CreateQuotationPage() {
  const { can } = useAccess();
  const canViewCost = can("cost.read");
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const { settings: salesPricing } = useSalesPricing();
  const { baseCurrency } = useOrgCurrency();
  const [values, setValues] = useState<QuotationHeaderValues>(emptyHeader);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [currenciesLoading, setCurrenciesLoading] = useState(true);
  const billingTypeManualRef = useRef(false);

  // Product catalog
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [debouncedCatalogSearch, setDebouncedCatalogSearch] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [deliveryFeeMode, setDeliveryFeeMode] = useState<DeliveryFeeMode>("none");
  const [deliveryFeeValue, setDeliveryFeeValue] = useState("");

  // Selected product being configured
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [inStockUnits, setInStockUnits] = useState<ProductUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [selectedProductStock, setSelectedProductStock] = useState<ProductStock | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [quantityWarning, setQuantityWarning] = useState<string | null>(null);

  // Lines
  const [lines, setLines] = useState<ConfiguredLineItem[]>([]);
  const [priceAdjustmentEnabled, setPriceAdjustmentEnabled] = useState(true);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [documentCurrencyError, setDocumentCurrencyError] = useState<string | null>(null);
  const [showReferences, setShowReferences] = useState(false);
  const prevCurrencyIdRef = useRef<string | null>(null);

  // Quote-wide discount & VAT
  const [globalDiscountMode, setGlobalDiscountMode] = useState<DiscountMode>("percent");
  const [globalDiscountValue, setGlobalDiscountValue] = useState<string>("0");
  const [globalVatPercent, setGlobalVatPercent] = useState<string>("5");
  const [isDropship, setIsDropship] = useState(false);
  const [dropshipSupplyReference, setDropshipSupplyReference] = useState("");

  function patch(partial: Partial<QuotationHeaderValues>) {
    setValues((current) => {
      const next = { ...current, ...partial };
      if (partial.quoteDate !== undefined && next.validityPreset !== "custom") {
        next.validityDate = computeValidityDate(next.quoteDate, next.validityPreset);
      }
      return next;
    });
  }

  function applyGlobalDiscount(mode: DiscountMode, valueStr: string) {
    setGlobalDiscountMode(mode);
    setGlobalDiscountValue(valueStr);
    const value = Math.max(0, parseFloat(valueStr) || 0);
    setLines((prev) => applyGlobalDiscountToLines(prev, mode, value));
  }

  function applyGlobalVat(vatPctStr: string) {
    setGlobalVatPercent(vatPctStr);
    const pct = Math.max(0, parseFloat(vatPctStr) || 0);
    setLines((prev) => prev.map((line) => ({ ...line, taxRatePercent: pct })));
  }

  const {
    exchangeRateError: productExchangeRateError,
    exchangeRateLoading,
    hasProductConversionRates,
    fmt,
    formatProductCatalogPrice,
    convertProductForDocument,
  } = useProductDocumentCurrency(values.currencyId, products, selectedProduct);

  const exchangeRateError = documentCurrencyError ?? productExchangeRateError;

  const loadCurrencies = useCallback(async () => {
    setCurrenciesLoading(true);
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCatalogSearch(catalogSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [catalogSearch]);

  useEffect(() => {
    setCatalogPage(1);
  }, [debouncedCatalogSearch]);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError(null);
    const isSearch = Boolean(debouncedCatalogSearch);
    try {
      const result = await listProducts({
        search: debouncedCatalogSearch || undefined,
        page: isSearch ? catalogPage : 1,
        perPage: isSearch ? 100 : 6,
        sortBy: isSearch ? "name" : undefined,
        sortDir: isSearch ? "asc" : undefined,
        forSaleOnly: true,
        rootOnly: true,
        includeStock: true,
        inStockOnly: !isDropship,
      });
      setProducts((current) => (isSearch && catalogPage > 1 ? [...current, ...result.data] : result.data));
      setCatalogTotal(result.meta.total);
    } catch (err) {
      setProducts([]);
      setCatalogTotal(0);
      setProductsError(err instanceof Error ? err.message : "Failed to load product catalog");
    } finally {
      setProductsLoading(false);
    }
  }, [debouncedCatalogSearch, catalogPage, isDropship]);

  useEffect(() => {
    void loadCurrencies();
  }, [loadCurrencies]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  async function handleSelectProduct(product: Product) {
    setSelectedProduct(product);
    setSelectedUnitId("");
    setInStockUnits([]);
    setSelectedProductStock(null);
    setQuantityWarning(null);
    setDropshipSupplyReference("");

    const tracked = !isDropship && product.type === "goods" && product.isStorable;
    if (!tracked) {
      setStockLoading(false);
      return;
    }

    setStockLoading(true);
    try {
      const stock = await getProductStock(product.id);
      setSelectedProductStock(stock);
      if (product.trackSerial) {
        const result = await listProductUnits(product.id, { status: "in_stock", perPage: 50 });
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

  const isSelectedProductInventoryTracked = useMemo(() => {
    if (!selectedProduct || isDropship) return false;
    return selectedProduct.type === "goods" && selectedProduct.isStorable;
  }, [selectedProduct, isDropship]);

  const selectedAvailableQuantity = useMemo(() => {
    if (!selectedProduct) return 0;
    if (!isSelectedProductInventoryTracked) return null;
    if (selectedProduct.trackSerial) return inStockUnits.length;
    return sumStockQuantity(selectedProductStock);
  }, [selectedProduct, isSelectedProductInventoryTracked, selectedProductStock, inStockUnits.length]);

  const remainingForSelectedProduct = useMemo(() => {
    if (!selectedProduct) return 0;
    if (!isSelectedProductInventoryTracked) return null;
    return getMaxAllowedQuantity(selectedAvailableQuantity ?? 0, lines, selectedProduct.id);
  }, [selectedProduct, isSelectedProductInventoryTracked, selectedAvailableQuantity, lines]);

  const customerIsLocal = values.customer?.isLocal ?? false;

  async function handleAddSelectedProduct() {
    if (!selectedProduct) return;

    if (
      !isDropship &&
      isSelectedProductInventoryTracked &&
      remainingForSelectedProduct !== null &&
      remainingForSelectedProduct <= 0
    ) {
      setQuantityWarning("No stock left for this product.");
      return;
    }
    if (exchangeRateLoading) {
      setQuantityWarning("Loading the exchange rate — try again in a moment.");
      return;
    }

    let baseUnitPrice: number;
    let unitCost: number;
    try {
      const converted = await convertProductForDocument(selectedProduct);
      baseUnitPrice = converted.unitPrice;
      unitCost = converted.unitCost;
    } catch (err) {
      setQuantityWarning(err instanceof Error ? err.message : "Failed to convert product price");
      return;
    }

    const unit = isDropship ? undefined : inStockUnits.find((u) => u.id === selectedUnitId);
    const supplyRef = dropshipSupplyReference.trim();
    const draftLine: ConfiguredLineItem = {
      id: `line-${Date.now()}`,
      productId: selectedProduct.id,
      productUnitId: unit?.id,
      serialNumber: isDropship ? supplyRef || undefined : unit?.serialNumber,
      supplyReference: isDropship && supplyRef ? supplyRef : undefined,
      name: selectedProduct.name,
      details: selectedProduct.description,
      sku: selectedProduct.sku || "N/A",
      quantity: 1,
      baseUnitPrice,
      unitPrice: baseUnitPrice,
      unitCost,
      discountPercent: globalDiscountMode === "percent" ? parseFloat(globalDiscountValue) || 0 : 0,
      discountAmount: globalDiscountMode === "amount" ? parseFloat(globalDiscountValue) || 0 : 0,
      taxRatePercent: parseFloat(globalVatPercent) || salesPricing.defaultVatRatePercent || 5,
      availableQuantity: isSelectedProductInventoryTracked ? selectedAvailableQuantity : null,
      isStorable: selectedProduct.isStorable,
      productType: selectedProduct.type,
    };

    const [pricedLine] = applyPricingToLines<ConfiguredLineItem>(
      [draftLine],
      customerIsLocal,
      priceAdjustmentEnabled,
      salesPricing,
    );

    setLines((prev) =>
      applyGlobalDiscountToLines([...prev, pricedLine], globalDiscountMode, parseFloat(globalDiscountValue) || 0),
    );
    showSuccess(`${selectedProduct.name} added — adjust quantity or price from the line.`);
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
  const currencyCode = displayCurrency?.code ?? "AED";

  // Convert existing lines when the document currency changes
  useEffect(() => {
    const previousCurrencyId = prevCurrencyIdRef.current;
    const nextCurrencyId = values.currencyId;
    if (!nextCurrencyId) return;
    if (!previousCurrencyId || previousCurrencyId === nextCurrencyId) {
      prevCurrencyIdRef.current = nextCurrencyId;
      return;
    }

    let cancelled = false;
    void getLatestExchangeRate(previousCurrencyId, nextCurrencyId)
      .then(({ rate, configured }) => {
        if (cancelled) return;
        if (!configured) {
          setDocumentCurrencyError(
            "No exchange rate is set up for this currency change. Add one under Settings → Currencies.",
          );
          setValues((current) => ({ ...current, currencyId: previousCurrencyId }));
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
                discountAmount: convertAmount(line.discountAmount || 0, rate),
              })),
        );
        setDocumentCurrencyError(null);
        prevCurrencyIdRef.current = nextCurrencyId;
      })
      .catch((err) => {
        if (!cancelled) {
          setDocumentCurrencyError(err instanceof Error ? err.message : "Failed to convert line amounts");
          setValues((current) => ({ ...current, currencyId: previousCurrencyId }));
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

  const pricingLabel = useMemo(
    () => pricingAdjustmentLabel(customerIsLocal, priceAdjustmentEnabled, salesPricing),
    [customerIsLocal, priceAdjustmentEnabled, salesPricing],
  );
  const pricingHelpText = useMemo(() => pricingAdjustmentHelpText(salesPricing), [salesPricing]);

  useEffect(() => {
    setPriceAdjustmentEnabled(Boolean(values.customer));
    // Re-evaluate only when the customer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.customer?.id]);

  useEffect(() => {
    setLines((current) =>
      applyPricingToLines<ConfiguredLineItem>(current, customerIsLocal, priceAdjustmentEnabled, salesPricing),
    );
  }, [customerIsLocal, priceAdjustmentEnabled, salesPricing]);

  const financials = useMemo(
    () =>
      computeLineFinancialSummary(lines, {
        deliveryFeeAmount: deliveryFeeMode === "amount" ? deliveryFeeValue : null,
        deliveryFeePercent: deliveryFeeMode === "percent" ? deliveryFeeValue : null,
      }),
    [lines, deliveryFeeMode, deliveryFeeValue],
  );

  const {
    catalogSubtotal,
    pricingAdjustmentTotal,
    lineSubtotal: rawSubtotal,
    totalDiscount,
    netSubtotal,
    deliveryFee,
    totalVat,
    grandTotal,
    totalCost,
    grossProfit,
    profitMarginPercent,
  } = financials;

  const showPricingAdjustment = priceAdjustmentEnabled && Math.abs(pricingAdjustmentTotal) >= 0.005;
  const editingLine = useMemo(() => lines.find((line) => line.id === editingLineId) ?? null, [lines, editingLineId]);

  function saveLine(updated: ConfiguredLineItem) {
    setQuantityWarning(null);
    setLines((prev) =>
      applyGlobalDiscountToLines(
        prev.map((line) => (line.id === updated.id ? updated : line)),
        globalDiscountMode,
        parseFloat(globalDiscountValue) || 0,
      ),
    );
  }

  function removeLine(lineId: string) {
    setLines((prev) =>
      applyGlobalDiscountToLines(
        prev.filter((line) => line.id !== lineId),
        globalDiscountMode,
        parseFloat(globalDiscountValue) || 0,
      ),
    );
  }

  function reorderLines(fromIndex: number, toIndex: number) {
    setLines((prev) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function jumpTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSaveQuotation() {
    setError(null);
    if (!values.customer) {
      const message = "Choose a customer first.";
      setError(message);
      showError(message);
      jumpTo("cq-customer");
      return;
    }
    if (lines.length === 0) {
      const message = "Add at least one item before saving.";
      setError(message);
      showError(message);
      jumpTo("cq-items");
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
        internalNotes: values.internalNotes || undefined,
        isDropship,
        billingDocumentType: values.billingDocumentType,
        ...buildDeliveryFeePayload(deliveryFeeMode, deliveryFeeValue),
      });

      for (const line of lines) {
        await addQuotationLine(quotation.id, {
          productId: line.productId,
          productUnitId: isDropship ? undefined : line.productUnitId,
          supplyReference: line.supplyReference,
          description: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          discountAmount: line.discountAmount,
          taxRatePercent: line.taxRatePercent,
        });
      }

      showSuccess(`Quotation ${quotation.number} saved as a draft.`);
      router.push(`/dashboard/sales/quotations/${quotation.id}?created=draft`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save quotation";
      setError(message);
      showError(message);
      setSaving(false);
    }
  }

  const customer = values.customer;
  const hasCustomer = Boolean(customer);
  const hasLines = lines.length > 0;
  const ready = hasCustomer && hasLines;
  const searching = Boolean(debouncedCatalogSearch);
  const configuring = selectedProduct;
  const addDisabled =
    !configuring ||
    (isSelectedProductInventoryTracked && remainingForSelectedProduct !== null && remainingForSelectedProduct <= 0) ||
    (!isDropship && Boolean(configuring?.trackSerial) && (inStockUnits.length === 0 || !selectedUnitId)) ||
    exchangeRateLoading;

  const catalogHint = productsLoading && products.length === 0
    ? "Loading products…"
    : catalogSearch.trim() && catalogSearch.trim() !== debouncedCatalogSearch
      ? "Searching…"
      : catalogTotal === 0
        ? isDropship
          ? "No saleable products in your catalog."
          : "No in-stock products found. Turn on dropship to quote items you don't hold."
        : searching
          ? `${catalogTotal} match${catalogTotal === 1 ? "" : "es"}${isDropship ? "" : " in stock"}`
          : `Suggestions · ${catalogTotal} ${isDropship ? "saleable" : "in-stock"} products — search to see all`;

  return (
    <AppPage
      backAction={{ content: "Quotations", url: "/dashboard/sales/quotations" }}
      primaryAction={{ content: "Save draft", loading: saving, disabled: !ready, onAction: () => void handleSaveQuotation() }}
      secondaryActions={[{ content: "Discard", onAction: () => router.push("/dashboard/sales/quotations") }]}
      subtitle="Pick the customer, add items, check the total — then save it as a draft to send."
      title="New quotation"
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}
        {productsError ? (
          <Banner tone="critical" onDismiss={() => setProductsError(null)}>
            {productsError}
          </Banner>
        ) : null}
        {exchangeRateError ? <Banner tone="warning">{exchangeRateError}</Banner> : null}

        <div className="cq">
          {/* ── Main column ── */}
          <div className="cq-main">
            <Section
              aside={
                hasCustomer ? (
                  <Button size="slim" variant="plain" onClick={() => patch({ customer: null })}>
                    Change
                  </Button>
                ) : null
              }
              done={hasCustomer}
              hint={hasCustomer ? undefined : "Who is this quotation for?"}
              id="cq-customer"
              step={1}
              title="Customer"
            >
              {customer ? (
                <div className="cq-customer">
                  <span className="cq-customer__avatar">{initials(customer.name)}</span>
                  <div className="cq-customer__text">
                    <strong>{customer.name}</strong>
                    <small>{customer.email || "No email on file — add one to send the quote by email"}</small>
                  </div>
                  <Badge tone={customer.isLocal ? "success" : "info"}>{customer.isLocal ? "Local" : "International"}</Badge>
                </div>
              ) : (
                <CustomerPicker
                  value={values.customer}
                  onChange={(next) => {
                    const partial: Partial<QuotationHeaderValues> = { customer: next };
                    if (next && !billingTypeManualRef.current) {
                      partial.billingDocumentType = defaultBillingDocumentTypeForCustomer(next.isLocal);
                    }
                    patch(partial);
                  }}
                />
              )}

              <div className="cq-doctype">
                <span>Document type</span>
                <ButtonGroup variant="segmented">
                  {(
                    [
                      { value: "tax_invoice", label: "Tax quotation", hint: "local, with VAT" },
                      { value: "commercial_invoice", label: "Commercial quotation", hint: "export" },
                    ] as Array<{ value: BillingDocumentType; label: string; hint: string }>
                  ).map((option) => (
                    <Button
                      key={option.value}
                      pressed={values.billingDocumentType === option.value}
                      size="slim"
                      onClick={() => {
                        billingTypeManualRef.current = true;
                        patch({ billingDocumentType: option.value });
                      }}
                    >
                      {option.label}
                    </Button>
                  ))}
                </ButtonGroup>
                <small>
                  {values.billingDocumentType === "commercial_invoice"
                    ? "For export buyers — set VAT to 0% if no tax applies."
                    : "Standard local quote with VAT."}
                </small>
              </div>
            </Section>

            <Section
              aside={<Text as="span" tone="subdued" variant="bodySm">{`${lines.length} item${lines.length === 1 ? "" : "s"}`}</Text>}
              done={hasLines}
              hint={isDropship ? "Dropship: pick any catalog item — your stock isn't used." : "Search your catalog and add products or services."}
              id="cq-items"
              step={2}
              title="Items"
            >
              <BlockStack gap="300">
                <TextField
                  autoComplete="off"
                  clearButton
                  label="Search products"
                  labelHidden
                  placeholder="Search by name, SKU or barcode"
                  prefix={<Icon source={SearchIcon} />}
                  suffix={productsLoading ? <Spinner size="small" /> : undefined}
                  value={catalogSearch}
                  onChange={setCatalogSearch}
                  onClearButtonClick={() => setCatalogSearch("")}
                />
                <span className="cq-hint">{catalogHint}</span>

                {products.length > 0 ? (
                  <div className={cn("cq-catalog", searching && "is-search")}>
                    {products.map((product) => {
                      const active = configuring?.id === product.id;
                      const qty =
                        product.type === "service" || !product.isStorable ? null : product.availableQuantity ?? null;
                      return (
                        <button
                          className={cn("cq-product", active && "is-active")}
                          key={product.id}
                          type="button"
                          onClick={() => void handleSelectProduct(product)}
                        >
                          <span className="cq-product__icon">
                            <Icon source={ProductIcon} />
                          </span>
                          <span className="cq-product__text">
                            <strong>{product.name}</strong>
                            <small>
                              {product.sku || "No SKU"}
                              {qty !== null ? ` · ${qty} in stock` : product.type === "service" ? " · Service" : ""}
                              {product.trackSerial ? " · Serialised" : ""}
                            </small>
                          </span>
                          <span className="cq-product__price">{formatProductCatalogPrice(product)}</span>
                          <span className="cq-product__add">
                            <Icon source={active ? CheckIcon : PlusIcon} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {searching && products.length > 0 && products.length < catalogTotal ? (
                  <Button loading={productsLoading} variant="plain" onClick={() => setCatalogPage((p) => p + 1)}>
                    {`Show more (${catalogTotal - products.length} more)`}
                  </Button>
                ) : null}

                {configuring ? (
                  <div className="cq-config">
                    <div className="cq-config__head">
                      <div>
                        <strong>{configuring.name}</strong>
                        <small>
                          {formatProductCatalogPrice(configuring)}
                          {isSelectedProductInventoryTracked
                            ? ` · ${stockLoading ? "checking stock…" : `${selectedAvailableQuantity ?? 0} available`}${
                                !configuring.trackSerial &&
                                remainingForSelectedProduct !== null &&
                                selectedAvailableQuantity !== null &&
                                remainingForSelectedProduct < selectedAvailableQuantity
                                  ? ` (${remainingForSelectedProduct} left after this quote)`
                                  : ""
                              }`
                            : " · not stock-tracked"}
                        </small>
                      </div>
                      <Button
                        accessibilityLabel="Cancel"
                        icon={XIcon}
                        size="slim"
                        variant="tertiary"
                        onClick={() => setSelectedProduct(null)}
                      />
                    </div>

                    {configuring.trackSerial ? (
                      isDropship ? (
                        <TextField
                          autoComplete="off"
                          helpText="Optional — supplier serial or PO line. Doesn't reserve stock."
                          label="Serial / supplier reference"
                          placeholder="e.g. Supplier S/N to follow"
                          value={dropshipSupplyReference}
                          onChange={setDropshipSupplyReference}
                        />
                      ) : stockLoading ? (
                        <Text as="p" tone="subdued" variant="bodySm">
                          Loading serial numbers…
                        </Text>
                      ) : inStockUnits.length === 0 ? (
                        <Banner tone="warning">No serial numbers in stock for this product.</Banner>
                      ) : (
                        <Select
                          label="Serial number"
                          options={inStockUnits.map((u) => ({ label: `${u.serialNumber}${u.notes ? ` — ${u.notes}` : ""}`, value: u.id }))}
                          value={selectedUnitId}
                          onChange={setSelectedUnitId}
                        />
                      )
                    ) : null}

                    {quantityWarning ? <Banner tone="warning">{quantityWarning}</Banner> : null}

                    <InlineStack align="end" gap="200">
                      <Button onClick={() => setSelectedProduct(null)}>Cancel</Button>
                      <Button disabled={addDisabled} icon={PlusIcon} variant="primary" onClick={() => void handleAddSelectedProduct()}>
                        Add to quote
                      </Button>
                    </InlineStack>
                  </div>
                ) : null}

                {hasLines ? (
                  <div className="cq-lines">
                    <div className="cq-lines__label">On this quote</div>
                    <ConfiguredLineItemsList
                      formatAmount={fmt}
                      lines={lines}
                      onEdit={setEditingLineId}
                      onRemove={removeLine}
                      onReorder={reorderLines}
                    />
                  </div>
                ) : (
                  <div className="cq-empty">
                    <Icon source={ProductIcon} tone="subdued" />
                    <span>Nothing added yet — pick a product above.</span>
                  </div>
                )}
              </BlockStack>
            </Section>

            <Section
              hint="Shown on the quotation the customer receives."
              id="cq-terms"
              step={3}
              title="Terms & notes"
            >
              <BlockStack gap="400">
                <DocumentNotesField
                  autoComplete="off"
                  label="Notes"
                  labelHidden
                  multiline={4}
                  placeholder="Payment terms, delivery time, warranty…"
                  value={values.notes}
                  onChange={(notes) => patch({ notes })}
                />

                <div className="cq-refs">
                  <button className="cq-refs__toggle" type="button" onClick={() => setShowReferences((v) => !v)}>
                    {showReferences ? "Hide references" : "Add references"}
                    <small>
                      {[values.customerReference && "customer PO", values.internalReference && "internal", values.paymentReference && "payment"]
                        .filter(Boolean)
                        .join(", ") || "customer PO, internal or payment reference"}
                    </small>
                  </button>
                  {showReferences ? (
                    <div className="cq-refs__grid">
                      <TextField
                        autoComplete="off"
                        label="Customer reference / PO"
                        placeholder="PO number, project code…"
                        value={values.customerReference}
                        onChange={(customerReference) => patch({ customerReference })}
                      />
                      <TextField
                        autoComplete="off"
                        label="Internal reference"
                        placeholder="Your tracking ID"
                        value={values.internalReference}
                        onChange={(internalReference) => patch({ internalReference })}
                      />
                      <TextField
                        autoComplete="off"
                        label="Payment reference"
                        placeholder="Shown on invoices and receipts"
                        value={values.paymentReference}
                        onChange={(paymentReference) => patch({ paymentReference })}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="cq-private">
                  <div className="cq-private__head">
                    <Icon source={LockIcon} tone="subdued" />
                    <span>Team notes — never shown to the customer</span>
                  </div>
                  <TextField
                    autoComplete="off"
                    label="Team notes"
                    labelHidden
                    multiline={2}
                    placeholder="e.g. Special price approved by Sara."
                    value={values.internalNotes}
                    onChange={(internalNotes) => patch({ internalNotes })}
                  />
                </div>
              </BlockStack>
            </Section>
          </div>

          {/* ── Summary column ── */}
          <aside className="cq-side">
            <div className="cq-summary">
              <div className="cq-summary__head">
                <span>Quote total</span>
                <strong>{fmt(grandTotal)}</strong>
                <small>
                  {lines.length ? `${lines.length} item${lines.length === 1 ? "" : "s"} · incl. ${fmt(totalVat)} tax` : "Add items to see the total"}
                </small>
              </div>

              <div className="cq-summary__block">
                <CurrencyPicker
                  currencies={currencies}
                  loading={currenciesLoading}
                  value={values.currencyId}
                  onChange={(currencyId) => patch({ currencyId })}
                />
                <div className="cq-row-fields is-top">
                  <TextField
                    autoComplete="off"
                    label="Quote date"
                    type="date"
                    value={values.quoteDate}
                    onChange={(quoteDate) => patch({ quoteDate })}
                  />
                  <ValidityPeriodPicker
                    preset={values.validityPreset}
                    quoteDate={values.quoteDate}
                    validityDate={values.validityDate}
                    onChange={({ preset, validityDate }) => patch({ validityPreset: preset, validityDate })}
                  />
                </div>
                {hasProductConversionRates && !exchangeRateError ? (
                  <small className="cq-note">Catalog prices are converted to {currencyCode} with your saved exchange rates.</small>
                ) : null}
              </div>

              <div className="cq-summary__block">
                <span className="cq-label">Pricing</span>
                <div className="cq-discount">
                  <TextField
                    autoComplete="off"
                    connectedRight={
                      <ButtonGroup variant="segmented">
                        <Button pressed={globalDiscountMode === "percent"} onClick={() => applyGlobalDiscount("percent", globalDiscountValue)}>
                          %
                        </Button>
                        <Button pressed={globalDiscountMode === "amount"} onClick={() => applyGlobalDiscount("amount", globalDiscountValue)}>
                          {currencyCode}
                        </Button>
                      </ButtonGroup>
                    }
                    label="Discount"
                    min={0}
                    type="number"
                    value={globalDiscountValue}
                    onChange={(value) => applyGlobalDiscount(globalDiscountMode, value)}
                  />
                </div>
                <div className="cq-row-fields">
                  <TextField
                    autoComplete="off"
                    label="Shipping"
                    min={0}
                    placeholder="0.00"
                    prefix={currencyCode}
                    type="number"
                    value={deliveryFeeMode === "percent" ? "" : deliveryFeeValue}
                    onChange={(val) => {
                      setDeliveryFeeMode(val ? "amount" : "none");
                      setDeliveryFeeValue(val);
                    }}
                  />
                  <Select
                    label="VAT"
                    options={[
                      { label: "5% standard", value: "5" },
                      { label: "0% zero-rated", value: "0" },
                      { label: "15%", value: "15" },
                    ]}
                    value={globalVatPercent}
                    onChange={applyGlobalVat}
                  />
                </div>
                <Checkbox
                  checked={priceAdjustmentEnabled}
                  disabled={!hasCustomer}
                  helpText={hasCustomer ? pricingLabel ?? pricingHelpText : "Choose a customer first."}
                  label="Local / international price adjustment"
                  onChange={setPriceAdjustmentEnabled}
                />
                <Checkbox
                  checked={isDropship}
                  helpText="Quote items you don't hold. Invoices won't touch your stock."
                  label="Dropship / broker sale"
                  onChange={(checked) => {
                    setIsDropship(checked);
                    setCatalogPage(1);
                    setSelectedProduct(null);
                  }}
                />
              </div>

              <dl className="cq-totals">
                {showPricingAdjustment ? (
                  <>
                    <div>
                      <dt>Catalog prices</dt>
                      <dd>{fmt(catalogSubtotal)}</dd>
                    </div>
                    <div className={pricingAdjustmentTotal > 0 ? "is-good" : undefined}>
                      <dt>{pricingLabel ?? "Price adjustment"}</dt>
                      <dd>
                        {pricingAdjustmentTotal > 0 ? "−" : "+"}
                        {fmt(Math.abs(pricingAdjustmentTotal))}
                      </dd>
                    </div>
                  </>
                ) : null}
                <div>
                  <dt>Subtotal</dt>
                  <dd>{fmt(rawSubtotal)}</dd>
                </div>
                {totalDiscount > 0 ? (
                  <div className="is-good">
                    <dt>Discount</dt>
                    <dd>−{fmt(totalDiscount)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Net before tax</dt>
                  <dd>{fmt(netSubtotal)}</dd>
                </div>
                {deliveryFee > 0 ? (
                  <div>
                    <dt>Shipping</dt>
                    <dd>+{fmt(deliveryFee)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>VAT</dt>
                  <dd>+{fmt(totalVat)}</dd>
                </div>
                <div className="is-total">
                  <dt>Total</dt>
                  <dd>{fmt(grandTotal)}</dd>
                </div>
              </dl>

              {hasLines && canViewCost ? (
                <div className={cn("cq-profit", grossProfit < 0 && "is-loss")}>
                  <div>
                    <span>
                      <Icon source={LockIcon} tone="subdued" /> Your margin
                    </span>
                    <strong>{formatMarginPercent(profitMarginPercent)}</strong>
                  </div>
                  <small>
                    {fmt(grossProfit)} profit on {fmt(totalCost)} cost
                  </small>
                </div>
              ) : null}

              <ul className="cq-checks">
                <li className={hasCustomer ? "is-ok" : undefined}>
                  <span>{hasCustomer ? <Icon source={CheckIcon} /> : <Icon source={PersonIcon} />}</span>
                  {hasCustomer ? `For ${customer?.name}` : "Choose a customer"}
                </li>
                <li className={hasLines ? "is-ok" : undefined}>
                  <span>{hasLines ? <Icon source={CheckIcon} /> : <Icon source={ProductIcon} />}</span>
                  {hasLines ? `${lines.length} item${lines.length === 1 ? "" : "s"} added` : "Add at least one item"}
                </li>
              </ul>

              <Button fullWidth disabled={!ready} loading={saving} size="large" variant="primary" onClick={() => void handleSaveQuotation()}>
                Save draft
              </Button>
              <small className="cq-note is-center">You can preview, send and get it signed after saving.</small>
            </div>
          </aside>
        </div>
      </BlockStack>

      <EditConfiguredLineModal
        allLines={lines}
        deliveryFee={{
          mode: deliveryFeeMode,
          value: deliveryFeeValue,
          pricePrefix,
          onModeChange: setDeliveryFeeMode,
          onValueChange: setDeliveryFeeValue,
        }}
        documentCurrencyId={values.currencyId}
        line={editingLine}
        open={Boolean(editingLine)}
        onClose={() => setEditingLineId(null)}
        onSave={saveLine}
      />
    </AppPage>
  );
}
