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
  Grid,
  InlineStack,
  Layout,
  Modal,
  ResourceItem,
  ResourceList,
  Select,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { pricingAdjustmentHelpText, pricingAdjustmentLabel } from "@frog1/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPage } from "@/components/layout/page";
import { ProductCatalogSearchResults } from "@/components/products/product-catalog-search-results";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { DocumentNotesField } from "@/components/documents/document-notes-field";
import { todayIsoDate } from "@/components/sales/format-money";
import { LineItemDescription } from "@/components/sales/line-item-description";
import { formatQuantity } from "@/lib/format-quantity";
import { listCustomers } from "@/lib/customers-api";
import type { Customer } from "@/types/customer";
import { createInvoice, confirmInvoice } from "@/lib/invoices-api";
import {
  applyPricingToLines,
  clampQuantity,
  getMaxAllowedQuantity,
  parseSellingPrice,
  resolveDeliveryFee,
  sumStockQuantity,
} from "@/lib/line-item-utils";
import { listProducts, listProductUnits, getProductStock } from "@/lib/products-api";
import type { Product, ProductUnit, ProductStock } from "@/types/product";
import { getQuotation } from "@/lib/quotations-api";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { useProductDocumentCurrency } from "@/hooks/use-product-document-currency";
import { useSalesPricing } from "@/hooks/use-sales-pricing";
import { useToast } from "@/components/providers/toast-provider";

interface ConfiguredInvoiceLine {
  id: string;
  productId?: string;
  productUnitId?: string;
  description: string;
  productDescription?: string | null;
  serialNumber?: string;
  quantity: number;
  baseUnitPrice: number;
  unitPrice: number;
  discountPercent: number;
  taxRatePercent: number;
  availableQuantity?: number;
}

