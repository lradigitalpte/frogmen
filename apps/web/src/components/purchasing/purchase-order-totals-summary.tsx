"use client";

import { BlockStack, Text } from "@shopify/polaris";
import { formatMoney } from "@/components/sales/format-money";

export interface PurchaseOrderChargeBreakdownItem {
  name: string;
  amount: number;
  scopeLabel?: string;
}

interface PurchaseOrderTotalsSummaryProps {
  currencyCode?: string;
  lineNet: number;
  freight: number;
  other: number;
  amountTax: number;
  amountTotal: number;
  title?: string;
  chargeBreakdown?: PurchaseOrderChargeBreakdownItem[];
}

export function PurchaseOrderTotalsSummary({
  currencyCode,
  lineNet,
  freight,
  other,
  amountTax,
  amountTotal,
  title = "Total PO cost",
  chargeBreakdown = [],
}: PurchaseOrderTotalsSummaryProps) {
  const fmt = (value: number) => formatMoney(String(value), currencyCode);
  const showChargeLines = chargeBreakdown.length > 0;

  return (
    <div className="po-sidebar-total">
      <div className="po-sidebar-total__hero">
        <BlockStack gap="100">
          <Text as="span" variant="bodySm">
            {title}
          </Text>
          <Text as="p" fontWeight="bold" variant="heading2xl">
            {fmt(amountTotal)}
          </Text>
          <Text as="span" variant="bodySm">
            {currencyCode ?? "USD"} · includes freight & charges
          </Text>
        </BlockStack>
      </div>

      <div className="po-sidebar-total__body">
        <div className="quotation-summary-panel__rows">
          <div className="quotation-summary-row">
            <Text as="span" tone="subdued" variant="bodySm">
              Line subtotal
            </Text>
            <Text as="span">{fmt(lineNet)}</Text>
          </div>
          {freight > 0 ? (
            <div className="quotation-summary-row">
              <Text as="span" tone="subdued" variant="bodySm">
                Freight
              </Text>
              <Text as="span">+{fmt(freight)}</Text>
            </div>
          ) : null}
          {showChargeLines
            ? chargeBreakdown.map((charge) => (
                <div
                  key={`${charge.name}-${charge.scopeLabel ?? "order"}`}
                  className="quotation-summary-row"
                >
                  <Text as="span" tone="subdued" variant="bodySm">
                    {charge.name}
                    {charge.scopeLabel ? ` (${charge.scopeLabel})` : ""}
                  </Text>
                  <Text as="span">+{fmt(charge.amount)}</Text>
                </div>
              ))
            : other > 0 ? (
                <div className="quotation-summary-row">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Additional charges
                  </Text>
                  <Text as="span">+{fmt(other)}</Text>
                </div>
              ) : null}
          {amountTax > 0 ? (
            <div className="quotation-summary-row">
              <Text as="span" tone="subdued" variant="bodySm">
                Tax
              </Text>
              <Text as="span">+{fmt(amountTax)}</Text>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
