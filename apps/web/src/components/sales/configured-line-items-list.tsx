"use client";

import {
  BlockStack,
  Button,
  InlineStack,
  Text,
} from "@shopify/polaris";
import {
  computeLineMarginPercent,
  computeLineProfit,
  computeLineTotal,
  formatMarginPercent,
} from "@/lib/line-item-utils";
import type { ConfiguredLineItem } from "@/types/configured-line-item";
import { formatQuantity } from "@/lib/format-quantity";

interface ConfiguredLineItemsListProps {
  lines: ConfiguredLineItem[];
  formatAmount: (amount: number) => string;
  onEdit: (lineId: string) => void;
  onRemove: (lineId: string) => void;
}

export function ConfiguredLineItemsList({
  lines,
  formatAmount,
  onEdit,
  onRemove,
}: ConfiguredLineItemsListProps) {
  if (lines.length === 0) {
    return (
      <div className="frogmen-line-card frogmen-line-card--empty">
        <Text as="p" tone="subdued">
          No line items yet. Search the catalog above and add products to this
          quotation.
        </Text>
      </div>
    );
  }

  return (
    <BlockStack gap="300">
      {lines.map((line) => {
        const lineTotal = computeLineTotal(line);
        const lineProfit = computeLineProfit(line);
        const lineMargin = computeLineMarginPercent(line);

        return (
          <div key={line.id} className="frogmen-line-card">
            <div className="frogmen-line-card__main">
              <BlockStack gap="200">
                <div className="frogmen-line-card__title">
                  <Text as="h3" variant="headingSm">
                    {line.name}
                  </Text>
                </div>
                <div className="frogmen-line-card__meta">
                  <div className="frogmen-line-card__meta-item">
                    <Text as="span" tone="subdued" variant="bodySm">
                      SKU
                    </Text>
                    <Text as="span" fontWeight="semibold">
                      {line.sku}
                    </Text>
                  </div>
                  {line.serialNumber ? (
                    <div className="frogmen-line-card__meta-item">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Serial number
                      </Text>
                      <Text as="span" fontWeight="semibold">
                        {line.serialNumber}
                      </Text>
                    </div>
                  ) : null}
                </div>
              </BlockStack>

              <div className="frogmen-line-card__metrics">
                <div className="frogmen-line-card__metric">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Qty
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {formatQuantity(line.quantity)}
                  </Text>
                </div>
                <div className="frogmen-line-card__metric">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Unit price
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {formatAmount(line.unitPrice)}
                  </Text>
                </div>
                <div className="frogmen-line-card__metric">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Line total
                  </Text>
                  <Text as="span" fontWeight="bold">
                    {formatAmount(lineTotal)}
                  </Text>
                </div>
                <div className="frogmen-line-card__metric">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Profit
                  </Text>
                  <InlineStack gap="150" blockAlign="center" wrap={false}>
                    <Text
                      as="span"
                      fontWeight="semibold"
                      tone={lineProfit >= 0 ? "success" : "critical"}
                    >
                      {formatAmount(lineProfit)}
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
                  </InlineStack>
                </div>
              </div>
            </div>

            <InlineStack gap="200" wrap={false}>
              <Button onClick={() => onEdit(line.id)}>Edit</Button>
              <Button tone="critical" onClick={() => onRemove(line.id)}>
                Remove
              </Button>
            </InlineStack>
          </div>
        );
      })}
    </BlockStack>
  );
}