export function CreateInvoicePage() {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const quotationId = searchParams.get("quotationId");
  const fromSalesOrder = Boolean(quotationId);
  const { settings: salesPricing } = useSalesPricing();
  const {
    baseCurrencyId,
    loading: currencyLoading,
  } = useOrgCurrency();
  const [documentCurrencyId, setDocumentCurrencyId] = useState<string>("");

  const [selectedTab, setSelectedTab] = useState(0);

  // Customer Search & Autocomplete State on Tab 1
  const [customerAccounts, setCustomerAccounts] = useState<Customer[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerTaxId, setCustomerTaxId] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("30 Days");
  const [invoiceDate, setInvoiceDate] = useState(todayIsoDate());
  const [dueDate, setDueDate] = useState(todayIsoDate());
  const [poReference, setPoReference] = useState("");
  const [notes, setNotes] = useState("");

  // Product catalog state
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [debouncedCatalogSearch, setDebouncedCatalogSearch] = useState("");
  const [catalogTotal, setCatalogTotal] = useState(0);

  // Serial Selection State for serial-tracked items
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [inStockUnits, setInStockUnits] = useState<ProductUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [selectedProductStock, setSelectedProductStock] = useState<ProductStock | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  // Invoice Lines State
  const [lines, setLines] = useState<ConfiguredInvoiceLine[]>([]);
  const [priceAdjustmentEnabled, setPriceAdjustmentEnabled] = useState(true);
  const [quantityWarning, setQuantityWarning] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [quotationNumber, setQuotationNumber] = useState<string | null>(null);
  const [deliveryFeeAmount, setDeliveryFeeAmount] = useState<number | null>(null);
  const [deliveryFeePercent, setDeliveryFeePercent] = useState<number | null>(null);

  const {
    documentCurrencyCode,
    exchangeRateError,
    exchangeRateLoading,
    fmt,
    formatProductCatalogPrice,
    convertProductForDocument,
  } = useProductDocumentCurrency(documentCurrencyId, products, selectedProduct);

  const pageTabs = fromSalesOrder
    ? [{ id: "review", content: "Review & post" }]
    : [
        { id: "setup", content: "1. Customer & Setup" },
        { id: "items", content: "2. Equipment Catalog & Serial Lines" },
        { id: "summary", content: "3. Financial Summary & Confirm" },
      ];

  useEffect(() => {
    if (baseCurrencyId && !documentCurrencyId) {
      setDocumentCurrencyId(baseCurrencyId);
    }
  }, [baseCurrencyId, documentCurrencyId]);

  // Fetch Customer Accounts for Autocomplete
  useEffect(() => {
    void listCustomers({ perPage: 100 })
      .then((result) => {
        setCustomerAccounts(result.data);
      })
      .catch(() => {
        setCustomerAccounts([]);
      });
  }, []);

  const filteredCustomerAccounts = useMemo(() => {
    if (!customerSearchQuery) return customerAccounts;
    const q = customerSearchQuery.toLowerCase();
    return customerAccounts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.taxId && c.taxId.toLowerCase().includes(q))
    );
  }, [customerAccounts, customerSearchQuery]);

  function handleSelectCustomerAccount(cust: Customer) {
    setSelectedCustomer(cust);
    setSelectedCustomerId(cust.id);
    setCustomerName(cust.name);
    setCustomerEmail(cust.email || "");
    if (cust.taxId) setCustomerTaxId(cust.taxId);
    setPoReference("");
    setPriceAdjustmentEnabled(true);
  }

  const customerIsLocal = selectedCustomer?.isLocal ?? false;

  const pricingLabel = useMemo(
    () => pricingAdjustmentLabel(customerIsLocal, priceAdjustmentEnabled, salesPricing),
    [customerIsLocal, priceAdjustmentEnabled, salesPricing],
  );

  const pricingHelpText = useMemo(
    () => pricingAdjustmentHelpText(salesPricing),
    [salesPricing],
  );

  useEffect(() => {
    if (fromSalesOrder) return;
    setLines((current) =>
      applyPricingToLines<ConfiguredInvoiceLine>(
        current,
        customerIsLocal,
        priceAdjustmentEnabled,
        salesPricing,
      ),
    );
  }, [customerIsLocal, priceAdjustmentEnabled, salesPricing, fromSalesOrder]);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedCatalogSearch(catalogSearch),
      300,
    );
    return () => clearTimeout(timer);
  }, [catalogSearch]);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const result = await listProducts({
        search: debouncedCatalogSearch || undefined,
        perPage: 50,
        forSaleOnly: true,
        rootOnly: true,
        includeStock: true,
        inStockOnly: true,
      });
      setProducts(result.data);
      setCatalogTotal(result.meta.total);
    } catch {
      setProducts([]);
      setCatalogTotal(0);
    } finally {
      setProductsLoading(false);
    }
  }, [debouncedCatalogSearch]);

  useEffect(() => {
    if (!fromSalesOrder && selectedTab === 1) {
      void loadProducts();
    }
  }, [selectedTab, loadProducts, fromSalesOrder]);

  // Load confirmed sales order data when creating an invoice
  useEffect(() => {
    if (quotationId) {
      void getQuotation(quotationId).then((q) => {
        if (!q) return;

        if (q.state !== "confirmed") {
          setError(
            "Only confirmed sales orders can be invoiced. Send and confirm the quotation first.",
          );
          return;
        }

        setSelectedCustomerId(q.customerId);
        setCustomerName(q.customerName || "");
        setCustomerEmail(q.customerEmail || "");
        setQuotationNumber(q.number);
        setDocumentCurrencyId(q.currencyId);
        setDeliveryFeeAmount(
          q.deliveryFeeAmount != null && q.deliveryFeeAmount !== ""
            ? Number(q.deliveryFeeAmount)
            : null,
        );
        setDeliveryFeePercent(
          q.deliveryFeePercent != null && q.deliveryFeePercent !== ""
            ? Number(q.deliveryFeePercent)
            : null,
        );
        if (q.customerReference) setPoReference(q.customerReference);
        if (q.notes) setNotes(q.notes);
        if (q.quoteDate) setInvoiceDate(q.quoteDate);
        if (q.lines && q.lines.length > 0) {
          setLines(
            q.lines.map((l) => {
              const baseUnitPrice = parseSellingPrice(l.unitPrice);
              const draftLine: ConfiguredInvoiceLine = {
                id: l.id,
                productId: l.productId || undefined,
                productUnitId: l.productUnitId || undefined,
                description: l.description,
                productDescription: l.productDescription ?? null,
                serialNumber: l.serialNumber ?? undefined,
                quantity: parseFloat(l.quantity) || 1,
                baseUnitPrice,
                unitPrice: baseUnitPrice,
                discountPercent: parseFloat(l.discountPercent) || 0,
                taxRatePercent: parseFloat(l.taxRatePercent) || 0,
              };
              return draftLine;
            }),
          );
        }
      });
    }
  }, [quotationId]);

  // Handle Product Selection & Fetch Serial Numbers
  async function handleSelectProduct(product: Product) {
    setSelectedProduct(product);
    setSelectedUnitId("");
    setInStockUnits([]);
    setSelectedProductStock(null);
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
    if (!selectedProduct) return 0;
    if (selectedProduct.trackSerial) return inStockUnits.length;
    return sumStockQuantity(selectedProductStock);
  }, [selectedProduct, selectedProductStock, inStockUnits.length]);

  const remainingForSelectedProduct = useMemo(() => {
    if (!selectedProduct) return 0;
    return getMaxAllowedQuantity(
      selectedAvailableQuantity,
      lines,
      selectedProduct.id,
    );
  }, [selectedProduct, selectedAvailableQuantity, lines]);

  async function handleAddSelectedProduct() {
    if (!selectedProduct || !documentCurrencyId) return;

    if (currencyLoading) {
      setQuantityWarning("Loading currency settings before adding products...");
      return;
    }

    if (exchangeRateLoading) {
      setQuantityWarning("Loading exchange rate before adding products...");
      return;
    }

    if (remainingForSelectedProduct <= 0) {
      setQuantityWarning("No stock available for this product.");
      return;
    }

    try {
      const { unitPrice } = await convertProductForDocument(selectedProduct);
      const unit = inStockUnits.find((u) => u.id === selectedUnitId);
      const draftLine: ConfiguredInvoiceLine = {
        id: `inv-line-${Date.now()}`,
        productId: selectedProduct.id,
        productUnitId: unit?.id,
        description: selectedProduct.name,
        productDescription: selectedProduct.description,
        serialNumber: unit?.serialNumber,
        quantity: 1,
        baseUnitPrice: unitPrice,
        unitPrice,
        discountPercent: 0,
        taxRatePercent: salesPricing.defaultVatRatePercent ?? 5,
        availableQuantity: selectedAvailableQuantity,
      };

      const [pricedLine] = applyPricingToLines<ConfiguredInvoiceLine>(
        [draftLine],
        customerIsLocal,
        priceAdjustmentEnabled,
        salesPricing,
      );

      setLines((prev) => [...prev, pricedLine]);
      setSelectedProduct(null);
      setSelectedUnitId("");
      setSelectedProductStock(null);
      setQuantityWarning(null);
    } catch (err) {
      setQuantityWarning(
        err instanceof Error ? err.message : "Failed to convert product price",
      );
    }
  }

  // Financial Calculations
  const rawSubtotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  }, [lines]);

  const totalDiscount = useMemo(() => {
    return lines.reduce(
      (sum, l) => sum + l.quantity * l.unitPrice * (l.discountPercent / 100),
      0
    );
  }, [lines]);

  const netSubtotal = rawSubtotal - totalDiscount;

  const deliveryFee = useMemo(
    () => resolveDeliveryFee(netSubtotal, deliveryFeeAmount, deliveryFeePercent),
    [netSubtotal, deliveryFeeAmount, deliveryFeePercent],
  );

  const totalTax = useMemo(() => {
    return lines.reduce((sum, l) => {
      const lineNet = l.quantity * l.unitPrice * (1 - l.discountPercent / 100);
      return sum + lineNet * (l.taxRatePercent / 100);
    }, 0);
  }, [lines]);

  const grandTotal = netSubtotal + deliveryFee + totalTax;

  function updateLine(lineId: string, field: keyof ConfiguredInvoiceLine, val: string | number) {
    setQuantityWarning(null);
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;

        const next: ConfiguredInvoiceLine = {
          ...line,
          [field]:
            field === "quantity"
              ? Number(val) || 0
              : typeof val === "string"
                ? Number(val) || 0
                : val,
        };

        if (field === "unitPrice") {
          next.baseUnitPrice = Number(val) || 0;
        }

        if (field === "quantity" && line.productId) {
          const clamped = clampQuantity(Number(val) || 0, prev, next);
          if (clamped !== (Number(val) || 0)) {
            const maxAllowed = getMaxAllowedQuantity(
              line.availableQuantity ?? 0,
              prev,
              line.productId,
              line.id,
            );
            setQuantityWarning(
              `Only ${maxAllowed} unit(s) available for ${line.description}.`,
            );
          }
          next.quantity = clamped;
        }

        return next;
      }),
    );
  }

  function removeLine(lineId: string) {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  }

  async function handleConfirmPost() {
    setSaving(true);
    setError(null);
    if (!selectedCustomerId) {
      setError("Select a customer before posting the invoice.");
      setSaving(false);
      return;
    }
    if (!documentCurrencyId) {
      setError("Invoice currency is required.");
      setSaving(false);
      return;
    }
    try {
      const draft = await createInvoice(
        fromSalesOrder
          ? {
              salesOrderId: quotationId!,
              invoiceDate,
              dueDate,
            }
          : {
              customerId: selectedCustomerId,
              currencyId: documentCurrencyId,
              invoiceDate,
              dueDate,
              customerReference: poReference || undefined,
              notes: notes || undefined,
              lines: lines.map((l) => ({
                productId: l.productId,
                productUnitId: l.productUnitId,
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discountPercent: l.discountPercent,
                taxRatePercent: l.taxRatePercent,
              })),
            },
      );
      const posted = await confirmInvoice(draft.id);
      showSuccess(`Invoice ${posted.number} created and posted.`);
      router.push(`/dashboard/invoices/${posted.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to post invoice";
      setError(message);
      showError(message);
      setSaving(false);
    }
  }

  return (
    <AppPage
      backAction={{ content: "Invoices Directory", url: "/dashboard/invoices" }}
      primaryAction={
        fromSalesOrder
          ? {
              content: "Confirm & Post Invoice",
              loading: saving,
              onAction: () => void handleConfirmPost(),
            }
          : {
              content:
                selectedTab === 0
                  ? "Next: Equipment Catalog & Lines →"
                  : selectedTab === 1
                    ? "Next: Financial Summary →"
                    : "Confirm & Post Invoice",
              loading: saving,
              onAction: () => {
                if (selectedTab === 0) setSelectedTab(1);
                else if (selectedTab === 1) setSelectedTab(2);
                else void handleConfirmPost();
              },
            }
      }
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
          content: "Preview PDF Invoice",
          onAction: () => setPdfModalOpen(true),
        },
      ]}
      subtitle={
        fromSalesOrder
          ? `Review sales order ${quotationNumber ?? quotationId} — lines and amounts are fixed at posting`
          : "Create standalone customer invoice directly without a sales order."
      }
      title={
        fromSalesOrder ? "Post invoice from sales order" : "Create Customer Invoice Studio"
      }
    >
      <BlockStack gap="500">
        {/* Step Navigation Bar */}
        <InlineStack align="space-between" blockAlign="center">
          <Tabs
            tabs={pageTabs}
            selected={selectedTab}
            onSelect={(idx) => setSelectedTab(idx)}
          />

          {!fromSalesOrder ? (
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
                <Button variant="primary" loading={saving} onClick={() => void handleConfirmPost()}>
                  Confirm & Post Invoice
                </Button>
              )}
            </InlineStack>
          ) : null}
        </InlineStack>

        {fromSalesOrder ? (
          <Banner tone="info">
            This invoice is created from a confirmed sales order. Lines, pricing, and customer
            details cannot be changed here. To correct amounts, cancel the sales order before
            invoicing. After posting, cancel the invoice to issue a credit note and create a new
            invoice if needed.
          </Banner>
        ) : (
          <Banner tone="info">
            Standalone Customer Invoice Mode (Creating invoice directly without a sales order).
          </Banner>
        )}

        {error ? <Banner tone="critical">{error}</Banner> : null}
        {exchangeRateError ? <Banner tone="warning">{exchangeRateError}</Banner> : null}

        {/* ── SALES ORDER: READ-ONLY REVIEW ── */}
        {fromSalesOrder && selectedTab === 0 ? (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="500">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">
                      Sales order invoice review
                    </Text>
                    <Text as="p" tone="subdued">
                      Confirm the order details below, then post. Posted invoices cannot be edited.
                    </Text>
                  </BlockStack>

                  <Grid>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                      <TextField
                        autoComplete="off"
                        label="Customer"
                        readOnly
                        value={customerName}
                        onChange={() => undefined}
                      />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                      <TextField
                        autoComplete="email"
                        label="Billing email"
                        readOnly
                        value={customerEmail}
                        onChange={() => undefined}
                      />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                      <TextField
                        autoComplete="off"
                        label="PO / customer reference"
                        readOnly
                        value={poReference}
                        onChange={() => undefined}
                      />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}>
                      <TextField
                        autoComplete="off"
                        label="Invoice date"
                        readOnly
                        type="date"
                        value={invoiceDate}
                        onChange={() => undefined}
                      />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}>
                      <TextField
                        autoComplete="off"
                        label="Due date"
                        readOnly
                        type="date"
                        value={dueDate}
                        onChange={() => undefined}
                      />
                    </Grid.Cell>
                    <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}>
                      <TextField
                        autoComplete="off"
                        label="Currency"
                        readOnly
                        value={documentCurrencyCode}
                        onChange={() => undefined}
                      />
                    </Grid.Cell>
                  </Grid>

                  {notes ? (
                    <TextField
                      autoComplete="off"
                      label="Notes"
                      multiline={3}
                      readOnly
                      value={notes}
                      onChange={() => undefined}
                    />
                  ) : null}

                  <div className="frogmen-recent-table-wrapper">
                    <table className="frogmen-recent-table">
                      <thead>
                        <tr>
                          <th style={{ width: "35%" }}>Description</th>
                          <th style={{ width: "20%" }}>Serial</th>
                          <th style={{ width: "8%", textAlign: "right" }}>Qty</th>
                          <th style={{ width: "15%", textAlign: "right" }}>
                            Unit price ({documentCurrencyCode})
                          </th>
                          <th style={{ width: "10%", textAlign: "right" }}>Disc (%)</th>
                          <th style={{ width: "10%", textAlign: "right" }}>VAT (%)</th>
                          <th style={{ width: "12%", textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => {
                          const lineNet =
                            line.quantity * line.unitPrice * (1 - line.discountPercent / 100);
                          const lineTotal = lineNet * (1 + line.taxRatePercent / 100);

                          return (
                            <tr key={line.id}>
                              <td className="frogmen-font-bold">
                                <LineItemDescription
                                  details={line.productDescription}
                                  productId={line.productId}
                                  title={line.description}
                                />
                              </td>
                              <td>
                                {line.serialNumber ? (
                                  <Badge tone="info">{line.serialNumber}</Badge>
                                ) : (
                                  <Text as="span" tone="subdued">—</Text>
                                )}
                              </td>
                              <td style={{ textAlign: "right" }}>{formatQuantity(line.quantity)}</td>
                              <td style={{ textAlign: "right" }}>{fmt(line.unitPrice)}</td>
                              <td style={{ textAlign: "right" }} className="frogmen-text-muted">
                                {line.discountPercent}%
                              </td>
                              <td style={{ textAlign: "right" }} className="frogmen-text-muted">
                                {line.taxRatePercent}%
                              </td>
                              <td style={{ textAlign: "right" }} className="frogmen-font-bold">
                                {fmt(lineTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <InlineStack align="end">
                    <Button variant="primary" loading={saving} onClick={() => void handleConfirmPost()}>
                      Confirm & Post Invoice
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Totals</Text>

                  <div className="quotation-summary-panel__rows">
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">Subtotal</Text>
                      <Text as="span" fontWeight="semibold">{fmt(rawSubtotal)}</Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">Discount</Text>
                      <Text as="span" tone="success">-{fmt(totalDiscount)}</Text>
                    </div>
                    {deliveryFee > 0 ? (
                      <div className="quotation-summary-row">
                        <Text as="span" tone="subdued">
                          Delivery fee
                          {deliveryFeePercent ? ` (${deliveryFeePercent}%)` : ""}
                        </Text>
                        <Text as="span" fontWeight="semibold">+{fmt(deliveryFee)}</Text>
                      </div>
                    ) : null}
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">VAT</Text>
                      <Text as="span" fontWeight="semibold">+{fmt(totalTax)}</Text>
                    </div>
                  </div>

                  <Divider />

                  <div className="quotation-summary-panel__total">
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Grand total</Text>
                      <Text as="span" variant="headingLg" fontWeight="bold">
                        {fmt(grandTotal)}
                      </Text>
                    </InlineStack>
                  </div>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        ) : null}

        {/* ── TAB 0: INTERACTIVE CUSTOMER ACCOUNT SEARCH & BILLING SETUP ── */}
        {!fromSalesOrder && selectedTab === 0 ? (
          <Layout>
            <Layout.Section>
              <BlockStack gap="500">
                {/* Real-time Customer Search & Autocomplete Card */}
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Search & Select Customer Account
                    </Text>
                    <TextField
                      autoComplete="off"
                      label="Search Customer Accounts"
                      onChange={setCustomerSearchQuery}
                      placeholder="Search customer account by name, email, or tax ID (e.g. subsea, frank, mike)..."
                      value={customerSearchQuery}
                    />

                    <ResourceList
                      items={filteredCustomerAccounts}
                      renderItem={(cust) => {
                        const isSelected = cust.id === selectedCustomerId;
                        return (
                          <ResourceItem
                            id={cust.id}
                            onClick={() => handleSelectCustomerAccount(cust)}
                            accessibilityLabel={`Select ${cust.name}`}
                          >
                            <InlineStack align="space-between" blockAlign="center">
                              <BlockStack gap="050">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="span" fontWeight="bold">
                                    {cust.name}
                                  </Text>
                                  <Badge tone={cust.accountType === "company" ? "info" : undefined}>
                                    {cust.accountType === "company" ? "Corporate B2B" : "Individual Client"}
                                  </Badge>
                                  {cust.isLocal ? <Badge tone="attention">Local</Badge> : null}
                                  {isSelected ? <Badge tone="success">Selected Account</Badge> : null}
                                </InlineStack>
                                <Text as="span" tone="subdued" variant="bodySm">
                                  Email: {cust.email || " "} • Tax ID: {cust.taxId || " "}
                                </Text>
                              </BlockStack>
                              <div onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="slim"
                                  variant={isSelected ? "primary" : "secondary"}
                                  onClick={() => handleSelectCustomerAccount(cust)}
                                >
                                  {isSelected ? "Selected" : "Select Account"}
                                </Button>
                              </div>
                            </InlineStack>
                          </ResourceItem>
                        );
                      }}
                    />
                  </BlockStack>
                </Card>

                {/* Selected Customer Billing Header Details */}
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Billing Header & Reference Info
                    </Text>

                    <Grid>
                      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                        <TextField
                          autoComplete="off"
                          label="Customer Account Name"
                          value={customerName}
                          onChange={setCustomerName}
                        />
                      </Grid.Cell>
                      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                        <TextField
                          autoComplete="email"
                          label="Customer Billing Email"
                          value={customerEmail}
                          onChange={setCustomerEmail}
                        />
                      </Grid.Cell>
                      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                        <TextField
                          autoComplete="off"
                          label="PO / Customer Reference"
                          value={poReference}
                          onChange={setPoReference}
                        />
                      </Grid.Cell>
                      <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}>
                        <TextField
                          autoComplete="off"
                          label="Invoice Date"
                          type="date"
                          value={invoiceDate}
                          onChange={setInvoiceDate}
                        />
                      </Grid.Cell>
                      <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}>
                        <TextField
                          autoComplete="off"
                          label="Due Date"
                          type="date"
                          value={dueDate}
                          onChange={setDueDate}
                        />
                      </Grid.Cell>
                      <Grid.Cell columnSpan={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}>
                        <Select
                          label="Payment Terms"
                          options={[
                            { label: "15 Days Net", value: "15 Days" },
                            { label: "30 Days Net", value: "30 Days" },
                            { label: "Immediate Payment", value: "Immediate" },
                          ]}
                          value={paymentTerm}
                          onChange={setPaymentTerm}
                        />
                      </Grid.Cell>
                    </Grid>
                    <DocumentNotesField
                      value={notes}
                      placeholder="Type notes shown on the invoice..."
                      onChange={setNotes}
                    />
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Billing Setup Summary
                  </Text>

                  <div className="quotation-summary-panel__rows">
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">Billed Customer</Text>
                      <Text as="span" fontWeight="semibold">{customerName}</Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">Billing Email</Text>
                      <Text as="span" fontWeight="semibold">{customerEmail}</Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">Tax ID</Text>
                      <Text as="span" fontWeight="semibold">{customerTaxId}</Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">PO Reference</Text>
                      <Text as="span" fontWeight="semibold">{poReference}</Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">Payment Terms</Text>
                      <Text as="span" fontWeight="semibold">{paymentTerm}</Text>
                    </div>
                  </div>

                  <Checkbox
                    checked={priceAdjustmentEnabled}
                    disabled={!selectedCustomer}
                    helpText={pricingHelpText}
                    label="Apply local/non-local pricing adjustment"
                    onChange={setPriceAdjustmentEnabled}
                  />
                  {pricingLabel ? <Badge tone="info">{pricingLabel}</Badge> : null}

                  <Button variant="primary" fullWidth onClick={() => setSelectedTab(1)}>
                    Next: Equipment Catalog & Lines →
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        ) : null}

        {/* ── TAB 1: EQUIPMENT CATALOG & SERIAL NUMBER SELECTION ── */}
        {!fromSalesOrder && selectedTab === 1 ? (
          <Layout>
            <Layout.Section>
              <BlockStack gap="500">
                <Card>
                  <BlockStack gap="300">
                    <Checkbox
                      checked={priceAdjustmentEnabled}
                      disabled={!selectedCustomer}
                      label="Apply local/non-local pricing adjustment"
                      onChange={setPriceAdjustmentEnabled}
                    />
                    {pricingLabel ? <Badge tone="info">{pricingLabel}</Badge> : null}
                  </BlockStack>
                </Card>

                {/* Catalog Search Card */}
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

                    <Text as="p" tone="subdued" variant="bodySm">
                      {productsLoading && products.length === 0
                        ? "Loading products..."
                        : catalogTotal === 0
                          ? "No in-stock saleable products found. Linked components and out-of-stock items are hidden."
                          : `Showing ${products.length} of ${catalogTotal} in-stock product${catalogTotal === 1 ? "" : "s"} (linked components hidden).${productsLoading ? " Updating…" : ""}`}
                    </Text>
                    {products.length > 0 ? (
                      <ProductCatalogSearchResults>
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
                                  {product.availableQuantity == null
                                    ? ""
                                    : ` · Qty on hand: ${product.availableQuantity}`}
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
                      </ProductCatalogSearchResults>
                    ) : null}
                  </BlockStack>
                </Card>

                {/* Serial Selector Modal Card */}
                {selectedProduct ? (
                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingMd">
                          Configure Line Item: {selectedProduct.name}
                        </Text>
                        <Badge tone="success">
                          {`${formatProductCatalogPrice(selectedProduct)} on invoice`}
                        </Badge>
                      </InlineStack>

                      <Text as="p" tone="subdued">
                        Available: {stockLoading ? "Loading..." : selectedAvailableQuantity}
                        {!selectedProduct.trackSerial && remainingForSelectedProduct < selectedAvailableQuantity
                          ? ` (${remainingForSelectedProduct} remaining on this invoice)`
                          : null}
                      </Text>

                      {selectedProduct.trackSerial ? (
                        <BlockStack gap="200">
                          <Text as="p" fontWeight="semibold">
                            Choose the stock unit by serial number
                          </Text>
                          {stockLoading ? (
                            <Text as="p" tone="subdued">Loading in-stock serial numbers...</Text>
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
                            remainingForSelectedProduct <= 0 ||
                            currencyLoading ||
                            exchangeRateLoading
                          }
                          onClick={() => void handleAddSelectedProduct()}
                        >
                          + Add Line Item to Invoice
                        </Button>
                      </InlineStack>
                      {quantityWarning ? (
                        <Banner tone="warning">{quantityWarning}</Banner>
                      ) : null}
                    </BlockStack>
                  </Card>
                ) : null}

                {/* Configured Lines Table */}
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Configured Invoice Equipment Lines ({lines.length})
                    </Text>

                    {quantityWarning ? (
                      <Banner tone="warning" onDismiss={() => setQuantityWarning(null)}>
                        {quantityWarning}
                      </Banner>
                    ) : null}

                    <div className="frogmen-recent-table-wrapper">
                      <table className="frogmen-recent-table">
                        <thead>
                          <tr>
                            <th style={{ width: "30%" }}>Description</th>
                            <th style={{ width: "18%" }}>Serial Number</th>
                            <th style={{ width: "10%", textAlign: "right" }}>Qty</th>
                            <th style={{ width: "12%", textAlign: "right" }}>Unit Price ({documentCurrencyCode})</th>
                            <th style={{ width: "12%", textAlign: "right" }}>Disc (%)</th>
                            <th style={{ width: "12%", textAlign: "right" }}>VAT (%)</th>
                            <th style={{ width: "11%", textAlign: "right" }}>Total</th>
                            <th style={{ width: "5%" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line) => {
                            const lineNet = line.quantity * line.unitPrice * (1 - line.discountPercent / 100);
                            const lineTotal = lineNet * (1 + line.taxRatePercent / 100);

                            return (
                              <tr key={line.id}>
                                <td>
                                  <LineItemDescription
                                    details={line.productDescription}
                                    productId={line.productId}
                                    title={line.description}
                                  />
                                </td>
                                <td>
                                  {line.serialNumber ? (
                                    <Badge tone="info">{line.serialNumber}</Badge>
                                  ) : (
                                    <Text as="span" tone="subdued"> </Text>
                                  )}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <input
                                    className="frogmen-table-input"
                                    type="number"
                                    min={0}
                                    max={
                                      line.productUnitId || !line.productId
                                        ? 1
                                        : getMaxAllowedQuantity(
                                            line.availableQuantity ?? 0,
                                            lines,
                                            line.productId,
                                            line.id,
                                          ) || undefined
                                    }
                                    value={line.quantity}
                                    disabled={Boolean(line.productUnitId)}
                                    onChange={(e) => updateLine(line.id, "quantity", e.target.value)}
                                  />
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <input
                                    className="frogmen-table-input"
                                    type="number"
                                    value={line.unitPrice}
                                    onChange={(e) => updateLine(line.id, "unitPrice", e.target.value)}
                                  />
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <input
                                    className="frogmen-table-input frogmen-table-input--percent"
                                    type="number"
                                    value={line.discountPercent}
                                    onChange={(e) => updateLine(line.id, "discountPercent", e.target.value)}
                                  />
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <select
                                    className="frogmen-table-input frogmen-table-input--percent"
                                    value={line.taxRatePercent}
                                    onChange={(e) => updateLine(line.id, "taxRatePercent", e.target.value)}
                                    aria-label={`VAT rate for ${line.description}`}
                                  >
                                    {(salesPricing.vatRates ?? [0, 5]).map((rate) => (
                                      <option key={rate} value={rate}>{rate}%</option>
                                    ))}
                                  </select>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <Text as="span" fontWeight="bold">
                                    {fmt(lineTotal)}
                                  </Text>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <Button
                                    size="slim"
                                    tone="critical"
                                    onClick={() => removeLine(line.id)}
                                  >
                                    Remove
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <InlineStack align="space-between" blockAlign="center">
                      <Button onClick={() => setSelectedTab(0)}>
                        ← Back to Customer Setup
                      </Button>
                      <Button variant="primary" onClick={() => setSelectedTab(2)}>
                        Next: Financial Summary →
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
                    Real-time Subtotal
                  </Text>

                  <div className="quotation-summary-panel__rows">
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">Equipment Subtotal</Text>
                      <Text as="span" fontWeight="semibold">{fmt(rawSubtotal)}</Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">Volume Discount (5%)</Text>
                      <Text as="span" tone="success">-{fmt(totalDiscount)}</Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">VAT Tax (+5%)</Text>
                      <Text as="span" fontWeight="semibold">+{fmt(totalTax)}</Text>
                    </div>
                  </div>

                  <Divider />

                  <div className="quotation-summary-panel__total">
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Grand Total</Text>
                      <Text as="span" variant="headingLg" fontWeight="bold">
                        {fmt(grandTotal)}
                      </Text>
                    </InlineStack>
                  </div>

                  <Button variant="primary" fullWidth onClick={() => setSelectedTab(2)}>
                    Next: Summary & Confirm →
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        ) : null}

        {/* ── TAB 2: FINANCIAL SUMMARY & CONFIRM POST ── */}
        {!fromSalesOrder && selectedTab === 2 ? (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="500">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="050">
                      <Text as="h1" variant="headingLg">
                        Commercial Invoice Financial Summary
                      </Text>
                      <Text as="p" tone="subdued">
                        Customer: {customerName} • Email: {customerEmail} • PO Ref: {poReference}
                      </Text>
                    </BlockStack>
                    <Badge tone="info">Ready to Post</Badge>
                  </InlineStack>

                  <Divider />

                  {/* Summary Lines Table */}
                  <div className="frogmen-recent-table-wrapper">
                    <table className="frogmen-recent-table">
                      <thead>
                        <tr>
                          <th style={{ width: "35%" }}>Equipment Description</th>
                          <th style={{ width: "20%" }}>Serial Number</th>
                          <th style={{ width: "8%", textAlign: "right" }}>Qty</th>
                          <th style={{ width: "15%", textAlign: "right" }}>Unit Price ({documentCurrencyCode})</th>
                          <th style={{ width: "10%", textAlign: "right" }}>Disc (%)</th>
                          <th style={{ width: "10%", textAlign: "right" }}>VAT (%)</th>
                          <th style={{ width: "12%", textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => {
                          const lineNet = l.quantity * l.unitPrice * (1 - l.discountPercent / 100);
                          const lineTotal = lineNet * (1 + l.taxRatePercent / 100);

                          return (
                            <tr key={l.id}>
                              <td className="frogmen-font-bold">
                                <LineItemDescription
                                  details={l.productDescription}
                                  productId={l.productId}
                                  title={l.description}
                                />
                              </td>
                              <td>
                                {l.serialNumber ? (
                                  <Badge tone="info">{l.serialNumber}</Badge>
                                ) : (
                                  <Text as="span" tone="subdued"> </Text>
                                )}
                              </td>
                              <td style={{ textAlign: "right" }}>{formatQuantity(l.quantity)}</td>
                              <td style={{ textAlign: "right" }}>{fmt(l.unitPrice)}</td>
                              <td style={{ textAlign: "right" }} className="frogmen-text-muted">{l.discountPercent}%</td>
                              <td style={{ textAlign: "right" }} className="frogmen-text-muted">{l.taxRatePercent}%</td>
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
                      ← Back to Equipment Lines
                    </Button>
                    <Button variant="primary" loading={saving} onClick={() => void handleConfirmPost()}>
                      Confirm & Post Invoice
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
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">Equipment Subtotal</Text>
                      <Text as="span" fontWeight="semibold">{fmt(rawSubtotal)}</Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">Volume Discount (5%)</Text>
                      <Text as="span" tone="success">-{fmt(totalDiscount)}</Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">Net Taxable Subtotal</Text>
                      <Text as="span" fontWeight="semibold">{fmt(netSubtotal)}</Text>
                    </div>
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued">VAT / Sales Tax (+5%)</Text>
                      <Text as="span" fontWeight="semibold">+{fmt(totalTax)}</Text>
                    </div>
                  </div>

                  <Divider />

                  <div className="quotation-summary-panel__total">
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Grand Total</Text>
                      <Text as="span" variant="headingLg" fontWeight="bold">
                        {fmt(grandTotal)}
                      </Text>
                    </InlineStack>
                  </div>

                  <Button
                    variant="primary"
                    fullWidth
                    loading={saving}
                    onClick={() => void handleConfirmPost()}
                  >
                    Confirm & Post Invoice
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        ) : null}
      </BlockStack>

      {quotationId && quotationNumber ? (
        <DocumentPreviewModal
          onClose={() => setPdfModalOpen(false)}
          open={pdfModalOpen}
          quotationId={quotationId}
          quotationNumber={quotationNumber}
          title="Sales order document preview"
        />
      ) : (
        <Modal
          open={pdfModalOpen}
          onClose={() => setPdfModalOpen(false)}
          title="Invoice PDF preview"
          primaryAction={{
            content: "Close",
            onAction: () => setPdfModalOpen(false),
          }}
        >
          <Modal.Section>
            <Banner tone="info">
              Create this invoice from a confirmed sales order to preview the branded
              quotation document, or wait for invoice PDF generation in a future release.
            </Banner>
          </Modal.Section>
        </Modal>
      )}
    </AppPage>
  );
}
