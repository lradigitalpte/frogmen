"use client";

import {
  BlockStack,
  Card,
  InlineStack,
  Link,
  Text,
} from "@shopify/polaris";
import { Calculator } from "lucide-react";
import { formatMoney } from "@/components/sales/format-money";
import { formatMarginPercent } from "@/lib/line-item-utils";
import type { ProductUnitCostBreakdown } from "@/types/product";

interface ProductUnitCostBreakdownCardProps {
  breakdown: ProductUnitCostBreakdown;
}

export function ProductUnitCostBreakdownCard({
  breakdown,
}: ProductUnitCostBreakdownCardProps) {
  const currency = breakdown.currencyCode;
  const fmt = (value: string | null | undefined) =>
    value ? formatMoney(value, currency) : "—";

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack gap="200" blockAlign="center">
          <Calculator aria-hidden className="text-sky-700" size={20} />
          <BlockStack gap="050">
            <Text as="h2" variant="headingMd">
              Cost breakdown
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              How this serial&apos;s unit cost was built — purchasing and sale.
            </Text>
          </BlockStack>
        </InlineStack>

        <div className="quotation-summary-panel__rows">
          <div className="quotation-summary-row">
            <Text as="span" tone="subdued" variant="bodySm">
              Current catalog cost
            </Text>
            <Text as="span" fontWeight="semibold">
              {fmt(breakdown.currentUnitCost)}
            </Text>
          </div>
        </div>

        {breakdown.purchase ? (
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Purchasing (landed cost)
            </Text>
            <div className="quotation-summary-panel__rows">
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Vendor
                </Text>
                <Text as="span">{breakdown.purchase.vendorName}</Text>
              </div>
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Purchase order
                </Text>
                <Link
                  url={`/dashboard/purchasing/orders/${breakdown.purchase.purchaseOrderId}`}
                >
                  {breakdown.purchase.purchaseOrderNumber}
                </Link>
              </div>
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Goods receipt
                </Text>
                <Link
                  url={`/dashboard/purchasing/receipts/${breakdown.purchase.goodsReceiptId}`}
                >
                  {breakdown.purchase.goodsReceiptNumber}
                </Link>
              </div>
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  PO line unit price
                </Text>
                <Text as="span">{fmt(breakdown.purchase.lineUnitPrice)}</Text>
              </div>
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Freight (allocated)
                </Text>
                <Text as="span">
                  +{fmt(breakdown.purchase.freightAllocated)}
                </Text>
              </div>
              <Text as="p" tone="subdued" variant="bodySm">
                Shipping or delivery charged on the purchase order, split across
                units received on this line.
              </Text>
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Other charges (allocated)
                </Text>
                <Text as="span">
                  +{fmt(breakdown.purchase.otherChargesAllocated)}
                </Text>
              </div>
              <Text as="p" tone="subdued" variant="bodySm">
                Import, handling, or misc. PO charges, split per unit the same
                way as freight.
              </Text>
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Landed unit cost
                </Text>
                <Text as="span" fontWeight="semibold">
                  {fmt(breakdown.purchase.landedUnitCost)}
                </Text>
              </div>
              <Text as="p" tone="subdued" variant="bodySm">
                {fmt(breakdown.purchase.lineUnitPrice)} +{" "}
                {fmt(breakdown.purchase.freightAllocated)} +{" "}
                {fmt(breakdown.purchase.otherChargesAllocated)} ={" "}
                {fmt(breakdown.purchase.landedUnitCost)}
              </Text>
            </div>
          </BlockStack>
        ) : null}

        {breakdown.sale ? (
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Sale
            </Text>
            <div className="quotation-summary-panel__rows">
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Invoice
                </Text>
                <Link url={`/dashboard/invoices/${breakdown.sale.invoiceId}`}>
                  {breakdown.sale.invoiceNumber}
                </Link>
              </div>
              {breakdown.sale.quotationNumber ? (
                <div className="quotation-summary-row">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Quotation / SO
                  </Text>
                  <Text as="span">{breakdown.sale.quotationNumber}</Text>
                </div>
              ) : null}
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Net unit revenue
                </Text>
                <Text as="span">{fmt(breakdown.sale.netUnitRevenue)}</Text>
              </div>
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Unit cost for margin
                </Text>
                <Text as="span">
                  {fmt(breakdown.sale.unitCost)}
                  {breakdown.sale.unitCostSource === "landed"
                    ? " (landed at receipt)"
                    : breakdown.sale.unitCostSource === "invoice"
                      ? " (invoice COGS)"
                      : breakdown.sale.unitCostSource === "catalog"
                        ? " (catalog est.)"
                        : ""}
                </Text>
              </div>
              {breakdown.sale.invoiceUnitCost &&
              breakdown.sale.unitCostSource === "landed" &&
              breakdown.sale.invoiceUnitCost !== breakdown.sale.unitCost ? (
                <div className="quotation-summary-row">
                  <Text as="span" tone="subdued" variant="bodySm">
                    Invoice COGS (booked)
                  </Text>
                  <Text as="span">{fmt(breakdown.sale.invoiceUnitCost)}</Text>
                </div>
              ) : null}
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Gross profit
                </Text>
                <Text
                  as="span"
                  fontWeight="semibold"
                  tone={
                    breakdown.sale.grossProfit &&
                    Number(breakdown.sale.grossProfit) >= 0
                      ? "success"
                      : "critical"
                  }
                >
                  {fmt(breakdown.sale.grossProfit)}
                </Text>
              </div>
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Profit margin
                </Text>
                <Text as="span" fontWeight="semibold">
                  {formatMarginPercent(breakdown.sale.profitMarginPercent)}
                </Text>
              </div>
            </div>
          </BlockStack>
        ) : null}

        {!breakdown.sale && breakdown.estimatedMargin ? (
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Estimated margin (not sold yet)
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Uses catalog list price vs landed cost. Invoice this serial to
              record actual sale revenue and profit.
            </Text>
            <div className="quotation-summary-panel__rows">
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Catalog list price
                </Text>
                <Text as="span">
                  {fmt(breakdown.estimatedMargin.catalogListPrice)}
                </Text>
              </div>
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Unit cost (landed)
                </Text>
                <Text as="span">
                  {fmt(breakdown.estimatedMargin.unitCost)}
                </Text>
              </div>
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Est. gross profit
                </Text>
                <Text
                  as="span"
                  fontWeight="semibold"
                  tone={
                    Number(breakdown.estimatedMargin.grossProfit) >= 0
                      ? "success"
                      : "critical"
                  }
                >
                  {fmt(breakdown.estimatedMargin.grossProfit)}
                </Text>
              </div>
              <div className="quotation-summary-row">
                <Text as="span" tone="subdued" variant="bodySm">
                  Est. profit margin
                </Text>
                <Text as="span" fontWeight="semibold">
                  {formatMarginPercent(
                    breakdown.estimatedMargin.profitMarginPercent,
                  )}
                </Text>
              </div>
            </div>
          </BlockStack>
        ) : null}

        {!breakdown.sale && !breakdown.estimatedMargin ? (
          <BlockStack gap="100">
            <Text as="h3" variant="headingSm">
              Sale &amp; profit
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              This serial has not been invoiced yet. Gross profit and margin
              appear here after sale — set a catalog list price to see an
              estimate.
            </Text>
          </BlockStack>
        ) : null}

        {breakdown.notes.length > 0 ? (
          <BlockStack gap="100">
            {breakdown.notes.map((note) => (
              <Text key={note} as="p" tone="subdued" variant="bodySm">
                {note}
              </Text>
            ))}
          </BlockStack>
        ) : null}
      </BlockStack>
    </Card>
  );
}
