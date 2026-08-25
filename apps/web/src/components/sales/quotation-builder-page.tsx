"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineStack,
  Layout,
  Select,
  SkeletonBodyText,
  Text,
  TextField,
} from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  allocateFixedDiscount,
  groupSerializedLines,
  pricingAdjustmentHelpText,
  pricingAdjustmentLabel,
} from "@frog1/shared";
import { AppPage } from "@/components/layout/page";
import { useToast } from "@/components/providers/toast-provider";
import { AddProductLineModal } from "@/components/sales/add-product-line-modal";
import { formatMoney } from "@/components/sales/format-money";
import { inferValidityPreset } from "@/components/sales/validity-period";
import {
  QuotationHeaderForm,
  type QuotationHeaderValues,
} from "@/components/sales/quotation-header-form";
import { QuotationLinesTable } from "@/components/sales/quotation-lines-table";
import { QuotationStepIndicator } from "@/components/sales/quotation-step-indicator";
import { getCustomer } from "@/lib/customers-api";
import { listCurrencies } from "@/lib/currencies-api";
import type { Currency } from "@/lib/currencies-api";
import {
  addQuotationLine,
  deleteQuotationLine,
  getQuotation,
  getQuotationCurrencyDiagnostics,
  reconvertQuotation,
  updateQuotation,
  updateQuotationLine,
  type Quotation,
} from "@/lib/quotations-api";
import { useOrgCurrency } from "@/hooks/use-org-currency";
import { useSalesPricing } from "@/hooks/use-sales-pricing";

interface QuotationBuilderPageProps {
  quotationId: string;
}

function stateBadge(state: Quotation["state"]) {
  switch (state) {
    case "draft":
      return <Badge>Draft</Badge>;
    case "sent":
      return <Badge tone="info">Sent</Badge>;
    case "confirmed":
      return <Badge tone="success">Confirmed Order</Badge>;
    case "cancelled":
      return <Badge tone="critical">Cancelled</Badge>;
  }
}

