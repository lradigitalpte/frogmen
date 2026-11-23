"use client";

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
  CalendarIcon,
  CheckIcon,
  DeleteIcon,
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
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppPage } from "@/components/layout/page";
import { DocumentPreviewModal } from "@/components/documents/document-preview-modal";
import { InvoiceDocumentBankModal } from "@/components/invoices/invoice-document-bank-modal";
import { listBankAccounts } from "@/lib/bank-accounts-api";
import type { BankAccount } from "@/lib/bank-accounts-api";
import {
  getInvoicePaymentBankStatus,
  resolveInvoiceDocumentBankIdForCreate,
} from "@/lib/invoice-document-bank";
import { DocumentNotesField } from "@/components/documents/document-notes-field";
import { todayIsoDate } from "@/components/sales/format-money";
import { LineItemDescription } from "@/components/sales/line-item-description";
import { formatQuantity } from "@/lib/format-quantity";
import { CustomerPicker } from "@/components/sales/customer-picker";
import { listCustomers } from "@/lib/customers-api";
import { formatAppDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
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

const PAYMENT_TERMS = [
  { days: 0, label: "On receipt" },
  { days: 15, label: "15 days" },
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
];

function addDays(iso: string, days: number) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(fromIso: string, toIso: string) {
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function initials(name: string) {
  return name
    .split(/s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Numbered section card used down the main column (shares the quotation composer styles). */
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
  availableQuantity?: number | null;
  isStorable?: boolean;
  productType?: string;
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

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIsoDate());
  const [dueDate, setDueDate] = useState(() => addDays(todayIsoDate(), 30));
  const [poReference, setPoReference] = useState("");
  const [notes, setNotes] = useState("");

  // Product catalog state
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [debouncedCatalogSearch, setDebouncedCatalogSearch] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
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
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [documentBankAccountId, setDocumentBankAccountId] = useState<
    string | null
  >(null);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [pendingPostAfterBank, setPendingPostAfterBank] = useState(false);
  const [quotationNumber, setQuotationNumber] = useState<string | null>(null);
  const [deliveryFeeAmount, setDeliveryFeeAmount] = useState<number | null>(null);
  const [deliveryFeePercent, setDeliveryFeePercent] = useState<number | null>(null);
  const [billingDocumentType, setBillingDocumentType] =
    useState<BillingDocumentType>("tax_invoice");
  const billingTypeManualRef = useRef(false);

  const {
    documentCurrencyCode,
    exchangeRateError,
    exchangeRateLoading,
    fmt,
    formatProductCatalogPrice,
    convertProductForDocument,
  } = useProductDocumentCurrency(documentCurrencyId, products, selectedProduct);

  useEffect(() => {
    if (baseCurrencyId && !documentCurrencyId) {
      setDocumentCurrencyId(baseCurrencyId);
    }
  }, [baseCurrencyId, documentCurrencyId]);

  // Newest customers for one-click picking.
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  useEffect(() => {
    if (fromSalesOrder) return;
    void listCustomers({ perPage: 6, sortBy: "createdAt", sortDir: "desc" })
      .then((result) => setRecentCustomers(result.data))
      .catch(() => setRecentCustomers([]));
  }, [fromSalesOrder]);

  useEffect(() => {
    void listBankAccounts({ activeOnly: true })
      .then(setBankAccounts)
      .catch(() => setBankAccounts([]));
  }, []);

  function handleSelectCustomerAccount(cust: Customer | null) {
    setSelectedCustomer(cust);
    setSelectedCustomerId(cust?.id ?? "");
    setCustomerName(cust?.name ?? "");
    setCustomerEmail(cust?.email || "");
    if (!cust) return;
    setPriceAdjustmentEnabled(true);
    if (!billingTypeManualRef.current) {
      setBillingDocumentType(defaultBillingDocumentTypeForCustomer(cust.isLocal));
    }
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
      () => setDebouncedCatalogSearch(catalogSearch.trim()),
      300,
    );
    return () => clearTimeout(timer);
  }, [catalogSearch]);

  useEffect(() => {
    setCatalogPage(1);
  }, [debouncedCatalogSearch]);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    const isSearch = Boolean(debouncedCatalogSearch);
    try {
      const result = await listProducts({
        search: debouncedCatalogSearch || undefined,
        page: catalogPage,
        perPage: isSearch ? 100 : 50,
        sortBy: "name",
        sortDir: "asc",
        forSaleOnly: true,
        rootOnly: true,
        includeStock: true,
        inStockOnly: true,
      });
      setProducts((current) =>
        catalogPage > 1 ? [...current, ...result.data] : result.data,
      );
      setCatalogTotal(result.meta.total);
    } catch {
      setProducts([]);
      setCatalogTotal(0);
    } finally {
      setProductsLoading(false);
    }
  }, [debouncedCatalogSearch, catalogPage]);

  useEffect(() => {
    if (!fromSalesOrder) {
      void loadProducts();
    }
  }, [loadProducts, fromSalesOrder]);

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
        setBillingDocumentType(q.billingDocumentType ?? "tax_invoice");
        setInvoiceDate(todayIsoDate());
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

    const isInventoryTracked = product.type === "goods" && product.isStorable;
    if (!isInventoryTracked) {
      setStockLoading(false);
      return;
    }

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

  const isSelectedProductInventoryTracked = useMemo(() => {
    if (!selectedProduct) return false;
    return selectedProduct.type === "goods" && selectedProduct.isStorable;
  }, [selectedProduct]);

  const selectedAvailableQuantity = useMemo(() => {
    if (!selectedProduct) return 0;
    if (!isSelectedProductInventoryTracked) return null;
    if (selectedProduct.trackSerial) return inStockUnits.length;
    return sumStockQuantity(selectedProductStock);
  }, [selectedProduct, isSelectedProductInventoryTracked, selectedProductStock, inStockUnits.length]);

  const remainingForSelectedProduct = useMemo(() => {
    if (!selectedProduct) return 0;
    if (!isSelectedProductInventoryTracked) return null;
    return getMaxAllowedQuantity(
      selectedAvailableQuantity ?? 0,
      lines,
      selectedProduct.id,
    );
  }, [selectedProduct, isSelectedProductInventoryTracked, selectedAvailableQuantity, lines]);

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

    if (
      isSelectedProductInventoryTracked &&
      remainingForSelectedProduct !== null &&
      remainingForSelectedProduct <= 0
    ) {
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
        availableQuantity: isSelectedProductInventoryTracked
          ? selectedAvailableQuantity
          : null,
        isStorable: selectedProduct.isStorable,
        productType: selectedProduct.type,
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

  async function postInvoiceWithBank(bankAccountId: string | null) {
    setSaving(true);
    setError(null);
    if (!selectedCustomerId && !fromSalesOrder) {
      setError("Select a customer before posting the invoice.");
      setSaving(false);
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one item before posting.");
      setSaving(false);
      return;
    }
    if (!documentCurrencyId) {
      setError("Invoice currency is required.");
      setSaving(false);
      return;
    }
    const currencyCode = documentCurrencyCode ?? "AED";
    const resolvedBankId = resolveInvoiceDocumentBankIdForCreate(
      bankAccounts,
      currencyCode,
      bankAccountId,
    );
    if (!resolvedBankId) {
      setError(
        `Choose a ${currencyCode} bank account to show payment details on the invoice PDF.`,
      );
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
              billingDocumentType,
              documentBankAccountId: resolvedBankId,
            }
          : {
              customerId: selectedCustomerId,
              currencyId: documentCurrencyId,
              invoiceDate,
              dueDate,
              customerReference: poReference || undefined,
              notes: notes || undefined,
              billingDocumentType,
              documentBankAccountId: resolvedBankId,
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

  function handleConfirmPost() {
    const currencyCode = documentCurrencyCode ?? "AED";
    const status = getInvoicePaymentBankStatus(
      bankAccounts,
      currencyCode,
      documentBankAccountId,
    );
    if (status === "ready") {
      void postInvoiceWithBank(documentBankAccountId);
      return;
    }
    setPendingPostAfterBank(true);
    setBankModalOpen(true);
  }

  async function handleConfirmDocumentBank(bankAccountId: string) {
    setDocumentBankAccountId(bankAccountId);
    setBankModalOpen(false);
    if (pendingPostAfterBank) {
      setPendingPostAfterBank(false);
      await postInvoiceWithBank(bankAccountId);
    }
  }

  const hasCustomer = fromSalesOrder ? Boolean(customerName) : Boolean(selectedCustomer);
  const hasLines = lines.length > 0;
  const ready = hasCustomer && hasLines && Boolean(documentCurrencyId);
  const searching = Boolean(debouncedCatalogSearch);
  const configuring = selectedProduct;
  const currencyCode = documentCurrencyCode ?? "AED";
  const termDaysNow = invoiceDate && dueDate ? daysBetween(invoiceDate, dueDate) : null;
  const vatRates = Array.from(new Set(lines.map((l) => l.taxRatePercent))).sort((a, b) => a - b);
  const vatLabel = vatRates.length === 1 ? `VAT (${vatRates[0]}%)` : "VAT";
  const addDisabled =
    !configuring ||
    (isSelectedProductInventoryTracked && remainingForSelectedProduct !== null && remainingForSelectedProduct <= 0) ||
    (Boolean(configuring?.trackSerial) && (inStockUnits.length === 0 || !selectedUnitId)) ||
    currencyLoading ||
    exchangeRateLoading;

  const catalogHint =
    productsLoading && products.length === 0
      ? "Loading products…"
      : catalogSearch.trim() && catalogSearch.trim() !== debouncedCatalogSearch
        ? "Searching…"
        : catalogTotal === 0
          ? "No in-stock products found. Linked components and out-of-stock items are hidden."
          : searching
            ? `${catalogTotal} match${catalogTotal === 1 ? "" : "es"} in stock`
            : `Suggestions · ${catalogTotal} in-stock products — search to see all`;

  function jumpTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handlePost() {
    setError(null);
    if (!hasCustomer) {
      setError("Choose a customer first.");
      jumpTo("ci-customer");
      return;
    }
    if (!hasLines) {
      setError("Add at least one item before posting.");
      jumpTo("ci-items");
      return;
    }
    handleConfirmPost();
  }

  function setInvoiceDateKeepingTerms(next: string) {
    setInvoiceDate(next);
    if (next && termDaysNow !== null && termDaysNow >= 0) setDueDate(addDays(next, termDaysNow));
  }

  const customerCard = (
    <div className="cq-customer">
      <span className="cq-customer__avatar">{initials(customerName || "?")}</span>
      <div className="cq-customer__text">
        <strong>{customerName}</strong>
        <small>
          {[customerEmail || "No email on file", selectedCustomer?.taxId ? `Tax ID ${selectedCustomer.taxId}` : null]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </div>
      {selectedCustomer ? (
        <Badge tone={selectedCustomer.isLocal ? "success" : "info"}>
          {selectedCustomer.isLocal ? "Local" : "International"}
        </Badge>
      ) : null}
    </div>
  );

  const docTypePicker = (
    <div className="cq-doctype">
      <span>Document type</span>
      <ButtonGroup variant="segmented">
        {(
          [
            { value: "tax_invoice", label: "Tax invoice" },
            { value: "commercial_invoice", label: "Commercial invoice" },
          ] as Array<{ value: BillingDocumentType; label: string }>
        ).map((option) => (
          <Button
            key={option.value}
            pressed={billingDocumentType === option.value}
            size="slim"
            onClick={() => {
              billingTypeManualRef.current = true;
              setBillingDocumentType(option.value);
            }}
          >
            {option.label}
          </Button>
        ))}
      </ButtonGroup>
      <small>
        {billingDocumentType === "commercial_invoice"
          ? "For export buyers — set VAT to 0% if no tax applies."
          : "Standard local invoice with VAT."}
      </small>
    </div>
  );

  return (
    <AppPage
      backAction={{ content: "Invoices", url: "/dashboard/invoices" }}
      primaryAction={{
        content: "Post invoice",
        loading: saving,
        disabled: !ready,
        onAction: handlePost,
      }}
      secondaryActions={
        fromSalesOrder && quotationNumber
          ? [{ content: "Preview sales order PDF", onAction: () => setPdfModalOpen(true) }]
          : [{ content: "Discard", onAction: () => router.push("/dashboard/invoices") }]
      }
      subtitle={
        fromSalesOrder
          ? `From sales order ${quotationNumber ?? ""} — check the dates and post.`
          : "Bill a customer directly, without a sales order."
      }
      title={fromSalesOrder ? "Invoice sales order" : "New invoice"}
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}
        {exchangeRateError ? <Banner tone="warning">{exchangeRateError}</Banner> : null}

        <div className="cq">
          {/* ── Main column ── */}
          <div className="cq-main">
            {fromSalesOrder ? (
              <div className="ci-lock">
                <Icon source={LockIcon} tone="subdued" />
                <span>
                  Lines, prices and the customer come from sales order <strong>{quotationNumber ?? "…"}</strong>{" "}
                  and can&apos;t be changed here. To fix amounts, cancel the order first.
                </span>
              </div>
            ) : null}

            <Section
              aside={
                !fromSalesOrder && selectedCustomer ? (
                  <Button size="slim" variant="plain" onClick={() => handleSelectCustomerAccount(null)}>
                    Change
                  </Button>
                ) : null
              }
              done={hasCustomer}
              hint={hasCustomer ? undefined : "Who are you billing?"}
              id="ci-customer"
              step={1}
              title="Customer"
            >
              {hasCustomer ? (
                customerCard
              ) : (
                <BlockStack gap="300">
                  <CustomerPicker value={selectedCustomer} onChange={handleSelectCustomerAccount} />
                  {recentCustomers.length ? (
                    <div className="ci-recent">
                      <span className="ci-recent__label">Recent customers</span>
                      <div className="ci-recent__list">
                        {recentCustomers.map((cust) => (
                          <button
                            className="ci-recent__item"
                            key={cust.id}
                            type="button"
                            onClick={() => handleSelectCustomerAccount(cust)}
                          >
                            <span className="ci-recent__avatar">{initials(cust.name)}</span>
                            <span className="ci-recent__text">
                              <strong>{cust.name}</strong>
                              <small>{cust.isLocal ? "Local" : "International"}{cust.email ? ` · ${cust.email}` : ""}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </BlockStack>
              )}
              {docTypePicker}
            </Section>

            <Section
              aside={
                <Text as="span" tone="subdued" variant="bodySm">{`${lines.length} item${lines.length === 1 ? "" : "s"}`}</Text>
              }
              done={hasLines}
              hint={fromSalesOrder ? "Exactly as confirmed on the sales order." : "Search your stock and add products or services."}
              id="ci-items"
              step={2}
              title="Items"
            >
              <BlockStack gap="300">
                {!fromSalesOrder ? (
                  <>
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
                                      ? ` (${remainingForSelectedProduct} left after this invoice)`
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
                          stockLoading ? (
                            <Text as="p" tone="subdued" variant="bodySm">
                              Loading serial numbers…
                            </Text>
                          ) : inStockUnits.length === 0 ? (
                            <Banner tone="warning">No serial numbers in stock for this product.</Banner>
                          ) : (
                            <Select
                              label="Serial number"
                              options={inStockUnits.map((u) => ({
                                label: `${u.serialNumber}${u.notes ? ` — ${u.notes}` : ""}`,
                                value: u.id,
                              }))}
                              value={selectedUnitId}
                              onChange={setSelectedUnitId}
                            />
                          )
                        ) : null}

                        <InlineStack align="end" gap="200">
                          <Button onClick={() => setSelectedProduct(null)}>Cancel</Button>
                          <Button
                            disabled={addDisabled}
                            icon={PlusIcon}
                            variant="primary"
                            onClick={() => void handleAddSelectedProduct()}
                          >
                            Add to invoice
                          </Button>
                        </InlineStack>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {quantityWarning ? (
                  <Banner tone="warning" onDismiss={() => setQuantityWarning(null)}>
                    {quantityWarning}
                  </Banner>
                ) : null}

                {hasLines ? (
                  <div className={cn("ci-table", fromSalesOrder && "is-readonly")}>
                    <div className="ci-table__head" aria-hidden>
                      <span>Item</span>
                      <span>Qty</span>
                      <span>Unit price</span>
                      <span>Disc.</span>
                      <span>VAT</span>
                      <span className="is-num">Total</span>
                      <span />
                    </div>
                    {lines.map((line, index) => {
                      const lineNet = line.quantity * line.unitPrice * (1 - line.discountPercent / 100);
                      const lineTotal = lineNet * (1 + line.taxRatePercent / 100);
                      const maxQty =
                        line.productUnitId || !line.productId
                          ? 1
                          : line.isStorable === false || line.productType === "service" || line.availableQuantity == null
                            ? undefined
                            : getMaxAllowedQuantity(line.availableQuantity ?? 0, lines, line.productId, line.id) || undefined;
                      return (
                        <div className="ci-row" key={line.id}>
                          <div className="ci-row__item">
                            <span className="ci-row__index">{index + 1}</span>
                            <div className="ci-row__desc">
                              <LineItemDescription
                                details={line.productDescription}
                                productId={line.productId}
                                title={line.description}
                              />
                              <small>
                                {line.serialNumber ? (
                                  <span className="ci-row__serial">S/N {line.serialNumber}</span>
                                ) : null}
                                {line.discountPercent > 0 ? (
                                  <span className="ci-row__save">−{line.discountPercent}% off</span>
                                ) : null}
                                {!line.serialNumber && line.discountPercent <= 0
                                  ? `${fmt(line.unitPrice)} each`
                                  : null}
                              </small>
                            </div>
                          </div>

                          {fromSalesOrder ? (
                            <>
                              <span className="ci-row__ro" data-label="Qty">{formatQuantity(line.quantity)}</span>
                              <span className="ci-row__ro" data-label="Unit price">{fmt(line.unitPrice)}</span>
                              <span className="ci-row__ro" data-label="Disc.">{line.discountPercent}%</span>
                              <span className="ci-row__ro" data-label="VAT">{line.taxRatePercent}%</span>
                            </>
                          ) : (
                            <>
                              <div className="ci-row__cell" data-label="Qty">
                                <TextField
                                  autoComplete="off"
                                  disabled={Boolean(line.productUnitId)}
                                  label="Quantity"
                                  labelHidden
                                  max={maxQty}
                                  min={0}
                                  type="number"
                                  value={String(line.quantity)}
                                  onChange={(v) => updateLine(line.id, "quantity", v)}
                                />
                              </div>
                              <div className="ci-row__cell" data-label="Unit price">
                                <TextField
                                  autoComplete="off"
                                  label="Unit price"
                                  labelHidden
                                  min={0}
                                  prefix={currencyCode}
                                  type="number"
                                  value={String(Math.round(line.unitPrice * 100) / 100)}
                                  onChange={(v) => updateLine(line.id, "unitPrice", v)}
                                />
                              </div>
                              <div className="ci-row__cell" data-label="Disc.">
                                <TextField
                                  autoComplete="off"
                                  label="Discount"
                                  labelHidden
                                  max={100}
                                  min={0}
                                  suffix="%"
                                  type="number"
                                  value={String(line.discountPercent)}
                                  onChange={(v) => updateLine(line.id, "discountPercent", v)}
                                />
                              </div>
                              <div className="ci-row__cell" data-label="VAT">
                                <Select
                                  label="VAT"
                                  labelHidden
                                  options={(salesPricing.vatRates ?? [0, 5]).map((rate) => ({
                                    label: `${rate}%`,
                                    value: String(rate),
                                  }))}
                                  value={String(line.taxRatePercent)}
                                  onChange={(v) => updateLine(line.id, "taxRatePercent", v)}
                                />
                              </div>
                            </>
                          )}

                          <div className="ci-row__total" data-label="Total">
                            <strong>{fmt(lineTotal)}</strong>
                            {line.taxRatePercent > 0 ? <small>incl. {fmt(lineNet * (line.taxRatePercent / 100))} VAT</small> : null}
                          </div>

                          <div className="ci-row__remove">
                            {!fromSalesOrder ? (
                              <Button
                                accessibilityLabel={`Remove ${line.description}`}
                                icon={DeleteIcon}
                                size="slim"
                                tone="critical"
                                variant="tertiary"
                                onClick={() => removeLine(line.id)}
                              />
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    <div className="ci-table__foot">
                      <span>
                        {lines.length} item{lines.length === 1 ? "" : "s"}
                        {totalDiscount > 0 ? ` · ${fmt(totalDiscount)} discount` : ""}
                      </span>
                      <span>
                        Lines total <strong>{fmt(netSubtotal + totalTax)}</strong>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="cq-empty">
                    <Icon source={ProductIcon} tone="subdued" />
                    <span>{fromSalesOrder ? "Loading the order lines…" : "Nothing added yet — pick a product above."}</span>
                  </div>
                )}
              </BlockStack>
            </Section>

            <Section hint="Printed on the invoice the customer receives." id="ci-terms" step={3} title="Reference & notes">
              <BlockStack gap="400">
                <TextField
                  autoComplete="off"
                  helpText={fromSalesOrder ? "Taken from the sales order." : "The customer's purchase order number, if they gave one."}
                  label="Customer PO / reference"
                  placeholder="e.g. PO-2026-9810"
                  readOnly={fromSalesOrder}
                  value={poReference}
                  onChange={setPoReference}
                />
                {fromSalesOrder ? (
                  notes ? (
                    <div className="ci-notes-ro">{notes}</div>
                  ) : (
                    <Text as="p" tone="subdued" variant="bodySm">
                      No notes on the sales order.
                    </Text>
                  )
                ) : (
                  <DocumentNotesField
                    placeholder="Payment instructions, warranty, delivery terms…"
                    value={notes}
                    onChange={setNotes}
                  />
                )}
              </BlockStack>
            </Section>
          </div>

          {/* ── Summary column ── */}
          <aside className="cq-side">
            <div className="cq-summary">
              <div className="cq-summary__head">
                <div className="ci-head-top">
                  <span>Invoice total</span>
                  <em>{fromSalesOrder ? "From sales order" : "Draft"}</em>
                </div>
                <strong>{fmt(grandTotal)}</strong>
                <small>
                  {hasLines
                    ? `${lines.length} item${lines.length === 1 ? "" : "s"} · incl. ${fmt(totalTax)} VAT · ${currencyCode}`
                    : "Add items to see the total"}
                </small>
                <div className="ci-head-meta">
                  <span>
                    <small>Bill to</small>
                    {customerName || "—"}
                  </span>
                  <span>
                    <small>Due</small>
                    {dueDate ? formatAppDate(dueDate) : "—"}
                  </span>
                </div>
              </div>

              <div className="cq-summary__block">
                <span className="cq-label">When it&apos;s due</span>
                <div className="cq-row-fields is-top">
                  <TextField
                    autoComplete="off"
                    label="Invoice date"
                    type="date"
                    value={invoiceDate}
                    onChange={setInvoiceDateKeepingTerms}
                  />
                  <TextField
                    autoComplete="off"
                    label="Due date"
                    type="date"
                    value={dueDate}
                    onChange={setDueDate}
                  />
                </div>
                <div className="ci-terms">
                  {PAYMENT_TERMS.map((term) => (
                    <Button
                      key={term.days}
                      pressed={termDaysNow === term.days}
                      size="micro"
                      onClick={() => invoiceDate && setDueDate(addDays(invoiceDate, term.days))}
                    >
                      {term.label}
                    </Button>
                  ))}
                </div>
                <small className="cq-note">
                  {termDaysNow === null
                    ? "Pick a due date."
                    : termDaysNow < 0
                      ? "The due date is before the invoice date."
                      : termDaysNow === 0
                        ? `Due on receipt · ${formatAppDate(dueDate)}`
                        : `Net ${termDaysNow} days · due ${formatAppDate(dueDate)}`}
                </small>
              </div>

              {!fromSalesOrder ? (
                <div className="cq-summary__block">
                  <span className="cq-label">Pricing</span>
                  <Checkbox
                    checked={priceAdjustmentEnabled}
                    disabled={!selectedCustomer}
                    helpText={selectedCustomer ? pricingLabel ?? pricingHelpText : "Choose a customer first."}
                    label="Local / international price adjustment"
                    onChange={setPriceAdjustmentEnabled}
                  />
                </div>
              ) : null}

              <dl className="cq-totals">
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
                    <dt>Shipping{deliveryFeePercent ? ` (${deliveryFeePercent}%)` : ""}</dt>
                    <dd>+{fmt(deliveryFee)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{vatLabel}</dt>
                  <dd>+{fmt(totalTax)}</dd>
                </div>
                <div className="is-total">
                  <dt>Amount due</dt>
                  <dd>{fmt(grandTotal)}</dd>
                </div>
              </dl>

              <ul className="cq-checks">
                <li className={hasCustomer ? "is-ok" : undefined}>
                  <span>{hasCustomer ? <Icon source={CheckIcon} /> : <Icon source={PersonIcon} />}</span>
                  {hasCustomer ? `Billing ${customerName}` : "Choose a customer"}
                </li>
                <li className={hasLines ? "is-ok" : undefined}>
                  <span>{hasLines ? <Icon source={CheckIcon} /> : <Icon source={ProductIcon} />}</span>
                  {hasLines ? `${lines.length} item${lines.length === 1 ? "" : "s"} added` : "Add at least one item"}
                </li>
                <li className={termDaysNow !== null && termDaysNow >= 0 ? "is-ok" : undefined}>
                  <span>
                    {termDaysNow !== null && termDaysNow >= 0 ? <Icon source={CheckIcon} /> : <Icon source={CalendarIcon} />}
                  </span>
                  {termDaysNow !== null && termDaysNow >= 0 ? `Due ${formatAppDate(dueDate)}` : "Set a valid due date"}
                </li>
              </ul>

              <Button fullWidth disabled={!ready} loading={saving} size="large" variant="primary" onClick={handlePost}>
                Post invoice
              </Button>
              <small className="cq-note is-center">
                Posting locks the amounts and adds them to the customer&apos;s balance. You&apos;ll pick the bank account
                shown on the PDF if one isn&apos;t set.
              </small>
            </div>
          </aside>
        </div>
      </BlockStack>

      <InvoiceDocumentBankModal
        open={bankModalOpen}
        onClose={() => {
          setBankModalOpen(false);
          setPendingPostAfterBank(false);
        }}
        currencyCode={currencyCode}
        bankAccounts={bankAccounts}
        status={getInvoicePaymentBankStatus(bankAccounts, currencyCode, documentBankAccountId)}
        initialBankAccountId={documentBankAccountId}
        saving={saving}
        onConfirm={handleConfirmDocumentBank}
        onBankAccountCreated={(account) => setBankAccounts((prev) => [...prev, account])}
      />

      {quotationId && quotationNumber ? (
        <DocumentPreviewModal
          onClose={() => setPdfModalOpen(false)}
          open={pdfModalOpen}
          quotationId={quotationId}
          quotationNumber={quotationNumber}
          title="Sales order document preview"
        />
      ) : null}
    </AppPage>
  );
}
