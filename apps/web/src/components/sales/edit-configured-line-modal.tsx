"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BlockStack,
  Divider,
  FormLayout,
  InlineGrid,
  InlineStack,
  Modal,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useProductDocumentCurrency } from "@/hooks/use-product-document-currency";
import {
  clampQuantity,
  computeLineMarginPercent,
  computeLineNetRevenue,
  computeLineProfit,
  computeLineTotal,
  formatMarginPercent,
  getMaxAllowedQuantity,
  inferDiscountMode,
  type DiscountMode,
} from "@/lib/line-item-utils";
import type { ConfiguredLineItem } from "@/types/configured-line-item";
import { useSalesPricing } from "@/hooks/use-sales-pricing";

export type DeliveryFeeMode = "none" | "amount" | "percent";

interface DeliveryFeeConfig {
  mode: DeliveryFeeMode;
  value: string;
  pricePrefix?: string;
  onModeChange: (mode: DeliveryFeeMode) => void;
  onValueChange: (value: string) => void;
}

interface EditConfiguredLineModalProps {
  open: boolean;
  line: ConfiguredLineItem | null;
  allLines: ConfiguredLineItem[];
  documentCurrencyId: string;
  deliveryFee?: DeliveryFeeConfig;
  onClose: () => void;
  onSave: (line: ConfiguredLineItem) => void;
}

