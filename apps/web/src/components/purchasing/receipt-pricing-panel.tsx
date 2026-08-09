"use client";

import {
  BlockStack,
  Card,
  InlineStack,
  Text,
  TextField,
} from "@shopify/polaris";
import { useMemo } from "react";
import { formatMoney } from "@/components/sales/format-money";
import { formatMarginPercent } from "@/lib/line-item-utils";
import type { GoodsReceiptLine } from "@/lib/purchase-orders-api";

export interface ReceiptProductPricingRow {
  productId: string;
  productName: string;
  productSku?: string | null;
  landedUnitCost: string;
  currentSellingPrice?: string | null;
  suggestedSellingPrice?: string | null;
}

interface ReceiptPricingPanelProps {
  lines: GoodsReceiptLine[];
  currencyCode: string;
  sellingPrices: Record<string, string>;
  onSellingPriceChange: (productId: string, value: string) => void;
}

export function buildReceiptPricingRows(
  lines: GoodsReceiptLine[],
): ReceiptProductPricingRow[] {
  const byProduct = new Map<string, ReceiptProductPricingRow>();

  for (const line of lines) {
    if (line.usageType === "operations") continue;

    const existing = byProduct.get(line.productId);
    if (existing) continue;

    byProduct.set(line.productId, {
      productId: line.productId,
      productName: line.productName ?? "Product",
      productSku: line.productSku,
      landedUnitCost: line.landedUnitCost ?? line.poLineUnitPrice ?? "0",
      currentSellingPrice: line.currentSellingPrice,
      suggestedSellingPrice: line.suggestedSellingPrice,
    });
  }

  return Array.from(byProduct.values());
}

export function buildProductPricingPayload(
  rows: ReceiptProductPricingRow[],
  sellingPrices: Record<string, string>,
) {
  return rows
    .map((row) => ({
      productId: row.productId,
      sellingPrice: sellingPrices[row.productId]?.trim() || null,
    }))
    .filter((row) => row.sellingPrice);
}

export function ReceiptPricingPanel({
  lines,
  currencyCode,
  sellingPrices,
  onSellingPriceChange,
}: ReceiptPricingPanelProps) {
  const rows = useMemo(() => buildReceiptPricingRows(lines), [lines]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">
            Set selling prices before validate
          </Text>
          <Text as="p" tone="subdued" variant="bodySm">
            Landed cost updates on validate. Set or adjust catalog list price
            here so margin reflects freight and other charges — not just PO
            unit price.
          </Text>
        </BlockStack>

        {rows.map((row) => {
          const sellingPrice = sellingPrices[row.productId] ?? "";
          const sell = Number(sellingPrice);
          const cost = Number(row.landedUnitCost);
          const margin =
            Number.isFinite(sell) && sell > 0 && Number.isFinite(cost)
              ? ((sell - cost) / sell) * 100
              : null;
          const profit =
            Number.isFinite(sell) && Number.isFinite(cost)
              ? sell - cost
              : null;

          return (
            <div
              key={row.productId}
              className="rounded-xl border bg-muted/20 p-4"
            >
              <BlockStack gap="300">
                <BlockStack gap="050">
                  <Text as="p" fontWeight="semibold">
                    {row.productName}
                  </Text>
                  {row.productSku ? (
                    <Text as="p" tone="subdued" variant="bodySm">
                      {row.productSku}
                    </Text>
                  ) : null}
                </BlockStack>

                <InlineStack gap="400" wrap>
                  <BlockStack gap="050">
                    <Text as="span" tone="subdued" variant="bodySm">
                      Landed unit cost
                    </Text>
                    <Text as="span" fontWeight="semibold">
                      {formatMoney(row.landedUnitCost, currencyCode)}
                    </Text>
                  </BlockStack>
                  {row.currentSellingPrice ? (
                    <BlockStack gap="050">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Current list price
                      </Text>
                      <Text as="span">
                        {formatMoney(row.currentSellingPrice, currencyCode)}
                      </Text>
                    </BlockStack>
                  ) : null}
                  {row.suggestedSellingPrice ? (
                    <BlockStack gap="050">
                      <Text as="span" tone="subdued" variant="bodySm">
                        Suggested from PO margin
                      </Text>
                      <Text as="span" fontWeight="semibold">
                        {formatMoney(row.suggestedSellingPrice, currencyCode)}
                      </Text>
                    </BlockStack>
                  ) : null}
                </InlineStack>

                <TextField
                  autoComplete="off"
                  label="Selling price (catalog list price)"
                  prefix={currencyCode}
                  type="number"
                  value={sellingPrice}
                  onChange={(value) =>
                    onSellingPriceChange(row.productId, value)
                  }
                  helpText={
                    margin != null && profit != null
                      ? `Est. margin ${formatMarginPercent(margin)} · profit ${formatMoney(String(profit), currencyCode)} per unit`
                      : "Enter the price you plan to sell at"
                  }
                />
              </BlockStack>
            </div>
          );
        })}
      </BlockStack>
    </Card>
  );
}
