"use client";

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  FormLayout,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { Layers, Plus, Trash2, Truck } from "lucide-react";
import { PurchaseOrderSectionCard } from "@/components/purchasing/purchase-order-section-card";
import { currencyInputPrefix, type CurrencyLike } from "@/lib/currency-utils";
import {
  createEmptyNamedCharge,
  type FreightMode,
  type PurchaseOrderChargeValues,
  type PurchaseOrderLineOption,
} from "@/lib/purchase-order-utils";

interface PurchaseOrderChargesFormBaseProps {
  values: PurchaseOrderChargeValues;
  currency?: CurrencyLike | null;
  disabled?: boolean;
  onChange: (values: PurchaseOrderChargeValues) => void;
}

interface PurchaseOrderAdditionalChargesFormProps
  extends PurchaseOrderChargesFormBaseProps {
  lineOptions: PurchaseOrderLineOption[];
}

const freightModeOptions = [
  { label: "None", value: "none" },
  { label: "Flat amount", value: "amount" },
  { label: "Percent of lines", value: "percent" },
];

const chargeScopeOptions = [
  { label: "Whole order", value: "order" },
  { label: "Specific product line", value: "line" },
];

/** Tab 0 — freight and target margin only (no product lines needed). */
export function PurchaseOrderFreightForm({
  values,
  currency,
  disabled,
  onChange,
}: PurchaseOrderChargesFormBaseProps) {
  const pricePrefix = currencyInputPrefix(currency);

  function patch(partial: Partial<PurchaseOrderChargeValues>) {
    onChange({ ...values, ...partial });
  }

  return (
    <PurchaseOrderSectionCard
      description="Freight splits across all product lines by value. Set target margin here — add named fees on the Products tab after you add lines."
      icon={Truck}
      title="Freight & target margin"
      tone="charges"
    >
      <FormLayout>
        <FormLayout.Group>
          <Select
            disabled={disabled}
            label="Freight"
            options={freightModeOptions}
            value={values.freightMode}
            onChange={(freightMode) =>
              patch({ freightMode: freightMode as FreightMode })
            }
          />
          {values.freightMode !== "none" ? (
            <TextField
              autoComplete="off"
              disabled={disabled}
              label={
                values.freightMode === "amount"
                  ? "Freight amount"
                  : "Freight percent"
              }
              prefix={values.freightMode === "amount" ? pricePrefix : undefined}
              suffix={values.freightMode === "percent" ? "%" : undefined}
              type="number"
              value={values.freightValue}
              onChange={(freightValue) => patch({ freightValue })}
            />
          ) : (
            <div />
          )}
        </FormLayout.Group>
        <TextField
          autoComplete="off"
          disabled={disabled}
          helpText="Used on the margin preview and pre-filled at goods receipt."
          label="Target margin"
          suffix="%"
          type="number"
          value={values.targetMarginPercent}
          onChange={(targetMarginPercent) => patch({ targetMarginPercent })}
        />
      </FormLayout>
    </PurchaseOrderSectionCard>
  );
}