export function QuotationBuilderPage({ quotationId }: QuotationBuilderPageProps) {
  const router = useRouter();
  const { showSuccess } = useToast();
  const { catalogCurrencyId, defaultPricingCurrencyId } = useOrgCurrency();
  const { settings: salesPricing } = useSalesPricing();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [header, setHeader] = useState<QuotationHeaderValues | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingHeader, setSavingHeader] = useState(false);
  const [headerDirty, setHeaderDirty] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [priceAdjustmentEnabled, setPriceAdjustmentEnabled] = useState(true);
  const [needsReconvert, setNeedsReconvert] = useState(false);
  const [reconvertFromId, setReconvertFromId] = useState("");
  const [reconverting, setReconverting] = useState(false);

  // Editable Financial Summary Controls: Discount (percent or amount), Delivery Fee, VAT
  const [discountMode, setDiscountMode] = useState<"percent" | "amount">(
    "percent",
  );
  const [discountValue, setDiscountValue] = useState<string>("0");
  const [deliveryFee, setDeliveryFee] = useState<string>("0");
  const [vatPercent, setVatPercent] = useState<string>("5");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const quotationResult = await getQuotation(quotationId);
      const [currencyRows, customer, diagnostics] = await Promise.all([
        listCurrencies(),
        getCustomer(quotationResult.customerId),
        getQuotationCurrencyDiagnostics().catch(() => []),
      ]);

      const flagged = diagnostics.some((item) => item.id === quotationResult.id);
      setNeedsReconvert(flagged);
      setReconvertFromId(
        catalogCurrencyId ??
          defaultPricingCurrencyId ??
          currencyRows.find((c) => c.code.trim() === "USD")?.id ??
          "",
      );

      setQuotation(quotationResult);
      setDeliveryFee(quotationResult.deliveryFeeAmount ?? "0");
      const firstLine = quotationResult.lines?.[0];
      if (firstLine) {
        const amount = Number(firstLine.discountAmount ?? 0);
        if (amount > 0) {
          const fixedAmounts = (quotationResult.lines ?? []).map((line) =>
            Number(line.discountAmount ?? 0),
          );
          const isLegacyRepeatedFixedDiscount = fixedAmounts.every(
            (lineAmount) => Math.abs(lineAmount - amount) < 0.005,
          );
          setDiscountMode("amount");
          setDiscountValue(
            String(isLegacyRepeatedFixedDiscount
              ? amount
              : fixedAmounts.reduce((sum, lineAmount) => sum + lineAmount, 0)),
          );
        } else {
          setDiscountMode("percent");
          setDiscountValue(firstLine.discountPercent ?? "0");
        }
      } else {
        setDiscountMode("percent");
        setDiscountValue("0");
      }
      setHeader({
        customer,
        currencyId: quotationResult.currencyId,
        quoteDate: quotationResult.quoteDate,
        validityPreset: inferValidityPreset(
          quotationResult.quoteDate,
          quotationResult.validityDate ?? "",
        ),
        validityDate: quotationResult.validityDate ?? "",
        customerReference: quotationResult.customerReference ?? "",
        internalReference: quotationResult.internalReference ?? "",
        paymentReference: quotationResult.paymentReference ?? "",
        notes: quotationResult.notes ?? "",
        internalNotes: quotationResult.internalNotes ?? "",
      });
      setCurrencies(currencyRows);
      setHeaderDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quotation");
    } finally {
      setLoading(false);
    }
  }, [quotationId, catalogCurrencyId, defaultPricingCurrencyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = useMemo(
    () => currencies.find((item) => item.id === quotation?.currencyId),
    [currencies, quotation?.currencyId],
  );

  const editable =
    quotation?.state === "draft" || quotation?.state === "sent";

  const customerIsLocal = header?.customer?.isLocal ?? false;

  const pricingLabel = useMemo(
    () => pricingAdjustmentLabel(customerIsLocal, priceAdjustmentEnabled, salesPricing),
    [customerIsLocal, priceAdjustmentEnabled, salesPricing],
  );

  const pricingHelpText = useMemo(
    () => pricingAdjustmentHelpText(salesPricing),
    [salesPricing],
  );

  const lineCount = quotation?.lines?.length ?? 0;
  const groupedLineCount = groupSerializedLines(quotation?.lines ?? []).length;

  // Dynamic Financial Calculations based on actual lines & user inputs
  const equipmentSubtotal = useMemo(() => {
    if (!quotation?.lines || quotation.lines.length === 0) {
      return parseFloat(quotation?.amountUntaxed || "0") || 0;
    }
    return quotation.lines.reduce((sum, line) => {
      const qty = parseFloat(line.quantity) || 0;
      const price = parseFloat(line.unitPrice) || 0;
      return sum + qty * price;
    }, 0);
  }, [quotation?.lines, quotation?.amountUntaxed]);

  const discountRateNum =
    discountMode === "percent" ? parseFloat(discountValue) || 0 : 0;
  const discountFixedNum =
    discountMode === "amount" ? Math.max(0, parseFloat(discountValue) || 0) : 0;
  const discountAmount =
    discountFixedNum > 0
      ? Math.min(equipmentSubtotal, discountFixedNum)
      : equipmentSubtotal * (discountRateNum / 100);
  const netSubtotal = Math.max(0, equipmentSubtotal - discountAmount);

  const deliveryFeeNum = Math.max(0, parseFloat(deliveryFee) || 0);
  const taxableBase = netSubtotal + deliveryFeeNum;

  const vatRateNum = parseFloat(vatPercent) || 0;
  const vatAmount = taxableBase * (vatRateNum / 100);
  const grandTotal = taxableBase + vatAmount;

  const currencyChanged =
    Boolean(quotation && header && header.currencyId !== quotation.currencyId);

  async function saveHeader() {
    if (!quotation || !header || !editable || !header.customer) return;

    setSavingHeader(true);
    setError(null);

    try {
      const updated = await updateQuotation(quotation.id, {
        customerId: header.customer.id,
        currencyId: header.currencyId,
        quoteDate: header.quoteDate,
        validityDate: header.validityDate || null,
        customerReference: header.customerReference || null,
        internalReference: header.internalReference || null,
        paymentReference: header.paymentReference || null,
        notes: header.notes || null,
        deliveryFeeAmount: deliveryFeeNum,
      });

      const parsedDiscount = Math.max(0, parseFloat(discountValue) || 0);
      const fixedAllocations = allocateFixedDiscount(
        (updated.lines ?? []).map(
          (line) => Number(line.quantity) * Number(line.unitPrice),
        ),
        parsedDiscount,
      );
      let withDiscount = updated;
      for (const [index, line] of (updated.lines ?? []).entries()) {
        withDiscount = await updateQuotationLine(quotation.id, line.id, {
          discountPercent: discountMode === "percent" ? parsedDiscount : 0,
          discountAmount:
            discountMode === "amount" ? fixedAllocations[index] : 0,
        });
      }

      setQuotation(withDiscount);
      setHeader((current) =>
        current
          ? {
              ...current,
              currencyId: updated.currencyId,
            }
          : current,
      );
      setHeaderDirty(false);
      if (currencyChanged) {
        showSuccess("Quotation saved and line amounts converted to the new currency.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save quotation");
      if (currencyChanged) {
        setHeader((current) =>
          current
            ? { ...current, currencyId: quotation.currencyId }
            : current,
        );
      }
    } finally {
      setSavingHeader(false);
    }
  }

  async function handleAddLine(
    input: Parameters<typeof addQuotationLine>[1],
  ) {
    if (!quotation) return;

    const updated = await addQuotationLine(quotation.id, input);
    setQuotation(updated);
  }

  async function handleUpdateLine(
    lineId: string,
    input: Parameters<typeof updateQuotationLine>[2],
  ) {
    if (!quotation) return;

    const updated = await updateQuotationLine(quotation.id, lineId, input);
    setQuotation(updated);
  }

  async function handleReconvert() {
    if (!quotation || !reconvertFromId) return;

    setReconverting(true);
    setError(null);

    try {
      const updated = await reconvertQuotation(quotation.id, reconvertFromId);
      setQuotation(updated);
      setNeedsReconvert(false);
      showSuccess("Line amounts reconverted using your saved exchange rate.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reconvert amounts");
    } finally {
      setReconverting(false);
    }
  }

  async function handleDeleteLine(lineId: string) {
    if (!quotation) return;

    const updated = await deleteQuotationLine(quotation.id, lineId);
    setQuotation(updated);
  }

  if (loading) {
    return (
      <AppPage
        backAction={{ content: "Quotations", url: "/dashboard/sales/quotations" }}
        title="Quotation"
      >
        <Card>
          <SkeletonBodyText lines={6} />
        </Card>
      </AppPage>
    );
  }

  if (!quotation || !header) {
    return (
      <AppPage
        backAction={{ content: "Quotations", url: "/dashboard/sales/quotations" }}
        title="Quotation"
      >
        <Banner tone="critical">{error ?? "Quotation not found"}</Banner>
      </AppPage>
    );
  }

  return (
    <AppPage
      backAction={{ content: "Quotations", url: "/dashboard/sales/quotations" }}
      primaryAction={
        editable
          ? {
              content: "+ Add Line Item",
              onAction: () => setProductModalOpen(true),
            }
          : undefined
      }
      secondaryActions={[
        ...(editable && headerDirty
          ? [
              {
                content: "Save Header",
                loading: savingHeader,
                onAction: () => void saveHeader(),
              },
            ]
          : []),
        {
          content: "View Profile",
          onAction: () =>
            router.push(`/dashboard/sales/quotations/${quotation.id}`),
        },
      ]}
      subtitle={header.customer?.name}
      title={quotation.number}
      titleMetadata={stateBadge(quotation.state)}
    >
      <BlockStack gap="500">
        <QuotationStepIndicator currentStep={2} />

        {error ? (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        ) : null}

        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <QuotationHeaderForm
                currencies={currencies}
                disabled={!editable}
                onChange={(next) => {
                  setHeader(next);
                  setHeaderDirty(true);
                }}
                values={header}
              />

              {editable && needsReconvert ? (
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      Fix currency amounts
                    </Text>
                    <Text as="p" tone="subdued">
                      This quotation may still contain amounts from another currency
                      (for example USD values shown as AED). Reconvert using your
                      saved exchange rate.
                    </Text>
                    <Select
                      label="Original line amount currency"
                      options={currencies.map((item) => ({
                        label: `${item.code.trim()}   ${item.name}`,
                        value: item.id,
                      }))}
                      value={reconvertFromId}
                      onChange={setReconvertFromId}
                    />
                    <InlineStack align="end">
                      <Button
                        loading={reconverting}
                        variant="primary"
                        onClick={() => void handleReconvert()}
                      >
                        Reconvert line amounts
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              ) : null}

              {editable && currencyChanged ? (
                <Banner tone="info">
                  <Text as="p">
                    Saving will convert all line amounts to the new currency using
                    your configured exchange rate. If no rate exists, the save will
                    fail and the currency will stay unchanged.
                  </Text>
                </Banner>
              ) : null}

              <div className="quotation-lines-section">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Line Items & Equipment Specs
                    </Text>
                    <Text as="p" tone="subdued">
                      {lineCount === 0
                        ? "Add diving gear, ROV spares, or service line items."
                        : groupedLineCount === lineCount
                          ? `${lineCount} line item${lineCount === 1 ? "" : "s"}`
                          : `${groupedLineCount} products · ${lineCount} serialized units`}
                    </Text>
                    <Checkbox
                      checked={priceAdjustmentEnabled}
                      disabled={!header?.customer}
                      helpText={pricingHelpText}
                      label="Apply local/non-local pricing adjustment"
                      onChange={setPriceAdjustmentEnabled}
                    />
                    {pricingLabel ? <Badge tone="info">{pricingLabel}</Badge> : null}
                  </BlockStack>
                  {editable ? (
                    <Button onClick={() => setProductModalOpen(true)} variant="primary">
                      + Add Product Line
                    </Button>
                  ) : (
                    <Badge tone="attention">Sent quotation · revise to edit products</Badge>
                  )}
                </InlineStack>

                <QuotationLinesTable
                  currencyCode={currency?.code ?? "USD"}
                  decimalPlaces={currency?.decimalPlaces ?? 2}
                  disabled={!editable}
                  lines={quotation.lines ?? []}
                  onDeleteLine={handleDeleteLine}
                  onUpdateLine={handleUpdateLine}
                />
              </div>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <div className="quotation-summary-panel">
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Financial Summary & Tax
                    </Text>
                    <Text as="p" tone="subdued">
                      {currency?.code ?? "USD"} · {quotation.number}
                    </Text>
                  </BlockStack>

                  {editable ? (
                    <BlockStack gap="300">
                      <Select
                        label="Commercial Discount"
                        options={[
                          { label: "Percent (%)", value: "percent" },
                          { label: "Fixed amount", value: "amount" },
                        ]}
                        value={discountMode}
                        onChange={(val) => {
                          setDiscountMode(val as "percent" | "amount");
                          setHeaderDirty(true);
                        }}
                        helpText="Percent applies to each line; a fixed amount is distributed once across the quotation"
                      />
                      <TextField
                        autoComplete="off"
                        label={
                          discountMode === "percent"
                            ? "Discount percent"
                            : "Discount amount"
                        }
                        type="number"
                        value={discountValue}
                        onChange={(val) => {
                          setDiscountValue(val);
                          setHeaderDirty(true);
                        }}
                        prefix={
                          discountMode === "percent"
                            ? "%"
                            : (currency?.code ?? "AED")
                        }
                        placeholder="0"
                      />
                      <TextField
                        autoComplete="off"
                        label="Global Delivery & Freight Fee"
                        type="number"
                        value={deliveryFee}
                        onChange={(val) => {
                          setDeliveryFee(val);
                          setHeaderDirty(true);
                        }}
                        prefix={currency?.code ?? "AED"}
                        placeholder="0.00"
                        helpText="Global shipping and transport fee for entire quote"
                      />
                      <Select
                        label="VAT / Sales Tax Rate"
                        options={[
                          { label: "5% Standard VAT (GCC)", value: "5" },
                          { label: "0% Zero-Rated / Exempt", value: "0" },
                          { label: "15% VAT", value: "15" },
                        ]}
                        value={vatPercent}
                        onChange={(val) => {
                          setVatPercent(val);
                          setHeaderDirty(true);
                        }}
                      />
                      {headerDirty ? (
                        <Button
                          fullWidth
                          loading={savingHeader}
                          onClick={() => void saveHeader()}
                          variant="secondary"
                        >
                          Save Financial Details & Delivery Fee
                        </Button>
                      ) : null}
                    </BlockStack>
                  ) : null}

                  <Divider />

                  <div className="quotation-summary-panel__rows">
                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Equipment Subtotal
                      </Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {formatMoney(
                          equipmentSubtotal,
                          currency?.code,
                          currency?.decimalPlaces,
                        )}
                      </Text>
                    </div>

                    {discountAmount > 0 ? (
                      <div className="quotation-summary-row">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Commercial Discount (
                          {discountMode === "percent"
                            ? `${discountValue}%`
                            : (currency?.code ?? "")}
                          )
                        </Text>
                        <Text as="span" variant="bodyMd" tone="success">
                          -{formatMoney(discountAmount, currency?.code)}
                        </Text>
                      </div>
                    ) : null}

                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Net Subtotal
                      </Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {formatMoney(netSubtotal, currency?.code)}
                      </Text>
                    </div>

                    {deliveryFeeNum > 0 ? (
                      <div className="quotation-summary-row">
                        <Text as="span" tone="subdued" variant="bodySm">
                          Delivery & Freight Fee
                        </Text>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          +{formatMoney(deliveryFeeNum, currency?.code)}
                        </Text>
                      </div>
                    ) : null}

                    <div className="quotation-summary-row">
                      <Text as="span" tone="subdued" variant="bodySm">
                        VAT / Sales Tax (+{vatPercent}%)
                      </Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        +{formatMoney(vatAmount, currency?.code)}
                      </Text>
                    </div>
                  </div>

                  <Divider />

                  <div className="quotation-summary-panel__total">
                    <InlineStack align="space-between">
                      <Text as="span" variant="headingMd">
                        Grand Total
                      </Text>
                      <Text as="span" variant="headingLg" fontWeight="bold">
                        {formatMoney(
                          grandTotal,
                          currency?.code,
                          currency?.decimalPlaces,
                        )}
                      </Text>
                    </InlineStack>
                  </div>

                  {editable ? (
                    <Button
                      fullWidth
                      loading={savingHeader}
                      onClick={async () => {
                        if (headerDirty) {
                          await saveHeader();
                        }
                        router.push(`/dashboard/sales/quotations/${quotation.id}`);
                      }}
                      variant="primary"
                    >
                      Preview & Confirm Quotation
                    </Button>
                  ) : null}
                </BlockStack>
              </Card>
            </div>
          </Layout.Section>
        </Layout>
      </BlockStack>

      <AddProductLineModal
        customerIsLocal={customerIsLocal}
        documentCurrencyId={quotation.currencyId}
        existingLines={(quotation.lines ?? []).map((line) => ({
          productId: line.productId ?? "",
          productUnitId: line.productUnitId,
          quantity: Number(line.quantity),
        }))}
        onAdd={handleAddLine}
        onClose={() => setProductModalOpen(false)}
        open={productModalOpen}
        priceAdjustmentEnabled={priceAdjustmentEnabled}
        salesPricing={salesPricing}
      />
    </AppPage>
  );
}
