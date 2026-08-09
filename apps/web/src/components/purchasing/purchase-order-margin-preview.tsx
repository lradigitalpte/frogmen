"use client";

import {
  BlockStack,
  EmptyState,
  IndexTable,
  Text,
} from "@shopify/polaris";
import { useMemo } from "react";
import { PurchaseOrderSectionCard } from "@/components/purchasing/purchase-order-section-card";
import { formatMoney } from "@/components/sales/format-money";
import { formatMarginPercent } from "@/lib/line-item-utils";
import {
  computeBlendedMarginPercent,
  computePurchaseOrderMarginPreview,
  type PurchaseOrderChargesPayload,
  type PurchaseOrderMarginLine,
} from "@/lib/purchase-order-utils";
import { TrendingUp } from "lucide-react";

interface PurchaseOrderMarginPreviewProps {
  lines: PurchaseOrderMarginLine[];
  charges: PurchaseOrderChargesPayload;
  currencyCode?: string;
}

export function PurchaseOrderMarginPreview({
  lines,
  charges,
  currencyCode,
}: PurchaseOrderMarginPreviewProps) {
  const rows = useMemo(
    () => computePurchaseOrderMarginPreview(lines, charges),
    [lines, charges],
  );
  const blendedMargin = useMemo(
    () => computeBlendedMarginPercent(rows),
    [rows],
  );
  const targetMarginValue = Number(charges.targetMarginPercent ?? 0);

  if (lines.length === 0) {
    return (
      <PurchaseOrderSectionCard
        description="Add product lines to see landed cost and suggested sell prices."
        icon={TrendingUp}
        title="Margin preview"
        tone="margin"
      >
        <EmptyState
          heading="No products yet"
          image="https://cdn.shopify.com/s/images/empty-states/empty-state.svg"
        >
          <p>Add lines on the Products tab to preview margin per SKU.</p>
        </EmptyState>
      </PurchaseOrderSectionCard>
    );
  }

  const rowMarkup = rows.map((row, index) => (
    <IndexTable.Row id={row.id} key={row.id} position={index}>
      <IndexTable.Cell>
        <Text as="span" fontWeight="semibold">
          {row.productName}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" alignment="end" numeric>
          {formatMoney(String(row.unitPrice), currencyCode)}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <span className="po-landed-price">
          <Text as="span" alignment="end" numeric>
            {formatMoney(String(row.landedUnitCost), currencyCode)}
          </Text>
        </span>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <span className="po-suggested-price">
          <Text as="span" alignment="end" numeric>
            {row.suggestedSellingPrice != null
              ? formatMoney(String(row.suggestedSellingPrice), currencyCode)
              : "—"}
          </Text>
        </span>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" alignment="end" numeric>
          {row.sellingPrice != null
            ? formatMoney(String(row.sellingPrice), currencyCode)
            : "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" alignment="end" numeric>
          {formatMarginPercent(row.marginPercent)}
        </Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <div className="po-section-card">
      <div className="po-margin-table-head">
        <BlockStack gap="200">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              Margin preview
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Landed cost includes freight and named charges. Suggested sell
              uses your target margin — pre-filled at goods receipt.
            </Text>
          </BlockStack>
          {Number.isFinite(targetMarginValue) && targetMarginValue > 0 ? (
            <Text as="p" tone="subdued" variant="bodySm">
              Target margin {targetMarginValue}% · suggested sell = landed ÷
              (1 − margin%)
            </Text>
          ) : null}
          {blendedMargin != null ? (
            <Text as="p" variant="bodyMd">
              Blended margin:{" "}
              <Text as="span" fontWeight="semibold">
                {formatMarginPercent(blendedMargin)}
              </Text>
            </Text>
          ) : null}
        </BlockStack>
      </div>

      <IndexTable
        headings={[
          { title: "Product" },
          { title: "Unit cost", alignment: "end" },
          { title: "Est. landed", alignment: "end" },
          { title: "Suggested sell", alignment: "end" },
          { title: "Catalog sell", alignment: "end" },
          { title: "Margin", alignment: "end" },
        ]}
        itemCount={rows.length}
        resourceName={{ singular: "line", plural: "lines" }}
        selectable={false}
      >
        {rowMarkup}
      </IndexTable>
    </div>
  );
}