/** Tab 1 — named charges, after product lines exist. */
export function PurchaseOrderAdditionalChargesForm({
  values,
  currency,
  lineOptions,
  disabled,
  onChange,
}: PurchaseOrderAdditionalChargesFormProps) {
  const pricePrefix = currencyInputPrefix(currency);
  const hasLines = lineOptions.length > 0;

  function patch(partial: Partial<PurchaseOrderChargeValues>) {
    onChange({ ...values, ...partial });
  }

  function updateCharge(
    chargeId: string,
    partial: Partial<PurchaseOrderChargeValues["additionalCharges"][number]>,
  ) {
    patch({
      additionalCharges: values.additionalCharges.map((charge) =>
        charge.id === chargeId ? { ...charge, ...partial } : charge,
      ),
    });
  }

  function removeCharge(chargeId: string) {
    patch({
      additionalCharges: values.additionalCharges.filter(
        (charge) => charge.id !== chargeId,
      ),
    });
  }

  function lineLabelForCharge(purchaseOrderLineId: string | null) {
    if (!purchaseOrderLineId) return null;
    return lineOptions.find((line) => line.id === purchaseOrderLineId)?.label;
  }

  function addCharge() {
    patch({
      additionalCharges: [
        ...values.additionalCharges,
        createEmptyNamedCharge(),
      ],
    });
  }

  return (
    <PurchaseOrderSectionCard
      description="Internal only — not printed on the PO sent to your vendor. Use these to build true landed cost and margin; the vendor PDF shows product lines and freight only."
      icon={Layers}
      title="Internal landed cost charges"
      tone="charges"
    >
      <BlockStack gap="400">
        {!hasLines ? (
          <Banner tone="info">
            Add product lines above first if you need a charge on a specific
            SKU. Whole-order charges (shared freight-style fees) can be added
            now.
          </Banner>
        ) : null}

        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text as="p" tone="subdued" variant="bodySm">
            Each charge updates your landed cost calculations only.
          </Text>
          <Button
            disabled={disabled}
            icon={<Plus aria-hidden size={16} />}
            onClick={addCharge}
          >
            Add charge
          </Button>
        </InlineStack>

        {values.additionalCharges.length === 0 ? (
          <div className="po-empty-charges">
            <Text as="p" tone="subdued" variant="bodySm">
              No additional charges yet. Examples: customs, inspection,
              insurance, local handling.
            </Text>
          </div>
        ) : null}

        {values.additionalCharges.map((charge, index) => {
          const lineLabel = lineLabelForCharge(charge.purchaseOrderLineId);
          const scopeOptions = hasLines
            ? chargeScopeOptions
            : [{ label: "Whole order", value: "order" }];

          return (
            <div key={charge.id} className="po-charge-row">
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="start" wrap>
                  <InlineStack gap="200" blockAlign="center" wrap>
                    <Text as="span" fontWeight="semibold">
                      Charge {index + 1}
                    </Text>
                    <span
                      className={
                        charge.scope === "line"
                          ? "po-charge-row__badge po-charge-row__badge--line"
                          : "po-charge-row__badge po-charge-row__badge--order"
                      }
                    >
                      {charge.scope === "line" ? "Line only" : "Whole order"}
                    </span>
                    {lineLabel ? <Badge tone="info">{lineLabel}</Badge> : null}
                  </InlineStack>
                  <Button
                    disabled={disabled}
                    icon={<Trash2 aria-hidden size={16} />}
                    tone="critical"
                    variant="plain"
                    onClick={() => removeCharge(charge.id)}
                  >
                    Remove
                  </Button>
                </InlineStack>

                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      autoComplete="off"
                      disabled={disabled}
                      label="Name"
                      placeholder="Customs, inspection, handling…"
                      value={charge.name}
                      onChange={(name) => updateCharge(charge.id, { name })}
                    />
                    <TextField
                      autoComplete="off"
                      disabled={disabled}
                      label="Amount"
                      prefix={pricePrefix}
                      type="number"
                      value={charge.amount}
                      onChange={(amount) =>
                        updateCharge(charge.id, { amount })
                      }
                    />
                  </FormLayout.Group>
                  <Select
                    disabled={disabled || !hasLines}
                    helpText={
                      !hasLines
                        ? "Add product lines above to enable per-line charges"
                        : undefined
                    }
                    label="Applies to"
                    options={scopeOptions}
                    value={hasLines ? charge.scope : "order"}
                    onChange={(scope) =>
                      updateCharge(charge.id, {
                        scope: scope as "order" | "line",
                        purchaseOrderLineId:
                          scope === "line"
                            ? charge.purchaseOrderLineId ??
                              lineOptions[0]?.id ??
                              null
                            : null,
                      })
                    }
                  />
                  {charge.scope === "line" && hasLines ? (
                    <Select
                      disabled={disabled}
                      helpText="This fee is added only to that product's landed cost"
                      label="Product line"
                      options={lineOptions.map((line) => ({
                        label: line.label,
                        value: line.id,
                      }))}
                      value={charge.purchaseOrderLineId ?? lineOptions[0]?.id ?? ""}
                      onChange={(purchaseOrderLineId) =>
                        updateCharge(charge.id, {
                          purchaseOrderLineId: purchaseOrderLineId || null,
                        })
                      }
                    />
                  ) : null}
                </FormLayout>
              </BlockStack>
            </div>
          );
        })}
      </BlockStack>
    </PurchaseOrderSectionCard>
  );
}

/** @deprecated Use PurchaseOrderFreightForm + PurchaseOrderAdditionalChargesForm */
export function PurchaseOrderChargesForm({
  values,
  currency,
  lineOptions = [],
  disabled,
  onChange,
}: PurchaseOrderChargesFormBaseProps & {
  lineOptions?: PurchaseOrderLineOption[];
}) {
  return (
    <BlockStack gap="400">
      <PurchaseOrderFreightForm
        currency={currency}
        disabled={disabled}
        onChange={onChange}
        values={values}
      />
      <PurchaseOrderAdditionalChargesForm
        currency={currency}
        disabled={disabled}
        lineOptions={lineOptions}
        onChange={onChange}
        values={values}
      />
    </BlockStack>
  );
}