export function EditConfiguredLineModal({
  open,
  line,
  allLines,
  documentCurrencyId,
  deliveryFee,
  onClose,
  onSave,
}: EditConfiguredLineModalProps) {
  const { settings: salesPricing } = useSalesPricing();
  const { fmt, pricePrefix } = useProductDocumentCurrency(
    documentCurrencyId,
    [],
    null,
  );

  const [draft, setDraft] = useState<ConfiguredLineItem | null>(line);
  const [discountMode, setDiscountMode] = useState<DiscountMode>("percent");
  const [discountValue, setDiscountValue] = useState("0");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && line) {
      setDraft({ ...line });
      const mode = inferDiscountMode(line.discountAmount, line.discountPercent);
      setDiscountMode(mode);
      setDiscountValue(
        String(
          mode === "amount"
            ? line.discountAmount || 0
            : line.discountPercent || 0,
        ),
      );
      setError(null);
    }
  }, [open, line]);

  const previewLine = useMemo(() => {
    if (!draft) return null;
    const parsed = Math.max(0, Number(discountValue) || 0);
    return {
      ...draft,
      discountPercent: discountMode === "percent" ? parsed : 0,
      discountAmount: discountMode === "amount" ? parsed : 0,
    };
  }, [draft, discountMode, discountValue]);

  const lineTotal = previewLine ? computeLineTotal(previewLine) : 0;
  const lineProfit = previewLine ? computeLineProfit(previewLine) : 0;
  const lineMargin = previewLine ? computeLineMarginPercent(previewLine) : null;
  const netUnitRevenue = previewLine
    ? computeLineNetRevenue({
        ...previewLine,
        quantity: 1,
        unitPrice: previewLine.unitPrice,
      })
    : 0;
  const sellsBelowCost = Boolean(
    previewLine && previewLine.unitCost > netUnitRevenue,
  );
  const vatRates = useMemo(
    () =>
      [
        ...new Set([
          ...(salesPricing.vatRates ?? [0, 5]),
          Number(draft?.taxRatePercent ?? 0),
        ]),
      ].sort((left, right) => left - right),
    [draft?.taxRatePercent, salesPricing.vatRates],
  );
  const hasCatalogDifference =
    previewLine &&
    Math.abs(previewLine.baseUnitPrice - previewLine.unitPrice) >= 0.005;

  const maxQuantity = useMemo(() => {
    if (!previewLine) return undefined;
    if (previewLine.productUnitId) return 1;
    return (
      getMaxAllowedQuantity(
        previewLine.availableQuantity ?? 0,
        allLines,
        previewLine.productId,
        previewLine.id,
      ) || undefined
    );
  }, [previewLine, allLines]);

  function updateField<K extends keyof ConfiguredLineItem>(
    field: K,
    value: ConfiguredLineItem[K],
  ) {
    if (!draft) return;
    setDraft({ ...draft, [field]: value });
  }

  function handleSave() {
    if (!draft) return;

    const unitPrice = Number(draft.unitPrice);
    const quantity = Number(draft.quantity);

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError("Enter a valid unit price.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Quantity must be at least 1.");
      return;
    }

    const parsedDiscount = Math.max(0, Number(discountValue) || 0);
    const next: ConfiguredLineItem = {
      ...draft,
      unitPrice,
      quantity,
      discountPercent: discountMode === "percent" ? parsedDiscount : 0,
      discountAmount: discountMode === "amount" ? parsedDiscount : 0,
      taxRatePercent: Number(draft.taxRatePercent) || 0,
    };

    const clamped = clampQuantity(next.quantity, allLines, next);
    if (clamped !== next.quantity) {
      setError(`Only ${clamped} unit(s) available for this product.`);
      next.quantity = clamped;
    }

    onSave(next);
    onClose();
  }

  if (!line || !draft) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit line item"
      primaryAction={{
        content: "Save line",
        onAction: handleSave,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="500">
          <BlockStack gap="200">
            <Text as="h3" variant="headingMd">
              {draft.name}
            </Text>
            <InlineStack gap="200" wrap>
              <div className="frogmen-line-card__meta-item">
                <Text as="span" tone="subdued" variant="bodySm">
                  SKU
                </Text>
                <Text as="span" fontWeight="semibold">
                  {draft.sku}
                </Text>
              </div>
              {draft.serialNumber ? (
                <div className="frogmen-line-card__meta-item">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Serial number
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {draft.serialNumber}
                  </Text>
                </div>
              ) : null}
            </InlineStack>
          </BlockStack>

          {error ? (
            <Text as="p" tone="critical">
              {error}
            </Text>
          ) : null}

          {sellsBelowCost ? (
            <div className="frogmen-line-cost-warning">
              <Text as="p" fontWeight="semibold" tone="critical">
                This line is priced below cost.
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Product cost is higher than the selling price.
              </Text>
            </div>
          ) : null}

          <FormLayout>
            <TextField
              autoComplete="off"
              disabled={Boolean(draft.productUnitId)}
              helpText={
                maxQuantity !== undefined
                  ? `Maximum available: ${maxQuantity}`
                  : undefined
              }
              label="Quantity"
              min={1}
              max={maxQuantity}
              type="number"
              value={String(draft.quantity)}
              onChange={(value) => updateField("quantity", Number(value) || 0)}
            />
            <TextField
              autoComplete="off"
              helpText={
                hasCatalogDifference
                  ? `Catalog price: ${fmt(draft.baseUnitPrice)}`
                  : undefined
              }
              label="Selling price before VAT"
              prefix={pricePrefix}
              type="number"
              value={String(draft.unitPrice)}
              onChange={(value) => updateField("unitPrice", Number(value) || 0)}
            />
            <TextField
              autoComplete="off"
              disabled
              helpText="Converted from the saved product cost."
              label="Converted product cost"
              prefix={pricePrefix}
              type="number"
              value={String(draft.unitCost)}
              onChange={() => undefined}
            />
            <InlineGrid columns={2} gap="400">
              <Select
                label="Discount type"
                options={[
                  { label: "Percent (%)", value: "percent" },
                  { label: "Fixed amount", value: "amount" },
                ]}
                value={discountMode}
                onChange={(value) => setDiscountMode(value as DiscountMode)}
              />
              <TextField
                autoComplete="off"
                label={
                  discountMode === "percent"
                    ? "Discount (%)"
                    : "Discount amount"
                }
                prefix={discountMode === "amount" ? pricePrefix : undefined}
                suffix={discountMode === "percent" ? "%" : undefined}
                type="number"
                value={discountValue}
                onChange={setDiscountValue}
              />
            </InlineGrid>
            <InlineGrid columns={deliveryFee ? 2 : 1} gap="400">
              <Select
                label="VAT (%)"
                options={vatRates.map((rate) => ({
                  label: rate === 0 ? "0% Zero rated / exempt" : `${rate}%`,
                  value: String(rate),
                }))}
                value={String(draft.taxRatePercent)}
                onChange={(value) =>
                  updateField("taxRatePercent", Number(value) || 0)
                }
              />
              {deliveryFee ? (
                <Select
                  label="Shipping"
                  options={[
                    { label: "None", value: "none" },
                    { label: "Fixed amount", value: "amount" },
                    { label: "Percent of net", value: "percent" },
                  ]}
                  value={deliveryFee.mode}
                  onChange={(value) =>
                    deliveryFee.onModeChange(value as DeliveryFeeMode)
                  }
                />
              ) : null}
            </InlineGrid>
            {deliveryFee && deliveryFee.mode !== "none" ? (
              <TextField
                autoComplete="off"
                helpText="Applies to the whole quotation, not this line only."
                label={
                  deliveryFee.mode === "amount"
                    ? "Shipping fee amount"
                    : "Shipping fee percent"
                }
                prefix={
                  deliveryFee.mode === "amount"
                    ? deliveryFee.pricePrefix
                    : undefined
                }
                suffix={deliveryFee.mode === "percent" ? "%" : undefined}
                type="number"
                value={deliveryFee.value}
                onChange={deliveryFee.onValueChange}
              />
            ) : null}
          </FormLayout>

          <Divider />

          <div className="frogmen-line-modal-summary">
            <InlineGrid columns={2} gap="400">
              <BlockStack gap="100">
                <Text as="span" tone="subdued" variant="bodySm">
                  Customer total including VAT
                </Text>
                <Text as="p" variant="headingMd">
                  {fmt(lineTotal)}
                </Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="span" tone="subdued" variant="bodySm">
                  Product cost
                </Text>
                <Text as="p" variant="headingMd">
                  {fmt(draft.unitCost * draft.quantity)}
                </Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="span" tone="subdued" variant="bodySm">
                  Gross profit before VAT
                </Text>
                <Text
                  as="p"
                  tone={lineProfit >= 0 ? "success" : "critical"}
                  variant="headingMd"
                >
                  {fmt(lineProfit)}
                </Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="span" tone="subdued" variant="bodySm">
                  Margin
                </Text>
                <span
                  className={
                    lineProfit >= 0
                      ? "frogmen-margin-badge"
                      : "frogmen-margin-badge frogmen-margin-badge--loss"
                  }
                >
                  {formatMarginPercent(lineMargin)}
                </span>
              </BlockStack>
            </InlineGrid>
          </div>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
